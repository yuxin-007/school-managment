import unittest

from sqlalchemy.exc import IntegrityError

from app import create_app
from app.extensions import db
from app.models import OrganizationNode, User, UserOrganization


class TestConfig:
    SECRET_KEY = 'test-secret'
    TESTING = True
    WTF_CSRF_ENABLED = False
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    SQLALCHEMY_TRACK_MODIFICATIONS = False


class OrganizationPermissionTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app(TestConfig)
        self.client = self.app.test_client()
        with self.app.app_context():
            db.drop_all()
            db.create_all()

            self.system = OrganizationNode(name='System', node_type='system', is_active=True)
            self.school = OrganizationNode(name='School', node_type='school', parent=self.system, is_active=True)
            self.college = OrganizationNode(name='Engineering', node_type='college', parent=self.school, is_active=True)
            self.staff_group = OrganizationNode(name='Staff', node_type='staff', parent=self.college, is_active=True)
            db.session.add_all([self.system, self.school, self.college, self.staff_group])
            db.session.flush()

            self.super_admin = User(username='root_user', real_name='Root User', role='super_admin', is_active=True)
            self.super_admin.set_password('secret123')
            self.college_admin = User(username='college_admin', real_name='College Admin', role='college_admin', is_active=True)
            self.college_admin.set_password('secret123')
            self.staff = User(username='staff_user', real_name='Staff User', role='staff', is_active=True)
            self.staff.set_password('secret123')
            self.unassigned_student = User(
                username='unassigned_student',
                real_name='Unassigned Student',
                role='student',
                is_active=True,
            )
            self.unassigned_student.set_password('secret123')
            db.session.add_all([self.super_admin, self.college_admin, self.staff, self.unassigned_student])
            db.session.flush()

            db.session.add(UserOrganization(user_id=self.college_admin.id, node_id=self.college.id, is_primary=True))
            db.session.add(UserOrganization(user_id=self.staff.id, node_id=self.staff_group.id, is_primary=True))
            db.session.commit()

            self.school_id = self.school.id
            self.college_id = self.college.id
            self.staff_group_id = self.staff_group.id
            self.staff_id = self.staff.id

    def login(self, username):
        response = self.client.post('/auth/login', json={'username': username, 'password': 'secret123'})
        self.assertEqual(response.status_code, 200)

    def test_reading_tree_does_not_create_missing_ancestor_memberships(self):
        self.login('college_admin')

        response = self.client.get('/organization/api/tree')

        self.assertEqual(response.status_code, 200)
        with self.app.app_context():
            staff_college_relation = UserOrganization.query.filter_by(
                user_id=self.staff_id,
                node_id=self.college_id,
            ).first()
            self.assertIsNone(staff_college_relation)

    def test_removing_parent_membership_rejects_when_child_membership_exists(self):
        with self.app.app_context():
            db.session.add(UserOrganization(user_id=self.staff_id, node_id=self.college_id, is_primary=False))
            db.session.commit()

        self.login('college_admin')

        response = self.client.delete(f'/organization/api/remove-user/{self.staff_id}?node_id={self.college_id}')

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json()['success'])
        with self.app.app_context():
            self.assertIsNotNone(UserOrganization.query.filter_by(user_id=self.staff_id, node_id=self.college_id).first())
            self.assertIsNotNone(UserOrganization.query.filter_by(user_id=self.staff_id, node_id=self.staff_group_id).first())

    def test_setting_primary_organization_keeps_single_primary_relation(self):
        with self.app.app_context():
            db.session.add(UserOrganization(user_id=self.staff_id, node_id=self.school_id, is_primary=False))
            db.session.commit()

        self.login('root_user')

        response = self.client.post(
            '/organization/api/assign-user',
            json={'user_id': self.staff_id, 'node_id': self.college_id, 'is_primary': True},
        )

        self.assertEqual(response.status_code, 200)
        with self.app.app_context():
            primary_relations = UserOrganization.query.filter_by(user_id=self.staff_id, is_primary=True).all()
            self.assertEqual(len(primary_relations), 1)
            self.assertEqual(primary_relations[0].node_id, self.college_id)

    def test_duplicate_user_node_membership_is_rejected_by_database(self):
        with self.app.app_context():
            db.session.add(UserOrganization(user_id=self.staff_id, node_id=self.staff_group_id, is_primary=False))

            with self.assertRaises(IntegrityError):
                db.session.commit()

    def test_college_admin_overview_does_not_expose_global_unassigned_count(self):
        self.login('college_admin')

        response = self.client.get('/organization/api/overview')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()['data']['summary']['unassigned_users'], 0)


if __name__ == '__main__':
    unittest.main()
