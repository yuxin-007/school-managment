# -*- coding: utf-8 -*-
"""生成适合系统演示的测试数据。"""

from __future__ import annotations

import sys
from datetime import date, datetime, time, timedelta

sys.stdout.reconfigure(encoding='utf-8')

from app import create_app
from app.extensions import db
from app.models import (
    Announcement,
    Attendance,
    Course,
    CourseSchedule,
    CourseSelection,
    Grade,
    LeaveApplication,
    LeaveApprovalFlow,
    Notification,
    OrganizationNode,
    User,
    UserOrganization,
)
from app.utils.org_permissions import (
    NODE_TYPE_CLASS,
    NODE_TYPE_COLLEGE,
    NODE_TYPE_DEPARTMENT,
    NODE_TYPE_SCHOOL,
    NODE_TYPE_STAFF,
    NODE_TYPE_STUDENT,
    NODE_TYPE_SYSTEM,
)

DEMO_PASSWORD = '123456'
DEMO_SEMESTER = '2025-2026-2'


def log(message: str):
    print(message)


def ensure_node(name: str, node_type: str, parent: OrganizationNode | None = None, code: str | None = None, description: str | None = None):
    parent_id = parent.id if parent else None
    node = OrganizationNode.query.filter_by(name=name, node_type=node_type, parent_id=parent_id).first()

    if not node:
        node = OrganizationNode(
            name=name,
            node_type=node_type,
            parent_id=parent_id,
            code=code,
            description=description,
            is_active=True,
        )
        db.session.add(node)
        db.session.flush()
        log(f'[OK] 创建组织节点：{name}')
    else:
        if code and node.code != code:
            node.code = code
        if description and node.description != description:
            node.description = description

    return node


def ensure_user(username: str, password: str = DEMO_PASSWORD, **payload):
    user = User.query.filter_by(username=username).first()
    created = user is None

    if not user:
        user = User(username=username)
        db.session.add(user)

    for key, value in payload.items():
        setattr(user, key, value)

    user.is_active = True
    user.set_password(password)
    db.session.flush()

    if created:
        log(f'[OK] 创建账号：{username} / {password}')
    else:
        log(f'[OK] 更新账号：{username}')

    return user


def ensure_membership(user: User, node: OrganizationNode, role_in_node: str, is_primary: bool = True):
    relation = UserOrganization.query.filter_by(user_id=user.id, node_id=node.id).first()

    if not relation:
        relation = UserOrganization(
            user_id=user.id,
            node_id=node.id,
            role_in_node=role_in_node,
            is_primary=is_primary,
        )
        db.session.add(relation)
    else:
        relation.role_in_node = role_in_node
        relation.is_primary = is_primary

    if is_primary:
        UserOrganization.query.filter(
            UserOrganization.user_id == user.id,
            UserOrganization.node_id != node.id,
            UserOrganization.is_primary.is_(True),
        ).update({'is_primary': False}, synchronize_session=False)

    db.session.flush()
    return relation


def ensure_course(
    code: str,
    name: str,
    teacher: User,
    location: str,
    credit: float,
    hours: int,
    max_students: int,
    description: str,
    schedules: list[tuple[int, str, str]],
):
    course = Course.query.filter_by(code=code).first()
    created = course is None

    if not course:
        course = Course(code=code)
        db.session.add(course)

    course.name = name
    course.teacher_id = teacher.id
    course.location = location
    course.credit = credit
    course.hours = hours
    course.max_students = max_students
    course.description = description
    course.semester = DEMO_SEMESTER
    course.is_active = True
    db.session.flush()

    CourseSchedule.query.filter_by(course_id=course.id).delete()
    for day_of_week, start, end in schedules:
        db.session.add(
            CourseSchedule(
                course_id=course.id,
                day_of_week=day_of_week,
                start_time=datetime.strptime(start, '%H:%M').time(),
                end_time=datetime.strptime(end, '%H:%M').time(),
            )
        )

    db.session.flush()
    log(f"[OK] {'创建' if created else '更新'}课程：{code} {name}")
    return course


def ensure_selection(student: User, course: Course):
    selection = CourseSelection.query.filter_by(student_id=student.id, course_id=course.id).first()
    if not selection:
        selection = CourseSelection(student_id=student.id, course_id=course.id, status='selected')
        db.session.add(selection)
    else:
        selection.status = 'selected'
    db.session.flush()


def refresh_course_counts(courses: list[Course]):
    for course in courses:
        course.current_students = CourseSelection.query.filter_by(course_id=course.id, status='selected').count()


