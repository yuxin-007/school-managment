import csv
import os
import uuid
from datetime import datetime
from io import StringIO
from pathlib import Path

from flask import Blueprint, Response, current_app, jsonify, request, send_file
from flask_login import current_user, login_required
from werkzeug.utils import secure_filename

from app.extensions import db
from app.models import (
    Course,
    CourseAssignment,
    CourseAssignmentAttachment,
    CourseAssignmentSubmission,
    CourseAssignmentSubmissionVersion,
    CourseSelection,
    Grade,
)
from app.services.access_scope_service import can_manage_course, get_manageable_course_ids
from app.utils.org_permissions import ROLE_COLLEGE_ADMIN, ROLE_STAFF, ROLE_STUDENT, ROLE_SUPER_ADMIN

bp = Blueprint('assignment', __name__, url_prefix='/assignment')

ALLOWED_ATTACHMENT_EXTENSIONS = {
    'txt', 'md', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
    'png', 'jpg', 'jpeg', 'zip', 'rar',
}
MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024


def is_selected_student(course_id, student_id):
    return CourseSelection.query.filter_by(
        course_id=course_id,
        student_id=student_id,
        status='selected',
    ).first() is not None


def get_selected_students(course_id):
    selections = (
        CourseSelection.query.filter_by(course_id=course_id, status='selected')
        .order_by(CourseSelection.selected_at.asc(), CourseSelection.id.asc())
        .all()
    )
    return [selection.student for selection in selections if selection.student and selection.student.is_active]


def parse_datetime(value, field_label):
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y-%m-%dT%H:%M'):
        try:
            return datetime.strptime(value, fmt)
        except (TypeError, ValueError):
            continue
    raise ValueError(f'{field_label}格式无效，请使用 YYYY-MM-DD HH:MM:SS。')


def serialize_missing_submission(assignment, student):
    return {
        'id': None,
        'assignment_id': assignment.id,
        'student_id': student.id,
        'student_name': student.real_name,
        'student_no': student.student_id or '',
        'major': student.major or '',
        'grade': student.grade or '',
        'email': student.email or '',
        'phone': student.phone or '',
        'content': '',
        'submitted_at': '',
        'status': 'missing',
        'status_display': '未提交',
        'score': None,
        'feedback': '',
        'reviewed_by': None,
        'reviewed_by_name': '',
        'reviewed_at': '',
        'created_at': '',
        'updated_at': '',
    }


def serialize_assignment_with_context(assignment):
    payload = assignment.to_dict()
    if current_user.role == ROLE_STUDENT:
        submission = CourseAssignmentSubmission.query.filter_by(
            assignment_id=assignment.id,
            student_id=current_user.id,
        ).first()
        payload['my_submission'] = submission.to_dict() if submission else None
    else:
        submissions = CourseAssignmentSubmission.query.filter_by(assignment_id=assignment.id).all()
        payload['stats'] = {
            'total': len(get_selected_students(assignment.course_id)),
            'submitted': len(submissions),
            'reviewed': len([item for item in submissions if item.status == 'reviewed']),
        }
        payload['my_submission'] = None
    return payload


def get_assignment_upload_dir():
    root = current_app.config.get('ASSIGNMENT_UPLOAD_FOLDER')
    if not root:
        root = Path(current_app.instance_path) / 'uploads' / 'assignments'
    path = Path(root)
    path.mkdir(parents=True, exist_ok=True)
    return path


def validate_upload(file_storage):
    if file_storage is None or not file_storage.filename:
        return False, '请选择要上传的文件。'
    filename = secure_filename(file_storage.filename)
    if not filename or '.' not in filename:
        return False, '文件名无效。'
    extension = filename.rsplit('.', 1)[1].lower()
    if extension not in ALLOWED_ATTACHMENT_EXTENSIONS:
        return False, '不支持该文件类型。'

    stream = file_storage.stream
    stream.seek(0, os.SEEK_END)
    size = stream.tell()
    stream.seek(0)
    if size > MAX_ATTACHMENT_BYTES:
        return False, '文件不能超过 10MB。'
    return True, None


def save_attachment(file_storage, *, assignment=None, submission=None):
    valid, message = validate_upload(file_storage)
    if not valid:
        return None, message

    original_name = secure_filename(file_storage.filename)
    extension = original_name.rsplit('.', 1)[1].lower()
    stored_name = f'{uuid.uuid4().hex}.{extension}'
    upload_dir = get_assignment_upload_dir()
    storage_path = upload_dir / stored_name
    file_storage.save(storage_path)

    attachment = CourseAssignmentAttachment(
        assignment_id=assignment.id if assignment else None,
        submission_id=submission.id if submission else None,
        uploaded_by=current_user.id,
        original_name=original_name,
        stored_name=stored_name,
        storage_path=str(storage_path),
        file_size=storage_path.stat().st_size,
        content_type=file_storage.mimetype,
    )
    db.session.add(attachment)
    return attachment, None


