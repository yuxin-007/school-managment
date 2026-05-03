from __future__ import annotations

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from app.extensions import db
from app.models import OrganizationNode, User, UserOrganization
from app.services.organization_service import (
    build_tree_for_user,
    ensure_user_chain_memberships,
    get_accessible_node_ids,
    get_assignable_users,
    get_creatable_node_types,
    get_node_path,
    get_node_user_summary,
    get_organization_overview,
    serialize_node_users,
)
from app.utils.org_permissions import (
    ROLE_COLLEGE_ADMIN,
    ROLE_STAFF,
    ROLE_STUDENT,
    ROLE_SUPER_ADMIN,
    can_be_assigned_to_node,
    can_see_organization,
    get_all_child_ids,
    get_node_type_meta,
    normalize_node_type,
    validate_child_node_type,
)

bp = Blueprint('organization', __name__, url_prefix='/organization')

def parse_node_id(raw_value):
    if raw_value in (None, '', 'null'):
        return None

    if isinstance(raw_value, str) and raw_value.startswith('node_'):
        raw_value = raw_value.replace('node_', '', 1)

    try:
        return int(raw_value)
    except (TypeError, ValueError):
        return None


def user_can_manage_organization():
    return current_user.role in {ROLE_SUPER_ADMIN, ROLE_COLLEGE_ADMIN}


def get_accessible_node_id_set() -> set[int]:
    if current_user.role == ROLE_SUPER_ADMIN:
        return {node.id for node in OrganizationNode.query.filter_by(is_active=True).all()}
    return set(get_accessible_node_ids(current_user))


def ensure_node_accessible(node_id: int):
    accessible_ids = get_accessible_node_id_set()
    if node_id not in accessible_ids:
        return False, '当前账号只能管理已授权学院范围内的节点。'

    return True, None


def ensure_parent_node_manageable(node: OrganizationNode):
    normalized_type = normalize_node_type(node.node_type)
    if normalized_type == 'system':
        return False, '系统根节点仅支持查看，不允许直接编辑、删除或排序。'

    allowed, error_message = ensure_node_accessible(node.id)
    if not allowed:
        return False, error_message

    if not node.parent_id:
        return False, '当前节点缺少上级节点，暂不允许直接操作。'

    parent_allowed, _ = ensure_node_accessible(node.parent_id)
    if not parent_allowed:
        return False, '只有上级节点在当前权限范围内时，才可以管理下级节点。'

    return True, None


def build_node_permissions(node: OrganizationNode) -> dict:
    can_manage_members = (
        current_user.role not in {ROLE_STAFF, ROLE_STUDENT}
        and ensure_node_accessible(node.id)[0]
    )
    can_manage_node = user_can_manage_organization() and ensure_parent_node_manageable(node)[0]
    can_create_child = user_can_manage_organization() and ensure_node_accessible(node.id)[0]

    return {
        'can_create_child': can_create_child,
        'can_edit_node': can_manage_node,
        'can_delete_node': can_manage_node and normalize_node_type(node.node_type) != 'system',
        'can_move_node': can_manage_node,
        'can_assign_users': can_manage_members,
        'can_remove_users': can_manage_members,
    }


def ensure_user_available_from_parent_scope(user: User, node: OrganizationNode):
    parent_node = node.parent
    if not parent_node or normalize_node_type(parent_node.node_type) == 'system':
        return True, None

    parent_relation = UserOrganization.query.filter_by(user_id=user.id, node_id=parent_node.id).first()
    if not parent_relation:
        return False, f'只有已归属到上级节点“{parent_node.name}”的人员，才能继续分配到当前节点。'

    return True, None


def validate_assignable_user_for_node(user: User, node: OrganizationNode):
    if not user:
        return False, '人员不存在。', 404
    if user.role == ROLE_SUPER_ADMIN:
        return False, '系统管理员不参与组织节点分配。', 400
    if current_user.role == ROLE_COLLEGE_ADMIN and user.role == ROLE_COLLEGE_ADMIN:
        return False, '学院管理员账号只能由系统管理员分配。', 403
    if not can_be_assigned_to_node(user, node.node_type):
        return False, '当前人员角色与目标节点类型不匹配。', 400

    existing = UserOrganization.query.filter_by(user_id=user.id, node_id=node.id).first()
    if existing:
        return False, f'人员“{user.real_name}”已经归属到当前节点。', 400

    available, error_message = ensure_user_available_from_parent_scope(user, node)
    if not available:
        return False, error_message, 400

    return True, None, None