def ensure_announcement(title: str, content: str, author: User, category: str, priority: str, is_pinned: bool, start_date: date, end_date: date):
    announcement = Announcement.query.filter_by(title=title).first()
    if not announcement:
        announcement = Announcement(title=title, author_id=author.id)
        db.session.add(announcement)

    announcement.content = content
    announcement.author_id = author.id
    announcement.category = category
    announcement.priority = priority
    announcement.is_pinned = is_pinned
    announcement.is_active = True
    announcement.start_date = start_date
    announcement.end_date = end_date
    db.session.flush()
    log(f'[OK] 准备公告：{title}')
    return announcement


def ensure_notification(user: User, title: str, content: str, notification_type: str, related_id: int | None = None, related_type: str | None = None, is_read: bool = False):
    notification = Notification.query.filter_by(user_id=user.id, title=title).first()
    if not notification:
        notification = Notification(user_id=user.id, title=title)
        db.session.add(notification)

    notification.content = content
    notification.notification_type = notification_type
    notification.related_id = related_id
    notification.related_type = related_type
    notification.is_read = is_read
    notification.read_at = None if not is_read else notification.read_at
    db.session.flush()
    log(f'[OK] 准备通知：{user.username} -> {title}')
    return notification


def ensure_attendance(user: User, attendance_date: date, clock_in_text: str, clock_out_text: str, status: str, remark: str):
    record = Attendance.query.filter_by(user_id=user.id, attendance_date=attendance_date).first()
    if not record:
        record = Attendance(user_id=user.id, attendance_date=attendance_date)
        db.session.add(record)

    record.clock_in = datetime.combine(attendance_date, datetime.strptime(clock_in_text, '%H:%M').time())
    record.clock_out = datetime.combine(attendance_date, datetime.strptime(clock_out_text, '%H:%M').time())
    record.status = status
    record.remark = remark
    db.session.flush()


def ensure_leave_application(
    staff: User,
    approver: User,
    leave_type: str,
    start_date: date,
    end_date: date,
    reason: str,
    status: str,
    approval_notes: str | None = None,
):
    application = LeaveApplication.query.filter_by(
        staff_id=staff.id,
        leave_type=leave_type,
        start_date=start_date,
        end_date=end_date,
    ).first()

    if not application:
        application = LeaveApplication(
            staff_id=staff.id,
            leave_type=leave_type,
            start_date=start_date,
            end_date=end_date,
            total_days=float((end_date - start_date).days + 1),
            reason=reason,
        )
        db.session.add(application)

    application.reason = reason
    application.total_days = float((end_date - start_date).days + 1)
    application.status = status
    application.current_approver_id = approver.id if status == 'pending' else None
    application.approver_id = approver.id if status in {'approved', 'rejected'} else None
    application.approval_notes = approval_notes
    application.emergency_contact = '校内联系人'
    application.emergency_phone = '13800000000'
    db.session.flush()

    LeaveApprovalFlow.query.filter_by(leave_application_id=application.id).delete()
    flow_status = 'approved' if status == 'approved' else 'pending'
    flow_comments = approval_notes if status == 'approved' else '等待学院管理员审批'
    db.session.add(
        LeaveApprovalFlow(
            leave_application_id=application.id,
            approver_id=approver.id,
            approval_step=1,
            status=flow_status,
            comments=flow_comments,
        )
    )
    db.session.flush()
    log(f'[OK] 准备请假记录：{staff.username} {leave_type} {status}')
    return application


def ensure_grade(student: User, course: Course, teacher: User, score: float, comment: str, is_published: bool):
    grade = Grade.query.filter_by(student_id=student.id, course_id=course.id, grade_type='final').first()
    if not grade:
        grade = Grade(student_id=student.id, course_id=course.id, teacher_id=teacher.id, grade_type='final')
        db.session.add(grade)

    grade.teacher_id = teacher.id
    grade.score = score
    grade.comment = comment
    grade.is_published = is_published
    grade.published_at = datetime.now() if is_published else None
    db.session.flush()
    return grade