def add_submission_version(submission):
    next_version = len(submission.versions) + 1
    db.session.add(CourseAssignmentSubmissionVersion(
        submission_id=submission.id,
        version_no=next_version,
        content=submission.content,
        submitted_at=submission.submitted_at,
        status=submission.status,
    ))


def notify_selected_students(assignment):
    from app.blueprints.notification import create_notification

    for student in get_selected_students(assignment.course_id):
        create_notification(
            user_id=student.id,
            title='新课程作业',
            content=f'课程《{assignment.course.name}》发布了作业：{assignment.title}。',
            notification_type='assignment_published',
            related_id=assignment.id,
            related_type='CourseAssignment',
        )


def update_usual_grade_from_assignments(assignment, student_id):
    reviewed = (
        CourseAssignmentSubmission.query
        .join(CourseAssignment, CourseAssignmentSubmission.assignment_id == CourseAssignment.id)
        .filter(
            CourseAssignment.course_id == assignment.course_id,
            CourseAssignmentSubmission.student_id == student_id,
            CourseAssignmentSubmission.status == 'reviewed',
            CourseAssignmentSubmission.score.isnot(None),
        )
        .all()
    )
    if not reviewed:
        return None

    normalized_scores = []
    for submission in reviewed:
        max_score = submission.assignment.max_score or 100
        normalized_scores.append(round(float(submission.score) / max_score * 100, 2))
    avg_score = round(sum(normalized_scores) / len(normalized_scores), 2)

    grade = Grade.query.filter_by(
        student_id=student_id,
        course_id=assignment.course_id,
        grade_type='usual',
    ).first()
    if grade:
        grade.score = avg_score
        grade.teacher_id = current_user.id
        grade.comment = '由课程作业批阅分自动汇总'
    else:
        grade = Grade(
            student_id=student_id,
            course_id=assignment.course_id,
            teacher_id=current_user.id,
            score=avg_score,
            grade_type='usual',
            comment='由课程作业批阅分自动汇总',
            is_published=False,
        )
        db.session.add(grade)
    return grade


@bp.route('/api/courses/<int:course_id>/assignments', methods=['GET'])
@login_required
def get_course_assignments(course_id):
    course = db.get_or_404(Course, course_id)
    if current_user.role == ROLE_STUDENT:
        if not is_selected_student(course_id, current_user.id):
            return jsonify({'success': False, 'message': '只能查看已选课程的作业。'}), 403
    elif not can_manage_course(current_user, course):
        return jsonify({'success': False, 'message': '权限不足。'}), 403

    assignments = (
        CourseAssignment.query.filter_by(course_id=course_id, is_active=True)
        .order_by(CourseAssignment.created_at.desc(), CourseAssignment.id.desc())
        .all()
    )
    return jsonify({'success': True, 'data': [serialize_assignment_with_context(item) for item in assignments]})


@bp.route('/api/courses/<int:course_id>/assignments', methods=['POST'])
@login_required
def create_course_assignment(course_id):
    course = db.get_or_404(Course, course_id)
    if not can_manage_course(current_user, course):
        return jsonify({'success': False, 'message': '权限不足。'}), 403

    data = request.get_json(silent=True) or request.form or {}
    title = (data.get('title') or '').strip()
    description = (data.get('description') or '').strip()
    if not title:
        return jsonify({'success': False, 'message': '请填写作业标题。'}), 400
    if not data.get('due_time'):
        return jsonify({'success': False, 'message': '请选择截止时间。'}), 400

    try:
        due_time = parse_datetime(data.get('due_time'), '截止时间')
        max_score = float(data.get('max_score', 100))
    except ValueError as exc:
        return jsonify({'success': False, 'message': str(exc)}), 400

    if max_score <= 0:
        return jsonify({'success': False, 'message': '满分必须大于 0。'}), 400

    assignment = CourseAssignment(
        course_id=course.id,
        teacher_id=current_user.id,
        title=title,
        description=description,
        due_time=due_time,
        max_score=max_score,
        allow_late=bool(data.get('allow_late', True)),
        publish_status=data.get('publish_status') or 'published',
    )
    db.session.add(assignment)
    db.session.flush()
    if assignment.publish_status == 'published':
        notify_selected_students(assignment)
    db.session.commit()
    return jsonify({'success': True, 'message': '作业已发布。', 'data': assignment.to_dict()})


