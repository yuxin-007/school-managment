import csv
from io import StringIO

from flask import Blueprint, Response, jsonify, request
from flask_login import login_required, current_user
from sqlalchemy import update
from datetime import datetime

from app.extensions import db
from app.models import Course, CourseAttendanceActivity, CourseAttendanceRecord, CourseSchedule, CourseSelection
from app.services.access_scope_service import (
    can_manage_course,
    can_view_course,
    get_manageable_course_ids,
    get_scope_users,
    get_viewable_courses,
)
from app.services.location import calculate_distance_meters
from app.utils.org_permissions import ROLE_COLLEGE_ADMIN, ROLE_STAFF, ROLE_STUDENT, ROLE_SUPER_ADMIN

bp = Blueprint('course', __name__, url_prefix='/course')

def serialize_courses(courses):
    result = []
    for course in courses:
        payload = course.to_dict()
        payload['schedules'] = [schedule.to_dict() for schedule in course.course_schedules]
        result.append(payload)
    return result


def is_selected_student(course_id, student_id):
    return CourseSelection.query.filter_by(
        course_id=course_id,
        student_id=student_id,
        status='selected',
    ).first() is not None


def parse_activity_time(value, field_label):
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M'):
        try:
            return datetime.strptime(value, fmt)
        except (TypeError, ValueError):
            continue
    raise ValueError(f'{field_label}格式无效，请使用 YYYY-MM-DD HH:MM:SS。')


def get_selected_students(course_id):
    selections = (
        CourseSelection.query.filter_by(course_id=course_id, status='selected')
        .order_by(CourseSelection.selected_at.asc(), CourseSelection.id.asc())
        .all()
    )
    return [selection.student for selection in selections if selection.student and selection.student.is_active]


def serialize_course_student(student, attendance_stats=None):
    attendance_stats = attendance_stats or {}
    total = attendance_stats.get('total', 0)
    attended = attendance_stats.get('present', 0) + attendance_stats.get('late', 0) + attendance_stats.get('manual', 0)
    attendance_rate = round(attended / total * 100, 1) if total else None
    return {
        'id': student.id,
        'username': student.username,
        'real_name': student.real_name,
        'student_id': student.student_id or '',
        'major': student.major or '',
        'grade': student.grade or '',
        'email': student.email or '',
        'phone': student.phone or '',
        'department_name': student.to_dict().get('department_name', ''),
        'attendance_total': total,
        'attendance_present': attended,
        'attendance_absent': attendance_stats.get('absent', 0),
        'attendance_rate': attendance_rate,
    }


def build_activity_stats(records):
    stats = {
        'total': len(records),
        'present': 0,
        'late': 0,
        'absent': 0,
        'leave': 0,
        'location_abnormal': 0,
        'manual': 0,
    }
    for item in records:
        status = item.get('status') if isinstance(item, dict) else item.status
        if status in stats:
            stats[status] += 1
    stats['checked_in'] = stats['present'] + stats['late'] + stats['manual']
    return stats


def serialize_activity_records(activity):
    existing_records = {
        record.student_id: record
        for record in CourseAttendanceRecord.query.filter_by(activity_id=activity.id).all()
    }
    records = []
    for student in get_selected_students(activity.course_id):
        record = existing_records.get(student.id)
        if record:
            payload = record.to_dict()
        else:
            payload = {
                'id': None,
                'activity_id': activity.id,
                'student_id': student.id,
                'student_name': student.real_name,
                'student_no': student.student_id or '',
                'major': student.major or '',
                'grade': student.grade or '',
                'email': student.email or '',
                'phone': student.phone or '',
                'sign_time': '',
                'status': 'absent',
                'status_display': '未签到',
                'latitude': None,
                'longitude': None,
                'accuracy': None,
                'distance_meters': None,
                'within_range': False,
                'remark': '',
                'reviewed_by': None,
                'reviewed_by_name': '',
                'reviewed_at': '',
                'created_at': '',
            }
        records.append(payload)
    return records


def validate_attendance_record_status(status):
    return status in {'present', 'late', 'absent', 'leave', 'location_abnormal', 'manual'}


def get_selected_student_or_none(course_id, student_id):
    selection = CourseSelection.query.filter_by(
        course_id=course_id,
        student_id=student_id,
        status='selected',
    ).first()
    return selection.student if selection and selection.student and selection.student.is_active else None


