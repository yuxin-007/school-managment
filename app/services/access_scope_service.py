"""Reusable organization-scope helpers for business modules."""

from __future__ import annotations

from sqlalchemy.orm import joinedload

from app.models import Course, User, UserOrganization
from app.utils.org_permissions import (
    ROLE_COLLEGE_ADMIN,
    ROLE_STAFF,
    ROLE_STUDENT,
    ROLE_SUPER_ADMIN,
    get_college_admin_scope,
)


def _collect_descendant_ids(node, bucket: set[int]):
    for child in getattr(node, 'children', []):
        if child.id in bucket:
            continue
        bucket.add(child.id)
        _collect_descendant_ids(child, bucket)


def get_user_related_node_ids(user, include_ancestors=False, include_descendants=False) -> set[int]:
    node_ids: set[int] = set()

    for relation in getattr(user, 'user_organizations', []):
        node = relation.node
        if not node:
            continue

        node_ids.add(node.id)

        if include_descendants:
            _collect_descendant_ids(node, node_ids)

        if include_ancestors:
            parent = node.parent
            while parent:
                node_ids.add(parent.id)
                parent = parent.parent

    return node_ids


def get_scope_user_ids(viewer, roles=None) -> list[int]:
    query = User.query.options(joinedload(User.user_organizations))

    if roles:
        query = query.filter(User.role.in_(roles))

    if viewer.role == ROLE_SUPER_ADMIN:
        return [item.id for item in query.all()]

    if viewer.role == ROLE_COLLEGE_ADMIN:
        scope_ids = get_college_admin_scope(viewer)
        if not scope_ids:
            return []
        records = (
            query.join(UserOrganization)
            .filter(UserOrganization.node_id.in_(scope_ids))
            .distinct()
            .all()
        )
        return [item.id for item in records]

    if roles and viewer.role not in roles:
        return []

    return [viewer.id]


def get_scope_users(viewer, roles=None):
    user_ids = get_scope_user_ids(viewer, roles=roles)
    if not user_ids:
        return []
    return User.query.filter(User.id.in_(user_ids)).order_by(User.real_name.asc()).all()


def can_manage_user_in_scope(viewer, target_user) -> bool:
    if viewer.role == ROLE_SUPER_ADMIN:
        return True
    if viewer.role != ROLE_COLLEGE_ADMIN:
        return viewer.id == target_user.id
    return target_user.id in set(get_scope_user_ids(viewer))


def can_view_course(user, course: Course) -> bool:
    if user.role == ROLE_SUPER_ADMIN:
        return True

    if user.role == ROLE_COLLEGE_ADMIN:
        teacher_ids = set(get_scope_user_ids(user, roles=[ROLE_STAFF, ROLE_COLLEGE_ADMIN]))
        return course.teacher_id in teacher_ids

    if user.role == ROLE_STAFF:
        return course.teacher_id == user.id

    if user.role == ROLE_STUDENT:
        student_scope = get_user_related_node_ids(user, include_ancestors=True)
        if not student_scope or not course.teacher:
            return False
        teacher_scope = get_user_related_node_ids(course.teacher, include_ancestors=True)
        return bool(student_scope & teacher_scope)

    return False


def get_viewable_courses(user, include_inactive=False) -> list[Course]:
    query = Course.query.options(joinedload(Course.teacher), joinedload(Course.course_schedules))
    if not include_inactive:
        query = query.filter(Course.is_active.is_(True))

    courses = query.order_by(Course.created_at.desc()).all()
    return [course for course in courses if can_view_course(user, course)]


def get_manageable_course_ids(user) -> set[int]:
    return {course.id for course in get_viewable_courses(user, include_inactive=True)}


def can_manage_course(user, course) -> bool:
    """Check if a user can manage a course (edit, grade, create assignments, etc.)."""
    if user.role == ROLE_SUPER_ADMIN:
        return True
    if user.role == ROLE_COLLEGE_ADMIN:
        return course.id in get_manageable_course_ids(user)
    return user.role == ROLE_STAFF and course.teacher_id == user.id
