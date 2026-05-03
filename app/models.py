from flask_login import UserMixin
from datetime import datetime, time
from app.extensions import db
from app.utils.time_utils import get_beijing_time
from werkzeug.security import generate_password_hash, check_password_hash


class OrganizationNode(db.Model):
    __tablename__ = 'organization_nodes'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    node_type = db.Column(db.String(50), nullable=False)
    code = db.Column(db.String(50))
    description = db.Column(db.Text)
    parent_id = db.Column(db.Integer, db.ForeignKey('organization_nodes.id'))
    order_index = db.Column(db.Integer, default=0)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=get_beijing_time)
    updated_at = db.Column(db.DateTime, default=get_beijing_time, onupdate=get_beijing_time)

    parent = db.relationship('OrganizationNode', remote_side=[id], backref='children')
    node_users = db.relationship('UserOrganization', backref='node', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'node_type': self.node_type,
            'code': self.code,
            'description': self.description,
            'parent_id': self.parent_id,
            'order_index': self.order_index,
            'is_active': self.is_active,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else '',
            'children_count': len(self.children),
            'users_count': len(self.node_users)
        }


class UserOrganization(db.Model):
    __tablename__ = 'user_organizations'
    __table_args__ = (
        db.UniqueConstraint('user_id', 'node_id', name='uq_user_organization_user_node'),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    node_id = db.Column(db.Integer, db.ForeignKey('organization_nodes.id'), nullable=False)
    role_in_node = db.Column(db.String(50))
    is_primary = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=get_beijing_time)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'node_id': self.node_id,
            'role_in_node': self.role_in_node,
            'is_primary': self.is_primary,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }


class User(UserMixin, db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(256), nullable=False)
    real_name = db.Column(db.String(80), nullable=False)
    email = db.Column(db.String(120))
    phone = db.Column(db.String(20))
    role = db.Column(db.String(20), nullable=False, default='staff')
    position = db.Column(db.String(100))
    employee_id = db.Column(db.String(50))
    student_id = db.Column(db.String(50))
    grade = db.Column(db.String(50))      # 年级（如：2024级）
    major = db.Column(db.String(100))    # 专业
    is_active = db.Column(db.Boolean, default=True)
    last_login = db.Column(db.DateTime)
    failed_login_count = db.Column(db.Integer, default=0)
    locked_until = db.Column(db.DateTime)
    last_failed_login_at = db.Column(db.DateTime)
    theme = db.Column(db.String(20), default='light')     # light/dark
    language = db.Column(db.String(10), default='zh-CN') # zh-CN/en
    created_at = db.Column(db.DateTime, default=get_beijing_time)
    updated_at = db.Column(db.DateTime, default=get_beijing_time, onupdate=get_beijing_time)

    user_organizations = db.relationship('UserOrganization', backref='user', cascade='all, delete-orphan')
    notification_preferences = db.relationship(
        'UserNotificationPreference',
        backref='user',
        uselist=False,
        cascade='all, delete-orphan',
    )

    def set_password(self, raw_password):
        """Set a hashed password."""
        self.password = generate_password_hash(raw_password)

    def check_password(self, raw_password):
        """Validate password and upgrade legacy plain-text passwords."""
        if self.password.startswith('pbkdf2:') or self.password.startswith('scrypt:'):
            return check_password_hash(self.password, raw_password)
        if self.password == raw_password:
            self.set_password(raw_password)
            return True
        return False

    def get_accessible_nodes(self):
        """Return node ids that the current user can access."""
        from app.utils.org_permissions import ROLE_SUPER_ADMIN, ROLE_COLLEGE_ADMIN

        if self.role == ROLE_SUPER_ADMIN:
            all_nodes = OrganizationNode.query.filter_by(is_active=True).all()
            return [n.id for n in all_nodes]

        node_ids = set()
        for uo in self.user_organizations:
            node = uo.node
            node_ids.add(node.id)
            self._add_children_ids(node, node_ids)
        return list(node_ids)


    def _add_children_ids(self, node, node_set):
        for child in node.children:
            node_set.add(child.id)
            self._add_children_ids(child, node_set)

    def get_role_display(self):
        role_map = {
            'super_admin': '系统管理员',
            'college_admin': '学院管理员',
            'staff': '教职工',
            'student': '学生'
        }
        return role_map.get(self.role, self.role)

    def to_dict(self):
        primary_node = next((uo.node for uo in self.user_organizations if uo.is_primary), None)
        return {
            'id': self.id,
            'username': self.username,
            'real_name': self.real_name,
            'email': self.email,
            'phone': self.phone,
            'role': self.role,
            'role_display': self.get_role_display(),
            'position': self.position,
            'employee_id': self.employee_id,
            'student_id': self.student_id,
            'grade': self.grade or '',
            'major': self.major or '',
            'is_active': self.is_active,
            'theme': self.theme or 'light',
            'language': self.language or 'zh-CN',
            'last_login': self.last_login.strftime('%Y-%m-%d %H:%M:%S') if self.last_login else '',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else '',
            'department_name': primary_node.name if primary_node else '未分配'
        }


