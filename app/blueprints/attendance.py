from datetime import date, datetime

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from app.extensions import db
from app.models import (
    Attendance,
    AttendanceLocationLog,
    AttendanceRule,
    AttendanceSupplementFlow,
    AttendanceSupplementRequest,
    User,
)
from app.services.access_scope_service import get_scope_user_ids
from app.services.location import calculate_distance_meters
from app.utils.response import paginated_response
from app.utils.org_permissions import (
    NODE_TYPE_COLLEGE,
    NODE_TYPE_SCHOOL,
    ROLE_COLLEGE_ADMIN,
    ROLE_SUPER_ADMIN,
    normalize_node_type,
)
from app.utils.permissions import college_admin_or_super_admin_required

bp = Blueprint('attendance', __name__, url_prefix='/attendance')

MANAGER_KEYWORDS = ['负责', '管理', '主管', 'admin', 'manager', 'leader']


def get_attendance_scope_ids():
    if current_user.role in [ROLE_SUPER_ADMIN, ROLE_COLLEGE_ADMIN]:
        return get_scope_user_ids(current_user)
    return [current_user.id]


def get_or_create_attendance_rule():
    rule = AttendanceRule.query.filter_by(key='default').first()
    if not rule:
        rule = AttendanceRule(key='default')
        db.session.add(rule)
        db.session.commit()
    return rule


def parse_rule_time(value, field_label):
    try:
        return datetime.strptime(value, '%H:%M').time()
    except (TypeError, ValueError):
        raise ValueError(f'{field_label} 格式无效，请使用 HH:MM。')


def get_primary_relation(user):
    return next((relation for relation in getattr(user, 'user_organizations', []) if relation.is_primary and relation.node), None)


def get_user_primary_node(user):
    relation = get_primary_relation(user)
    return relation.node if relation else None


def is_manager_relation(relation):
    if not relation or not relation.user or not relation.user.is_active:
        return False

    role_in_node = (relation.role_in_node or '').lower()
    if any(keyword.lower() in role_in_node for keyword in MANAGER_KEYWORDS):
        return True

    return relation.user.role in {ROLE_COLLEGE_ADMIN, ROLE_SUPER_ADMIN}


def get_nearest_ancestor(node, target_type):
    current = node
    while current:
        if normalize_node_type(current.node_type) == target_type:
            return current
        current = current.parent
    return None


def get_college_approver(college_node, requester_id):
    if not college_node:
        return None

    candidates = []
    for relation in getattr(college_node, 'node_users', []):
        user = relation.user
        if not user or not user.is_active or user.id == requester_id:
            continue
        if user.role == ROLE_COLLEGE_ADMIN:
            candidates.append(user)

    if candidates:
        return sorted(candidates, key=lambda item: (item.real_name or item.username or '', item.id))[0]
    return None


def get_school_manager(school_node, requester_id):
    if not school_node:
        return None

    candidates = []
    for relation in getattr(school_node, 'node_users', []):
        user = relation.user
        if not user or not user.is_active or user.id == requester_id:
            continue
        if is_manager_relation(relation):
            candidates.append(user)

    if candidates:
        return sorted(candidates, key=lambda item: (item.real_name or item.username or '', item.id))[0]
    return None


def resolve_supplement_approver(user):
    primary_node = get_user_primary_node(user)
    college_node = get_nearest_ancestor(primary_node, NODE_TYPE_COLLEGE) if primary_node else None
    school_node = get_nearest_ancestor(primary_node, NODE_TYPE_SCHOOL) if primary_node else None

    college_approver = get_college_approver(college_node, user.id)
    if college_approver:
        return college_approver, college_node, 'college'

    school_approver = get_school_manager(school_node, user.id)
    if school_approver:
        return school_approver, school_node, 'school'

    system_admin = (
        User.query.filter_by(role=ROLE_SUPER_ADMIN, is_active=True)
        .order_by(User.real_name.asc(), User.id.asc())
        .first()
    )
    if system_admin:
        return system_admin, None, 'system'

    return None, None, None


