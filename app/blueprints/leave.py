from datetime import date, datetime

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from app.extensions import db
from app.models import LeaveApplication, LeaveApprovalFlow, User
from app.services.attendance_service import rollback_leave_attendance_sync, sync_approved_leave_to_attendance
from app.services.access_scope_service import can_manage_user_in_scope, get_scope_user_ids
from app.utils.org_permissions import ROLE_COLLEGE_ADMIN, ROLE_STUDENT, ROLE_SUPER_ADMIN

bp = Blueprint('leave', __name__, url_prefix='/leave')

def get_primary_relation(user):
    return next((relation for relation in getattr(user, 'user_organizations', []) if relation.is_primary and relation.node), None)


def is_manager_relation(relation):
    if not relation or not relation.user:
        return False

    role_in_node = relation.role_in_node or ''
    if any(keyword in role_in_node for keyword in ['负责', '管理', '主管', 'admin', 'manager', 'leader']):
        return True

    return relation.user.role in {ROLE_SUPER_ADMIN, ROLE_COLLEGE_ADMIN}


def sort_candidate_relations(relations):
    return sorted(
        relations,
        key=lambda relation: (
            0 if is_manager_relation(relation) else 1,
            0 if relation.is_primary else 1,
            relation.user.real_name or relation.user.username or '',
        ),
    )


def get_candidate_relations_for_node(node, exclude_user_id=None):
    relations = []
    for relation in getattr(node, 'node_users', []):
        user = relation.user
        if not user or not user.is_active:
            continue
        if exclude_user_id and user.id == exclude_user_id:
            continue
        if user.role == ROLE_STUDENT:
            continue
        relations.append(relation)
    return sort_candidate_relations(relations)


def resolve_leave_approver(user):
    primary_relation = get_primary_relation(user)
    if not primary_relation or not primary_relation.node:
        return None, None

    current_node = primary_relation.node.parent
    while current_node:
        candidate_relations = get_candidate_relations_for_node(current_node, exclude_user_id=user.id)
        if candidate_relations:
            return candidate_relations[0].user, current_node
        current_node = current_node.parent

    return None, None


def get_leave_approval_chain_nodes(application):
    if not application.staff:
        return []

    primary_relation = get_primary_relation(application.staff)
    if not primary_relation or not primary_relation.node:
        return []

    nodes = []
    current_node = primary_relation.node.parent
    while current_node:
        nodes.append(current_node)
        current_node = current_node.parent
    return nodes


def get_leave_approval_node(application):
    current_approver = application.current_approver or application.approver
    chain_nodes = get_leave_approval_chain_nodes(application)

    ordered_flows = sorted(
        getattr(application, 'approval_flows', []),
        key=lambda item: (item.created_at or datetime.min, item.id),
        reverse=True,
    )
    for flow in ordered_flows:
        approver = flow.approver
        if not approver:
            continue
        if approver.role == ROLE_SUPER_ADMIN and len(chain_nodes) > 1:
            continue
        approver_node_ids = {relation.node_id for relation in getattr(approver, 'user_organizations', [])}
        for node in chain_nodes:
            if node.id in approver_node_ids:
                return node

    if current_approver and not (current_approver.role == ROLE_SUPER_ADMIN and len(chain_nodes) > 1):
        approver_node_ids = {relation.node_id for relation in getattr(current_approver, 'user_organizations', [])}
        for node in chain_nodes:
            if node.id in approver_node_ids:
                return node

    for node in chain_nodes:
        if get_candidate_relations_for_node(node, exclude_user_id=application.staff_id):
            return node

    if not chain_nodes and current_approver:
        primary_relation = get_primary_relation(current_approver)
        return primary_relation.node if primary_relation else None
    return None


def serialize_leave_detail(application):
    payload = application.to_dict()
    approval_node = get_leave_approval_node(application)
    payload['approval_node_id'] = approval_node.id if approval_node else None
    payload['approval_node_name'] = approval_node.name if approval_node else ''
    payload['approval_flows'] = [flow.to_dict() for flow in application.approval_flows]
    return payload