class UserNotificationPreference(db.Model):
    __tablename__ = 'user_notification_preferences'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, unique=True)
    leave_enabled = db.Column(db.Boolean, default=True, nullable=False)
    attendance_enabled = db.Column(db.Boolean, default=True, nullable=False)
    announcement_enabled = db.Column(db.Boolean, default=True, nullable=False)
    grade_enabled = db.Column(db.Boolean, default=True, nullable=False)
    course_enabled = db.Column(db.Boolean, default=True, nullable=False)
    system_enabled = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=get_beijing_time)
    updated_at = db.Column(db.DateTime, default=get_beijing_time, onupdate=get_beijing_time)

    def to_dict(self):
        return {
            'leave': self.leave_enabled,
            'attendance': self.attendance_enabled,
            'announcement': self.announcement_enabled,
            'grade': self.grade_enabled,
            'course': self.course_enabled,
            'system': self.system_enabled,
        }


class LeaveApplication(db.Model):
    __tablename__ = 'leave_applications'

    id = db.Column(db.Integer, primary_key=True)
    staff_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    leave_type = db.Column(db.String(50), nullable=False)
    start_date = db.Column(db.Date, nullable=False)
    end_date = db.Column(db.Date, nullable=False)
    reason = db.Column(db.Text, nullable=False)
    total_days = db.Column(db.Float, nullable=False)
    emergency_contact = db.Column(db.String(100))
    emergency_phone = db.Column(db.String(20))
    status = db.Column(db.String(20), default='pending')
    current_approver_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    approver_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    approval_notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=get_beijing_time)
    updated_at = db.Column(db.DateTime, default=get_beijing_time, onupdate=get_beijing_time)

    staff = db.relationship('User', foreign_keys=[staff_id], backref='my_applications')
    current_approver = db.relationship('User', foreign_keys=[current_approver_id])
    approver = db.relationship('User', foreign_keys=[approver_id])
    approval_flows = db.relationship('LeaveApprovalFlow', backref='application', cascade='all, delete-orphan')

    def get_leave_type_display(self):
        types = {
            'sick_leave': '病假', 'personal_leave': '事假', 'annual_leave': '年假',
            'marriage_leave': '婚假', 'maternity_leave': '产假', 'paternity_leave': '陪产假',
            'bereavement_leave': '丧假', 'other': '其他'
        }
        return types.get(self.leave_type, self.leave_type)

    def get_status_display(self):
        status_map = {'pending': '待审批', 'approved': '已批准', 'rejected': '已驳回', 'cancelled': '已取消'}
        return status_map.get(self.status, self.status)

    def to_dict(self):
        transfer_flows = sorted(
            [flow for flow in self.approval_flows if flow.status == 'transferred'],
            key=lambda flow: flow.updated_at or flow.created_at or get_beijing_time(),
            reverse=True
        )
        latest_transfer = transfer_flows[0] if transfer_flows else None
        return {
            'id': self.id,
            'staff_id': self.staff_id,
            'staff_name': self.staff.real_name if self.staff else '',
            'leave_type': self.leave_type,
            'leave_type_display': self.get_leave_type_display(),
            'start_date': self.start_date.strftime('%Y-%m-%d') if self.start_date else '',
            'end_date': self.end_date.strftime('%Y-%m-%d') if self.end_date else '',
            'total_days': self.total_days,
            'reason': self.reason,
            'status': self.status,
            'status_display': self.get_status_display(),
            'current_approver_id': self.current_approver_id,
            'current_approver_name': self.current_approver.real_name if self.current_approver else '',
            'approver_id': self.approver_id,
            'approver_name': self.approver.real_name if self.approver else '',
            'approval_notes': self.approval_notes,
            'has_transfer_history': bool(transfer_flows),
            'transfer_count': len(transfer_flows),
            'latest_transfer_note': latest_transfer.comments if latest_transfer else '',
            'latest_transfer_at': latest_transfer.updated_at.strftime('%Y-%m-%d %H:%M:%S')
            if latest_transfer and latest_transfer.updated_at
            else latest_transfer.created_at.strftime('%Y-%m-%d %H:%M:%S')
            if latest_transfer and latest_transfer.created_at
            else '',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else '',
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else ''
        }


class LeaveApprovalFlow(db.Model):
    __tablename__ = 'leave_approval_flows'

    id = db.Column(db.Integer, primary_key=True)
    leave_application_id = db.Column(db.Integer, db.ForeignKey('leave_applications.id'), nullable=False)
    approver_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    approval_step = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(20), default='pending')
    comments = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=get_beijing_time)
    updated_at = db.Column(db.DateTime, default=get_beijing_time, onupdate=get_beijing_time)

    approver = db.relationship('User')

    def to_dict(self):
        return {
            'id': self.id,
            'approver_id': self.approver_id,
            'approver_name': self.approver.real_name if self.approver else '',
            'approval_step': self.approval_step,
            'status': self.status,
            'status_display': {
                'pending': '待审批',
                'approved': '已批准',
                'rejected': '已驳回',
                'transferred': '已转交',
            }.get(self.status, self.status),
            'comments': self.comments,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else '',
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else ''
        }


