import unittest
import tempfile
from datetime import datetime, timedelta, time
from io import BytesIO

from app import create_app
from app.extensions import db
from app.models import (
    Course,
    CourseAssignmentSubmission,
    CourseAssignmentSubmissionVersion,
    CourseSchedule,
    CourseSelection,
    Grade,
    Notification,
    OrganizationNode,
    User,
    UserOrganization,
)


class TestConfig:
    SECRET_KEY = 'test-secret'
    TESTING = True
    WTF_CSRF_ENABLED = False
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    SQLALCHEMY_TRACK_MODIFICATIONS = False


class CourseAssignmentTests(unittest.TestCase):
    def setUp(self):
        self.upload_dir = tempfile.TemporaryDirectory()
        TestConfig.ASSIGNMENT_UPLOAD_FOLDER = self.upload_dir.name
        self.app = create_app(TestConfig)
        self.client = self.app.test_client()
        with self.app.app_context():
            db.drop_all()
            db.create_all()

            college = OrganizationNode(name='Engineering', node_type='college', is_active=True)
            db.session.add(college)
            db.session.flush()

            teacher = User(
                username='teacher_user',
                real_name='Teacher User',
                role='staff',
                email='teacher@example.com',
                phone='13900000000',
                is_active=True,
            )
            teacher.set_password('secret123')
            student = User(
                username='student_user',
                real_name='Student User',
                role='student',
                student_id='S2026001',
                major='Software Engineering',
                email='student@example.com',
                phone='13800000000',
                is_active=True,
            )
            student.set_password('secret123')
            outsider = User(
                username='outsider_user',
                real_name='Outsider User',
                role='student',
                student_id='S2026002',
                major='Computer Science',
                is_active=True,
            )
            outsider.set_password('secret123')
            db.session.add_all([teacher, student, outsider])
            db.session.flush()

            db.session.add_all([
                UserOrganization(user_id=teacher.id, node_id=college.id, is_primary=True),
                UserOrganization(user_id=student.id, node_id=college.id, is_primary=True),
                UserOrganization(user_id=outsider.id, node_id=college.id, is_primary=True),
            ])

            course = Course(
                name='Software Testing',
                code='SE302',
                teacher_id=teacher.id,
                max_students=20,
                current_students=1,
                semester='2026 Spring',
                is_active=True,
                location='Room 302',
            )
            db.session.add(course)
            db.session.flush()
            db.session.add_all([
                CourseSchedule(
                    course_id=course.id,
                    day_of_week=2,
                    start_time=time(9, 0),
                    end_time=time(10, 0),
                ),
                CourseSelection(student_id=student.id, course_id=course.id, status='selected'),
            ])
            db.session.commit()

            self.course_id = course.id
            self.student_id = student.id

    def tearDown(self):
        self.upload_dir.cleanup()

    def login(self, username):
        response = self.client.post('/auth/login', json={'username': username, 'password': 'secret123'})
        self.assertEqual(response.status_code, 200)

    def logout(self):
        self.client.post('/auth/logout')

    def create_assignment(self, allow_late=True, due_minutes=60):
        self.login('teacher_user')
        response = self.client.post(
            f'/assignment/api/courses/{self.course_id}/assignments',
            json={
                'title': 'Homework 1',
                'description': 'Write unit tests for the login flow.',
                'due_time': (datetime.now() + timedelta(minutes=due_minutes)).strftime('%Y-%m-%d %H:%M:%S'),
                'max_score': 100,
                'allow_late': allow_late,
            },
        )
        self.assertEqual(response.status_code, 200)
        assignment_id = response.get_json()['data']['id']
        self.logout()
        return assignment_id

    def submit_assignment(self, assignment_id, content='Submitted answer.'):
        self.login('student_user')
        response = self.client.post(
            f'/assignment/api/assignments/{assignment_id}/submit',
            json={'content': content},
        )
        self.assertEqual(response.status_code, 200)
        self.logout()
        return response.get_json()['data']

    def test_teacher_creates_assignment_and_student_can_list_it(self):
        assignment_id = self.create_assignment()

        self.login('student_user')
        response = self.client.get(f'/assignment/api/courses/{self.course_id}/assignments')

        self.assertEqual(response.status_code, 200)
        data = response.get_json()['data']
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['id'], assignment_id)
        self.assertEqual(data[0]['title'], 'Homework 1')
        self.assertIsNone(data[0]['my_submission'])

    def test_selected_student_can_submit_assignment(self):
        assignment_id = self.create_assignment()

        self.login('student_user')
        response = self.client.post(
            f'/assignment/api/assignments/{assignment_id}/submit',
            json={'content': 'Here is my answer.'},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()['data']
        self.assertEqual(payload['content'], 'Here is my answer.')
        self.assertEqual(payload['status'], 'submitted')

    def test_unselected_student_cannot_submit_assignment(self):
        assignment_id = self.create_assignment()

        self.login('outsider_user')
        response = self.client.post(
            f'/assignment/api/assignments/{assignment_id}/submit',
            json={'content': 'I should not be accepted.'},
        )

        self.assertEqual(response.status_code, 403)

    def test_teacher_sees_missing_and_submitted_students(self):
        assignment_id = self.create_assignment()
        self.login('student_user')
        self.client.post(
            f'/assignment/api/assignments/{assignment_id}/submit',
            json={'content': 'Submitted answer.'},
        )
        self.logout()

        self.login('teacher_user')
        response = self.client.get(f'/assignment/api/assignments/{assignment_id}/submissions')

        self.assertEqual(response.status_code, 200)
        records = response.get_json()['data']['submissions']
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]['student_id'], self.student_id)
        self.assertEqual(records[0]['status'], 'submitted')

    def test_teacher_reviews_submission(self):
        assignment_id = self.create_assignment()
        submission_id = self.submit_assignment(assignment_id)['id']

        self.login('teacher_user')
        response = self.client.put(
            f'/assignment/api/submissions/{submission_id}/review',
            json={'score': 92, 'feedback': 'Good coverage.'},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()['data']
        self.assertEqual(payload['status'], 'reviewed')
        self.assertEqual(payload['score'], 92)
        self.assertEqual(payload['feedback'], 'Good coverage.')

    def test_student_cannot_submit_closed_late_assignment(self):
        assignment_id = self.create_assignment(allow_late=False, due_minutes=-5)

        self.login('student_user')
        response = self.client.post(
            f'/assignment/api/assignments/{assignment_id}/submit',
            json={'content': 'Late answer.'},
        )

        self.assertEqual(response.status_code, 400)

    def test_assignment_attachment_can_be_uploaded_and_listed(self):
        assignment_id = self.create_assignment()

        self.login('teacher_user')
        response = self.client.post(
            f'/assignment/api/assignments/{assignment_id}/attachments',
            data={'file': (BytesIO(b'homework spec'), 'spec.txt')},
            content_type='multipart/form-data',
        )

        self.assertEqual(response.status_code, 200)
        attachment = response.get_json()['data']
        self.assertEqual(attachment['original_name'], 'spec.txt')

        self.logout()
        self.login('student_user')
        list_response = self.client.get(f'/assignment/api/courses/{self.course_id}/assignments')
        listed = list_response.get_json()['data'][0]['attachments']
        self.assertEqual(listed[0]['original_name'], 'spec.txt')

    def test_submission_versions_are_preserved_when_student_resubmits(self):
        assignment_id = self.create_assignment()
        first = self.submit_assignment(assignment_id, 'First answer.')
        second = self.submit_assignment(assignment_id, 'Second answer.')

        self.assertEqual(first['content'], 'First answer.')
        self.assertEqual(second['content'], 'Second answer.')
        with self.app.app_context():
            versions = CourseAssignmentSubmissionVersion.query.filter_by(submission_id=second['id']).all()
            self.assertEqual(len(versions), 2)
            self.assertEqual(versions[0].content, 'First answer.')
            self.assertEqual(versions[1].content, 'Second answer.')

    def test_teacher_returns_submission_and_student_resubmits(self):
        assignment_id = self.create_assignment()
        submission_id = self.submit_assignment(assignment_id)['id']

        self.login('teacher_user')
        return_response = self.client.put(
            f'/assignment/api/submissions/{submission_id}/review',
            json={'action': 'return', 'feedback': 'Please add assertions.'},
        )
        self.assertEqual(return_response.status_code, 200)
        self.assertEqual(return_response.get_json()['data']['status'], 'returned')
        self.logout()

        self.login('student_user')
        resubmit_response = self.client.post(
            f'/assignment/api/assignments/{assignment_id}/submit',
            json={'content': 'Improved answer.'},
        )
        self.assertEqual(resubmit_response.status_code, 200)
        self.assertEqual(resubmit_response.get_json()['data']['status'], 'resubmitted')

    def test_review_updates_usual_grade_average(self):
        assignment_id = self.create_assignment()
        submission_id = self.submit_assignment(assignment_id)['id']

        self.login('teacher_user')
        response = self.client.put(
            f'/assignment/api/submissions/{submission_id}/review',
            json={'score': 80, 'feedback': 'Good.'},
        )

        self.assertEqual(response.status_code, 200)
        with self.app.app_context():
            grade = Grade.query.filter_by(student_id=self.student_id, course_id=self.course_id, grade_type='usual').first()
            self.assertIsNotNone(grade)
            self.assertEqual(grade.score, 80)

    def test_assignment_notifications_are_created(self):
        assignment_id = self.create_assignment()
        submission_id = self.submit_assignment(assignment_id)['id']

        self.login('teacher_user')
        self.client.put(
            f'/assignment/api/submissions/{submission_id}/review',
            json={'score': 91, 'feedback': 'Well done.'},
        )

        with self.app.app_context():
            notifications = Notification.query.order_by(Notification.created_at.asc()).all()
            types = [item.notification_type for item in notifications]
            self.assertIn('assignment_published', types)
            self.assertIn('assignment_submitted', types)
            self.assertIn('assignment_reviewed', types)

    def test_teacher_exports_assignment_submissions(self):
        assignment_id = self.create_assignment()
        self.submit_assignment(assignment_id, 'Exported answer.')

        self.login('teacher_user')
        response = self.client.get(f'/assignment/api/assignments/{assignment_id}/submissions/export')

        self.assertEqual(response.status_code, 200)
        self.assertIn('text/csv', response.content_type)
        self.assertIn('Student User', response.get_data(as_text=True))


if __name__ == '__main__':
    unittest.main()