def get_course_scope_label():
    if current_user.role == ROLE_SUPER_ADMIN:
        return '当前展示全校课程数据，可为任意教职工配置课程。'
    if current_user.role == ROLE_COLLEGE_ADMIN:
        return '当前仅展示本学院组织范围内的课程，可为本学院教职工分配授课任务。'
    if current_user.role == ROLE_STAFF:
        return '当前仅展示由你负责的课程。'
    return '当前仅展示与你所在组织链路相关的课程。'


def get_teacher_candidates():
    if current_user.role == ROLE_SUPER_ADMIN:
        return get_scope_users(current_user, roles=[ROLE_STAFF, ROLE_COLLEGE_ADMIN])
    if current_user.role == ROLE_COLLEGE_ADMIN:
        return get_scope_users(current_user, roles=[ROLE_STAFF, ROLE_COLLEGE_ADMIN])
    if current_user.role == ROLE_STAFF:
        return [current_user]
    return []


def validate_teacher_assignment(teacher_id):
    if current_user.role == ROLE_STAFF:
        return current_user.id

    valid_ids = {teacher.id for teacher in get_teacher_candidates()}
    if teacher_id not in valid_ids:
        return None
    return teacher_id


def validate_schedule_items(schedule_items):
    if not schedule_items:
        return False, '请至少配置一个上课时间段。'

    for schedule_data in schedule_items:
        try:
            start_time = datetime.strptime(schedule_data['start_time'], '%H:%M').time()
            end_time = datetime.strptime(schedule_data['end_time'], '%H:%M').time()
        except (KeyError, TypeError, ValueError):
            return False, '上课时间格式无效，请使用 HH:MM。'

        if start_time >= end_time:
            return False, '结束时间必须晚于开始时间。'

    return True, None


def validate_course_capacity(max_students, current_students=0):
    try:
        capacity = int(max_students)
    except (TypeError, ValueError):
        return False, '最大选课人数必须是有效数字。'

    if capacity < 1:
        return False, '最大选课人数不能小于 1。'

    if capacity < current_students:
        return False, '最大选课人数不能小于当前已选人数。'

    return True, None


@bp.route('/api/courses', methods=['GET'])
@login_required
def get_courses():
    if current_user.role == ROLE_STUDENT:
        courses = get_viewable_courses(current_user)
    elif current_user.role == ROLE_STAFF:
        courses = Course.query.filter_by(teacher_id=current_user.id).order_by(Course.created_at.desc()).all()
    elif current_user.role == ROLE_COLLEGE_ADMIN:
        courses = get_viewable_courses(current_user, include_inactive=True)
    else:
        courses = Course.query.order_by(Course.created_at.desc()).all()
    return jsonify({
        'success': True,
        'data': serialize_courses(courses),
        'meta': {'scope_label': get_course_scope_label()},
    })


@bp.route('/api/teachers/options', methods=['GET'])
@login_required
def get_teacher_options():
    if current_user.role not in [ROLE_SUPER_ADMIN, ROLE_COLLEGE_ADMIN, ROLE_STAFF]:
        return jsonify({'success': False, 'message': '权限不足。'}), 403

    teachers = get_teacher_candidates()
    data = [
        {
            'id': teacher.id,
            'name': teacher.real_name or teacher.username,
            'username': teacher.username,
            'role': teacher.role,
        }
        for teacher in teachers
    ]
    return jsonify({'success': True, 'data': data})