class Course(db.Model):
    __tablename__ = 'courses'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    code = db.Column(db.String(50), unique=True, nullable=False)
    description = db.Column(db.Text)
    credit = db.Column(db.Float, default=0)
    hours = db.Column(db.Integer, default=0)
    teacher_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    location = db.Column(db.String(100))
    max_students = db.Column(db.Integer, default=30)
    current_students = db.Column(db.Integer, default=0)
    semester = db.Column(db.String(20), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=get_beijing_time)
    updated_at = db.Column(db.DateTime, default=get_beijing_time, onupdate=get_beijing_time)

    teacher = db.relationship('User', backref='teaching_courses')
    course_schedules = db.relationship('CourseSchedule', backref='course', cascade='all, delete-orphan')
    selections = db.relationship('CourseSelection', backref='course', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'code': self.code,
            'description': self.description,
            'credit': self.credit,
            'hours': self.hours,
            'teacher_id': self.teacher_id,
            'teacher_name': self.teacher.real_name if self.teacher else '',
            'location': self.location,
            'max_students': self.max_students,
            'current_students': self.current_students,
            'semester': self.semester,
            'is_active': self.is_active,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else '',
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else ''
        }


class CourseSchedule(db.Model):
    __tablename__ = 'course_schedules'

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=False)
    day_of_week = db.Column(db.Integer, nullable=False)
    start_time = db.Column(db.Time, nullable=False)
    end_time = db.Column(db.Time, nullable=False)
    created_at = db.Column(db.DateTime, default=get_beijing_time)

    def get_day_display(self):
        days = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']
        return days[self.day_of_week - 1] if 1 <= self.day_of_week <= 7 else ''

    def to_dict(self):
        return {
            'id': self.id,
            'course_id': self.course_id,
            'day_of_week': self.day_of_week,
            'day_of_week_display': self.get_day_display(),
            'start_time': self.start_time.strftime('%H:%M') if self.start_time else '',
            'end_time': self.end_time.strftime('%H:%M') if self.end_time else '',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }


class OperationLog(db.Model):
    __tablename__ = 'operation_logs'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    action = db.Column(db.String(100), nullable=False)       # 操作类型
    target_type = db.Column(db.String(50))                    # 目标类型（User/Course/Leave等）
    target_id = db.Column(db.Integer)                         # 目标ID
    target_name = db.Column(db.String(200))                   # 目标名称（方便展示）
    detail = db.Column(db.Text)                               # 操作详情
    ip_address = db.Column(db.String(50))                     # IP地址
    user_agent = db.Column(db.String(500))                    # 浏览器信息
    created_at = db.Column(db.DateTime, default=get_beijing_time)

    user = db.relationship('User', backref='operation_logs')

    def get_action_display(self):
        action_map = {
            'login': '登录', 'logout': '登出',
            'create_user': '创建用户', 'update_user': '更新用户', 'delete_user': '删除用户',
            'create_course': '创建课程', 'update_course': '更新课程', 'delete_course': '删除课程',
            'select_course': '选课', 'drop_course': '退选',
            'create_leave': '提交请假', 'approve_leave': '审批请假', 'reject_leave': '驳回请假', 'cancel_leave': '取消请假',
            'create_org': '创建组织节点', 'update_org': '更新组织节点', 'delete_org': '删除组织节点',
            'create_announcement': '发布公告', 'update_announcement': '更新公告', 'delete_announcement': '删除公告',
            'grade_entry': '录入成绩', 'grade_update': '更新成绩',
            'attendance_clock_in': '上班打卡', 'attendance_clock_out': '下班打卡',
            'attendance_supplement_create': '提交补签申请',
            'attendance_supplement_approve': '批准补签申请',
            'attendance_supplement_reject': '驳回补签申请',
            'attendance_supplement_cancel': '撤回补签申请',
        }
        return action_map.get(self.action, self.action)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'user_name': self.user.real_name if self.user else '',
            'action': self.action,
            'action_display': self.get_action_display(),
            'target_type': self.target_type,
            'target_id': self.target_id,
            'target_name': self.target_name,
            'detail': self.detail,
            'ip_address': self.ip_address,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }


class Announcement(db.Model):
    __tablename__ = 'announcements'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=False)
    category = db.Column(db.String(50), default='general')     # general/system/course/leave
    priority = db.Column(db.String(20), default='normal')       # normal/important/urgent
    author_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    is_pinned = db.Column(db.Boolean, default=False)
    is_active = db.Column(db.Boolean, default=True)
    start_date = db.Column(db.Date)                             # 公告生效开始日期
    end_date = db.Column(db.Date)                              # 公告失效日期
    view_count = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=get_beijing_time)
    updated_at = db.Column(db.DateTime, default=get_beijing_time, onupdate=get_beijing_time)

    author = db.relationship('User', backref='announcements')

    def get_category_display(self):
        cat_map = {'general': '普通', 'system': '系统通知', 'course': '课程通知', 'leave': '请假通知'}
        return cat_map.get(self.category, self.category)

    def get_priority_display(self):
        pri_map = {'normal': '普通', 'important': '重要', 'urgent': '紧急'}
        return pri_map.get(self.priority, self.priority)

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'content': self.content,
            'category': self.category,
            'category_display': self.get_category_display(),
            'priority': self.priority,
            'priority_display': self.get_priority_display(),
            'author_id': self.author_id,
            'author_name': self.author.real_name if self.author else '',
            'is_pinned': self.is_pinned,
            'is_active': self.is_active,
            'start_date': self.start_date.strftime('%Y-%m-%d') if self.start_date else '',
            'end_date': self.end_date.strftime('%Y-%m-%d') if self.end_date else '',
            'view_count': self.view_count,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else '',
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else ''
        }