def serialize_transfer_candidates(application, approval_node):
    candidates = []
    seen_user_ids = set()

    for relation in get_candidate_relations_for_node(approval_node, exclude_user_id=application.staff_id):
        user = relation.user
        if user.id == application.current_approver_id or user.id in seen_user_ids:
            continue

        candidates.append(
            {
                'id': user.id,
                'name': user.real_name or user.username,
                'role': user.role,
                'role_display': user.get_role_display(),
                'role_in_node': relation.role_in_node or '',
                'node_id': approval_node.id,
                'node_name': approval_node.name,
                'allow_takeover': False,
            }
        )
        seen_user_ids.add(user.id)

    if current_user.role == ROLE_SUPER_ADMIN and current_user.id not in seen_user_ids:
        candidates.insert(
            0,
            {
                'id': current_user.id,
                'name': current_user.real_name or current_user.username,
                'role': current_user.role,
                'role_display': current_user.get_role_display(),
                'role_in_node': '系统管理员接管',
                'node_id': approval_node.id,
                'node_name': approval_node.name,
                'allow_takeover': True,
            },
        )

    return candidates


def can_assign_leave_to_target(application, approval_node, target_user):
    if not target_user or not target_user.is_active:
        return False

    if target_user.id == application.staff_id:
        return False

    if current_user.role == ROLE_SUPER_ADMIN and target_user.id == current_user.id:
        return True

    return any(relation.node_id == approval_node.id for relation in getattr(target_user, 'user_organizations', []))


@bp.route('/api/types')
@login_required
def get_types():
    types = [
        {'value': 'sick_leave', 'label': '病假'},
        {'value': 'personal_leave', 'label': '事假'},
        {'value': 'annual_leave', 'label': '年假'},
        {'value': 'marriage_leave', 'label': '婚假'},
        {'value': 'maternity_leave', 'label': '产假'},
        {'value': 'paternity_leave', 'label': '陪产假'},
        {'value': 'bereavement_leave', 'label': '丧假'},
        {'value': 'other', 'label': '其他'},
    ]
    return jsonify({'success': True, 'data': types})


@bp.route('/api/applications', methods=['GET'])
@login_required
def get_applications():
    if current_user.role == ROLE_SUPER_ADMIN:
        applications = LeaveApplication.query.order_by(LeaveApplication.created_at.desc()).all()
    elif current_user.role == ROLE_COLLEGE_ADMIN:
        scoped_ids = get_scope_user_ids(current_user)
        applications = (
            LeaveApplication.query.filter(LeaveApplication.staff_id.in_(scoped_ids))
            .order_by(LeaveApplication.created_at.desc())
            .all()
        )
    else:
        applications = (
            LeaveApplication.query.filter_by(staff_id=current_user.id)
            .order_by(LeaveApplication.created_at.desc())
            .all()
        )
    return jsonify({'success': True, 'data': [item.to_dict() for item in applications]})


@bp.route('/api/applications/pending', methods=['GET'])
@login_required
def get_pending():
    if current_user.role == ROLE_SUPER_ADMIN:
        applications = (
            LeaveApplication.query.filter_by(status='pending')
            .order_by(LeaveApplication.created_at.desc())
            .all()
        )
    else:
        applications = (
            LeaveApplication.query.filter_by(current_approver_id=current_user.id, status='pending')
            .order_by(LeaveApplication.created_at.desc())
            .all()
        )
    data = []
    for item in applications:
        payload = item.to_dict()
        approval_node = get_leave_approval_node(item)
        payload['approval_node_id'] = approval_node.id if approval_node else None
        payload['approval_node_name'] = approval_node.name if approval_node else ''
        data.append(payload)
    return jsonify({'success': True, 'data': data})


