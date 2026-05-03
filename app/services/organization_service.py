"""Organization tree service helpers."""

from __future__ import annotations

from collections import Counter

from sqlalchemy.orm import joinedload

from app.extensions import db
from app.models import OrganizationNode, User, UserOrganization
from app.utils.org_permissions import (
    ORGANIZATION_HIERARCHY,
    ROLE_COLLEGE_ADMIN,
    ROLE_SUPER_ADMIN,
    ROLE_STAFF,
    ROLE_STUDENT,
    can_assign_to_node_type,
    can_be_assigned_to_node,
    get_allowed_child_types,
    get_college_admin_scope,
    get_node_type_catalog,
    get_node_type_label,
    get_node_type_meta,
    normalize_node_type,
)


def get_accessible_node_ids(user) -> list[int]:
    if user.role == ROLE_SUPER_ADMIN:
        return [item.id for item in OrganizationNode.query.filter_by(is_active=True).all()]
    if user.role == ROLE_COLLEGE_ADMIN:
        return get_college_admin_scope(user)
    return []


def get_accessible_nodes(user) -> list[OrganizationNode]:
    accessible_ids = get_accessible_node_ids(user)
    if not accessible_ids:
        return []

    return (
        OrganizationNode.query.options(joinedload(OrganizationNode.node_users))
        .filter(OrganizationNode.id.in_(accessible_ids))
        .order_by(OrganizationNode.order_index.asc(), OrganizationNode.id.asc())
        .all()
    )


def ensure_user_chain_memberships(user: User, target_node: OrganizationNode) -> bool:
    chain = []
    current = target_node
    while current:
        if normalize_node_type(current.node_type) != 'system':
            chain.append(current)
        current = current.parent
    chain.reverse()

    created = False
    for node in chain:
        if not can_be_assigned_to_node(user, node.node_type):
            continue

        relation = next((item for item in user.user_organizations if item.node_id == node.id), None)
        if relation is None:
            db.session.add(UserOrganization(user=user, node=node, is_primary=False))
            created = True
    return created


def build_tree_for_user(user) -> list[dict]:
    nodes = get_accessible_nodes(user)
    if not nodes:
        return []

    children_map: dict[int | None, list[OrganizationNode]] = {}
    node_ids = {node.id for node in nodes}

    for node in nodes:
        parent_key = node.parent_id if node.parent_id in node_ids else None
        children_map.setdefault(parent_key, []).append(node)

    for siblings in children_map.values():
        siblings.sort(key=lambda item: (item.order_index, item.id))

    def build_branch(parent_id=None):
        branch = []
        for node in children_map.get(parent_id, []):
            branch.append(serialize_tree_node(node, build_branch(node.id)))
        return branch

    return build_branch(None)


def serialize_tree_node(node: OrganizationNode, children: list[dict] | None = None) -> dict:
    meta = get_node_type_meta(node.node_type)
    payload = node.to_dict()
    payload['node_type'] = meta['key']
    payload['node_type_label'] = meta['label']
    payload['type_color'] = meta['color']
    payload['type_icon'] = meta['icon']
    payload['children_count'] = len(children or [])
    payload['users_count'] = len(node.node_users)

    return {
        'id': node.id,
        'key': str(node.id),
        'title': node.name,
        'name': node.name,
        'node_type': meta['key'],
        'node_type_label': meta['label'],
        'type_color': meta['color'],
        'type_icon': meta['icon'],
        'data': payload,
        'children': children or [],
        'is_leaf': not children,
    }


def get_node_path(node: OrganizationNode | None) -> list[dict]:
    if not node:
        return []

    path = []
    current = node
    while current:
        meta = get_node_type_meta(current.node_type)
        path.append({
            'id': current.id,
            'name': current.name,
            'node_type': meta['key'],
            'node_type_label': meta['label'],
        })
        current = current.parent
    path.reverse()
    return path


