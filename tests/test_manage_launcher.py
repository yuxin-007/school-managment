import importlib
import unittest


class ManageLauncherTests(unittest.TestCase):
    def test_dev_services_always_include_backend_and_requested_clients(self):
        manage = importlib.import_module('manage')

        self.assertEqual(manage.resolve_dev_services(include_web=True, include_mobile=False), ['backend', 'web'])
        self.assertEqual(manage.resolve_dev_services(include_web=False, include_mobile=True), ['backend', 'mobile'])
        self.assertEqual(manage.resolve_dev_services(include_web=True, include_mobile=True), ['backend', 'web', 'mobile'])

    def test_runtime_state_contains_shared_service_metadata(self):
        manage = importlib.import_module('manage')

        state = manage.build_runtime_state(
            mode='development',
            service_pids={'backend': 1001, 'web': 1002, 'mobile': 1003},
        )

        self.assertEqual(state['mode'], 'development')
        self.assertEqual(state['services']['backend']['status'], 'running')
        self.assertEqual(state['services']['web']['status'], 'running')
        self.assertEqual(state['services']['mobile']['status'], 'running')
        self.assertEqual(state['services']['backend']['pid'], 1001)
        self.assertEqual(state['services']['web']['url'], 'http://localhost:3000')
        self.assertEqual(state['services']['mobile']['url'], 'http://127.0.0.1:3100')


if __name__ == '__main__':
    unittest.main()