@bp.route('/api/courses', methods=['POST'])
@login_required
def create_course():
    if current_user.role not in [ROLE_SUPER_ADMIN, ROLE_COLLEGE_ADMIN, ROLE_STAFF]:
        return jsonify({'success': False, 'message': '权限不足。'}), 403

    data = request.get_json() or {}
    if not data.get('name') or not data.get('code') or not data.get('semester'):
        return jsonify({'success': False, 'message': '缺少必填字段。'}), 400
    if Course.query.filter_by(code=data['code']).first():
        return jsonify({'success': False, 'message': '课程代码已存在。'}), 400

    schedules = data.get('schedules', [])
    valid_schedule, schedule_error = validate_schedule_items(schedules)
    if not valid_schedule:
        return jsonify({'success': False, 'message': schedule_error}), 400

    valid_capacity, capacity_error = validate_course_capacity(data.get('max_students', 30))
    if not valid_capacity:
        return jsonify({'success': False, 'message': capacity_error}), 400

    teacher_id = validate_teacher_assignment(data.get('teacher_id', current_user.id))
    if teacher_id is None:
        return jsonify({'success': False, 'message': '授课教师不在当前组织范围内。'}), 400

    course = Course(
        name=data['name'],
        code=data['code'],
        description=data.get('description'),
        credit=float(data.get('credit', 0)),
        hours=int(data.get('hours', 0)),
        teacher_id=teacher_id,
        location=data.get('location'),
        max_students=int(data.get('max_students', 30)),
        semester=data['semester'],
        is_active=bool(data.get('is_active', True)),
    )
    db.session.add(course)
    db.session.flush()

    for schedule_data in schedules:
        schedule = CourseSchedule(
            course_id=course.id,
            day_of_week=int(schedule_data['day_of_week']),
            start_time=datetime.strptime(schedule_data['start_time'], '%H:%M').time(),
            end_time=datetime.strptime(schedule_data['end_time'], '%H:%M').time()
        )
        db.session.add(schedule)

    db.session.commit()
    return jsonify({'success': True, 'message': '课程创建成功。'})


@bp.route('/api/courses/<int:course_id>', methods=['PUT'])
@login_required
def update_course(course_id):
    course = db.get_or_404(Course, course_id)
    if not can_manage_course(current_user, course):
        return jsonify({'success': False, 'message': '权限不足。'}), 403

    data = request.get_json() or {}
    if 'name' in data:
        course.name = data['name']
    if 'description' in data:
        course.description = data['description']
    if 'credit' in data:
        course.credit = data['credit']
    if 'hours' in data:
        course.hours = data['hours']
    if 'location' in data:
        course.location = data['location']
    if 'max_students' in data:
        valid_capacity, capacity_error = validate_course_capacity(data['max_students'], course.current_students)
        if not valid_capacity:
            return jsonify({'success': False, 'message': capacity_error}), 400
        course.max_students = data['max_students']
    if 'is_active' in data:
        course.is_active = data['is_active']
    if 'semester' in data and data['semester']:
        course.semester = data['semester']
    if 'teacher_id' in data:
        teacher_id = validate_teacher_assignment(data['teacher_id'])
        if teacher_id is None:
            return jsonify({'success': False, 'message': '授课教师不在当前组织范围内。'}), 400
        course.teacher_id = teacher_id
    if 'schedules' in data:
        valid_schedule, schedule_error = validate_schedule_items(data['schedules'])
        if not valid_schedule:
            return jsonify({'success': False, 'message': schedule_error}), 400
        CourseSchedule.query.filter_by(course_id=course_id).delete()
        for schedule_data in data['schedules']:
            schedule = CourseSchedule(
                course_id=course_id,
                day_of_week=int(schedule_data['day_of_week']),
                start_time=datetime.strptime(schedule_data['start_time'], '%H:%M').time(),
                end_time=datetime.strptime(schedule_data['end_time'], '%H:%M').time()
            )
            db.session.add(schedule)
    db.session.commit()
    return jsonify({'success': True, 'message': '课程更新成功。'})


@bp.route('/api/courses/<int:course_id>', methods=['DELETE'])
@login_required
def delete_course(course_id):
    course = db.get_or_404(Course, course_id)
    if not can_manage_course(current_user, course):
        return jsonify({'success': False, 'message': '权限不足。'}), 403
    if course.current_students > 0:
        return jsonify({'success': False, 'message': '该课程已有学生选课，无法删除。'}), 400
    db.session.delete(course)
    db.session.commit()
    return jsonify({'success': True, 'message': '课程已删除。'})


@bp.route('/api/courses/<int:course_id>', methods=['GET'])
@login_required
def get_course(course_id):
    course = db.get_or_404(Course, course_id)
    if not can_view_course(current_user, course):
        return jsonify({'success': False, 'message': '权限不足。'}), 403
    data = course.to_dict()
    data['schedules'] = [schedule.to_dict() for schedule in course.course_schedules]
    return jsonify({'success': True, 'data': data})