def get_supplement_pending_query():
    if current_user.role == ROLE_SUPER_ADMIN:
        return AttendanceSupplementRequest.query.filter_by(status='pending')
    return AttendanceSupplementRequest.query.filter_by(current_approver_id=current_user.id, status='pending')


def can_review_supplement_request(supplement_request):
    return current_user.role == ROLE_SUPER_ADMIN or supplement_request.current_approver_id == current_user.id


def get_pending_supplement_flow(supplement_request, approver_id):
    return (
        AttendanceSupplementFlow.query.filter_by(
            supplement_request_id=supplement_request.id,
            approver_id=approver_id,
            status='pending',
        )
        .order_by(AttendanceSupplementFlow.id.desc())
        .first()
    )


def serialize_supplement_request(supplement_request):
    payload = supplement_request.to_dict()
    payload['approval_flows'] = [flow.to_dict() for flow in supplement_request.approval_flows]
    primary_node = get_user_primary_node(supplement_request.user) if supplement_request.user else None
    payload['requester_primary_node_name'] = primary_node.name if primary_node else ''
    return payload


def recompute_attendance_status(attendance, rule):
    if attendance.status == 'on_leave':
        return

    status = 'normal'
    if attendance.clock_in and rule.check_in_end and attendance.clock_in.time() > rule.check_in_end:
        status = 'late'
    if attendance.clock_out and rule.check_out_start and attendance.clock_out.time() < rule.check_out_start:
        status = 'early'
    attendance.status = status


def validate_attendance_policy(rule, punch_type, payload):
    if not rule.attendance_enabled:
        return False, '当前考勤打卡已关闭。', {}

    current_time = datetime.now().time()
    window_start = rule.check_in_start if punch_type == 'clock_in' else rule.check_out_start
    window_end = rule.check_in_end if punch_type == 'clock_in' else rule.check_out_end

    if window_start and window_end and not (window_start <= current_time <= window_end):
        action_label = '上班打卡' if punch_type == 'clock_in' else '下班打卡'
        return False, f'{action_label}时间不在允许范围内（{window_start.strftime("%H:%M")} - {window_end.strftime("%H:%M")}）。', {}

    location_meta = {
        'latitude': payload.get('latitude'),
        'longitude': payload.get('longitude'),
        'accuracy': payload.get('accuracy'),
        'distance_meters': None,
        'within_range': False,
        'location_name': rule.location_name,
    }

    if rule.require_location:
        if rule.latitude is None or rule.longitude is None:
            return False, '系统尚未配置考勤定位范围，请联系系统管理员。', location_meta
        if payload.get('latitude') is None or payload.get('longitude') is None:
            return False, '请先开启定位权限后再进行打卡。', location_meta

        distance = calculate_distance_meters(
            float(payload.get('latitude')),
            float(payload.get('longitude')),
            float(rule.latitude),
            float(rule.longitude),
        )
        location_meta['distance_meters'] = round(distance, 2)
        location_meta['within_range'] = distance <= float(rule.radius_meters or 0)

        if not location_meta['within_range']:
            return False, f'当前位置超出允许打卡范围，距离 {rule.location_name or "考勤点"} 约 {round(distance)} 米。', location_meta

    return True, None, location_meta


def create_location_log(attendance, punch_type, location_meta):
    if location_meta.get('latitude') is None or location_meta.get('longitude') is None:
        return None

    log = AttendanceLocationLog(
        attendance_id=attendance.id,
        user_id=attendance.user_id,
        punch_type=punch_type,
        latitude=float(location_meta.get('latitude')),
        longitude=float(location_meta.get('longitude')),
        accuracy=float(location_meta.get('accuracy')) if location_meta.get('accuracy') is not None else None,
        distance_meters=location_meta.get('distance_meters'),
        within_range=bool(location_meta.get('within_range')),
        location_name=location_meta.get('location_name'),
    )
    db.session.add(log)
    return log