class Notification(db.Model):
    __tablename__ = 'notifications'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text)
    notification_type = db.Column(db.String(50), nullable=False)   # leave_approved/leave_rejected/course_change/announcement
    related_id = db.Column(db.Integer)                              # 关联记录ID
    related_type = db.Column(db.String(50))                         # 关联类型
    is_read = db.Column(db.Boolean, default=False)
    read_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=get_beijing_time)

    user = db.relationship('User', backref='notifications')

    def get_type_display(self):
        type_map = {
            'leave_approved': '请假已批准', 'leave_rejected': '请假已拒绝', 'leave_cancelled': '请假已取消',
            'leave_pending': '待审批请假', 'leave_transfer': '审批已转交',
            'course_change': '课程变动', 'course_selected': '选课成功', 'course_dropped': '已退选课程',
            'announcement': '新公告', 'grade_published': '成绩发布',
            'assignment_published': '新作业',
            'assignment_submitted': '作业已提交',
            'assignment_reviewed': '作业已批阅',
            'assignment_returned': '作业已退回',
            'supplement_pending': '待审批补签',
            'supplement_approved': '补签已批准',
            'supplement_rejected': '补签已驳回',
            'supplement_cancelled': '补签已撤回',
            'system': '系统通知'
        }
        return type_map.get(self.notification_type, self.notification_type)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'title': self.title,
            'content': self.content,
            'notification_type': self.notification_type,
            'type_display': self.get_type_display(),
            'related_id': self.related_id,
            'related_type': self.related_type,
            'is_read': self.is_read,
            'read_at': self.read_at.strftime('%Y-%m-%d %H:%M:%S') if self.read_at else '',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }


class Attendance(db.Model):
    __tablename__ = 'attendances'
    __table_args__ = (
        db.UniqueConstraint('user_id', 'attendance_date', name='uq_attendance_user_date'),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    attendance_date = db.Column(db.Date, nullable=False)
    clock_in = db.Column(db.DateTime)                                # 上班打卡时间
    clock_out = db.Column(db.DateTime)                               # 下班打卡时间
    status = db.Column(db.String(20), default='normal')              # normal/late/early/absent
    remark = db.Column(db.String(200))                               # 备注（迟到原因等）
    created_at = db.Column(db.DateTime, default=get_beijing_time)
    updated_at = db.Column(db.DateTime, default=get_beijing_time, onupdate=get_beijing_time)

    user = db.relationship('User', backref='attendances')

    def get_status_display(self):
        status_map = {'normal': '正常', 'late': '迟到', 'early': '早退', 'absent': '缺勤', 'on_leave': '请假'}
        return status_map.get(self.status, self.status)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'user_name': self.user.real_name if self.user else '',
            'attendance_date': self.attendance_date.strftime('%Y-%m-%d') if self.attendance_date else '',
            'clock_in': self.clock_in.strftime('%Y-%m-%d %H:%M') if self.clock_in else '',
            'clock_out': self.clock_out.strftime('%Y-%m-%d %H:%M') if self.clock_out else '',
            'status': self.status,
            'status_display': self.get_status_display(),
            'remark': self.remark,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }


class AttendanceSupplementRequest(db.Model):
    __tablename__ = 'attendance_supplement_requests'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    attendance_id = db.Column(db.Integer, db.ForeignKey('attendances.id'))
    attendance_date = db.Column(db.Date, nullable=False)
    supplement_type = db.Column(db.String(20), nullable=False)
    requested_time = db.Column(db.Time, nullable=False)
    reason = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), default='pending')
    current_approver_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    final_approver_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    approval_comments = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=get_beijing_time)
    updated_at = db.Column(db.DateTime, default=get_beijing_time, onupdate=get_beijing_time)

    user = db.relationship('User', foreign_keys=[user_id], backref='attendance_supplement_requests')
    attendance = db.relationship('Attendance', backref='supplement_requests')
    current_approver = db.relationship('User', foreign_keys=[current_approver_id])
    final_approver = db.relationship('User', foreign_keys=[final_approver_id])
    approval_flows = db.relationship('AttendanceSupplementFlow', backref='request', cascade='all, delete-orphan')

    def get_type_display(self):
        return {
            'clock_in': '上班补签',
            'clock_out': '下班补签',
        }.get(self.supplement_type, self.supplement_type)

    def get_status_display(self):
        return {
            'pending': '待审批',
            'approved': '已批准',
            'rejected': '已驳回',
            'cancelled': '已取消',
        }.get(self.status, self.status)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'user_name': self.user.real_name if self.user else '',
            'attendance_id': self.attendance_id,
            'attendance_date': self.attendance_date.strftime('%Y-%m-%d') if self.attendance_date else '',
            'supplement_type': self.supplement_type,
            'supplement_type_display': self.get_type_display(),
            'requested_time': self.requested_time.strftime('%H:%M') if self.requested_time else '',
            'reason': self.reason,
            'status': self.status,
            'status_display': self.get_status_display(),
            'current_approver_id': self.current_approver_id,
            'current_approver_name': self.current_approver.real_name if self.current_approver else '',
            'final_approver_id': self.final_approver_id,
            'final_approver_name': self.final_approver.real_name if self.final_approver else '',
            'approval_comments': self.approval_comments or '',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else '',
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else '',
        }