@bp.route('/api/applications', methods=['POST'])
@login_required
def create_application():
    data = request.get_json() or {}
    for field in ['leave_type', 'start_date', 'end_date', 'reason']:
        if not data.get(field):
            return jsonify({'success': False, 'message': f'{field} 不能为空。'}), 400

    start = datetime.strptime(data['start_date'], '%Y-%m-%d').date()
    end = datetime.strptime(data['end_date'], '%Y-%m-%d').date()
    total_days = (end - start).days + 1
    if total_days < 1:
        return jsonify({'success': False, 'message': '结束日期不能早于开始日期。'}), 400

    supervisor, approval_node = resolve_leave_approver(current_user)
    if not supervisor:
        return jsonify({'success': False, 'message': '无法确定审批人，请先配置组织归属。'}), 400

    application = LeaveApplication(
        staff_id=current_user.id,
        leave_type=data['leave_type'],
        start_date=start,
        end_date=end,
        reason=data['reason'],
        total_days=total_days,
        emergency_contact=data.get('emergency_contact'),
        emergency_phone=data.get('emergency_phone'),
        current_approver_id=supervisor.id,
    )
    db.session.add(application)
    db.session.flush()

    db.session.add(
        LeaveApprovalFlow(
            leave_application_id=application.id,
            approver_id=supervisor.id,
            approval_step=1,
            status='pending',
            comments=f'系统已自动分配给 {supervisor.real_name} 审批。',
        )
    )
    db.session.commit()

    from app.blueprints.notification import create_notification

    leave_type_display = application.get_leave_type_display()
    approval_node_name = approval_node.name if approval_node else '上级节点'
    create_notification(
        user_id=supervisor.id,
        title='有新的请假申请待审批',
        content=f'{current_user.real_name} 提交了 {leave_type_display} 申请（{application.start_date} 至 {application.end_date}），当前已分配到 {approval_node_name}。',
        notification_type='leave_pending',
        related_id=application.id,
        related_type='LeaveApplication',
        commit=True,
    )

    return jsonify({'success': True, 'message': '请假申请已提交，并已通知审批人。'})


@bp.route('/api/applications/<int:app_id>/approve', methods=['POST'])
@login_required
def approve(app_id):
    application = db.get_or_404(LeaveApplication, app_id)
    if application.current_approver_id != current_user.id:
        return jsonify({'success': False, 'message': '当前账号无权审批该申请。'}), 403
    if application.status != 'pending':
        return jsonify({'success': False, 'message': '该申请已处理。'}), 400

    comments = (request.json or {}).get('comments', '')
    application.status = 'approved'
    application.approver_id = current_user.id
    application.approval_notes = comments

    flow = LeaveApprovalFlow.query.filter_by(
        leave_application_id=app_id,
        approver_id=current_user.id,
        status='pending',
    ).order_by(LeaveApprovalFlow.created_at.desc()).first()
    if flow:
        flow.status = 'approved'
        flow.comments = comments or '审批通过。'

    sync_approved_leave_to_attendance(application)
    db.session.commit()

    from app.blueprints.notification import create_notification

    leave_type_display = application.get_leave_type_display()
    create_notification(
        user_id=application.staff_id,
        title='请假申请已通过',
        content=f'您的 {leave_type_display} 申请（{application.start_date} 至 {application.end_date}）已审批通过。',
        notification_type='leave_approved',
        related_id=application.id,
        related_type='LeaveApplication',
        commit=True,
    )

    return jsonify({'success': True, 'message': '请假申请已批准。'})