def create_user_relation_for_node(user: User, node: OrganizationNode, role_in_node: str | None, is_primary: bool):
    if is_primary:
        UserOrganization.query.filter_by(user_id=user.id, is_primary=True).update({'is_primary': False})

    relation = UserOrganization(
        user_id=user.id,
        node_id=node.id,
        role_in_node=role_in_node,
        is_primary=is_primary,
    )
    db.session.add(relation)
    ensure_user_chain_memberships(user, node)
    return relation


def validate_removable_relation(relation: UserOrganization, target_user: User | None):
    if relation.is_primary:
        return False, '当前节点是该人员的主组织，请先调整主组织后再移除。', 400

    descendant_ids = get_all_child_ids(relation.node)
    if descendant_ids:
        child_relation = (
            UserOrganization.query.filter(
                UserOrganization.user_id == relation.user_id,
                UserOrganization.node_id.in_(descendant_ids),
            )
            .first()
        )
        if child_relation:
            user_name = target_user.real_name if target_user else str(relation.user_id)
            return False, f'成员“{user_name}”仍归属于当前节点的下级节点，请先移除下级节点关系。', 400

    return True, None, None


@bp.route('/api/tree')
@login_required
def get_tree():
    if not can_see_organization(current_user.role):
        return jsonify({'success': False, 'message': '当前账号无权访问组织架构。'}), 403

    return jsonify({'success': True, 'data': build_tree_for_user(current_user)})


@bp.route('/api/overview')
@login_required
def get_overview():
    if not can_see_organization(current_user.role):
        return jsonify({'success': False, 'message': '当前账号无权访问组织架构。'}), 403

    return jsonify({'success': True, 'data': get_organization_overview(current_user)})


@bp.route('/api/node', methods=['POST'])
@login_required
def add_node():
    if not user_can_manage_organization():
        return jsonify({'success': False, 'message': '当前账号无权创建组织节点。'}), 403

    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    code = (data.get('code') or '').strip() or None
    description = (data.get('description') or '').strip() or None
    node_type = normalize_node_type(data.get('node_type'))

    if not name:
        return jsonify({'success': False, 'message': '节点名称不能为空。'}), 400
    if not node_type:
        return jsonify({'success': False, 'message': '节点类型不能为空。'}), 400

    parent_id = parse_node_id(data.get('parent_id'))
    parent_node = db.session.get(OrganizationNode, parent_id) if parent_id else None

    if parent_node is None and node_type != 'system':
        system_root = OrganizationNode.query.filter_by(node_type='system').first()
        if system_root:
            parent_node = system_root
            parent_id = system_root.id

    if parent_node:
        allowed, error_message = ensure_node_accessible(parent_node.id)
        if not allowed:
            return jsonify({'success': False, 'message': error_message}), 403

        is_valid, error_message = validate_child_node_type(parent_node.node_type, node_type)
        if not is_valid:
            return jsonify({'success': False, 'message': error_message}), 400
    else:
        creatable_types = get_creatable_node_types(current_user, None)
        if node_type not in creatable_types:
            return jsonify({'success': False, 'message': '当前层级下不允许创建该类型节点。'}), 400

    if current_user.role == ROLE_COLLEGE_ADMIN:
        allowed_types = set(get_creatable_node_types(current_user, parent_node))
        if node_type not in allowed_types:
            return jsonify({'success': False, 'message': '学院管理员只能在权限范围内创建学院下级节点。'}), 403

    existing = OrganizationNode.query.filter_by(name=name, parent_id=parent_id).first()
    if existing:
        return jsonify({'success': False, 'message': '同级节点下已存在同名组织，请调整名称。'}), 400

    max_order = (
        db.session.query(db.func.max(OrganizationNode.order_index))
        .filter(OrganizationNode.parent_id == parent_id)
        .scalar()
        or 0
    )

    node = OrganizationNode(
        name=name,
        node_type=node_type,
        code=code,
        description=description,
        parent_id=parent_id,
        order_index=max_order + 1,
    )
    db.session.add(node)
    db.session.commit()

    meta = get_node_type_meta(node.node_type)
    payload = node.to_dict()
    payload['node_type'] = meta['key']
    payload['node_type_label'] = meta['label']

    return jsonify({'success': True, 'data': payload, 'message': '组织节点创建成功。'})