class AttendanceSupplementFlow(db.Model):
    __tablename__ = 'attendance_supplement_flows'

    id = db.Column(db.Integer, primary_key=True)
    supplement_request_id = db.Column(db.Integer, db.ForeignKey('attendance_supplement_requests.id'), nullable=False)
    approver_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    status = db.Column(db.String(20), default='pending')
    comments = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=get_beijing_time)
    updated_at = db.Column(db.DateTime, default=get_beijing_time, onupdate=get_beijing_time)

    approver = db.relationship('User')

    def to_dict(self):
        return {
            'id': self.id,
            'approver_id': self.approver_id,
            'approver_name': self.approver.real_name if self.approver else '',
            'status': self.status,
            'status_display': {
                'pending': '待审批',
                'approved': '已批准',
                'rejected': '已驳回',
                'cancelled': '已撤回',
            }.get(self.status, self.status),
            'comments': self.comments or '',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else '',
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else '',
        }


class Grade(db.Model):
    __tablename__ = 'grades'

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=False)
    teacher_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    score = db.Column(db.Float)                                     # 分数
    grade_type = db.Column(db.String(20), default='final')           # mid-term/final/supplement
    comment = db.Column(db.Text)                                      # 评语
    is_published = db.Column(db.Boolean, default=False)              # 是否已发布
    published_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=get_beijing_time)
    updated_at = db.Column(db.DateTime, default=get_beijing_time, onupdate=get_beijing_time)

    student = db.relationship('User', foreign_keys=[student_id], backref='grades_received')
    course = db.relationship('Course', backref='grades')
    teacher = db.relationship('User', foreign_keys=[teacher_id])

    def get_score_letter(self):
        if self.score is None:
            return 'N/A'
        if self.score >= 90:
            return 'A'
        elif self.score >= 80:
            return 'B'
        elif self.score >= 70:
            return 'C'
        elif self.score >= 60:
            return 'D'
        else:
            return 'F'

    def to_dict(self):
        return {
            'id': self.id,
            'student_id': self.student_id,
            'student_name': self.student.real_name if self.student else '',
            'course_id': self.course_id,
            'course_name': self.course.name if self.course else '',
            'course_code': self.course.code if self.course else '',
            'teacher_id': self.teacher_id,
            'teacher_name': self.teacher.real_name if self.teacher else '',
            'score': self.score,
            'score_letter': self.get_score_letter(),
            'grade_type': self.grade_type,
            'comment': self.comment,
            'is_published': self.is_published,
            'published_at': self.published_at.strftime('%Y-%m-%d %H:%M:%S') if self.published_at else '',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }


class CourseSelection(db.Model):
    __tablename__ = 'course_selections'
    __table_args__ = (
        db.UniqueConstraint('student_id', 'course_id', name='uq_course_selection_student_course'),
    )

    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=False)
    selected_at = db.Column(db.DateTime, default=get_beijing_time)
    status = db.Column(db.String(20), default='selected')

    student = db.relationship('User', backref='selected_courses')

    def to_dict(self):
        return {
            'id': self.id,
            'student_id': self.student_id,
            'student_name': self.student.real_name if self.student else '',
            'course_id': self.course_id,
            'course_name': self.course.name if self.course else '',
            'course_code': self.course.code if self.course else '',
            'selected_at': self.selected_at.strftime('%Y-%m-%d %H:%M:%S') if self.selected_at else '',
            'status': self.status,
            'status_display': '已选课' if self.status == 'selected' else '已退选'
        }