@bp.route('/api/assignments/<int:assignment_id>/submit', methods=['POST'])
@login_required
def submit_assignment(assignment_id):
    assignment = db.get_or_404(CourseAssignment, assignment_id)
    if current_user.role != ROLE_STUDENT or not is_selected_student(assignment.course_id, current_user.id):
        return jsonify({'success': False, 'message': '只能提交已选课程的作业。'}), 403
    if not assignment.is_active:
        return jsonify({'success': False, 'message': '作业已关闭。'}), 400

    now = datetime.now()
    if now > assignment.due_time and not assignment.allow_late:
        return jsonify({'success': False, 'message': '作业已截止，不能迟交。'}), 400

    data = request.get_json(silent=True) or request.form or {}
    content = (data.get('content') or '').strip()
    if not content:
        return jsonify({'success': False, 'message': '请填写提交内容。'}), 400

    is_late = now > assignment.due_time
    status = 'late' if is_late else 'submitted'
    submission = CourseAssignmentSubmission.query.filter_by(
        assignment_id=assignment.id,
        student_id=current_user.id,
    ).first()
    if submission:
        if submission.status == 'returned':
            status = 'resubmitted'
        elif is_late:
            status = 'late'
        submission.content = content
        submission.submitted_at = now
        submission.status = status
        submission.score = None
        submission.feedback = None
        submission.reviewed_by = None
        submission.reviewed_at = None
        add_submission_version(submission)
    else:
        submission = CourseAssignmentSubmission(
            assignment_id=assignment.id,
            student_id=current_user.id,
            content=content,
            submitted_at=now,
            status=status,
        )
        db.session.add(submission)
        db.session.flush()
        add_submission_version(submission)

    if 'file' in request.files:
        attachment, message = save_attachment(request.files['file'], submission=submission)
        if message:
            return jsonify({'success': False, 'message': message}), 400

    from app.blueprints.notification import create_notification
    create_notification(
        user_id=assignment.teacher_id,
        title='作业提交提醒',
        content=f'{current_user.real_name} 提交了《{assignment.title}》。',
        notification_type='assignment_submitted',
        related_id=assignment.id,
        related_type='CourseAssignment',
    )
    db.session.commit()
    return jsonify({'success': True, 'message': '作业已提交。', 'data': submission.to_dict()})


@bp.route('/api/assignments/<int:assignment_id>/submissions', methods=['GET'])
@login_required
def get_assignment_submissions(assignment_id):
    assignment = db.get_or_404(CourseAssignment, assignment_id)
    if not can_manage_course(current_user, assignment.course):
        return jsonify({'success': False, 'message': '权限不足。'}), 403

    existing = {
        item.student_id: item
        for item in CourseAssignmentSubmission.query.filter_by(assignment_id=assignment.id).all()
    }
    submissions = []
    for student in get_selected_students(assignment.course_id):
        submission = existing.get(student.id)
        submissions.append(submission.to_dict() if submission else serialize_missing_submission(assignment, student))

    return jsonify({
        'success': True,
        'data': {
            'assignment': serialize_assignment_with_context(assignment),
            'submissions': submissions,
        },
    })


@bp.route('/api/submissions/<int:submission_id>/review', methods=['PUT'])
@login_required
def review_assignment_submission(submission_id):
    submission = db.get_or_404(CourseAssignmentSubmission, submission_id)
    assignment = submission.assignment
    if not can_manage_course(current_user, assignment.course):
        return jsonify({'success': False, 'message': '权限不足。'}), 403

    data = request.get_json() or {}
    action = data.get('action', 'review')
    if action == 'return':
        submission.feedback = (data.get('feedback') or '').strip()
        submission.status = 'returned'
        submission.reviewed_by = current_user.id
        submission.reviewed_at = datetime.now()
        db.session.commit()
        from app.blueprints.notification import create_notification
        create_notification(
            user_id=submission.student_id,
            title='作业已退回',
            content=f'作业《{assignment.title}》已退回，请修改后重新提交。',
            notification_type='assignment_returned',
            related_id=assignment.id,
            related_type='CourseAssignment',
            commit=True,
        )
        return jsonify({'success': True, 'message': '作业已退回。', 'data': submission.to_dict()})

    try:
        score = float(data.get('score'))
    except (TypeError, ValueError):
        return jsonify({'success': False, 'message': '请填写有效分数。'}), 400
    if score < 0 or score > (assignment.max_score or 100):
        return jsonify({'success': False, 'message': '分数不能超出作业满分。'}), 400

    submission.score = score
    submission.feedback = (data.get('feedback') or '').strip()
    submission.status = 'reviewed'
    submission.reviewed_by = current_user.id
    submission.reviewed_at = datetime.now()
    update_usual_grade_from_assignments(assignment, submission.student_id)
    db.session.commit()
    from app.blueprints.notification import create_notification
    create_notification(
        user_id=submission.student_id,
        title='作业已批阅',
        content=f'作业《{assignment.title}》已批阅，得分 {score}。',
        notification_type='assignment_reviewed',
        related_id=assignment.id,
        related_type='CourseAssignment',
        commit=True,
    )
    return jsonify({'success': True, 'message': '作业已批阅。', 'data': submission.to_dict()})