@bp.route('/api/node/<int:node_id>', methods=['PUT'])
@login_required
def update_node(node_id):
    if not user_can_manage_organization():
        return jsonify({'success': False, 'message': '当前账号无权编辑组织节点。'}), 403

    node = db.get_or_404(OrganizationNode, node_id)
    allowed, error_message = ensure_parent_node_manageable(node)
    if not allowed:
        return jsonify({'success': False, 'message': error_message}), 403

    data = request.get_json() or {}
    name = (data.get('name') or '').strip()

    if not name:
        return jsonify({'success': False, 'message': '节点名称不能为空。'}), 400

    existing = (
        OrganizationNode.query.filter_by(name=name, parent_id=node.parent_id)
        .filter(OrganizationNode.id != node.id)
        .first()
    )
    if existing:
        return jsonify({'success': False, 'message': '同级节点下已存在同名组织，请调整名称。'}), 400

    node.name = name
    node.code = (data.get('code') or '').strip() or None
    node.description = (data.get('description') or '').strip() or None
    db.session.commit()

    return jsonify({'success': True, 'data': node.to_dict(), 'message': '组织节点更新成功。'})


@bp.route('/api/node/<int:node_id>', methods=['DELETE'])
@login_required
def delete_node(node_id):
    if not user_can_manage_organization():
        return jsonify({'success': False, 'message': '当前账号无权删除组织节点。'}), 403

    node = db.get_or_404(OrganizationNode, node_id)
    allowed, error_message = ensure_parent_node_manageable(node)
    if not allowed:
        return jsonify({'success': False, 'message': error_message}), 403

    if normalize_node_type(node.node_type) == 'system':
        return jsonify({'success': False, 'message': '系统根节点不能删除。'}), 400
    if node.children:
        return jsonify({'success': False, 'message': '请先删除或移除所有子节点。'}), 400
    if node.node_users:
        return jsonify({'success': False, 'message': '请先解除该节点下的人员分配关系。'}), 400

    db.session.delete(node)
    db.session.commit()
    return jsonify({'success': True, 'message': '组织节点已删除。'})


@bp.route('/api/node/<int:node_id>/move', methods=['POST'])
@login_required
def move_node(node_id):
    if not user_can_manage_organization():
        return jsonify({'success': False, 'message': '当前账号无权调整组织节点顺序。'}), 403

    node = db.get_or_404(OrganizationNode, node_id)
    allowed, error_message = ensure_parent_node_manageable(node)
    if not allowed:
        return jsonify({'success': False, 'message': error_message}), 403

    data = request.get_json() or {}
    direction = data.get('direction')

    if direction not in {'up', 'down'}:
        return jsonify({'success': False, 'message': '排序方向无效。'}), 400

    siblings = (
        OrganizationNode.query.filter_by(parent_id=node.parent_id)
        .order_by(OrganizationNode.order_index.asc(), OrganizationNode.id.asc())
        .all()
    )

    sibling_ids = [item.id for item in siblings]
    current_index = sibling_ids.index(node.id)
    target_index = current_index - 1 if direction == 'up' else current_index + 1

    if target_index < 0 or target_index >= len(siblings):
        return jsonify({'success': False, 'message': '当前节点已经处于该方向的边界。'}), 400

    target_node = siblings[target_index]
    if current_user.role == ROLE_COLLEGE_ADMIN:
        for item in [node, target_node]:
            allowed, error_message = ensure_node_accessible(item.id)
            if not allowed:
                return jsonify({'success': False, 'message': error_message}), 403

    node.order_index, target_node.order_index = target_node.order_index, node.order_index
    db.session.commit()

    return jsonify({
        'success': True,
        'message': '节点顺序已更新。',
        'data': {
            'node_id': node.id,
            'target_node_id': target_node.id,
            'direction': direction,
        },
    })


