from flask import Blueprint, jsonify, request, redirect
from flask_login import login_required, current_user
from sqlalchemy import update
from datetime import datetime

from app.extensions import db
from app.models import Course, CourseSchedule, CourseSelection
from app.services.access_scope_service import (
    can_view_course,
    get_manageable_course_ids,
    get_scope_users,
    get_viewable_courses,
)
from app.utils.org_permissions import ROLE_COLLEGE_ADMIN, ROLE_STAFF, ROLE_STUDENT, ROLE_SUPER_ADMIN

bp = Blueprint('course', __name__, url_prefix='/course')

FRONTEND_URL = ''


def serialize_courses(courses):
    result = []
    for course in courses:
        payload = course.to_dict()
        payload['schedules'] = [schedule.to_dict() for schedule in course.course_schedules]
        result.append(payload)
    return result


def can_manage_course_record(course):
    if current_user.role == ROLE_SUPER_ADMIN:
        return True
    if current_user.role == ROLE_COLLEGE_ADMIN:
        return course.id in get_manageable_course_ids(current_user)
    return course.teacher_id == current_user.id


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


@bp.route('/management')
@login_required
def management():
    if current_user.role not in [ROLE_SUPER_ADMIN, ROLE_COLLEGE_ADMIN, ROLE_STAFF]:
        return jsonify({'success': False, 'message': '权限不足。'}), 403
    return redirect(FRONTEND_URL + '/courses')


@bp.route('/selection')
@login_required
def selection():
    if current_user.role != ROLE_STUDENT:
        return jsonify({'success': False, 'message': '只有学生可以选课。'}), 403
    return redirect(FRONTEND_URL + '/course-selection')


@bp.route('/schedule')
@login_required
def schedule():
    return redirect(FRONTEND_URL + '/course-schedule')


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
    course = Course.query.get_or_404(course_id)
    if not can_manage_course_record(course):
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
    course = Course.query.get_or_404(course_id)
    if not can_manage_course_record(course):
        return jsonify({'success': False, 'message': '权限不足。'}), 403
    if course.current_students > 0:
        return jsonify({'success': False, 'message': '该课程已有学生选课，无法删除。'}), 400
    db.session.delete(course)
    db.session.commit()
    return jsonify({'success': True, 'message': '课程已删除。'})


@bp.route('/api/courses/<int:course_id>', methods=['GET'])
@login_required
def get_course(course_id):
    course = Course.query.get_or_404(course_id)
    if not can_view_course(current_user, course):
        return jsonify({'success': False, 'message': '权限不足。'}), 403
    data = course.to_dict()
    data['schedules'] = [schedule.to_dict() for schedule in course.course_schedules]
    return jsonify({'success': True, 'data': data})


@bp.route('/api/courses/select', methods=['POST'])
@login_required
def select_course():
    if current_user.role != ROLE_STUDENT:
        return jsonify({'success': False, 'message': '只有学生可以选课。'}), 403

    course_id = request.json.get('course_id')
    course = Course.query.get_or_404(course_id)
    if not can_view_course(current_user, course):
        return jsonify({'success': False, 'message': '该课程不在当前学生的组织范围内。'}), 403
    if not course.is_active:
        return jsonify({'success': False, 'message': '课程已停用。'}), 400

    existing = CourseSelection.query.filter_by(student_id=current_user.id, course_id=course_id, status='selected').first()
    if existing:
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

    selection = CourseSelection(student_id=current_user.id, course_id=course_id, status='selected')
    db.session.add(selection)
    db.session.commit()
    return jsonify({'success': True, 'message': '选课成功。'})


@bp.route('/api/courses/drop', methods=['POST'])
@login_required
def drop_course():
    if current_user.role != ROLE_STUDENT:
        return jsonify({'success': False, 'message': '只有学生可以退选。'}), 403

    course_id = request.json.get('course_id')
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
                    existing_course = Course.query.get(selection.course_id)
                    return f'与课程「{existing_course.name}」时间冲突。'
    return None