class CourseAttendanceActivity(db.Model):
    __tablename__ = 'course_attendance_activities'

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=False)
    teacher_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(120), nullable=False)
    start_time = db.Column(db.DateTime, nullable=False)
    end_time = db.Column(db.DateTime, nullable=False)
    location_name = db.Column(db.String(120))
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    radius_meters = db.Column(db.Integer, default=200)
    allow_late = db.Column(db.Boolean, default=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=get_beijing_time)
    updated_at = db.Column(db.DateTime, default=get_beijing_time, onupdate=get_beijing_time)

    course = db.relationship('Course', backref='attendance_activities')
    teacher = db.relationship('User', backref='course_attendance_activities')
    records = db.relationship('CourseAttendanceRecord', backref='activity', cascade='all, delete-orphan')

    def get_status(self):
        now = datetime.now()
        if not self.is_active:
            return 'closed'
        if now < self.start_time:
            return 'pending'
        if now > self.end_time:
            return 'finished'
        return 'open'

    def get_status_display(self):
        return {
            'pending': '未开始',
            'open': '进行中',
            'finished': '已结束',
            'closed': '已关闭',
        }.get(self.get_status(), self.get_status())

    def to_dict(self):
        return {
            'id': self.id,
            'course_id': self.course_id,
            'course_name': self.course.name if self.course else '',
            'course_code': self.course.code if self.course else '',
            'teacher_id': self.teacher_id,
            'teacher_name': self.teacher.real_name if self.teacher else '',
            'title': self.title,
            'start_time': self.start_time.strftime('%Y-%m-%d %H:%M:%S') if self.start_time else '',
            'end_time': self.end_time.strftime('%Y-%m-%d %H:%M:%S') if self.end_time else '',
            'location_name': self.location_name or '',
            'latitude': self.latitude,
            'longitude': self.longitude,
            'radius_meters': self.radius_meters,
            'allow_late': self.allow_late,
            'is_active': self.is_active,
            'status': self.get_status(),
            'status_display': self.get_status_display(),
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else '',
        }


class CourseAttendanceRecord(db.Model):
    __tablename__ = 'course_attendance_records'
    __table_args__ = (
        db.UniqueConstraint('activity_id', 'student_id', name='uq_course_attendance_activity_student'),
    )

    id = db.Column(db.Integer, primary_key=True)
    activity_id = db.Column(db.Integer, db.ForeignKey('course_attendance_activities.id'), nullable=False)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    sign_time = db.Column(db.DateTime)
    status = db.Column(db.String(30), nullable=False, default='present')
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    accuracy = db.Column(db.Float)
    distance_meters = db.Column(db.Float)
    within_range = db.Column(db.Boolean, default=False)
    remark = db.Column(db.Text)
    reviewed_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    reviewed_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=get_beijing_time)
    updated_at = db.Column(db.DateTime, default=get_beijing_time, onupdate=get_beijing_time)

    student = db.relationship('User', foreign_keys=[student_id], backref='course_attendance_records')
    reviewer = db.relationship('User', foreign_keys=[reviewed_by])

    def get_status_display(self):
        return {
            'present': '已签到',
            'late': '迟到',
            'absent': '未签到',
            'leave': '请假',
            'location_abnormal': '位置异常',
            'manual': '手动补签',
        }.get(self.status, self.status)

    def to_dict(self):
        return {
            'id': self.id,
            'activity_id': self.activity_id,
            'student_id': self.student_id,
            'student_name': self.student.real_name if self.student else '',
            'student_no': self.student.student_id if self.student else '',
            'major': self.student.major if self.student else '',
            'grade': self.student.grade if self.student else '',
            'email': self.student.email if self.student else '',
            'phone': self.student.phone if self.student else '',
            'sign_time': self.sign_time.strftime('%Y-%m-%d %H:%M:%S') if self.sign_time else '',
            'status': self.status,
            'status_display': self.get_status_display(),
            'latitude': self.latitude,
            'longitude': self.longitude,
            'accuracy': self.accuracy,
            'distance_meters': self.distance_meters,
            'within_range': self.within_range,
            'remark': self.remark or '',
            'reviewed_by': self.reviewed_by,
            'reviewed_by_name': self.reviewer.real_name if self.reviewer else '',
            'reviewed_at': self.reviewed_at.strftime('%Y-%m-%d %H:%M:%S') if self.reviewed_at else '',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else '',
        }


class CourseAssignment(db.Model):
    __tablename__ = 'course_assignments'

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey('courses.id'), nullable=False)
    teacher_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text)
    due_time = db.Column(db.DateTime, nullable=False)
    max_score = db.Column(db.Float, default=100)
    allow_late = db.Column(db.Boolean, default=True)
    publish_status = db.Column(db.String(20), default='published')
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=get_beijing_time)
    updated_at = db.Column(db.DateTime, default=get_beijing_time, onupdate=get_beijing_time)

    course = db.relationship('Course', backref='assignments')
    teacher = db.relationship('User', backref='course_assignments')
    submissions = db.relationship('CourseAssignmentSubmission', backref='assignment', cascade='all, delete-orphan')
    attachments = db.relationship('CourseAssignmentAttachment', backref='assignment', cascade='all, delete-orphan')

    def get_status(self):
        if not self.is_active:
            return 'closed'
        if self.publish_status == 'draft':
            return 'draft'
        if datetime.now() > self.due_time:
            return 'overdue'
        return 'open'

    def get_status_display(self):
        return {
            'open': '进行中',
            'overdue': '已截止',
            'closed': '已关闭',
            'draft': '草稿',
        }.get(self.get_status(), self.get_status())

    def to_dict(self):
        return {
            'id': self.id,
            'course_id': self.course_id,
            'course_name': self.course.name if self.course else '',
            'course_code': self.course.code if self.course else '',
            'teacher_id': self.teacher_id,
            'teacher_name': self.teacher.real_name if self.teacher else '',
            'title': self.title,
            'description': self.description or '',
            'due_time': self.due_time.strftime('%Y-%m-%d %H:%M:%S') if self.due_time else '',
            'max_score': self.max_score,
            'allow_late': self.allow_late,
            'publish_status': self.publish_status,
            'is_active': self.is_active,
            'status': self.get_status(),
            'status_display': self.get_status_display(),
            'attachments': [item.to_dict() for item in self.attachments],
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else '',
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else '',
        }