@bp.route('/api/node/<int:node_id>/users')
@login_required
def get_node_users(node_id):
    if not can_see_organization(current_user.role):
        return jsonify({'success': False, 'message': '当前账号无权访问组织架构。'}), 403

    allowed, error_message = ensure_node_accessible(node_id)
    if not allowed:
        return jsonify({'success': False, 'message': error_message}), 403

    node = db.get_or_404(OrganizationNode, node_id)
    return jsonify({
        'success': True,
        'data': serialize_node_users(node.id),
        'meta': {
            'node_path': get_node_path(node),
            'creatable_types': get_creatable_node_types(current_user, node),
            'assignable_user_count': len(get_assignable_users(current_user, node)),
            'member_summary': get_node_user_summary(node.id),
            'permissions': build_node_permissions(node),
        }
    })


@bp.route('/api/assign-user', methods=['POST'])
@login_required
def assign_user():
    if current_user.role in {ROLE_STAFF, ROLE_STUDENT}:
        return jsonify({'success': False, 'message': '当前账号无权分配人员。'}), 403

    data = request.get_json() or {}
    user_id = data.get('user_id')
    node_id = parse_node_id(data.get('node_id'))
    role_in_node = (data.get('role_in_node') or '').strip() or None
    is_primary = bool(data.get('is_primary'))

    if not user_id or not node_id:
        return jsonify({'success': False, 'message': '请选择人员和目标节点。'}), 400

    allowed, error_message = ensure_node_accessible(node_id)
    if not allowed:
        return jsonify({'success': False, 'message': error_message}), 403

    user = db.session.get(User, user_id)
    node = db.session.get(OrganizationNode, node_id)
    if not node:
        return jsonify({'success': False, 'message': '人员或节点不存在。'}), 404
    allowed_assign, error_message, status_code = validate_assignable_user_for_node(user, node)
    if not allowed_assign:
        return jsonify({'success': False, 'message': error_message}), status_code

    create_user_relation_for_node(user, node, role_in_node, is_primary)
    db.session.commit()
    return jsonify({'success': True, 'message': '人员分配成功。'})


@bp.route('/api/assign-users/batch', methods=['POST'])
@login_required
def assign_users_batch():
    if current_user.role in {ROLE_STAFF, ROLE_STUDENT}:
        return jsonify({'success': False, 'message': '当前账号无权分配人员。'}), 403

    data = request.get_json() or {}
    user_ids = data.get('user_ids') or []
    node_id = parse_node_id(data.get('node_id'))
    role_in_node = (data.get('role_in_node') or '').strip() or None
    is_primary = bool(data.get('is_primary'))

    if not isinstance(user_ids, list) or not user_ids:
        return jsonify({'success': False, 'message': '请至少选择一名人员。'}), 400
    if not node_id:
        return jsonify({'success': False, 'message': '请选择目标节点。'}), 400
    if is_primary and len(user_ids) > 1:
        return jsonify({'success': False, 'message': '批量分配时不能同时将多名人员设为主归属。'}), 400

    allowed, error_message = ensure_node_accessible(node_id)
    if not allowed:
        return jsonify({'success': False, 'message': error_message}), 403

    node = db.session.get(OrganizationNode, node_id)
    if not node:
        return jsonify({'success': False, 'message': '目标节点不存在。'}), 404

    unique_user_ids = list(dict.fromkeys(user_ids))
    users = User.query.filter(User.id.in_(unique_user_ids)).all()
    user_map = {user.id: user for user in users}

    for user_id in unique_user_ids:
        user = user_map.get(user_id)
        allowed_assign, message_text, status_code = validate_assignable_user_for_node(user, node)
        if not allowed_assign:
            db.session.rollback()
            return jsonify({'success': False, 'message': message_text}), status_code

    for user_id in unique_user_ids:
        create_user_relation_for_node(user_map[user_id], node, role_in_node, is_primary)

    db.session.commit()
    return jsonify({
        'success': True,
        'message': f'已成功分配 {len(unique_user_ids)} 名人员。',
        'data': {
            'assigned_count': len(unique_user_ids),
            'node_id': node.id,
        }
    })


