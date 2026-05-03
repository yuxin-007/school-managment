import unittest

from app import create_app
from app.extensions import db


class RuntimeStatusConfig:
    SECRET_KEY = 'test-secret'
    TESTING = True
    WTF_CSRF_ENABLED = False
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    ENV = 'testing'


class RuntimeStatusTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(RuntimeStatusConfig)
        self.client = self.app.test_client()
        with self.app.app_context():
            db.drop_all()
            db.create_all()

    def test_runtime_status_reports_shared_backend_web_and_app_state(self):
        response = self.client.get('/api/runtime/status')

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload['success'])
        data = payload['data']

        self.assertEqual(data['mode'], 'testing')
        self.assertIn(data['frontend_dist'], {'ready', 'missing'})
        self.assertEqual(data['services']['backend']['status'], 'running')
        self.assertEqual(data['services']['database']['status'], 'ok')
        self.assertIn(data['services']['web']['status'], {'running', 'stopped', 'unknown'})
        self.assertIn(data['services']['mobile']['status'], {'running', 'stopped', 'unknown'})
        self.assertEqual(data['services']['backend']['url'], 'http://127.0.0.1:5000')
        self.assertEqual(data['services']['web']['url'], 'http://localhost:3000')
        self.assertEqual(data['services']['mobile']['url'], 'http://127.0.0.1:3100')


if __name__ == '__main__':
    unittest.main()