@bp.route('/api/courses/<int:course_id>/students', methods=['GET'])
@login_required
def get_course_roster(course_id):
    course = db.get_or_404(Course, course_id)
    if not can_manage_course(current_user, course):
        return jsonify({'success': False, 'message': '当前账号无权查看该课程学生名单。'}), 403

    activity_ids = [item.id for item in CourseAttendanceActivity.query.filter_by(course_id=course_id).all()]
    per_student_stats = {}
    if activity_ids:
        records = CourseAttendanceRecord.query.filter(CourseAttendanceRecord.activity_id.in_(activity_ids)).all()
        for student in get_selected_students(course_id):
            per_student_stats[student.id] = {'total': len(activity_ids), 'present': 0, 'late': 0, 'absent': 0, 'manual': 0}
        for record in records:
            if record.student_id not in per_student_stats:
                continue
            if record.status in per_student_stats[record.student_id]:
                per_student_stats[record.student_id][record.status] += 1
        for stats in per_student_stats.values():
            stats['absent'] = max(stats['total'] - stats['present'] - stats['late'] - stats['manual'], 0)

    students = [
        serialize_course_student(student, per_student_stats.get(student.id))
        for student in get_selected_students(course_id)
    ]
    return jsonify({'success': True, 'data': students})


@bp.route('/api/courses/<int:course_id>/attendance-activities', methods=['GET'])
@login_required
def get_course_attendance_activities(course_id):
    course = db.get_or_404(Course, course_id)
    if current_user.role == ROLE_STUDENT:
        if not is_selected_student(course_id, current_user.id):
            return jsonify({'success': False, 'message': '你尚未选择该课程。'}), 403
    elif not can_manage_course(current_user, course):
        return jsonify({'success': False, 'message': '当前账号无权查看该课程签到活动。'}), 403

    activities = (
        CourseAttendanceActivity.query.filter_by(course_id=course_id)
        .order_by(CourseAttendanceActivity.start_time.desc(), CourseAttendanceActivity.id.desc())
        .all()
    )
    payload = []
    for activity in activities:
        if current_user.role == ROLE_STUDENT and activity.get_status() != 'open':
            continue
        item = activity.to_dict()
        if current_user.role == ROLE_STUDENT:
            record = CourseAttendanceRecord.query.filter_by(activity_id=activity.id, student_id=current_user.id).first()
            item['my_record'] = record.to_dict() if record else None
        else:
            records = serialize_activity_records(activity)
            item['stats'] = build_activity_stats(records)
        payload.append(item)
    return jsonify({'success': True, 'data': payload})


@bp.route('/api/courses/<int:course_id>/attendance-activities', methods=['POST'])
@login_required
def create_course_attendance_activity(course_id):
    course = db.get_or_404(Course, course_id)
    if not can_manage_course(current_user, course):
        return jsonify({'success': False, 'message': '当前账号无权为该课程发布签到。'}), 403

    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'success': False, 'message': '请填写签到名称。'}), 400

    try:
        start_time = parse_activity_time(data.get('start_time'), '开始时间')
        end_time = parse_activity_time(data.get('end_time'), '结束时间')
    except ValueError as exc:
        return jsonify({'success': False, 'message': str(exc)}), 400
    if start_time >= end_time:
        return jsonify({'success': False, 'message': '签到结束时间必须晚于开始时间。'}), 400

    latitude = data.get('latitude')
    longitude = data.get('longitude')
    if latitude is None or longitude is None:
        return jsonify({'success': False, 'message': '请设置签到定位点。'}), 400
    try:
        latitude = float(latitude)
        longitude = float(longitude)
        radius_meters = int(data.get('radius_meters', 200))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': '定位点或签到范围格式无效。'}), 400
    if radius_meters < 1:
        return jsonify({'success': False, 'message': '签到范围必须大于 0 米。'}), 400

    activity = CourseAttendanceActivity(
        course_id=course.id,
        teacher_id=current_user.id,
        title=title,
        start_time=start_time,
        end_time=end_time,
        location_name=(data.get('location_name') or course.location or '').strip(),
        latitude=latitude,
        longitude=longitude,
        radius_meters=radius_meters,
        allow_late=bool(data.get('allow_late', True)),
        is_active=True,
    )
    db.session.add(activity)
    db.session.commit()

    return jsonify({'success': True, 'message': '课程签到已发布。', 'data': activity.to_dict()})