@bp.route('/api/applications/<int:app_id>/reject', methods=['POST'])
@login_required
def reject(app_id):
    application = db.get_or_404(LeaveApplication, app_id)
    if application.current_approver_id != current_user.id:
        return jsonify({'success': False, 'message': '当前账号无权审批该申请。'}), 403
    if application.status != 'pending':
        return jsonify({'success': False, 'message': '该申请已处理。'}), 400

    comments = (request.json or {}).get('comments', '')
    application.status = 'rejected'
    application.approver_id = current_user.id
    application.approval_notes = comments

    flow = LeaveApprovalFlow.query.filter_by(
        leave_application_id=app_id,
        approver_id=current_user.id,
        status='pending',
    ).order_by(LeaveApprovalFlow.created_at.desc()).first()
    if flow:
        flow.status = 'rejected'
        flow.comments = comments or '审批驳回。'

    rollback_leave_attendance_sync(application)
    db.session.commit()

    from app.blueprints.notification import create_notification

    leave_type_display = application.get_leave_type_display()
    create_notification(
        user_id=application.staff_id,
        title='请假申请被驳回',
        content=f'您的 {leave_type_display} 申请（{application.start_date} 至 {application.end_date}）被驳回。原因：{comments or "未填写"}。',
        notification_type='leave_rejected',
        related_id=application.id,
        related_type='LeaveApplication',
        commit=True,
    )

    return jsonify({'success': True, 'message': '请假申请已驳回。'})


@bp.route('/api/applications/<int:app_id>/transfer-options', methods=['GET'])
@login_required
def get_transfer_options(app_id):
    if current_user.role != ROLE_SUPER_ADMIN:
        return jsonify({'success': False, 'message': '只有系统管理员可以转交审批。'}), 403

    application = db.get_or_404(LeaveApplication, app_id)
    if application.status != 'pending':
        return jsonify({'success': False, 'message': '只有待审批申请才能转交。'}), 400

    approval_node = get_leave_approval_node(application)
    if not approval_node:
        return jsonify({'success': False, 'message': '无法定位当前审批节点，请检查组织归属配置。'}), 400

    return jsonify(
        {
            'success': True,
            'data': {
                'approval_node_id': approval_node.id,
                'approval_node_name': approval_node.name,
                'current_approver_id': application.current_approver_id,
                'current_approver_name': application.current_approver.real_name if application.current_approver else '',
                'candidates': serialize_transfer_candidates(application, approval_node),
            },
        }
    )


@bp.route('/api/applications/<int:app_id>/transfer', methods=['POST'])
@login_required
def transfer(app_id):
    if current_user.role != ROLE_SUPER_ADMIN:
        return jsonify({'success': False, 'message': '只有系统管理员可以转交审批。'}), 403

    application = db.get_or_404(LeaveApplication, app_id)
    if application.status != 'pending':
        return jsonify({'success': False, 'message': '只有待审批申请才能转交。'}), 400

    data = request.get_json() or {}
    target_user_id = data.get('target_user_id')
    transfer_reason = (data.get('reason') or '').strip()

    if not target_user_id:
        return jsonify({'success': False, 'message': '请选择新的审批人。'}), 400

    target_user = db.session.get(User, target_user_id)
    if not target_user:
        return jsonify({'success': False, 'message': '目标审批人不存在。'}), 404

    if target_user.id == application.current_approver_id:
        return jsonify({'success': False, 'message': '目标审批人已经是当前审批人。'}), 400

    approval_node = get_leave_approval_node(application)
    if not approval_node:
        return jsonify({'success': False, 'message': '无法定位当前审批节点，请检查组织归属配置。'}), 400

    if not can_assign_leave_to_target(application, approval_node, target_user):
        return jsonify({'success': False, 'message': '新的审批人必须位于同一审批节点，系统管理员本人可以直接接管审批。'}), 400

    previous_approver = application.current_approver
    previous_flow = LeaveApprovalFlow.query.filter_by(
        leave_application_id=application.id,
        approver_id=application.current_approver_id,
        status='pending',
    ).order_by(LeaveApprovalFlow.created_at.desc()).first()

    transfer_note = f'系统管理员 {current_user.real_name} 将审批转交给 {target_user.real_name}'
    if previous_approver:
        transfer_note = f'系统管理员 {current_user.real_name} 将审批从 {previous_approver.real_name} 转交给 {target_user.real_name}'
    if transfer_reason:
        transfer_note = f'{transfer_note}。原因：{transfer_reason}'

    approval_step = previous_flow.approval_step if previous_flow else 1
    if previous_flow:
        previous_flow.status = 'transferred'
        previous_flow.comments = transfer_note

    db.session.add(
        LeaveApprovalFlow(
            leave_application_id=application.id,
            approver_id=target_user.id,
            approval_step=approval_step,
            status='pending',
            comments=f'等待 {target_user.real_name} 审批。',
        )
    )
    application.current_approver_id = target_user.id
    db.session.commit()

    from app.blueprints.notification import create_notification

    leave_type_display = application.get_leave_type_display()
    create_notification(
        user_id=target_user.id,
        title='有新的请假申请转交给你审批',
        content=f'{application.staff.real_name} 的 {leave_type_display} 申请已转交给你处理，请及时审批。',
        notification_type='leave_transfer',
        related_id=application.id,
        related_type='LeaveApplication',
        commit=True,
    )

    create_notification(
        user_id=application.staff_id,
        title='请假申请审批人已调整',
        content=f'你的 {leave_type_display} 申请已调整审批人，当前由 {target_user.real_name} 负责处理。',
        notification_type='leave_transfer',
        related_id=application.id,
        related_type='LeaveApplication',
        commit=True,
    )

    if previous_approver and previous_approver.id not in {target_user.id, current_user.id}:
        create_notification(
            user_id=previous_approver.id,
            title='有一条请假审批已转交',
            content=f'{application.staff.real_name} 的 {leave_type_display} 申请已由系统管理员转交给 {target_user.real_name}。',
            notification_type='leave_transfer',
            related_id=application.id,
            related_type='LeaveApplication',
            commit=True,
        )

    return jsonify({'success': True, 'message': '审批人已更新，系统已同步发送通知。'})