def send_notification(user_id, title, content, notification_type, related_id):
    from app.blueprints.notification import create_notification

    create_notification(
        user_id=user_id,
        title=title,
        content=content,
        notification_type=notification_type,
        related_id=related_id,
        related_type='AttendanceSupplementRequest',
        commit=True,
    )


def log_supplement_action(user_id, action, supplement_request, detail, ip_address):
    from app.blueprints.log import log_operation

    log_operation(
        user_id=user_id,
        action=action,
        target_type='AttendanceSupplementRequest',
        target_id=supplement_request.id,
        target_name=f'{supplement_request.attendance_date.strftime("%Y-%m-%d")} {supplement_request.get_type_display()}',
        detail=detail,
        ip_address=ip_address,
        commit=True,
    )


def apply_supplement_approval(supplement_request, approver, comments, ip_address):
    rule = get_or_create_attendance_rule()
    attendance = Attendance.query.filter_by(
        user_id=supplement_request.user_id,
        attendance_date=supplement_request.attendance_date,
    ).first()

    if not attendance:
        attendance = Attendance(
            user_id=supplement_request.user_id,
            attendance_date=supplement_request.attendance_date,
            status='normal',
        )
        db.session.add(attendance)

    supplement_datetime = datetime.combine(supplement_request.attendance_date, supplement_request.requested_time)
    if supplement_request.supplement_type == 'clock_in':
        attendance.clock_in = supplement_datetime
    else:
        attendance.clock_out = supplement_datetime

    recompute_attendance_status(attendance, rule)
    if comments:
        attendance.remark = comments

    db.session.flush()
    supplement_request.attendance_id = attendance.id
    supplement_request.status = 'approved'
    supplement_request.current_approver_id = None
    supplement_request.final_approver_id = approver.id
    supplement_request.approval_comments = comments

    pending_flow = get_pending_supplement_flow(supplement_request, approver.id)
    if pending_flow:
        pending_flow.status = 'approved'
        pending_flow.comments = comments

    db.session.commit()

    send_notification(
        user_id=supplement_request.user_id,
        title='补签申请已批准',
        content=f'你提交的 {supplement_request.attendance_date.strftime("%Y-%m-%d")} {supplement_request.get_type_display()} 申请已批准。',
        notification_type='supplement_approved',
        related_id=supplement_request.id,
    )
    log_supplement_action(
        user_id=approver.id,
        action='attendance_supplement_approve',
        supplement_request=supplement_request,
        detail=comments or '补签申请已批准',
        ip_address=ip_address,
    )


def apply_supplement_rejection(supplement_request, approver, comments, ip_address):
    supplement_request.status = 'rejected'
    supplement_request.current_approver_id = None
    supplement_request.final_approver_id = approver.id
    supplement_request.approval_comments = comments

    pending_flow = get_pending_supplement_flow(supplement_request, approver.id)
    if pending_flow:
        pending_flow.status = 'rejected'
        pending_flow.comments = comments

    db.session.commit()

    send_notification(
        user_id=supplement_request.user_id,
        title='补签申请已驳回',
        content=f'你提交的 {supplement_request.attendance_date.strftime("%Y-%m-%d")} {supplement_request.get_type_display()} 申请已驳回。原因：{comments}',
        notification_type='supplement_rejected',
        related_id=supplement_request.id,
    )
    log_supplement_action(
        user_id=approver.id,
        action='attendance_supplement_reject',
        supplement_request=supplement_request,
        detail=comments,
        ip_address=ip_address,
    )


