import unittest
from datetime import time

from app import create_app
from app.extensions import db
from app.models import Course, CourseSchedule, CourseSelection, OperationLog, OrganizationNode, User, UserOrganization


class TestConfig:
    SECRET_KEY = 'test-secret'
    TESTING = True
    WTF_CSRF_ENABLED = False
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    SQLALCHEMY_TRACK_MODIFICATIONS = False


class CourseSelectionIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(TestConfig)
        self.client = self.app.test_client()
        with self.app.app_context():
            db.drop_all()
            db.create_all()

            college = OrganizationNode(name='Engineering', node_type='college', is_active=True)
            db.session.add(college)
            db.session.flush()

            teacher = User(username='teacher_user', real_name='Teacher User', role='staff', is_active=True)
            teacher.set_password('secret123')
            student = User(username='student_user', real_name='Student User', role='student', is_active=True)
            student.set_password('secret123')
            db.session.add_all([teacher, student])
            db.session.flush()

            db.session.add_all([
                UserOrganization(user_id=teacher.id, node_id=college.id, is_primary=True),
                UserOrganization(user_id=student.id, node_id=college.id, is_primary=True),
            ])

            course = Course(
                name='Data Structures',
                code='CS101',
                teacher_id=teacher.id,
                max_students=2,
                current_students=0,
                semester='2026 Spring',
                is_active=True,
            )
            db.session.add(course)
            db.session.flush()
            db.session.add(
                CourseSchedule(
                    course_id=course.id,
                    day_of_week=1,
                    start_time=time(9, 0),
                    end_time=time(10, 0),
                )
            )
            db.session.commit()
            self.course_id = course.id

    def login_student(self):
        response = self.client.post('/auth/login', json={'username': 'student_user', 'password': 'secret123'})
        self.assertEqual(response.status_code, 200)

    def test_reselecting_dropped_course_reuses_existing_selection(self):
        self.login_student()

        first_select = self.client.post('/course/api/courses/select', json={'course_id': self.course_id})
        self.assertEqual(first_select.status_code, 200)

        drop = self.client.post('/course/api/courses/drop', json={'course_id': self.course_id})
        self.assertEqual(drop.status_code, 200)

        second_select = self.client.post('/course/api/courses/select', json={'course_id': self.course_id})
        self.assertEqual(second_select.status_code, 200)

        with self.app.app_context():
            selections = CourseSelection.query.filter_by(course_id=self.course_id).all()
            self.assertEqual(len(selections), 1)
            self.assertEqual(selections[0].status, 'selected')
            course = db.session.get(Course, self.course_id)
            self.assertEqual(course.current_students, 1)

    def test_select_and_drop_course_write_audit_logs(self):
        self.login_student()

        select_response = self.client.post('/course/api/courses/select', json={'course_id': self.course_id})
        self.assertEqual(select_response.status_code, 200)
        drop_response = self.client.post('/course/api/courses/drop', json={'course_id': self.course_id})
        self.assertEqual(drop_response.status_code, 200)

        with self.app.app_context():
            actions = [item.action for item in OperationLog.query.order_by(OperationLog.id.asc()).all()]
            self.assertEqual(actions, ['select_course', 'drop_course'])

    def test_select_course_rejects_missing_json_body(self):
        self.login_student()

        response = self.client.post('/course/api/courses/select')

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json()['success'])


if __name__ == '__main__':
    unittest.main()
