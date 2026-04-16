from datetime import datetime

from flask import Blueprint, jsonify, request, redirect
from flask_login import login_required, current_user

from app.extensions import db
from app.models import Grade, Course, CourseSelection
from app.services.access_scope_service import can_view_course, get_manageable_course_ids
from app.utils.org_permissions import ROLE_COLLEGE_ADMIN, ROLE_STAFF, ROLE_SUPER_ADMIN

bp = Blueprint('grade', __name__, url_prefix='/grade')

FRONTEND_URL = ''


def can_manage_grade_course(course):
    if current_user.role == ROLE_SUPER_ADMIN:
        return True
    if current_user.role == ROLE_COLLEGE_ADMIN:
        return course.id in get_manageable_course_ids(current_user)
    return course.teacher_id == current_user.id


@bp.route('/')
@login_required
def index():
    return redirect(FRONTEND_URL + '/my-grades')


@bp.route('/entry')
@login_required
def entry():
    if current_user.role not in [ROLE_SUPER_ADMIN, ROLE_COLLEGE_ADMIN, ROLE_STAFF]:
        return jsonify({'success': False, 'message': '权限不足。'}), 403
    return redirect(FRONTEND_URL + '/grade-entry')


@bp.route('/api/grades/my')
@login_required
def get_my_grades():
    if current_user.role != 'student':
        return jsonify({'success': False, 'message': '只有学生可以查看自己的成绩。'}), 403

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    query = Grade.query.filter_by(student_id=current_user.id, is_published=True)
    pagination = query.order_by(Grade.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'success': True,
        'data': [item.to_dict() for item in pagination.items],
        'pagination': {
            'page': page,
            'per_page': per_page,
            'total': pagination.total,
            'pages': pagination.pages,
            'has_next': pagination.has_next,
            'has_prev': pagination.has_prev
        }
    })


@bp.route('/api/grades/course/<int:course_id>')
@login_required
def get_course_grades(course_id):
    course = Course.query.get_or_404(course_id)
    if not can_manage_grade_course(course):
        return jsonify({'success': False, 'message': '当前账号无权查看该课程成绩。'}), 403

    grades = Grade.query.filter_by(course_id=course_id).order_by(Grade.student_id).all()
    return jsonify({'success': True, 'data': [item.to_dict() for item in grades]})


@bp.route('/api/grades/teacher-courses')
@login_required
def get_teacher_courses():
    if current_user.role not in [ROLE_SUPER_ADMIN, ROLE_COLLEGE_ADMIN, ROLE_STAFF]:
        return jsonify({'success': False, 'message': '权限不足。'}), 403

    if current_user.role == ROLE_STAFF:
        courses = Course.query.filter_by(teacher_id=current_user.id).all()
    elif current_user.role == ROLE_COLLEGE_ADMIN:
        manageable_ids = get_manageable_course_ids(current_user)
        courses = Course.query.filter(Course.id.in_(manageable_ids)).all() if manageable_ids else []
    else:
        courses = Course.query.all()

    result = []
    for course in courses:
        result.append({
            'id': course.id,
            'name': course.name,
            'code': course.code,
            'semester': course.semester,
            'grade_count': Grade.query.filter_by(course_id=course.id).count()
        })
    return jsonify({'success': True, 'data': result})


@bp.route('/api/grades/course/<int:course_id>/students')
@login_required
def get_course_students(course_id):
    course = Course.query.get_or_404(course_id)
    if not can_manage_grade_course(course):
        return jsonify({'success': False, 'message': '当前账号无权查看该课程学生。'}), 403

    selections = CourseSelection.query.filter_by(course_id=course_id, status='selected').all()
    students = []
    for selection in selections:
        student = selection.student
        grade = Grade.query.filter_by(student_id=student.id, course_id=course_id).first()
        students.append({
            'student_id': student.id,
            'student_name': student.real_name,
            'student_number': student.student_id or student.employee_id,
            'grade_id': grade.id if grade else None,
            'score': grade.score if grade else None,
            'grade_letter': grade.get_score_letter() if grade else None,
            'grade_type': grade.grade_type if grade else None,
            'is_published': grade.is_published if grade else False
        })
    return jsonify({'success': True, 'data': students})


