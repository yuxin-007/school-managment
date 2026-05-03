"""add_course_attendance_unique_constraints

Revision ID: d1a9c3e4f520
Revises: c8f4a7d91b20
Create Date: 2026-04-21 14:30:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'd1a9c3e4f520'
down_revision = 'c8f4a7d91b20'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        DELETE FROM attendances
        WHERE id IN (
            SELECT id FROM (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY user_id, attendance_date
                        ORDER BY updated_at DESC, created_at DESC, id DESC
                    ) AS rn
                FROM attendances
            ) ranked
            WHERE ranked.rn > 1
        )
        """
    )
    op.execute(
        """
        DELETE FROM course_selections
        WHERE id IN (
            SELECT id FROM (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY student_id, course_id
                        ORDER BY
                            CASE WHEN status = 'selected' THEN 0 ELSE 1 END,
                            id DESC
                    ) AS rn
                FROM course_selections
            ) ranked
            WHERE ranked.rn > 1
        )
        """
    )
    op.execute(
        """
        UPDATE courses
        SET current_students = (
            SELECT COUNT(*)
            FROM course_selections
            WHERE course_selections.course_id = courses.id
              AND course_selections.status = 'selected'
        )
        """
    )

    with op.batch_alter_table('attendances', schema=None) as batch_op:
        batch_op.create_unique_constraint('uq_attendance_user_date', ['user_id', 'attendance_date'])

    with op.batch_alter_table('course_selections', schema=None) as batch_op:
        batch_op.create_unique_constraint('uq_course_selection_student_course', ['student_id', 'course_id'])


def downgrade():
    with op.batch_alter_table('course_selections', schema=None) as batch_op:
        batch_op.drop_constraint('uq_course_selection_student_course', type_='unique')

    with op.batch_alter_table('attendances', schema=None) as batch_op:
        batch_op.drop_constraint('uq_attendance_user_date', type_='unique')