@bp.route('/api/applications/<int:app_id>/cancel', methods=['POST'])
@login_required
def cancel(app_id):
    application = db.get_or_404(LeaveApplication, app_id)
    if application.staff_id != current_user.id:
        return jsonify({'success': False, 'message': '只能取消自己的请假申请。'}), 403

    if application.status not in {'pending', 'approved'}:
        return jsonify({'success': False, 'message': '当前请假状态不支持取消。'}), 400

    if application.status == 'approved' and application.start_date < date.today():
        return jsonify({'success': False, 'message': '已开始执行的请假不能直接取消。'}), 400

    application.status = 'cancelled'
    rolled_back_records = rollback_leave_attendance_sync(application)
    db.session.commit()

    if application.current_approver_id:
        from app.blueprints.notification import create_notification

        leave_type_display = application.get_leave_type_display()
        create_notification(
            user_id=application.current_approver_id,
            title='请假申请已取消',
            content=f'{current_user.real_name} 已取消 {leave_type_display} 申请（{application.start_date} 至 {application.end_date}）。',
            notification_type='leave_cancelled',
            related_id=application.id,
            related_type='LeaveApplication',
            commit=True,
        )

    return jsonify(
        {
            'success': True,
            'message': f'请假申请已取消，相关考勤同步已回收 {len(rolled_back_records)} 条。',
            'data': {'rolled_back_count': len(rolled_back_records)},
        }
    )


@bp.route('/api/applications/<int:app_id>', methods=['GET'])
@login_required
def get_detail(app_id):
    application = db.get_or_404(LeaveApplication, app_id)
    can_view = (
        application.staff_id == current_user.id
        or application.current_approver_id == current_user.id
        or current_user.role == ROLE_SUPER_ADMIN
        or (current_user.role == ROLE_COLLEGE_ADMIN and can_manage_user_in_scope(current_user, application.staff))
    )
    if not can_view:
        return jsonify({'success': False, 'message': '当前账号无权查看该申请。'}), 403

    return jsonify({'success': True, 'data': serialize_leave_detail(application)})


