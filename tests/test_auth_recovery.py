import unittest
from unittest.mock import patch

from app import create_app
from app.extensions import db
from app.models import User


class TestConfig:
    SECRET_KEY = 'test-secret'
    TESTING = True
    WTF_CSRF_ENABLED = False
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    MAIL_SUPPRESS_SEND = True


class AuthRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(TestConfig)
        self.client = self.app.test_client()
        with self.app.app_context():
            db.drop_all()
            db.create_all()
            user = User(
                username='recover_user',
                real_name='找回用户',
                role='staff',
                email='recover@example.com',
                phone='13800000000',
                is_active=True,
            )
            user.set_password('old-password')
            db.session.add(user)
            db.session.commit()
            self.user_id = user.id

    def send_code(self, purpose='reset_password', contact_type='email', contact='recover@example.com'):
        response = self.client.post(
            '/auth/recovery/send-code',
            json={'purpose': purpose, 'contact_type': contact_type, 'contact': contact},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload['success'])
        self.assertRegex(payload['data']['debug_code'], r'^\d{6}$')
        return payload['data']['debug_code']

    def test_send_code_rejects_unbound_contact(self):
        response = self.client.post(
            '/auth/recovery/send-code',
            json={'purpose': 'email_login', 'contact_type': 'email', 'contact': 'missing@example.com'},
        )

        self.assertEqual(response.status_code, 404)
        payload = response.get_json()
        self.assertFalse(payload['success'])
        self.assertEqual(payload['message'], '该邮箱下无账号')

    def test_send_email_code_requires_configured_mail_service(self):
        self.app.config['MAIL_SUPPRESS_SEND'] = False

        response = self.client.post(
            '/auth/recovery/send-code',
            json={'purpose': 'email_login', 'contact_type': 'email', 'contact': 'recover@example.com'},
        )

        self.assertEqual(response.status_code, 503)
        payload = response.get_json()
        self.assertFalse(payload['success'])
        self.assertIn('邮箱服务未配置', payload['message'])

    def test_send_email_code_uses_configured_smtp_service(self):
        self.app.config.update(
            MAIL_SUPPRESS_SEND=False,
            MAIL_SERVER='smtp.example.com',
            MAIL_PORT=587,
            MAIL_USE_TLS=True,
            MAIL_USE_SSL=False,
            MAIL_USERNAME='smtp-user',
            MAIL_PASSWORD='smtp-password',
            MAIL_DEFAULT_SENDER='noreply@example.com',
        )

        with patch('smtplib.SMTP') as smtp_cls:
            smtp = smtp_cls.return_value.__enter__.return_value
            response = self.client.post(
                '/auth/recovery/send-code',
                json={'purpose': 'email_login', 'contact_type': 'email', 'contact': 'recover@example.com'},
            )

        self.assertEqual(response.status_code, 200)
        smtp_cls.assert_called_once_with('smtp.example.com', 587, timeout=10)
        smtp.starttls.assert_called_once()
        smtp.login.assert_called_once_with('smtp-user', 'smtp-password')
        smtp.send_message.assert_called_once()
        message = smtp.send_message.call_args.args[0]
        self.assertEqual(message['To'], 'recover@example.com')
        self.assertEqual(message['From'], 'noreply@example.com')
        self.assertIn(response.get_json()['data']['debug_code'], message.get_content())

    def test_reset_password_with_verified_email_code(self):
        code = self.send_code()

        response = self.client.post(
            '/auth/recovery/reset-password',
            json={
                'contact_type': 'email',
                'contact': 'recover@example.com',
                'code': code,
                'new_password': 'new-password',
                'confirm_password': 'new-password',
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()['success'])
        with self.app.app_context():
            user = db.session.get(User, self.user_id)
            self.assertTrue(user.check_password('new-password'))

    def test_email_code_login_logs_user_in(self):
        code = self.send_code(purpose='email_login')

        response = self.client.post(
            '/auth/recovery/login',
            json={'contact_type': 'email', 'contact': 'recover@example.com', 'code': code},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()['success'])
        profile = self.client.get('/user/api/profile')
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.get_json()['data']['username'], 'recover_user')

    def test_phone_code_login_logs_user_in(self):
        code = self.send_code(purpose='phone_login', contact_type='phone', contact='13800000000')

        response = self.client.post(
            '/auth/recovery/login',
            json={'contact_type': 'phone', 'contact': '13800000000', 'code': code},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()['success'])
        profile = self.client.get('/user/api/profile')
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.get_json()['data']['username'], 'recover_user')

    def test_reset_password_rejects_wrong_code(self):
        self.send_code()

        response = self.client.post(
            '/auth/recovery/reset-password',
            json={
                'contact_type': 'email',
                'contact': 'recover@example.com',
                'code': '000000',
                'new_password': 'new-password',
                'confirm_password': 'new-password',
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json()['success'])


if __name__ == '__main__':
    unittest.main()
