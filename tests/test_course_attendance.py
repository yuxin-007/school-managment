import unittest
from datetime import datetime, timedelta, time

from app import create_app
from app.extensions import db
from app.models import (
    Course,
    CourseAttendanceActivity,
    CourseAttendanceRecord,
    CourseSchedule,
    CourseSelection,
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


class CourseAttendanceTests(unittest.TestCase):
    def setUp(self):
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
                code='SE301',
                teacher_id=teacher.id,
                max_students=20,
                current_students=1,
                semester='2026 Spring',
                is_active=True,
                location='Room 301',
            )
            db.session.add(course)
            db.session.flush()
            db.session.add_all([
                CourseSchedule(
                    course_id=course.id,
                    day_of_week=1,
                    start_time=time(9, 0),
                    end_time=time(10, 0),
                ),
                CourseSelection(student_id=student.id, course_id=course.id, status='selected'),
            ])
            db.session.commit()

            self.course_id = course.id
            self.teacher_id = teacher.id
            self.student_id = student.id
            self.outsider_id = outsider.id

    def login(self, username):
        response = self.client.post('/auth/login', json={'username': username, 'password': 'secret123'})
        self.assertEqual(response.status_code, 200)

    def logout(self):
        self.client.post('/auth/logout')

    def create_activity(self):
        self.login('teacher_user')
        now = datetime.now()
        response = self.client.post(
            f'/course/api/courses/{self.course_id}/attendance-activities',
            json={
                'title': 'Week 8 Attendance',
                'start_time': (now - timedelta(minutes=5)).strftime('%Y-%m-%d %H:%M:%S'),
                'end_time': (now + timedelta(minutes=30)).strftime('%Y-%m-%d %H:%M:%S'),
                'location_name': 'Room 301',
                'latitude': 31.2304,
                'longitude': 121.4737,
                'radius_meters': 200,
                'allow_late': True,
            },
        )
        self.assertEqual(response.status_code, 200)
        activity_id = response.get_json()['data']['id']
        self.logout()
        return activity_id

    def create_future_activity(self):
        self.login('teacher_user')
        now = datetime.now()
        response = self.client.post(
            f'/course/api/courses/{self.course_id}/attendance-activities',
            json={
                'title': 'Future Attendance',
                'start_time': (now + timedelta(hours=1)).strftime('%Y-%m-%d %H:%M:%S'),
                'end_time': (now + timedelta(hours=2)).strftime('%Y-%m-%d %H:%M:%S'),
                'location_name': 'Room 301',
                'latitude': 31.2304,
                'longitude': 121.4737,
                'radius_meters': 200,
                'allow_late': True,
            },
        )
        self.assertEqual(response.status_code, 200)
        activity_id = response.get_json()['data']['id']
        self.logout()
        return activity_id

    def create_ended_activity(self):
        self.login('teacher_user')
        now = datetime.now()
        response = self.client.post(
            f'/course/api/courses/{self.course_id}/attendance-activities',
            json={
                'title': 'Ended Attendance',
                'start_time': (now - timedelta(hours=2)).strftime('%Y-%m-%d %H:%M:%S'),
                'end_time': (now - timedelta(hours=1)).strftime('%Y-%m-%d %H:%M:%S'),
                'location_name': 'Room 301',
                'latitude': 31.2304,
                'longitude': 121.4737,
                'radius_meters': 200,
                'allow_late': True,
            },
        )
        self.assertEqual(response.status_code, 200)
        activity_id = response.get_json()['data']['id']
        self.logout()
        return activity_id

    def test_teacher_creates_activity_and_sees_absent_selected_students(self):
        activity_id = self.create_activity()
        self.login('teacher_user')

        response = self.client.get(f'/course/api/attendance-activities/{activity_id}/records')

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload['data']['stats']['total'], 1)
        self.assertEqual(payload['data']['stats']['absent'], 1)
        self.assertEqual(payload['data']['stats']['present'], 0)
        self.assertEqual(payload['data']['records'][0]['student_id'], self.student_id)
        self.assertEqual(payload['data']['records'][0]['status'], 'absent')

    def test_student_activity_list_only_shows_open_teacher_started_activity(self):
        open_activity_id = self.create_activity()
        self.create_future_activity()
        self.create_ended_activity()
        self.login('student_user')

        response = self.client.get(f'/course/api/courses/{self.course_id}/attendance-activities')

        self.assertEqual(response.status_code, 200)
        activity_ids = [item['id'] for item in response.get_json()['data']]
        self.assertEqual(activity_ids, [open_activity_id])

    def test_selected_student_can_sign_in_with_location(self):
        activity_id = self.create_activity()
        self.login('student_user')

        response = self.client.post(
            f'/course/api/attendance-activities/{activity_id}/sign-in',
            json={
                'latitude': 31.2304,
                'longitude': 121.4737,
                'accuracy': 15,
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload['data']['status'], 'present')
        self.assertTrue(payload['data']['within_range'])

        with self.app.app_context():
            records = CourseAttendanceRecord.query.filter_by(activity_id=activity_id, student_id=self.student_id).all()
            self.assertEqual(len(records), 1)
            self.assertEqual(records[0].status, 'present')

    def test_unselected_student_cannot_sign_in(self):
        activity_id = self.create_activity()
        self.login('outsider_user')

        response = self.client.post(
            f'/course/api/attendance-activities/{activity_id}/sign-in',
            json={'latitude': 31.2304, 'longitude': 121.4737},
        )

        self.assertEqual(response.status_code, 403)

    def test_out_of_range_sign_in_is_recorded_for_teacher_review(self):
        activity_id = self.create_activity()
        self.login('student_user')

        response = self.client.post(
            f'/course/api/attendance-activities/{activity_id}/sign-in',
            json={
                'latitude': 32.0603,
                'longitude': 118.7969,
                'accuracy': 30,
                'remark': '定位偏移，请老师审核',
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.get_json()['data']['status'], 'location_abnormal')

        self.logout()
        self.login('teacher_user')
        records_response = self.client.get(f'/course/api/attendance-activities/{activity_id}/records')
        payload = records_response.get_json()
        self.assertEqual(payload['data']['stats']['location_abnormal'], 1)
        self.assertEqual(payload['data']['records'][0]['status'], 'location_abnormal')

    def test_student_cannot_sign_in_after_activity_end_time(self):
        activity_id = self.create_ended_activity()
        self.login('student_user')

        response = self.client.post(
            f'/course/api/attendance-activities/{activity_id}/sign-in',
            json={'latitude': 31.2304, 'longitude': 121.4737},
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json()['success'])
        with self.app.app_context():
            record = CourseAttendanceRecord.query.filter_by(activity_id=activity_id, student_id=self.student_id).first()
            self.assertIsNone(record)

    def test_teacher_can_close_activity_and_prevent_student_sign_in(self):
        activity_id = self.create_activity()
        self.login('teacher_user')

        close_response = self.client.post(f'/course/api/attendance-activities/{activity_id}/close')

        self.assertEqual(close_response.status_code, 200)
        self.assertEqual(close_response.get_json()['data']['status'], 'closed')

        self.logout()
        self.login('student_user')
        list_response = self.client.get(f'/course/api/courses/{self.course_id}/attendance-activities')
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.get_json()['data'], [])

        sign_response = self.client.post(
            f'/course/api/attendance-activities/{activity_id}/sign-in',
            json={'latitude': 31.2304, 'longitude': 121.4737},
        )
        self.assertEqual(sign_response.status_code, 400)
        self.assertFalse(sign_response.get_json()['success'])

    def test_teacher_can_mark_absent_student_as_leave(self):
        activity_id = self.create_activity()
        self.login('teacher_user')

        response = self.client.put(
            f'/course/api/attendance-activities/{activity_id}/records/{self.student_id}',
            json={'status': 'leave', 'remark': 'Approved course leave'},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload['data']['status'], 'leave')
        self.assertEqual(payload['data']['remark'], 'Approved course leave')

        records_response = self.client.get(f'/course/api/attendance-activities/{activity_id}/records')
        stats = records_response.get_json()['data']['stats']
        self.assertEqual(stats['leave'], 1)
        self.assertEqual(stats['absent'], 0)

    def test_teacher_can_approve_location_abnormal_record(self):
        activity_id = self.create_activity()
        self.login('student_user')
        self.client.post(
            f'/course/api/attendance-activities/{activity_id}/sign-in',
            json={'latitude': 32.0603, 'longitude': 118.7969, 'remark': 'Location drift'},
        )
        self.logout()
        self.login('teacher_user')

        response = self.client.put(
            f'/course/api/attendance-activities/{activity_id}/records/{self.student_id}',
            json={'status': 'present', 'remark': 'Verified in classroom'},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload['data']['status'], 'present')
        self.assertEqual(payload['data']['reviewed_by'], self.teacher_id)

    def test_teacher_cannot_mark_unselected_student_attendance(self):
        activity_id = self.create_activity()
        self.login('teacher_user')

        response = self.client.put(
            f'/course/api/attendance-activities/{activity_id}/records/{self.outsider_id}',
            json={'status': 'manual', 'remark': 'Wrong student'},
        )

        self.assertEqual(response.status_code, 400)

    def test_teacher_exports_attendance_records_as_csv(self):
        activity_id = self.create_activity()
        self.login('teacher_user')
        self.client.put(
            f'/course/api/attendance-activities/{activity_id}/records/{self.student_id}',
            json={'status': 'leave', 'remark': 'Approved course leave'},
        )

        response = self.client.get(f'/course/api/attendance-activities/{activity_id}/records/export')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, 'text/csv')
        csv_text = response.get_data(as_text=True)
        self.assertIn('student_no,student_name,major,phone,email,status,sign_time,distance_meters,remark', csv_text)
        self.assertIn('S2026001,Student User,Software Engineering,13800000000,student@example.com,请假,,', csv_text)


if __name__ == '__main__':
    unittest.main()
