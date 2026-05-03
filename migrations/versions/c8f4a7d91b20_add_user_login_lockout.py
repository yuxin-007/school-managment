"""add_user_login_lockout

Revision ID: c8f4a7d91b20
Revises: bb68b699eab7
Create Date: 2026-04-21 13:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c8f4a7d91b20'
down_revision = 'bb68b699eab7'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('failed_login_count', sa.Integer(), nullable=True, server_default='0'))
        batch_op.add_column(sa.Column('locked_until', sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column('last_failed_login_at', sa.DateTime(), nullable=True))

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.alter_column('failed_login_count', server_default=None)


def downgrade():
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('last_failed_login_at')
        batch_op.drop_column('locked_until')
        batch_op.drop_column('failed_login_count')