@bp.route('/api/clock-in', methods=['POST'])
@login_required
def clock_in():
    payload = request.get_json() or {}
    rule = get_or_create_attendance_rule()
    today = date.today()
    attendance = Attendance.query.filter_by(user_id=current_user.id, attendance_date=today).first()

    allowed, message_text, location_meta = validate_attendance_policy(rule, 'clock_in', payload)
    if not allowed:
        return jsonify({'success': False, 'message': message_text, 'policy': rule.to_dict(), 'location': location_meta}), 400

    if attendance and attendance.status == 'on_leave':
        return jsonify({'success': False, 'message': '今日已按请假处理，无需打卡。'}), 400
    if attendance and attendance.clock_in:
        return jsonify({'success': False, 'message': '今日已完成上班打卡。'}), 400

    if attendance:
        attendance.clock_in = datetime.now()
    else:
        attendance = Attendance(user_id=current_user.id, attendance_date=today, clock_in=datetime.now())
        db.session.add(attendance)

    recompute_attendance_status(attendance, rule)
    db.session.flush()
    location_log = create_location_log(attendance, 'clock_in', location_meta)
    db.session.commit()

    from app.blueprints.log import log_operation

    log_operation(
        user_id=current_user.id,
        action='attendance_clock_in',
        target_type='Attendance',
        target_id=attendance.id,
        target_name=today.strftime('%Y-%m-%d'),
        ip_address=request.remote_addr,
        commit=True,
    )

    return jsonify({
        'success': True,
        'message': '上班打卡成功。',
        'data': attendance.to_dict(),
        'location': location_log.to_dict() if location_log else location_meta,
        'policy': rule.to_dict(),
    })


@bp.route('/api/clock-out', methods=['POST'])
@login_required
def clock_out():
    payload = request.get_json() or {}
    rule = get_or_create_attendance_rule()
    today = date.today()
    attendance = Attendance.query.filter_by(user_id=current_user.id, attendance_date=today).first()

    allowed, message_text, location_meta = validate_attendance_policy(rule, 'clock_out', payload)
    if not allowed:
        return jsonify({'success': False, 'message': message_text, 'policy': rule.to_dict(), 'location': location_meta}), 400

    if not attendance:
        return jsonify({'success': False, 'message': '请先完成上班打卡。'}), 400
    if attendance.status == 'on_leave':
        return jsonify({'success': False, 'message': '今日已按请假处理，无需下班打卡。'}), 400
    if attendance.clock_out:
        return jsonify({'success': False, 'message': '今日已完成下班打卡。'}), 400

    attendance.clock_out = datetime.now()
    recompute_attendance_status(attendance, rule)
    db.session.flush()
    location_log = create_location_log(attendance, 'clock_out', location_meta)
    db.session.commit()

    from app.blueprints.log import log_operation

    log_operation(
        user_id=current_user.id,
        action='attendance_clock_out',
        target_type='Attendance',
        target_id=attendance.id,
        target_name=today.strftime('%Y-%m-%d'),
        ip_address=request.remote_addr,
        commit=True,
    )

    return jsonify({
        'success': True,
        'message': '下班打卡成功。',
        'data': attendance.to_dict(),
        'location': location_log.to_dict() if location_log else location_meta,
        'policy': rule.to_dict(),
    })


@bp.route('/api/attendance/today')
@login_required
def get_today():
    today = date.today()
    attendance = Attendance.query.filter_by(user_id=current_user.id, attendance_date=today).first()
    rule = get_or_create_attendance_rule()
    logs = [log.to_dict() for log in attendance.location_logs] if attendance else []
    return jsonify({
        'success': True,
        'data': attendance.to_dict() if attendance else None,
        'policy': rule.to_dict(),
        'location_logs': logs,
    })