class CourseAssignmentSubmission(db.Model):
    __tablename__ = 'course_assignment_submissions'
    __table_args__ = (
        db.UniqueConstraint('assignment_id', 'student_id', name='uq_course_assignment_student_submission'),
    )

    id = db.Column(db.Integer, primary_key=True)
    assignment_id = db.Column(db.Integer, db.ForeignKey('course_assignments.id'), nullable=False)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    submitted_at = db.Column(db.DateTime, default=get_beijing_time)
    status = db.Column(db.String(30), nullable=False, default='submitted')
    score = db.Column(db.Float)
    feedback = db.Column(db.Text)
    reviewed_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    reviewed_at = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=get_beijing_time)
    updated_at = db.Column(db.DateTime, default=get_beijing_time, onupdate=get_beijing_time)

    student = db.relationship('User', foreign_keys=[student_id], backref='course_assignment_submissions')
    reviewer = db.relationship('User', foreign_keys=[reviewed_by])
    versions = db.relationship(
        'CourseAssignmentSubmissionVersion',
        backref='submission',
        cascade='all, delete-orphan',
        order_by='CourseAssignmentSubmissionVersion.version_no',
    )
    attachments = db.relationship('CourseAssignmentAttachment', backref='submission', cascade='all, delete-orphan')

    def get_status_display(self):
        return {
            'submitted': '已提交',
            'late': '迟交',
            'resubmitted': '已重交',
            'returned': '已退回',
            'reviewed': '已批阅',
            'missing': '未提交',
        }.get(self.status, self.status)

    def to_dict(self):
        return {
            'id': self.id,
            'assignment_id': self.assignment_id,
            'student_id': self.student_id,
            'student_name': self.student.real_name if self.student else '',
            'student_no': self.student.student_id if self.student else '',
            'major': self.student.major if self.student else '',
            'grade': self.student.grade if self.student else '',
            'email': self.student.email if self.student else '',
            'phone': self.student.phone if self.student else '',
            'content': self.content or '',
            'submitted_at': self.submitted_at.strftime('%Y-%m-%d %H:%M:%S') if self.submitted_at else '',
            'status': self.status,
            'status_display': self.get_status_display(),
            'score': self.score,
            'feedback': self.feedback or '',
            'attachments': [item.to_dict() for item in self.attachments],
            'version_count': len(self.versions),
            'reviewed_by': self.reviewed_by,
            'reviewed_by_name': self.reviewer.real_name if self.reviewer else '',
            'reviewed_at': self.reviewed_at.strftime('%Y-%m-%d %H:%M:%S') if self.reviewed_at else '',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else '',
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else '',
        }


class CourseAssignmentSubmissionVersion(db.Model):
    __tablename__ = 'course_assignment_submission_versions'

    id = db.Column(db.Integer, primary_key=True)
    submission_id = db.Column(db.Integer, db.ForeignKey('course_assignment_submissions.id'), nullable=False)
    version_no = db.Column(db.Integer, nullable=False)
    content = db.Column(db.Text, nullable=False)
    submitted_at = db.Column(db.DateTime, default=get_beijing_time)
    status = db.Column(db.String(30), nullable=False, default='submitted')

    def to_dict(self):
        return {
            'id': self.id,
            'submission_id': self.submission_id,
            'version_no': self.version_no,
            'content': self.content,
            'submitted_at': self.submitted_at.strftime('%Y-%m-%d %H:%M:%S') if self.submitted_at else '',
            'status': self.status,
        }


class CourseAssignmentAttachment(db.Model):
    __tablename__ = 'course_assignment_attachments'

    id = db.Column(db.Integer, primary_key=True)
    assignment_id = db.Column(db.Integer, db.ForeignKey('course_assignments.id'))
    submission_id = db.Column(db.Integer, db.ForeignKey('course_assignment_submissions.id'))
    uploaded_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    original_name = db.Column(db.String(255), nullable=False)
    stored_name = db.Column(db.String(255), nullable=False)
    storage_path = db.Column(db.String(500), nullable=False)
    file_size = db.Column(db.Integer, default=0)
    content_type = db.Column(db.String(120))
    created_at = db.Column(db.DateTime, default=get_beijing_time)

    uploader = db.relationship('User', foreign_keys=[uploaded_by])

    def to_dict(self):
        return {
            'id': self.id,
            'assignment_id': self.assignment_id,
            'submission_id': self.submission_id,
            'uploaded_by': self.uploaded_by,
            'uploader_name': self.uploader.real_name if self.uploader else '',
            'original_name': self.original_name,
            'stored_name': self.stored_name,
            'file_size': self.file_size,
            'content_type': self.content_type or '',
            'download_url': f'/assignment/api/attachments/{self.id}/download',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else '',
        }


