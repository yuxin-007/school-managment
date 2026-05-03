import unittest
from datetime import date

from app import create_app
from app.extensions import db
from app.models import Attendance, LeaveApplication, Notification, OperationLog, User
from app.services.attendance_service import rollback_leave_attendance_sync, sync_approved_leave_to_attendance


class TestConfig:
    SECRET_KEY = 'test-secret'
    TESTING = True
    WTF_CSRF_ENABLED = False
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    SQLALCHEMY_TRACK_MODIFICATIONS = False


class WorkflowIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(TestConfig)
        with self.app.app_context():
            db.drop_all()
            db.create_all()
            user = User(username='workflow_user', real_name='Workflow User', role='staff', is_active=True)
            user.set_password('secret123')
            db.session.add(user)
            db.session.commit()
            self.user_id = user.id

    def test_notification_creation_joins_current_transaction_by_default(self):
        from app.blueprints.notification import create_notification

        with self.app.app_context():
            create_notification(
                user_id=self.user_id,
                title='Transactional notice',
                content='Should roll back with the business transaction',
                notification_type='system',
            )

            self.assertEqual(Notification.query.count(), 1)
            db.session.rollback()
            self.assertEqual(Notification.query.count(), 0)

    def test_operation_log_creation_joins_current_transaction_by_default(self):
        from app.blueprints.log import log_operation

        with self.app.app_context():
            log_operation(
                user_id=self.user_id,
                action='create_course',
                target_type='Course',
                target_id=1,
                target_name='Transactional Course',
            )

            self.assertEqual(OperationLog.query.count(), 1)
            db.session.rollback()
            self.assertEqual(OperationLog.query.count(), 0)

    def test_approved_leave_sync_uses_readable_remark_and_rolls_back_cleanly(self):
        with self.app.app_context():
            application = LeaveApplication(
                staff_id=self.user_id,
                leave_type='sick_leave',
                start_date=date(2026, 4, 20),
                end_date=date(2026, 4, 21),
                reason='Fever',
                total_days=2,
                status='approved',
            )
            db.session.add(application)
            db.session.flush()

            updated = sync_approved_leave_to_attendance(application)

            self.assertEqual(len(updated), 2)
            attendance = Attendance.query.filter_by(
                user_id=self.user_id,
                attendance_date=date(2026, 4, 20),
            ).one()
            self.assertEqual(attendance.status, 'on_leave')
            self.assertEqual(attendance.remark, '已批准病假：2026-04-20 至 2026-04-21')

            rolled_back = rollback_leave_attendance_sync(application)

            self.assertEqual(len(rolled_back), 2)
            self.assertEqual(Attendance.query.filter_by(user_id=self.user_id).count(), 0)


if __name__ == '__main__':
    unittest.main()
