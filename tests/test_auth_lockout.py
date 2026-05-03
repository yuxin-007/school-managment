import unittest
from datetime import datetime, timedelta

from app import create_app
from app.extensions import db
from app.models import User


class TestConfig:
    SECRET_KEY = 'test-secret'
    TESTING = True
    WTF_CSRF_ENABLED = False
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    SQLALCHEMY_TRACK_MODIFICATIONS = False


class AuthLockoutTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(TestConfig)
        self.client = self.app.test_client()
        with self.app.app_context():
            db.drop_all()
            db.create_all()
            user = User(
                username='lock_user',
                real_name='Lock User',
                role='staff',
                email='lock@example.com',
                phone='13900000000',
                is_active=True,
            )
            user.set_password('correct-password')
            db.session.add(user)
            db.session.commit()
            self.user_id = user.id

    def post_login(self, password):
        return self.client.post('/auth/login', json={'username': 'lock_user', 'password': password})

    def send_code(self, purpose='reset_password', contact_type='email', contact='lock@example.com'):
        response = self.client.post(
            '/auth/recovery/send-code',
            json={'purpose': purpose, 'contact_type': contact_type, 'contact': contact},
        )
        self.assertEqual(response.status_code, 200)
        return response.get_json()['data']['debug_code']

    def test_locks_account_after_five_failed_password_attempts(self):
        for attempt in range(4):
            response = self.post_login('bad-password')
            self.assertEqual(response.status_code, 401)
            self.assertIn(f'还可尝试 {4 - attempt} 次', response.get_json()['message'])

        response = self.post_login('bad-password')

        self.assertEqual(response.status_code, 423)
        self.assertIn('账号已锁定', response.get_json()['message'])
        with self.app.app_context():
            user = db.session.get(User, self.user_id)
            self.assertEqual(user.failed_login_count, 5)
            self.assertIsNotNone(user.locked_until)

    def test_locked_account_rejects_correct_password_until_lock_expires(self):
        for _ in range(5):
            self.post_login('bad-password')

        locked_response = self.post_login('correct-password')
        self.assertEqual(locked_response.status_code, 423)
        self.assertIn('账号已锁定', locked_response.get_json()['message'])

        with self.app.app_context():
            user = db.session.get(User, self.user_id)
            user.locked_until = datetime.utcnow() - timedelta(seconds=1)
            db.session.commit()

        response = self.post_login('correct-password')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()['success'])
        with self.app.app_context():
            user = db.session.get(User, self.user_id)
            self.assertEqual(user.failed_login_count, 0)
            self.assertIsNone(user.locked_until)

    def test_reset_password_success_clears_login_lockout(self):
        for _ in range(5):
            self.post_login('bad-password')

        code = self.send_code()
        response = self.client.post(
            '/auth/recovery/reset-password',
            json={
                'contact_type': 'email',
                'contact': 'lock@example.com',
                'code': code,
                'new_password': 'new-password',
                'confirm_password': 'new-password',
            },
        )

        self.assertEqual(response.status_code, 200)
        with self.app.app_context():
            user = db.session.get(User, self.user_id)
            self.assertEqual(user.failed_login_count, 0)
            self.assertIsNone(user.locked_until)
            self.assertTrue(user.check_password('new-password'))

    def test_code_login_success_clears_login_lockout(self):
        for _ in range(5):
            self.post_login('bad-password')

        code = self.send_code(purpose='email_login')
        response = self.client.post(
            '/auth/recovery/login',
            json={'contact_type': 'email', 'contact': 'lock@example.com', 'code': code},
        )

        self.assertEqual(response.status_code, 200)
        with self.app.app_context():
            user = db.session.get(User, self.user_id)
            self.assertEqual(user.failed_login_count, 0)
            self.assertIsNone(user.locked_until)


if __name__ == '__main__':
    unittest.main()