@bp.route('/api/attendance-activities/<int:activity_id>/close', methods=['POST'])
@login_required
def close_course_attendance_activity(activity_id):
    activity = db.get_or_404(CourseAttendanceActivity, activity_id)
    if not can_manage_course(current_user, activity.course):
        return jsonify({'success': False, 'message': '当前账号无权结束该签到活动。'}), 403
    if not activity.is_active:
        return jsonify({'success': False, 'message': '该签到活动已结束。', 'data': activity.to_dict()}), 400

    activity.is_active = False
    db.session.commit()
    return jsonify({'success': True, 'message': '签到活动已结束。', 'data': activity.to_dict()})


@bp.route('/api/attendance-activities/<int:activity_id>/sign-in', methods=['POST'])
@login_required
def sign_in_course_attendance(activity_id):
    if current_user.role != ROLE_STUDENT:
        return jsonify({'success': False, 'message': '只有学生可以进行课程签到。'}), 403

    activity = db.get_or_404(CourseAttendanceActivity, activity_id)
    if not activity.is_active:
        return jsonify({'success': False, 'message': '该签到活动已关闭。'}), 400
    if not is_selected_student(activity.course_id, current_user.id):
        return jsonify({'success': False, 'message': '你尚未选择该课程，不能签到。'}), 403

    now = datetime.now()
    if now < activity.start_time:
        return jsonify({'success': False, 'message': '签到尚未开始。'}), 400
    if now > activity.end_time:
        return jsonify({'success': False, 'message': '签到已结束，不能再签到。'}), 400

    data = request.get_json(silent=True) or {}
    if data.get('latitude') is None or data.get('longitude') is None:
        return jsonify({'success': False, 'message': '请先开启定位权限后再进行签到。'}), 400

    try:
        latitude = float(data.get('latitude'))
        longitude = float(data.get('longitude'))
        accuracy = float(data.get('accuracy')) if data.get('accuracy') is not None else None
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': '定位数据格式无效。'}), 400

    distance = calculate_distance_meters(latitude, longitude, float(activity.latitude), float(activity.longitude))
    within_range = distance <= float(activity.radius_meters or 0)
    if not within_range:
        status = 'location_abnormal'
    else:
        status = 'present'

    record = CourseAttendanceRecord.query.filter_by(activity_id=activity.id, student_id=current_user.id).first()
    if record and record.status in {'present', 'late', 'manual'}:
        return jsonify({'success': False, 'message': '你已完成该课程签到。', 'data': record.to_dict()}), 400
    if not record:
        record = CourseAttendanceRecord(activity_id=activity.id, student_id=current_user.id)
        db.session.add(record)

    record.sign_time = now
    record.status = status
    record.latitude = latitude
    record.longitude = longitude
    record.accuracy = accuracy
    record.distance_meters = round(distance, 2)
    record.within_range = within_range
    record.remark = (data.get('remark') or '').strip()
    db.session.commit()

    if status == 'location_abnormal':
        return jsonify({
            'success': False,
            'message': f'当前位置超出签到范围，距离签到点约 {round(distance)} 米，已记录为位置异常。',
            'data': record.to_dict(),
        }), 400
    return jsonify({'success': True, 'message': '课程签到成功。', 'data': record.to_dict()})


@bp.route('/api/attendance-activities/<int:activity_id>/records', methods=['GET'])
@login_required
def get_course_attendance_records(activity_id):
    activity = db.get_or_404(CourseAttendanceActivity, activity_id)
    if not can_manage_course(current_user, activity.course):
        return jsonify({'success': False, 'message': '当前账号无权查看该签到统计。'}), 403

    records = serialize_activity_records(activity)
    return jsonify({
        'success': True,
        'data': {
            'activity': activity.to_dict(),
            'stats': build_activity_stats(records),
            'records': records,
        },
    })


