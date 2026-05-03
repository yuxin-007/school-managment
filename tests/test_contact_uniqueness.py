import unittest

from app import create_app
from app.extensions import db
from app.models import User


class TestConfig:
    SECRET_KEY = 'test-secret'
    TESTING = True
    WTF_CSRF_ENABLED = False
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    SQLALCHEMY_TRACK_MODIFICATIONS = False


class ContactUniquenessTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(TestConfig)
        self.client = self.app.test_client()
        with self.app.app_context():
            db.drop_all()
            db.create_all()

            admin = User(username='admin_user', real_name='Admin User', role='super_admin', is_active=True)
            admin.set_password('admin-secret')
            first = User(
                username='first_user',
                real_name='First User',
                role='staff',
                email='shared@example.com',
                phone='13800000001',
                is_active=True,
            )
            first.set_password('secret123')
            second = User(
                username='second_user',
                real_name='Second User',
                role='staff',
                email='shared@example.com',
                phone='13800000002',
                is_active=True,
            )
            second.set_password('secret123')
            third = User(
                username='third_user',
                real_name='Third User',
                role='staff',
                email='third@example.com',
                phone='13800000003',
                is_active=True,
            )
            third.set_password('secret123')
            empty_contact = User(
                username='empty_contact_user',
                real_name='Empty Contact User',
                role='staff',
                is_active=True,
            )
            empty_contact.set_password('secret123')
            db.session.add_all([admin, first, second, third, empty_contact])
            db.session.commit()

    def login(self, username='third_user', password='secret123'):
        response = self.client.post('/auth/login', json={'username': username, 'password': password})
        self.assertEqual(response.status_code, 200)

    def test_recovery_rejects_ambiguous_email_binding(self):
        response = self.client.post(
            '/auth/recovery/send-code',
            json={'purpose': 'reset_password', 'contact_type': 'email', 'contact': 'shared@example.com'},
        )

        self.assertEqual(response.status_code, 409)
        payload = response.get_json()
        self.assertFalse(payload['success'])
        self.assertIn('多个账号', payload['message'])

    def test_profile_update_rejects_email_bound_to_another_account(self):
        self.login()

        response = self.client.put('/user/api/profile', json={'email': 'shared@example.com'})

        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertFalse(payload['success'])
        self.assertIn('邮箱', payload['message'])

    def test_admin_create_user_rejects_duplicate_phone(self):
        self.login('admin_user', 'admin-secret')

        response = self.client.post(
            '/user/api/users',
            json={
                'username': 'new_user',
                'password': 'secret123',
                'real_name': 'New User',
                'role': 'staff',
                'phone': '13800000003',
            },
        )

        self.assertEqual(response.status_code, 400)
        payload = response.get_json()
        self.assertFalse(payload['success'])
        self.assertIn('手机号', payload['message'])


    def test_admin_user_search_matches_email_and_phone(self):
        self.login('admin_user', 'admin-secret')

        email_response = self.client.get('/user/api/users/search?email=third@example.com')
        phone_response = self.client.get('/user/api/users/search?phone=13800000003')

        self.assertEqual(email_response.status_code, 200)
        self.assertEqual(phone_response.status_code, 200)
        self.assertEqual([item['username'] for item in email_response.get_json()['data']], ['third_user'])
        self.assertEqual([item['username'] for item in phone_response.get_json()['data']], ['third_user'])

    def test_profile_contact_bind_requires_verified_code(self):
        self.login('empty_contact_user')

        code_response = self.client.post(
            '/user/api/contact-code',
            json={'contact_type': 'email', 'contact': 'bind@example.com'},
        )
        self.assertEqual(code_response.status_code, 200)
        code = code_response.get_json()['data']['debug_code']

        response = self.client.put(
            '/user/api/profile',
            json={'email': 'bind@example.com', 'email_code': code},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()['success'])
        with self.app.app_context():
            user = User.query.filter_by(username='empty_contact_user').first()
            self.assertEqual(user.email, 'bind@example.com')

    def test_profile_contact_rebind_rejects_missing_code(self):
        self.login('third_user')

        response = self.client.put('/user/api/profile', json={'email': 'new-third@example.com'})

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json()['success'])
        with self.app.app_context():
            user = User.query.filter_by(username='third_user').first()
            self.assertEqual(user.email, 'third@example.com')

    def test_profile_contact_rebind_rejects_wrong_code(self):
        self.login('third_user')
        self.client.post(
            '/user/api/contact-code',
            json={'contact_type': 'phone', 'contact': '13800000009'},
        )

        response = self.client.put(
            '/user/api/profile',
            json={'phone': '13800000009', 'phone_code': '000000'},
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json()['success'])
        with self.app.app_context():
            user = User.query.filter_by(username='third_user').first()
            self.assertEqual(user.phone, '13800000003')

    def test_profile_contact_rebind_accepts_verified_code(self):
        self.login('third_user')
        code_response = self.client.post(
            '/user/api/contact-code',
            json={'contact_type': 'phone', 'contact': '13800000009'},
        )
        self.assertEqual(code_response.status_code, 200)
        code = code_response.get_json()['data']['debug_code']

        response = self.client.put(
            '/user/api/profile',
            json={'phone': '13800000009', 'phone_code': code},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()['success'])
        with self.app.app_context():
            user = User.query.filter_by(username='third_user').first()
            self.assertEqual(user.phone, '13800000009')


if __name__ == '__main__':
    unittest.main()