@bp.route('/api/grades', methods=['POST'])
@login_required
def create_or_update_grade():
    if current_user.role not in [ROLE_SUPER_ADMIN, ROLE_COLLEGE_ADMIN, ROLE_STAFF]:
        return jsonify({'success': False, 'message': '权限不足。'}), 403

    data = request.get_json() or {}
    student_id = data.get('student_id')
    course_id = data.get('course_id')
    score = data.get('score')
    grade_type = data.get('grade_type', 'final')
    comment = data.get('comment', '')
    is_published = data.get('is_published', False)

    if not student_id or not course_id:
        return jsonify({'success': False, 'message': '参数不完整。'}), 400

    course = Course.query.get_or_404(course_id)
    if not can_manage_grade_course(course):
        return jsonify({'success': False, 'message': '当前账号无权维护该课程成绩。'}), 403

    grade = Grade.query.filter_by(student_id=student_id, course_id=course_id, grade_type=grade_type).first()
    if grade:
        if score is not None:
            grade.score = float(score)
        grade.comment = comment
        grade.teacher_id = current_user.id
        grade.is_published = is_published
        if is_published and not grade.published_at:
            grade.published_at = datetime.now()
        action = 'grade_update'
    else:
        grade = Grade(
            student_id=student_id,
            course_id=course_id,
            teacher_id=current_user.id,
            score=float(score) if score is not None else None,
            grade_type=grade_type,
            comment=comment,
            is_published=is_published,
            published_at=datetime.now() if is_published else None
        )
        db.session.add(grade)
        action = 'grade_entry'

    db.session.commit()

    from app.blueprints.log import log_operation
    log_operation(
        user_id=current_user.id,
        action=action,
        target_type='Grade',
        target_id=grade.id,
        target_name=f"{course.name} - {grade.student.real_name if grade.student else ''}",
        detail=f'成绩: {score}',
        ip_address=request.remote_addr
    )

    from app.blueprints.notification import create_notification
    if is_published:
        create_notification(
            user_id=student_id,
            title='成绩已发布',
            content=f'您的课程《{course.name}》成绩已发布：{score} 分。',
            notification_type='grade_published',
            related_id=grade.id,
            related_type='Grade'
        )

    return jsonify({'success': True, 'data': grade.to_dict(), 'message': '成绩保存成功。'})


@bp.route('/api/grades/<int:grade_id>', methods=['DELETE'])
@login_required
def delete_grade(grade_id):
    if current_user.role not in [ROLE_SUPER_ADMIN, ROLE_COLLEGE_ADMIN]:
        return jsonify({'success': False, 'message': '权限不足。'}), 403

    grade = Grade.query.get_or_404(grade_id)
    course = Course.query.get_or_404(grade.course_id)
    if not can_manage_grade_course(course):
        return jsonify({'success': False, 'message': '当前账号无权删除该成绩。'}), 403

    db.session.delete(grade)
    db.session.commit()
    return jsonify({'success': True, 'message': '成绩已删除。'})


@bp.route('/api/grades/stats')
@login_required
def get_stats():
    if current_user.role not in [ROLE_SUPER_ADMIN, ROLE_COLLEGE_ADMIN, ROLE_STAFF]:
        return jsonify({'success': False, 'message': '权限不足。'}), 403

    if current_user.role == ROLE_STAFF:
        course_ids = [course.id for course in Course.query.filter_by(teacher_id=current_user.id).all()]
    elif current_user.role == ROLE_COLLEGE_ADMIN:
        course_ids = list(get_manageable_course_ids(current_user))
    else:
        course_ids = [course.id for course in Course.query.all()]

    if not course_ids:
        return jsonify({'success': True, 'data': {'total': 0, 'published': 0, 'avg_score': 0}})

    total = Grade.query.filter(Grade.course_id.in_(course_ids)).count()
    published = Grade.query.filter(Grade.course_id.in_(course_ids), Grade.is_published.is_(True)).count()
    avg_result = db.session.query(db.func.avg(Grade.score)).filter(
        Grade.course_id.in_(course_ids),
        Grade.score.isnot(None)
    ).scalar()

    return jsonify({
        'success': True,
        'data': {
            'total': total,
            'published': published,
            'avg_score': round(float(avg_result), 1) if avg_result else 0
        }
    })