@bp.route('/api/remove-user/<int:user_id>', methods=['DELETE'])
@login_required
def remove_user(user_id):
    if current_user.role in {ROLE_STAFF, ROLE_STUDENT}:
        return jsonify({'success': False, 'message': '当前账号无权移除人员。'}), 403

    node_id = parse_node_id(request.args.get('node_id'))
    if not node_id:
        return jsonify({'success': False, 'message': '缺少 node_id 参数。'}), 400

    allowed, error_message = ensure_node_accessible(node_id)
    if not allowed:
        return jsonify({'success': False, 'message': error_message}), 403

    target_user = db.session.get(User, user_id)
    if current_user.role == ROLE_COLLEGE_ADMIN and target_user and target_user.role == ROLE_COLLEGE_ADMIN:
        return jsonify({'success': False, 'message': '学院管理员账号只能由系统管理员调整。'}), 403

    relation = UserOrganization.query.filter_by(user_id=user_id, node_id=node_id).first()
    if not relation:
        return jsonify({'success': False, 'message': '该人员不在当前节点中。'}), 404

    removable, message_text, status_code = validate_removable_relation(relation, target_user)
    if not removable:
        return jsonify({'success': False, 'message': message_text}), status_code

    db.session.delete(relation)
    db.session.commit()
    return jsonify({'success': True, 'message': '人员已从节点移除。'})


@bp.route('/api/remove-users/batch', methods=['POST'])
@login_required
def remove_users_batch():
    if current_user.role in {ROLE_STAFF, ROLE_STUDENT}:
        return jsonify({'success': False, 'message': '当前账号无权移除人员。'}), 403

    data = request.get_json() or {}
    user_ids = data.get('user_ids') or []
    node_id = parse_node_id(data.get('node_id'))

    if not isinstance(user_ids, list) or not user_ids:
        return jsonify({'success': False, 'message': '请至少选择一名成员。'}), 400
    if not node_id:
        return jsonify({'success': False, 'message': '请选择目标节点。'}), 400

    allowed, error_message = ensure_node_accessible(node_id)
    if not allowed:
        return jsonify({'success': False, 'message': error_message}), 403

    unique_user_ids = list(dict.fromkeys(user_ids))
    users = User.query.filter(User.id.in_(unique_user_ids)).all()
    user_map = {user.id: user for user in users}

    relations = (
        UserOrganization.query.filter(
            UserOrganization.user_id.in_(unique_user_ids),
            UserOrganization.node_id == node_id,
        )
        .all()
    )
    relation_map = {relation.user_id: relation for relation in relations}

    for user_id in unique_user_ids:
        target_user = user_map.get(user_id)
        if current_user.role == ROLE_COLLEGE_ADMIN and target_user and target_user.role == ROLE_COLLEGE_ADMIN:
            return jsonify({'success': False, 'message': '学院管理员账号只能由系统管理员调整。'}), 403

        if user_id not in relation_map:
            user_name = target_user.real_name if target_user else str(user_id)
            return jsonify({'success': False, 'message': f'成员“{user_name}”不在当前节点中。'}), 404

        removable, message_text, status_code = validate_removable_relation(relation_map[user_id], target_user)
        if not removable:
            return jsonify({'success': False, 'message': message_text}), status_code

    for relation in relations:
        db.session.delete(relation)

    db.session.commit()
    return jsonify({
        'success': True,
        'message': f'已从当前节点移除 {len(relations)} 名成员。',
        'data': {
            'removed_count': len(relations),
            'node_id': node_id,
        },
    })


@bp.route('/api/users/options')
@login_required
def get_user_options():
    node_id = parse_node_id(request.args.get('node_id'))
    target_node = db.session.get(OrganizationNode, node_id) if node_id else None

    if target_node:
        allowed, error_message = ensure_node_accessible(target_node.id)
        if not allowed:
            return jsonify({'success': False, 'message': error_message}), 403

    return jsonify({'success': True, 'data': get_assignable_users(current_user, target_node)})


@bp.route('/api/assignable-node-types')
@login_required
def get_assignable_node_types():
    parent_id = parse_node_id(request.args.get('parent_id'))
    parent_node = db.session.get(OrganizationNode, parent_id) if parent_id else None
    node_types = get_creatable_node_types(current_user, parent_node)
    return jsonify({'success': True, 'data': node_types})
