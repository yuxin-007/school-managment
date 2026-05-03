import unittest

from app import create_app
from app.extensions import db
from app.models import Notification, User


class TestConfig:
    SECRET_KEY = 'test-secret'
    TESTING = True
    WTF_CSRF_ENABLED = False
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    SQLALCHEMY_TRACK_MODIFICATIONS = False


class UserPreferencesTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(TestConfig)
        self.client = self.app.test_client()
        with self.app.app_context():
            db.drop_all()
            db.create_all()
            user = User(username='pref_user', real_name='偏好用户', role='staff', is_active=True)
            user.set_password('secret123')
            db.session.add(user)
            db.session.commit()
            self.user_id = user.id

    def login(self):
        response = self.client.post('/auth/login', json={'username': 'pref_user', 'password': 'secret123'})
        self.assertEqual(response.status_code, 200)

    def test_get_preferences_returns_defaults(self):
        self.login()

        response = self.client.get('/user/api/preferences')
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()

        self.assertTrue(payload['success'])
        self.assertEqual(payload['data']['theme'], 'light')
        self.assertEqual(payload['data']['language'], 'zh-CN')
        self.assertEqual(
            payload['data']['notification_preferences'],
            {
                'leave': True,
                'attendance': True,
                'announcement': True,
                'grade': True,
                'course': True,
                'system': True,
            },
        )

    def test_update_preferences_accepts_auto_theme_and_notification_preferences(self):
        self.login()

        response = self.client.put(
            '/user/api/preferences',
            json={
                'theme': 'auto',
                'language': 'en',
                'notification_preferences': {
                    'leave': False,
                    'announcement': False,
                    'grade': True,
                },
            },
        )
        self.assertEqual(response.status_code, 200)

        payload = self.client.get('/user/api/preferences').get_json()
        self.assertEqual(payload['data']['theme'], 'auto')
        self.assertEqual(payload['data']['language'], 'en')
        self.assertFalse(payload['data']['notification_preferences']['leave'])
        self.assertFalse(payload['data']['notification_preferences']['announcement'])
        self.assertTrue(payload['data']['notification_preferences']['grade'])

    def test_update_preferences_rejects_invalid_values(self):
        self.login()

        response = self.client.put(
            '/user/api/preferences',
            json={
                'theme': 'neon',
                'language': 'fr',
                'notification_preferences': {'leave': 'yes'},
            },
        )
        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertFalse(payload['success'])

    def test_create_notification_respects_user_preferences(self):
        self.login()
        self.client.put(
            '/user/api/preferences',
            json={'notification_preferences': {'leave': False, 'announcement': True}},
        )

        from app.blueprints.notification import create_notification

        with self.app.app_context():
            create_notification(
                user_id=self.user_id,
                title='请假审批结果',
                content='你的请假已通过',
                notification_type='leave_approved',
            )
            create_notification(
                user_id=self.user_id,
                title='公告发布',
                content='有一条新公告',
                notification_type='announcement',
            )

            records = Notification.query.order_by(Notification.id.asc()).all()
            self.assertEqual(len(records), 1)
            self.assertEqual(records[0].notification_type, 'announcement')


if __name__ == '__main__':
    unittest.main()