app = create_app()
with app.app_context():
    today = date.today()
    log('=' * 60)
    log('[DEMO] 开始准备演示数据')
    log('=' * 60)

    system_root = OrganizationNode.query.filter_by(node_type=NODE_TYPE_SYSTEM).first()
    if not system_root:
        system_root = ensure_node('系统管理', NODE_TYPE_SYSTEM, code='SYS')

    school_root = OrganizationNode.query.filter_by(node_type=NODE_TYPE_SCHOOL).first()
    if not school_root:
        school_root = ensure_node('示范学校', NODE_TYPE_SCHOOL, parent=system_root, code='SCH')

    cs_college = ensure_node('计算机学院', NODE_TYPE_COLLEGE, parent=school_root, code='CS')
    math_college = ensure_node('数学学院', NODE_TYPE_COLLEGE, parent=school_root, code='MATH')

    software_department = ensure_node('软件工程系', NODE_TYPE_DEPARTMENT, parent=cs_college, code='SE')
    math_department = ensure_node('应用数学系', NODE_TYPE_DEPARTMENT, parent=math_college, code='AM')

    software_staff_group = ensure_node('软件工程教研室', NODE_TYPE_STAFF, parent=software_department, code='SE-STAFF')
    software_student_group = ensure_node('软件工程学生组', NODE_TYPE_STUDENT, parent=software_department, code='SE-STU')
    math_staff_group = ensure_node('应用数学教研室', NODE_TYPE_STAFF, parent=math_department, code='AM-STAFF')
    math_student_group = ensure_node('应用数学学生组', NODE_TYPE_STUDENT, parent=math_department, code='AM-STU')

    se_class_2022 = ensure_node('2022级软件工程1班', NODE_TYPE_CLASS, parent=software_student_group, code='SE2201')
    se_class_2023 = ensure_node('2023级软件工程1班', NODE_TYPE_CLASS, parent=software_student_group, code='SE2301')
    math_class_2022 = ensure_node('2022级数学1班', NODE_TYPE_CLASS, parent=math_student_group, code='AM2201')
    math_class_2023 = ensure_node('2023级数学1班', NODE_TYPE_CLASS, parent=math_student_group, code='AM2301')

    users = {
        'cs_admin': ensure_user(
            'cs_admin',
            real_name='计算机学院管理员',
            role='college_admin',
            email='cs_admin@example.com',
            phone='13810010001',
        ),
        'math_admin': ensure_user(
            'math_admin',
            real_name='数学学院管理员',
            role='college_admin',
            email='math_admin@example.com',
            phone='13810010002',
        ),
        'teacher_wang': ensure_user(
            'teacher_wang',
            real_name='王晓峰',
            role='staff',
            position='讲师',
            employee_id='TSE001',
            email='teacher_wang@example.com',
            phone='13910010001',
        ),
        'teacher_li': ensure_user(
            'teacher_li',
            real_name='李敏',
            role='staff',
            position='副教授',
            employee_id='TSE002',
            email='teacher_li@example.com',
            phone='13910010002',
        ),
        'teacher_zhang': ensure_user(
            'teacher_zhang',
            real_name='张宁',
            role='staff',
            position='讲师',
            employee_id='TSE003',
            email='teacher_zhang@example.com',
            phone='13910010003',
        ),
        'teacher_chen': ensure_user(
            'teacher_chen',
            real_name='陈卓',
            role='staff',
            position='教授',
            employee_id='TAM001',
            email='teacher_chen@example.com',
            phone='13910010004',
        ),
        'teacher_liu': ensure_user(
            'teacher_liu',
            real_name='刘婷',
            role='staff',
            position='讲师',
            employee_id='TAM002',
            email='teacher_liu@example.com',
            phone='13910010005',
        ),
        'student_cs_2022_01': ensure_user(
            'student_cs_2022_01',
            real_name='孙浩然',
            role='student',
            grade='2022',
            major='软件工程',
            student_id='SE2022001',
            email='student_cs_2022_01@example.com',
            phone='13710010001',
        ),
        'student_cs_2022_02': ensure_user(
            'student_cs_2022_02',
            real_name='周子涵',
            role='student',
            grade='2022',
            major='软件工程',
            student_id='SE2022002',
            email='student_cs_2022_02@example.com',
            phone='13710010002',
        ),
        'student_cs_2023_01': ensure_user(
            'student_cs_2023_01',
            real_name='冯嘉怡',
            role='student',
            grade='2023',
            major='软件工程',
            student_id='SE2023001',
            email='student_cs_2023_01@example.com',
            phone='13710010003',
        ),
        'student_math_2022_01': ensure_user(
            'student_math_2022_01',
            real_name='褚明轩',
            role='student',
            grade='2022',
            major='应用数学',
            student_id='AM2022001',
            email='student_math_2022_01@example.com',
            phone='13710010004',
        ),
        'student_math_2023_01': ensure_user(
            'student_math_2023_01',
            real_name='韦欣然',
            role='student',
            grade='2023',
            major='应用数学',
            student_id='AM2023001',
            email='student_math_2023_01@example.com',
            phone='13710010005',
        ),
    }

    ensure_membership(users['cs_admin'], cs_college, '学院管理员')
    ensure_membership(users['math_admin'], math_college, '学院管理员')
    ensure_membership(users['teacher_wang'], software_staff_group, '授课教师')
    ensure_membership(users['teacher_li'], software_staff_group, '授课教师')
    ensure_membership(users['teacher_zhang'], software_staff_group, '授课教师')
    ensure_membership(users['teacher_chen'], math_staff_group, '授课教师')
    ensure_membership(users['teacher_liu'], math_staff_group, '授课教师')
    ensure_membership(users['student_cs_2022_01'], se_class_2022, '学生')
    ensure_membership(users['student_cs_2022_02'], se_class_2022, '学生')
    ensure_membership(users['student_cs_2023_01'], se_class_2023, '学生')
    ensure_membership(users['student_math_2022_01'], math_class_2022, '学生')
    ensure_membership(users['student_math_2023_01'], math_class_2023, '学生')

    courses = [
        ensure_course(
            code='SE101',
            name='程序设计基础',
            teacher=users['teacher_wang'],
            location='实训楼 A201',
            credit=3.0,
            hours=48,
            max_students=60,
            description='演示基础编程课程的排课、选课与成绩发布。',
            schedules=[(1, '08:00', '09:40'), (3, '08:00', '09:40')],
        ),
        ensure_course(
            code='SE201',
            name='数据结构',
            teacher=users['teacher_li'],
            location='教学楼 B305',
            credit=3.5,
            hours=56,
            max_students=50,
            description='用于演示课程管理、课程详情和选课容量控制。',
            schedules=[(2, '10:00', '11:40')],
        ),
        ensure_course(
            code='SE301',
            name='软件工程',
            teacher=users['teacher_zhang'],
            location='实训楼 B102',
            credit=2.5,
            hours=40,
            max_students=45,
            description='用于演示项目化课程、课表展示和课程状态切换。',
            schedules=[(4, '14:00', '15:40')],
        ),
        ensure_course(
            code='AM101',
            name='高等数学',
            teacher=users['teacher_chen'],
            location='教学楼 C101',
            credit=4.0,
            hours=64,
            max_students=80,
            description='用于展示数学学院课程与公告、成绩的联动。',
            schedules=[(1, '10:00', '11:40'), (4, '08:00', '09:40')],
        ),
        ensure_course(
            code='AM201',
            name='线性代数',
            teacher=users['teacher_liu'],
            location='教学楼 C302',
            credit=3.0,
            hours=48,
            max_students=50,
            description='用于展示课表、选课和成绩模块的完整链路。',
            schedules=[(5, '14:00', '15:40')],
        ),
    ]

    course_map = {course.code: course for course in courses}

    ensure_selection(users['student_cs_2022_01'], course_map['SE101'])
    ensure_selection(users['student_cs_2022_01'], course_map['SE201'])
    ensure_selection(users['student_cs_2022_01'], course_map['SE301'])
    ensure_selection(users['student_cs_2022_02'], course_map['SE101'])
    ensure_selection(users['student_cs_2023_01'], course_map['SE301'])
    ensure_selection(users['student_math_2022_01'], course_map['AM101'])
    ensure_selection(users['student_math_2022_01'], course_map['AM201'])
    ensure_selection(users['student_math_2023_01'], course_map['AM101'])
    refresh_course_counts(courses)

    grade_1 = ensure_grade(
        student=users['student_cs_2022_01'],
        course=course_map['SE101'],
        teacher=users['teacher_wang'],
        score=88,
        comment='课堂参与积极，实验完成质量稳定。',
        is_published=True,
    )
    grade_2 = ensure_grade(
        student=users['student_math_2022_01'],
        course=course_map['AM101'],
        teacher=users['teacher_chen'],
        score=92,
        comment='基础扎实，解题过程清晰。',
        is_published=True,
    )

    announcement_1 = ensure_announcement(
        title='组织树与业务联动演示说明',
        content='本次演示建议优先查看组织中心、用户管理、课程安排、请假审批和通知中心，以便完整体验系统的组织驱动能力。',
        author=users['cs_admin'],
        category='system',
        priority='important',
        is_pinned=True,
        start_date=today - timedelta(days=7),
        end_date=today + timedelta(days=30),
    )
    announcement_2 = ensure_announcement(
        title='2025-2026学年第二学期课程安排已发布',
        content='课程中心已经同步最新教学安排，学生可以进入选课中心查看课程、容量和课表信息。',
        author=users['math_admin'],
        category='course',
        priority='urgent',
        is_pinned=True,
        start_date=today - timedelta(days=3),
        end_date=today + timedelta(days=45),
    )
    announcement_3 = ensure_announcement(
        title='请假审批与考勤联动提醒',
        content='请假记录审批通过后，系统会在后续考勤统计中同步展示对应状态，便于管理员统一查看。',
        author=users['cs_admin'],
        category='leave',
        priority='normal',
        is_pinned=False,
        start_date=today - timedelta(days=1),
        end_date=today + timedelta(days=20),
    )

    pending_leave = ensure_leave_application(
        staff=users['teacher_wang'],
        approver=users['cs_admin'],
        leave_type='personal_leave',
        start_date=today + timedelta(days=3),
        end_date=today + timedelta(days=4),
        reason='参加校外教学研讨活动。',
        status='pending',
    )
    approved_leave = ensure_leave_application(
        staff=users['teacher_li'],
        approver=users['cs_admin'],
        leave_type='sick_leave',
        start_date=today - timedelta(days=12),
        end_date=today - timedelta(days=11),
        reason='身体不适，已提交医院证明。',
        status='approved',
        approval_notes='请假情况属实，按流程审批通过。',
    )

    attendance_templates = [
        (users['teacher_wang'], 0, '08:25', '17:40', 'normal', '正常授课'),
        (users['teacher_wang'], 1, '08:32', '17:45', 'late', '晨会延迟到岗'),
        (users['teacher_li'], 0, '08:21', '17:38', 'normal', '正常授课'),
        (users['teacher_li'], 2, '08:20', '16:55', 'early', '下午参加外出会务'),
        (users['teacher_chen'], 1, '08:18', '17:50', 'normal', '正常授课'),
        (users['teacher_liu'], 3, '08:40', '17:35', 'late', '地铁延误'),
    ]

    for user, offset, clock_in, clock_out, status, remark in attendance_templates:
        ensure_attendance(user, today - timedelta(days=offset), clock_in, clock_out, status, remark)

    admin_user = User.query.filter_by(username='admin').first()
    if admin_user:
        ensure_notification(
            user=admin_user,
            title='演示数据已准备完成',
            content='首页、组织中心、课程、请假、通知和公告模块已经具备基础演示数据。',
            notification_type='system',
            is_read=False,
        )

    ensure_notification(
        user=users['student_cs_2022_01'],
        title='课程《程序设计基础》已加入你的课表',
        content='你可以进入课表页查看每周上课时间和地点。',
        notification_type='course_selected',
        related_id=course_map['SE101'].id,
        related_type='course',
        is_read=False,
    )
    ensure_notification(
        user=users['student_math_2022_01'],
        title='《高等数学》成绩已发布',
        content='教师已发布你的最终成绩，可以前往成绩页查看详情。',
        notification_type='grade_published',
        related_id=grade_2.id,
        related_type='grade',
        is_read=False,
    )
    ensure_notification(
        user=users['teacher_li'],
        title='你的请假申请已审批通过',
        content='请假审批已完成，可在请假记录中查看审批意见。',
        notification_type='leave_approved',
        related_id=approved_leave.id,
        related_type='leave',
        is_read=True,
    )
    ensure_notification(
        user=users['cs_admin'],
        title='当前仍有待审批请假申请',
        content='请前往请假管理页面处理待审批记录，避免影响业务流转。',
        notification_type='system',
        related_id=pending_leave.id,
        related_type='leave',
        is_read=False,
    )
    ensure_notification(
        user=users['math_admin'],
        title='有新的课程安排公告',
        content='课程安排公告已经发布，建议进入公告中心检查展示效果。',
        notification_type='announcement',
        related_id=announcement_2.id,
        related_type='announcement',
        is_read=False,
    )

    db.session.commit()

    log('=' * 60)
    log('[DEMO] 演示数据准备完成')
    log('=' * 60)
    log('建议使用以下账号进行体验：')
    log('  系统管理员：admin / admin123')
    log('  学院管理员：cs_admin / 123456')
    log('  学院管理员：math_admin / 123456')
    log('  教师账号：teacher_wang / 123456')
    log('  学生账号：student_cs_2022_01 / 123456')
    log('  学生账号：student_math_2022_01 / 123456')
    log('建议优先查看：/dashboard /organization /users /course-selection /course-schedule /notifications')