class SystemSettings(db.Model):
    """系统级别的外观设置（仅系统管理员可修改）"""
    __tablename__ = 'system_settings'

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), unique=True, nullable=False)

    # 背景设置
    background_type = db.Column(db.String(20), default='solid')      # solid/gradient/image
    background_color = db.Column(db.String(20), default='#f0f2f5')     # 纯色背景
    background_gradient_start = db.Column(db.String(20), default='#667eea')  # 渐变起始色
    background_gradient_end = db.Column(db.String(20), default='#764ba2')   # 渐变结束色
    background_image = db.Column(db.String(500))                        # 背景图片URL
    background_image_opacity = db.Column(db.Float, default=0.3)        # 背景图片透明度

    # 主题色调
    primary_color = db.Column(db.String(20), default='#667eea')        # 主色调
    accent_color = db.Column(db.String(20), default='#764ba2')          # 强调色

    # 色调调整
    saturation = db.Column(db.Integer, default=100)                    # 饱和度 0-200
    brightness = db.Column(db.Integer, default=100)                    # 亮度 0-200
    hue_shift = db.Column(db.Integer, default=0)                        # 色相偏移 -180 到 180

    # 其他
    border_radius = db.Column(db.String(20), default='8px')            # 圆角大小
    card_style = db.Column(db.String(20), default='rounded')            # 卡片样式: rounded/sharp/circle
    animation_enabled = db.Column(db.Boolean, default=True)             # 是否启用动画

    updated_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    updated_at = db.Column(db.DateTime, default=get_beijing_time, onupdate=get_beijing_time)

    updater = db.relationship('User', backref='system_settings_updates')

    def to_dict(self):
        return {
            'id': self.id,
            'key': self.key,
            'background_type': self.background_type,
            'background_color': self.background_color,
            'background_gradient_start': self.background_gradient_start,
            'background_gradient_end': self.background_gradient_end,
            'background_image': self.background_image,
            'background_image_opacity': self.background_image_opacity,
            'primary_color': self.primary_color,
            'accent_color': self.accent_color,
            'saturation': self.saturation,
            'brightness': self.brightness,
            'hue_shift': self.hue_shift,
            'border_radius': self.border_radius,
            'card_style': self.card_style,
            'animation_enabled': self.animation_enabled,
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else ''
        }


class AttendanceRule(db.Model):
    __tablename__ = 'attendance_rules'

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(50), unique=True, nullable=False, default='default')
    attendance_enabled = db.Column(db.Boolean, default=True)
    require_location = db.Column(db.Boolean, default=True)
    location_name = db.Column(db.String(120), default='学校主校区')
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    radius_meters = db.Column(db.Integer, default=300)
    check_in_start = db.Column(db.Time, default=lambda: time(7, 30))
    check_in_end = db.Column(db.Time, default=lambda: time(9, 0))
    check_out_start = db.Column(db.Time, default=lambda: time(17, 0))
    check_out_end = db.Column(db.Time, default=lambda: time(21, 0))
    updated_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    updated_at = db.Column(db.DateTime, default=get_beijing_time, onupdate=get_beijing_time)

    updater = db.relationship('User', backref='attendance_rule_updates')

    def to_dict(self):
        return {
            'id': self.id,
            'key': self.key,
            'attendance_enabled': self.attendance_enabled,
            'require_location': self.require_location,
            'location_name': self.location_name,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'radius_meters': self.radius_meters,
            'check_in_start': self.check_in_start.strftime('%H:%M') if self.check_in_start else '',
            'check_in_end': self.check_in_end.strftime('%H:%M') if self.check_in_end else '',
            'check_out_start': self.check_out_start.strftime('%H:%M') if self.check_out_start else '',
            'check_out_end': self.check_out_end.strftime('%H:%M') if self.check_out_end else '',
            'updated_by': self.updated_by,
            'updated_by_name': self.updater.real_name if self.updater else '',
            'updated_at': self.updated_at.strftime('%Y-%m-%d %H:%M:%S') if self.updated_at else '',
        }


class AttendanceLocationLog(db.Model):
    __tablename__ = 'attendance_location_logs'

    id = db.Column(db.Integer, primary_key=True)
    attendance_id = db.Column(db.Integer, db.ForeignKey('attendances.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    punch_type = db.Column(db.String(20), nullable=False)
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    accuracy = db.Column(db.Float)
    distance_meters = db.Column(db.Float)
    within_range = db.Column(db.Boolean, default=False)
    location_name = db.Column(db.String(120))
    created_at = db.Column(db.DateTime, default=get_beijing_time)

    attendance = db.relationship('Attendance', backref='location_logs')
    user = db.relationship('User', backref='attendance_location_logs')

    def to_dict(self):
        return {
            'id': self.id,
            'attendance_id': self.attendance_id,
            'user_id': self.user_id,
            'punch_type': self.punch_type,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'accuracy': self.accuracy,
            'distance_meters': self.distance_meters,
            'within_range': self.within_range,
            'location_name': self.location_name,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else '',
        }