@bp.route('/api/submissions/<int:submission_id>/versions')
@login_required
def get_submission_versions(submission_id):
    submission = db.get_or_404(CourseAssignmentSubmission, submission_id)
    assignment = submission.assignment
    if current_user.role == ROLE_STUDENT:
        if submission.student_id != current_user.id:
            return jsonify({'success': False, 'message': '权限不足。'}), 403
    elif not can_manage_course(current_user, assignment.course):
        return jsonify({'success': False, 'message': '权限不足。'}), 403

    return jsonify({
        'success': True,
        'data': [item.to_dict() for item in submission.versions],
    })


@bp.route('/api/assignments/<int:assignment_id>/attachments', methods=['POST'])
@login_required
def upload_assignment_attachment(assignment_id):
    assignment = db.get_or_404(CourseAssignment, assignment_id)
    if not can_manage_course(current_user, assignment.course):
        return jsonify({'success': False, 'message': '权限不足。'}), 403

    attachment, message = save_attachment(request.files.get('file'), assignment=assignment)
    if message:
        return jsonify({'success': False, 'message': message}), 400
    db.session.commit()
    return jsonify({'success': True, 'message': '附件已上传。', 'data': attachment.to_dict()})


@bp.route('/api/attachments/<int:attachment_id>/download')
@login_required
def download_assignment_attachment(attachment_id):
    attachment = db.get_or_404(CourseAssignmentAttachment, attachment_id)
    assignment = attachment.assignment or attachment.submission.assignment
    if current_user.role == ROLE_STUDENT:
        if not is_selected_student(assignment.course_id, current_user.id):
            return jsonify({'success': False, 'message': '权限不足。'}), 403
        if attachment.submission and attachment.submission.student_id != current_user.id:
            return jsonify({'success': False, 'message': '权限不足。'}), 403
    elif not can_manage_course(current_user, assignment.course):
        return jsonify({'success': False, 'message': '权限不足。'}), 403

    return send_file(
        attachment.storage_path,
        as_attachment=True,
        download_name=attachment.original_name,
        mimetype=attachment.content_type or 'application/octet-stream',
    )


@bp.route('/api/assignments/<int:assignment_id>/submissions/export')
@login_required
def export_assignment_submissions(assignment_id):
    assignment = db.get_or_404(CourseAssignment, assignment_id)
    if not can_manage_course(current_user, assignment.course):
        return jsonify({'success': False, 'message': '权限不足。'}), 403

    existing = {
        item.student_id: item
        for item in CourseAssignmentSubmission.query.filter_by(assignment_id=assignment.id).all()
    }
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(['学号', '姓名', '专业', '邮箱', '手机', '状态', '提交时间', '分数', '评语'])
    for student in get_selected_students(assignment.course_id):
        submission = existing.get(student.id)
        if submission:
            writer.writerow([
                student.student_id or '',
                student.real_name,
                student.major or '',
                student.email or '',
                student.phone or '',
                submission.get_status_display(),
                submission.submitted_at.strftime('%Y-%m-%d %H:%M:%S') if submission.submitted_at else '',
                submission.score if submission.score is not None else '',
                submission.feedback or '',
            ])
        else:
            writer.writerow([
                student.student_id or '',
                student.real_name,
                student.major or '',
                student.email or '',
                student.phone or '',
                '未提交',
                '',
                '',
                '',
            ])
    return Response(
        output.getvalue().encode('utf-8-sig'),
        mimetype='text/csv; charset=utf-8',
        headers={'Content-Disposition': f'attachment; filename=assignment_{assignment.id}_submissions.csv'},
    )