def get_organization_overview(user) -> dict:
    nodes = get_accessible_nodes(user)
    accessible_ids = [node.id for node in nodes]
    normalized_types = [normalize_node_type(node.node_type) for node in nodes]
    node_counter = Counter(normalized_types)

    assignments = []
    if accessible_ids:
        assignments = (
            UserOrganization.query.options(joinedload(UserOrganization.user), joinedload(UserOrganization.node))
            .join(User)
            .filter(UserOrganization.node_id.in_(accessible_ids), User.role != ROLE_SUPER_ADMIN)
            .all()
        )

    unique_user_ids = {relation.user_id for relation in assignments}

    if user.role == ROLE_SUPER_ADMIN:
        base_user_query = User.query.filter(User.role != ROLE_SUPER_ADMIN)
        unassigned_count = base_user_query.filter(~User.user_organizations.any()).count()
    else:
        unassigned_count = 0

    root_names = [node.name for node in nodes if node.parent_id not in accessible_ids]

    return {
        'summary': {
            'total_nodes': len(nodes),
            'accessible_users': len(unique_user_ids),
            'primary_assignments': sum(1 for relation in assignments if relation.is_primary),
            'unassigned_users': unassigned_count,
            'school_count': node_counter.get('school', 0),
            'college_count': node_counter.get('college', 0),
            'staff_count': node_counter.get('staff', 0),
            'student_count': node_counter.get('student', 0),
        },
        'distribution': [
            {
                'node_type': item['key'],
                'label': item['label'],
                'color': item['color'],
                'count': node_counter.get(item['key'], 0),
            }
            for item in get_node_type_catalog()
            if node_counter.get(item['key'], 0) > 0
        ],
        'catalog': get_node_type_catalog(),
        'hierarchy': [get_node_type_label(item) for item in ORGANIZATION_HIERARCHY],
        'root_names': root_names,
    }


def get_creatable_node_types(user, parent_node: OrganizationNode | None) -> list[str]:
    if user.role not in {ROLE_SUPER_ADMIN, ROLE_COLLEGE_ADMIN}:
        return []

    if parent_node is None:
        existing_system = OrganizationNode.query.filter_by(node_type='system').first()
        if existing_system:
            return ['school'] if user.role == ROLE_SUPER_ADMIN else []
        return ['system'] if user.role == ROLE_SUPER_ADMIN else []

    allowed = get_allowed_child_types(parent_node.node_type)
    return [item for item in allowed if can_assign_to_node_type(user.role, item)]


def serialize_assignable_user(candidate: User) -> dict:
    primary_relation = next((item for item in candidate.user_organizations if item.is_primary), None)
    return {
        'id': candidate.id,
        'username': candidate.username,
        'real_name': candidate.real_name,
        'role': candidate.role,
        'role_display': candidate.get_role_display(),
        'employee_id': candidate.employee_id,
        'student_id': candidate.student_id,
        'position': candidate.position,
        'department_name': primary_relation.node.name if primary_relation and primary_relation.node else '',
        'organization_count': len(candidate.user_organizations),
    }


def get_parent_scoped_candidates(base_candidates: list[User], node: OrganizationNode) -> list[User]:
    parent_node = node.parent
    if not parent_node or normalize_node_type(parent_node.node_type) == 'system':
        return base_candidates

    parent_user_ids = {relation.user_id for relation in parent_node.node_users}
    return [candidate for candidate in base_candidates if candidate.id in parent_user_ids]


def get_assignable_users(user, node: OrganizationNode | None = None) -> list[dict]:
    if user.role == ROLE_SUPER_ADMIN:
        query = User.query.options(
            joinedload(User.user_organizations).joinedload(UserOrganization.node)
        ).filter(User.role != ROLE_SUPER_ADMIN)
    elif user.role == ROLE_COLLEGE_ADMIN:
        query = User.query.options(
            joinedload(User.user_organizations).joinedload(UserOrganization.node)
        ).filter(User.role.in_([ROLE_STAFF, ROLE_STUDENT]))
    else:
        return []

    candidates = query.order_by(User.real_name.asc()).all()

    if node:
        candidates = get_parent_scoped_candidates(candidates, node)
        candidates = [
            candidate
            for candidate in candidates
            if can_be_assigned_to_node(candidate, node.node_type)
            and not any(relation.node_id == node.id for relation in candidate.user_organizations)
        ]

    return [serialize_assignable_user(candidate) for candidate in candidates]


def serialize_node_users(node_id: int) -> list[dict]:
    relations = (
        UserOrganization.query.options(joinedload(UserOrganization.user))
        .join(User)
        .filter(UserOrganization.node_id == node_id, User.role != ROLE_SUPER_ADMIN)
        .order_by(UserOrganization.is_primary.desc(), User.real_name.asc())
        .all()
    )

    payload = []
    for relation in relations:
        user_data = relation.user.to_dict()
        user_data['role_in_node'] = relation.role_in_node
        user_data['is_primary'] = relation.is_primary
        payload.append(user_data)
    return payload


def get_node_user_summary(node_id: int) -> dict:
    relations = (
        UserOrganization.query.options(joinedload(UserOrganization.user))
        .join(User)
        .filter(UserOrganization.node_id == node_id, User.role != ROLE_SUPER_ADMIN)
        .all()
    )

    role_counter = Counter(relation.user.role for relation in relations if relation.user)

    return {
        'total': len(relations),
        'primary_count': sum(1 for relation in relations if relation.is_primary),
        'by_role': dict(role_counter),
    }