@bp.route('/api/attendance/my')
@login_required
def get_my_attendance():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 31, type=int)
    start_date = request.args.get('start_date', '').strip()
    end_date = request.args.get('end_date', '').strip()

    query = Attendance.query.filter_by(user_id=current_user.id)
    if start_date:
        query = query.filter(Attendance.attendance_date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(Attendance.attendance_date <= datetime.strptime(end_date, '%Y-%m-%d').date())

    pagination = query.order_by(Attendance.attendance_date.desc()).paginate(page=page, per_page=per_page, error_out=False)
    return paginated_response(pagination, lambda item: item.to_dict())


@bp.route('/api/attendance/all')
@login_required
@college_admin_or_super_admin_required
def get_all_attendance():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    status = request.args.get('status', '').strip()
    keyword = request.args.get('keyword', '').strip()
    start_date = request.args.get('start_date', '').strip()
    end_date = request.args.get('end_date', '').strip()

    scope_user_ids = get_attendance_scope_ids()
    query = Attendance.query.filter(Attendance.user_id.in_(scope_user_ids))

    if status:
        query = query.filter_by(status=status)
    if keyword:
        query = query.join(User, Attendance.user_id == User.id).filter(User.real_name.like(f'%{keyword}%'))
    if start_date:
        query = query.filter(Attendance.attendance_date >= datetime.strptime(start_date, '%Y-%m-%d').date())
    if end_date:
        query = query.filter(Attendance.attendance_date <= datetime.strptime(end_date, '%Y-%m-%d').date())

    pagination = query.order_by(Attendance.attendance_date.desc()).paginate(page=page, per_page=per_page, error_out=False)
    return paginated_response(pagination, lambda item: item.to_dict())


@bp.route('/api/attendance/stats')
@login_required
def get_stats():
    today = date.today()
    month_start = today.replace(day=1)

    scope_user_ids = get_attendance_scope_ids()
    query = Attendance.query.filter(Attendance.user_id.in_(scope_user_ids))

    stats = {
        'total': query.count(),
        'normal': query.filter_by(status='normal').count(),
        'late': query.filter_by(status='late').count(),
        'early': query.filter_by(status='early').count(),
        'absent': query.filter_by(status='absent').count(),
        'on_leave': query.filter_by(status='on_leave').count(),
        'month': query.filter(Attendance.attendance_date >= month_start).count(),
    }
    return jsonify({'success': True, 'data': stats})


@bp.route('/api/attendance/<int:att_id>', methods=['PUT'])
@login_required
@college_admin_or_super_admin_required
def update_attendance(att_id):
    attendance = db.get_or_404(Attendance, att_id)
    if attendance.user_id not in set(get_attendance_scope_ids()):
        return jsonify({'success': False, 'message': '当前账号无权修改该考勤记录。'}), 403

    data = request.get_json() or {}
    if 'status' in data:
        attendance.status = data['status']
    if 'remark' in data:
        attendance.remark = data['remark']

    db.session.commit()
    return jsonify({'success': True, 'data': attendance.to_dict()})


@bp.route('/api/supplements/my')
@login_required
def get_my_supplements():
    requests = (
        AttendanceSupplementRequest.query.filter_by(user_id=current_user.id)
        .order_by(AttendanceSupplementRequest.created_at.desc())
        .all()
    )
    return jsonify({'success': True, 'data': [serialize_supplement_request(item) for item in requests]})


@bp.route('/api/supplements/pending')
@login_required
def get_pending_supplements():
    requests = (
        get_supplement_pending_query()
        .order_by(AttendanceSupplementRequest.created_at.desc())
        .all()
    )
    return jsonify({'success': True, 'data': [serialize_supplement_request(item) for item in requests]})


@bp.route('/api/supplements', methods=['POST'])
@login_required
def create_supplement_request():
    data = request.get_json() or {}
    attendance_date_value = (data.get('attendance_date') or '').strip()
    supplement_type = (data.get('supplement_type') or '').strip()
    requested_time_value = (data.get('requested_time') or '').strip()
    reason = (data.get('reason') or '').strip()

    if not attendance_date_value or not supplement_type or not requested_time_value or not reason:
        return jsonify({'success': False, 'message': '请完整填写补签日期、补签类型、补签时间和原因。'}), 400

    if supplement_type not in {'clock_in', 'clock_out'}:
        return jsonify({'success': False, 'message': '补签类型无效。'}), 400

    try:
        attendance_date_obj = datetime.strptime(attendance_date_value, '%Y-%m-%d').date()
        requested_time_obj = datetime.strptime(requested_time_value, '%H:%M').time()
    except ValueError:
        return jsonify({'success': False, 'message': '日期或时间格式无效，请检查后重试。'}), 400

    if attendance_date_obj > date.today():
        return jsonify({'success': False, 'message': '补签日期不能晚于今天。'}), 400

    attendance = Attendance.query.filter_by(user_id=current_user.id, attendance_date=attendance_date_obj).first()
    if attendance and attendance.status == 'on_leave':
        return jsonify({'success': False, 'message': '该日期已按请假处理，无需补签。'}), 400
    if attendance and supplement_type == 'clock_in' and attendance.clock_in:
        return jsonify({'success': False, 'message': '该日期已存在上班打卡记录，无需重复申请补签。'}), 400
    if attendance and supplement_type == 'clock_out' and attendance.clock_out:
        return jsonify({'success': False, 'message': '该日期已存在下班打卡记录，无需重复申请补签。'}), 400

    existing_request = AttendanceSupplementRequest.query.filter_by(
        user_id=current_user.id,
        attendance_date=attendance_date_obj,
        supplement_type=supplement_type,
        status='pending',
    ).first()
    if existing_request:
        return jsonify({'success': False, 'message': '该日期该类型的补签申请正在审批中，请勿重复提交。'}), 400

    approver, approver_node, approver_level = resolve_supplement_approver(current_user)
    if not approver:
        return jsonify({'success': False, 'message': '暂未找到可审批的管理人员，请联系系统管理员。'}), 400

    supplement_request = AttendanceSupplementRequest(
        user_id=current_user.id,
        attendance_id=attendance.id if attendance else None,
        attendance_date=attendance_date_obj,
        supplement_type=supplement_type,
        requested_time=requested_time_obj,
        reason=reason,
        status='pending',
        current_approver_id=approver.id,
    )
    db.session.add(supplement_request)
    db.session.flush()

    flow_comments = f'自动分配至{approver.real_name}'
    if approver_node:
        flow_comments += f'（{approver_node.name}）'
    flow_comments += f'，审批层级：{approver_level}'
    db.session.add(
        AttendanceSupplementFlow(
            supplement_request_id=supplement_request.id,
            approver_id=approver.id,
            status='pending',
            comments=flow_comments,
        )
    )
    db.session.commit()

    send_notification(
        user_id=approver.id,
        title='待审批补签申请',
        content=f'{current_user.real_name} 提交了 {attendance_date_obj.strftime("%Y-%m-%d")} {supplement_request.get_type_display()} 申请，请及时处理。',
        notification_type='supplement_pending',
        related_id=supplement_request.id,
    )
    log_supplement_action(
        user_id=current_user.id,
        action='attendance_supplement_create',
        supplement_request=supplement_request,
        detail=f'提交补签申请，当前审批人：{approver.real_name}',
        ip_address=request.remote_addr,
    )

    return jsonify({
        'success': True,
        'message': f'补签申请已提交，当前审批人：{approver.real_name}。',
        'data': serialize_supplement_request(supplement_request),
    })


@bp.route('/api/supplements/<int:request_id>/cancel', methods=['POST'])
@login_required
def cancel_supplement_request(request_id):
    supplement_request = db.get_or_404(AttendanceSupplementRequest, request_id)
    if supplement_request.user_id != current_user.id:
        return jsonify({'success': False, 'message': '只能撤回本人提交的补签申请。'}), 403
    if supplement_request.status != 'pending':
        return jsonify({'success': False, 'message': '当前补签申请已处理，不能再撤回。'}), 400

    original_approver_id = supplement_request.current_approver_id
    supplement_request.status = 'cancelled'
    supplement_request.final_approver_id = current_user.id
    supplement_request.current_approver_id = None
    supplement_request.approval_comments = '申请人主动撤回'

    for flow in supplement_request.approval_flows:
        if flow.status == 'pending':
            flow.status = 'cancelled'
            flow.comments = '申请人主动撤回'

    db.session.commit()

    if original_approver_id and original_approver_id != current_user.id:
        send_notification(
            user_id=original_approver_id,
            title='补签申请已撤回',
            content=f'{supplement_request.user.real_name} 撤回了 {supplement_request.attendance_date.strftime("%Y-%m-%d")} {supplement_request.get_type_display()} 申请。',
            notification_type='supplement_cancelled',
            related_id=supplement_request.id,
        )

    log_supplement_action(
        user_id=current_user.id,
        action='attendance_supplement_cancel',
        supplement_request=supplement_request,
        detail='申请人主动撤回补签申请',
        ip_address=request.remote_addr,
    )

    return jsonify({
        'success': True,
        'message': '补签申请已撤回。',
        'data': serialize_supplement_request(supplement_request),
    })


@bp.route('/api/supplements/<int:request_id>/approve', methods=['POST'])
@login_required
def approve_supplement(request_id):
    supplement_request = db.get_or_404(AttendanceSupplementRequest, request_id)
    if supplement_request.status != 'pending':
        return jsonify({'success': False, 'message': '该补签申请已处理，请刷新后重试。'}), 400
    if not can_review_supplement_request(supplement_request):
        return jsonify({'success': False, 'message': '当前账号无权审批该补签申请。'}), 403

    data = request.get_json() or {}
    comments = (data.get('comments') or '').strip()
    apply_supplement_approval(supplement_request, current_user, comments, request.remote_addr)
    return jsonify({
        'success': True,
        'message': '补签申请已批准。',
        'data': serialize_supplement_request(supplement_request),
    })


@bp.route('/api/supplements/<int:request_id>/reject', methods=['POST'])
@login_required
def reject_supplement(request_id):
    supplement_request = db.get_or_404(AttendanceSupplementRequest, request_id)
    if supplement_request.status != 'pending':
        return jsonify({'success': False, 'message': '该补签申请已处理，请刷新后重试。'}), 400
    if not can_review_supplement_request(supplement_request):
        return jsonify({'success': False, 'message': '当前账号无权审批该补签申请。'}), 403

    data = request.get_json() or {}
    comments = (data.get('comments') or '').strip()
    if not comments:
        return jsonify({'success': False, 'message': '驳回补签申请时请填写审批意见。'}), 400

    apply_supplement_rejection(supplement_request, current_user, comments, request.remote_addr)
    return jsonify({
        'success': True,
        'message': '补签申请已驳回。',
        'data': serialize_supplement_request(supplement_request),
    })


def get_batch_supplement_requests(request_ids):
    try:
        request_ids = [int(item) for item in request_ids if str(item).strip()]
    except (TypeError, ValueError):
        return None, jsonify({'success': False, 'message': '补签申请参数无效，请刷新后重试。'}), 400
    if not request_ids:
        return None, jsonify({'success': False, 'message': '请先选择要处理的补签申请。'}), 400

    supplement_requests = (
        AttendanceSupplementRequest.query.filter(AttendanceSupplementRequest.id.in_(request_ids))
        .order_by(AttendanceSupplementRequest.id.asc())
        .all()
    )
    if len(supplement_requests) != len(set(request_ids)):
        return None, jsonify({'success': False, 'message': '存在无效的补签申请记录，请刷新后重试。'}), 400

    invalid_requests = [item for item in supplement_requests if item.status != 'pending']
    if invalid_requests:
        return None, jsonify({'success': False, 'message': '选中的补签申请里包含已处理记录，请刷新后重试。'}), 400

    forbidden_requests = [item for item in supplement_requests if not can_review_supplement_request(item)]
    if forbidden_requests:
        return None, jsonify({'success': False, 'message': '选中的补签申请里包含当前账号无权审批的记录。'}), 403

    return supplement_requests, None, None


@bp.route('/api/supplements/batch-approve', methods=['POST'])
@login_required
def batch_approve_supplements():
    data = request.get_json() or {}
    supplement_requests, error_response, status_code = get_batch_supplement_requests(data.get('request_ids') or [])
    if error_response:
        return error_response, status_code

    comments = (data.get('comments') or '').strip()
    for supplement_request in supplement_requests:
        apply_supplement_approval(supplement_request, current_user, comments, request.remote_addr)

    return jsonify({
        'success': True,
        'message': f'已批量批准 {len(supplement_requests)} 条补签申请。',
    })


@bp.route('/api/supplements/batch-reject', methods=['POST'])
@login_required
def batch_reject_supplements():
    data = request.get_json() or {}
    supplement_requests, error_response, status_code = get_batch_supplement_requests(data.get('request_ids') or [])
    if error_response:
        return error_response, status_code

    comments = (data.get('comments') or '').strip()
    if not comments:
        return jsonify({'success': False, 'message': '批量驳回时请填写审批意见。'}), 400

    for supplement_request in supplement_requests:
        apply_supplement_rejection(supplement_request, current_user, comments, request.remote_addr)

    return jsonify({
        'success': True,
        'message': f'已批量驳回 {len(supplement_requests)} 条补签申请。',
    })


@bp.route('/api/settings')
@login_required
@college_admin_or_super_admin_required
def get_settings():
    rule = get_or_create_attendance_rule()
    return jsonify({'success': True, 'data': rule.to_dict()})


@bp.route('/api/settings', methods=['PUT'])
@login_required
@college_admin_or_super_admin_required
def update_settings():
    rule = get_or_create_attendance_rule()
    data = request.get_json() or {}

    try:
        rule.attendance_enabled = bool(data.get('attendance_enabled', rule.attendance_enabled))
        rule.require_location = bool(data.get('require_location', rule.require_location))
        rule.location_name = (data.get('location_name') or rule.location_name or '学校主校区').strip()
        rule.latitude = float(data['latitude']) if data.get('latitude') not in (None, '') else None
        rule.longitude = float(data['longitude']) if data.get('longitude') not in (None, '') else None
        rule.radius_meters = int(data.get('radius_meters') or rule.radius_meters or 300)
        rule.check_in_start = parse_rule_time(data.get('check_in_start') or rule.to_dict()['check_in_start'], '上班开始时间')
        rule.check_in_end = parse_rule_time(data.get('check_in_end') or rule.to_dict()['check_in_end'], '上班结束时间')
        rule.check_out_start = parse_rule_time(data.get('check_out_start') or rule.to_dict()['check_out_start'], '下班开始时间')
        rule.check_out_end = parse_rule_time(data.get('check_out_end') or rule.to_dict()['check_out_end'], '下班结束时间')
    except (TypeError, ValueError) as exc:
        return jsonify({'success': False, 'message': str(exc)}), 400

    if rule.radius_meters <= 0:
        return jsonify({'success': False, 'message': '允许打卡半径必须大于 0。'}), 400
    if rule.check_in_start and rule.check_in_end and rule.check_in_start >= rule.check_in_end:
        return jsonify({'success': False, 'message': '上班打卡结束时间必须晚于开始时间。'}), 400
    if rule.check_out_start and rule.check_out_end and rule.check_out_start >= rule.check_out_end:
        return jsonify({'success': False, 'message': '下班打卡结束时间必须晚于开始时间。'}), 400

    rule.updated_by = current_user.id
    db.session.commit()
    return jsonify({'success': True, 'message': '考勤规则已更新。', 'data': rule.to_dict()})
