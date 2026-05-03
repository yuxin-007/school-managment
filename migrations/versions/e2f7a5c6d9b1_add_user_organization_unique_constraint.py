"""add_user_organization_unique_constraint

Revision ID: e2f7a5c6d9b1
Revises: d1a9c3e4f520
Create Date: 2026-04-21 18:50:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'e2f7a5c6d9b1'
down_revision = 'd1a9c3e4f520'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        DELETE FROM user_organizations
        WHERE id IN (
            SELECT id FROM (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY user_id, node_id
                        ORDER BY is_primary DESC, id DESC
                    ) AS rn
                FROM user_organizations
            ) ranked
            WHERE ranked.rn > 1
        )
        """
    )

    with op.batch_alter_table('user_organizations', schema=None) as batch_op:
        batch_op.create_unique_constraint('uq_user_organization_user_node', ['user_id', 'node_id'])


def downgrade():
    with op.batch_alter_table('user_organizations', schema=None) as batch_op:
        batch_op.drop_constraint('uq_user_organization_user_node', type_='unique')