@bp.route('/api/attendance-activities/<int:activity_id>/records/export', methods=['GET'])
@login_required
def export_course_attendance_records(activity_id):
    activity = db.get_or_404(CourseAttendanceActivity, activity_id)
    if not can_manage_course(current_user, activity.course):
        return jsonify({'success': False, 'message': '当前账号无权导出该签到统计。'}), 403

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'student_no',
        'student_name',
        'major',
        'phone',
        'email',
        'status',
        'sign_time',
        'distance_meters',
        'remark',
    ])
    for record in serialize_activity_records(activity):
        writer.writerow([
            record.get('student_no') or '',
            record.get('student_name') or '',
            record.get('major') or '',
            record.get('phone') or '',
            record.get('email') or '',
            record.get('status_display') or '',
            record.get('sign_time') or '',
            record.get('distance_meters') or '',
            record.get('remark') or '',
        ])

    filename = f'course-attendance-{activity.id}.csv'
    return Response(
        '\ufeff' + output.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'},
    )


@bp.route('/api/attendance-activities/<int:activity_id>/records/<int:student_id>', methods=['PUT'])
@login_required
def upsert_course_attendance_record(activity_id, student_id):
    activity = db.get_or_404(CourseAttendanceActivity, activity_id)
    if not can_manage_course(current_user, activity.course):
        return jsonify({'success': False, 'message': '当前账号无权修改该签到记录。'}), 403

    student = get_selected_student_or_none(activity.course_id, student_id)
    if not student:
        return jsonify({'success': False, 'message': '该学生未选择此课程，不能维护签到记录。'}), 400

    data = request.get_json(silent=True) or {}
    status = data.get('status')
    if not validate_attendance_record_status(status):
        return jsonify({'success': False, 'message': '签到状态无效。'}), 400

    record = CourseAttendanceRecord.query.filter_by(activity_id=activity.id, student_id=student.id).first()
    if not record:
        record = CourseAttendanceRecord(activity_id=activity.id, student_id=student.id)
        db.session.add(record)

    record.status = status
    record.remark = data.get('remark') or ''
    if status in {'present', 'late', 'manual'} and not record.sign_time:
        record.sign_time = datetime.now()
    record.reviewed_by = current_user.id
    record.reviewed_at = datetime.now()
    db.session.commit()
    return jsonify({'success': True, 'message': '签到记录已更新。', 'data': record.to_dict()})


@bp.route('/api/attendance-records/<int:record_id>', methods=['PUT'])
@login_required
def update_course_attendance_record(record_id):
    record = db.get_or_404(CourseAttendanceRecord, record_id)
    if not can_manage_course(current_user, record.activity.course):
        return jsonify({'success': False, 'message': '当前账号无权修改该签到记录。'}), 403

    data = request.get_json(silent=True) or {}
    status = data.get('status')
    if not validate_attendance_record_status(status):
        return jsonify({'success': False, 'message': '签到状态无效。'}), 400
    record.status = status
    if 'remark' in data:
        record.remark = data.get('remark') or ''
    record.reviewed_by = current_user.id
    record.reviewed_at = datetime.now()
    db.session.commit()
    return jsonify({'success': True, 'message': '签到记录已更新。', 'data': record.to_dict()})


@bp.route('/api/courses/select', methods=['POST'])
@login_required
def select_course():
    if current_user.role != ROLE_STUDENT:
        return jsonify({'success': False, 'message': '只有学生可以选课。'}), 403

    data = request.get_json(silent=True) or {}
    course_id = data.get('course_id')
    if not course_id:
        return jsonify({'success': False, 'message': '请选择课程。'}), 400

    course = db.get_or_404(Course, course_id)
    if not can_view_course(current_user, course):
        return jsonify({'success': False, 'message': '该课程不在当前学生的组织范围内。'}), 403
    if not course.is_active:
        return jsonify({'success': False, 'message': '课程已停用。'}), 400

    selection = CourseSelection.query.filter_by(student_id=current_user.id, course_id=course_id).first()
    if selection and selection.status == 'selected':
        return jsonify({'success': False, 'message': '你已经选择过该课程。'}), 400

    conflict = check_conflict(current_user.id, course_id)
    if conflict:
        return jsonify({'success': False, 'message': conflict}), 400

    result = db.session.execute(
        update(Course)
        .where(Course.id == course_id)
        .where(Course.current_students < Course.max_students)
        .values(current_students=Course.current_students + 1)
    )
    if result.rowcount == 0:
        db.session.rollback()
        return jsonify({'success': False, 'message': '课程人数已满。'}), 400

    if selection:
        selection.status = 'selected'
    else:
        selection = CourseSelection(student_id=current_user.id, course_id=course_id, status='selected')
        db.session.add(selection)

    from app.blueprints.log import log_operation

    log_operation(
        user_id=current_user.id,
        action='select_course',
        target_type='Course',
        target_id=course.id,
        target_name=course.name,
        detail=f'学生 {current_user.real_name} 选择课程 {course.name}',
        ip_address=request.remote_addr,
    )
    db.session.commit()
    return jsonify({'success': True, 'message': '选课成功。'})


