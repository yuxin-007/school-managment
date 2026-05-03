import unittest
from unittest.mock import patch
from pathlib import Path

from app import create_app
from app.extensions import db
from app.models import User


class BaseSecurityConfig:
    SECRET_KEY = 'test-secret'
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    ENV = 'testing'


class CsrfEnabledConfig(BaseSecurityConfig):
    WTF_CSRF_ENABLED = True


class ProductionUnsafeConfig(BaseSecurityConfig):
    SECRET_KEY = 'dev-key-change-in-production'
    DATABASE_URL = 'mysql+pymysql://root:password@localhost/school_management'
    SQLALCHEMY_DATABASE_URI = DATABASE_URL
    ENV = 'production'
    TESTING = False
    WTF_CSRF_ENABLED = True


class SecurityBasicsTests(unittest.TestCase):
    def test_create_app_does_not_create_tables_implicitly(self):
        with patch.object(db, 'create_all', side_effect=AssertionError('create_all should be explicit')):
            create_app(BaseSecurityConfig)

    def test_production_requires_safe_secret_and_database_url(self):
        with self.assertRaisesRegex(RuntimeError, 'SECRET_KEY'):
            create_app(ProductionUnsafeConfig)

    def test_json_mutation_requires_csrf_token_when_enabled(self):
        app = create_app(CsrfEnabledConfig)
        client = app.test_client()
        with app.app_context():
            db.drop_all()
            db.create_all()
            user = User(username='csrf_user', real_name='CSRF User', role='staff', is_active=True)
            user.set_password('secret123')
            db.session.add(user)
            db.session.commit()

        without_token = client.post('/auth/login', json={'username': 'csrf_user', 'password': 'secret123'})
        self.assertEqual(without_token.status_code, 400)

        token_response = client.get('/api/csrf-token')
        self.assertEqual(token_response.status_code, 200)
        token_payload = token_response.get_json()
        self.assertTrue(token_payload['success'])
        self.assertTrue(token_payload['data']['csrf_token'])

        with_token = client.post(
            '/auth/login',
            json={'username': 'csrf_user', 'password': 'secret123'},
            headers={'X-CSRFToken': token_payload['data']['csrf_token']},
        )
        self.assertEqual(with_token.status_code, 200)
        self.assertTrue(with_token.get_json()['success'])

    def test_runtime_server_dependency_is_declared(self):
        requirements = Path('requirements.txt').read_text(encoding='utf-8')

        self.assertIn('waitress', requirements.lower())


if __name__ == '__main__':
    unittest.main()