@bp.route('/api/courses/drop', methods=['POST'])
@login_required
def drop_course():
    if current_user.role != ROLE_STUDENT:
        return jsonify({'success': False, 'message': '只有学生可以退选。'}), 403

    data = request.get_json(silent=True) or {}
    course_id = data.get('course_id')
    if not course_id:
        return jsonify({'success': False, 'message': '请选择课程。'}), 400

    selection = CourseSelection.query.filter_by(student_id=current_user.id, course_id=course_id, status='selected').first()
    if not selection:
        return jsonify({'success': False, 'message': '你还没有选择该课程。'}), 400

    selection.status = 'dropped'
    db.session.execute(
        update(Course)
        .where(Course.id == course_id)
        .where(Course.current_students > 0)
        .values(current_students=Course.current_students - 1)
    )

    course = db.session.get(Course, course_id)
    from app.blueprints.log import log_operation

    log_operation(
        user_id=current_user.id,
        action='drop_course',
        target_type='Course',
        target_id=course_id,
        target_name=course.name if course else str(course_id),
        detail=f'学生 {current_user.real_name} 退选课程 {course.name if course else course_id}',
        ip_address=request.remote_addr,
    )
    db.session.commit()
    return jsonify({'success': True, 'message': '退选成功。'})


@bp.route('/api/courses/my-selections', methods=['GET'])
@login_required
def my_selections():
    if current_user.role == ROLE_STUDENT:
        selections = CourseSelection.query.filter_by(student_id=current_user.id, status='selected').all()
        return jsonify({'success': True, 'data': [selection.to_dict() for selection in selections]})
    if current_user.role == ROLE_STAFF:
        courses = Course.query.filter_by(teacher_id=current_user.id).all()
        return jsonify({'success': True, 'data': [course.to_dict() for course in courses]})
    return jsonify({'success': False, 'message': '权限不足。'}), 403


@bp.route('/api/courses/schedule', methods=['GET'])
@login_required
def get_schedule():
    if current_user.role == ROLE_STUDENT:
        selections = CourseSelection.query.filter_by(student_id=current_user.id, status='selected').all()
        courses = [selection.course for selection in selections if selection.course and selection.course.is_active]
    elif current_user.role == ROLE_STAFF:
        courses = Course.query.filter_by(teacher_id=current_user.id, is_active=True).all()
    else:
        return jsonify({'success': False, 'message': '权限不足。'}), 403

    schedule = []
    for course in courses:
        for course_schedule in course.course_schedules:
            schedule.append({
                'course_id': course.id,
                'course_name': course.name,
                'course_code': course.code,
                'teacher_name': course.teacher.real_name if course.teacher else '',
                'location': course.location,
                'day_of_week': course_schedule.day_of_week,
                'day_display': course_schedule.get_day_display(),
                'start_time': course_schedule.start_time.strftime('%H:%M'),
                'end_time': course_schedule.end_time.strftime('%H:%M'),
                'time_display': f"{course_schedule.start_time.strftime('%H:%M')}-{course_schedule.end_time.strftime('%H:%M')}"
            })
    return jsonify({'success': True, 'data': schedule})


def check_conflict(student_id, new_course_id):
    selections = CourseSelection.query.filter_by(student_id=student_id, status='selected').all()
    new_schedules = CourseSchedule.query.filter_by(course_id=new_course_id).all()
    for selection in selections:
        if selection.course_id == new_course_id:
            continue
        existing_schedules = CourseSchedule.query.filter_by(course_id=selection.course_id).all()
        for existing in existing_schedules:
            for new_item in new_schedules:
                if (
                    existing.day_of_week == new_item.day_of_week
                    and existing.start_time < new_item.end_time
                    and existing.end_time > new_item.start_time
                ):
                    existing_course = db.session.get(Course, selection.course_id)
                    return f'与课程「{existing_course.name}」时间冲突。'
    return None
