"""Organization domain constants and permission helpers."""

from __future__ import annotations


ROLE_SUPER_ADMIN = 'super_admin'
ROLE_COLLEGE_ADMIN = 'college_admin'
ROLE_STAFF = 'staff'
ROLE_STUDENT = 'student'

ROLE_NAMES = {
    ROLE_SUPER_ADMIN: '系统管理员',
    ROLE_COLLEGE_ADMIN: '学院管理员',
    ROLE_STAFF: '教职工',
    ROLE_STUDENT: '学生',
}


NODE_TYPE_SYSTEM = 'system'
NODE_TYPE_SCHOOL = 'school'
NODE_TYPE_COLLEGE = 'college'
NODE_TYPE_DEPARTMENT = 'department'
NODE_TYPE_STAFF = 'staff'
NODE_TYPE_STUDENT = 'student'
NODE_TYPE_CLASS = 'class'
NODE_TYPE_ORG = 'org'

NODE_TYPE_UNDERGRADUATE = 'ug'
NODE_TYPE_POSTGRADUATE = 'pg'
LEGACY_NODE_TYPE_DEPARTMENT = 'dept'

NODE_TYPE_ALIASES = {
    LEGACY_NODE_TYPE_DEPARTMENT: NODE_TYPE_DEPARTMENT,
    NODE_TYPE_UNDERGRADUATE: NODE_TYPE_STUDENT,
    NODE_TYPE_POSTGRADUATE: NODE_TYPE_STUDENT,
}

NODE_TYPE_NAMES = {
    NODE_TYPE_SYSTEM: '系统管理员',
    NODE_TYPE_SCHOOL: '学校',
    NODE_TYPE_COLLEGE: '学院',
    NODE_TYPE_DEPARTMENT: '系/专业',
    NODE_TYPE_STAFF: '教职工',
    NODE_TYPE_STUDENT: '学生',
    NODE_TYPE_CLASS: '班级/项目组',
    NODE_TYPE_ORG: '业务小组',
    NODE_TYPE_UNDERGRADUATE: '学生',
    NODE_TYPE_POSTGRADUATE: '学生',
    LEGACY_NODE_TYPE_DEPARTMENT: '系/专业',
}

NODE_TYPE_LEVELS = {
    NODE_TYPE_SYSTEM: 1,
    NODE_TYPE_SCHOOL: 2,
    NODE_TYPE_COLLEGE: 3,
    NODE_TYPE_DEPARTMENT: 4,
    NODE_TYPE_STAFF: 5,
    NODE_TYPE_STUDENT: 5,
    NODE_TYPE_CLASS: 6,
    NODE_TYPE_ORG: 7,
}

NODE_TYPE_THEME = {
    NODE_TYPE_SYSTEM: {'color': 'red', 'icon': 'safety'},
    NODE_TYPE_SCHOOL: {'color': 'blue', 'icon': 'bank'},
    NODE_TYPE_COLLEGE: {'color': 'purple', 'icon': 'apartment'},
    NODE_TYPE_DEPARTMENT: {'color': 'cyan', 'icon': 'cluster'},
    NODE_TYPE_STAFF: {'color': 'green', 'icon': 'team'},
    NODE_TYPE_STUDENT: {'color': 'gold', 'icon': 'read'},
    NODE_TYPE_CLASS: {'color': 'orange', 'icon': 'group'},
    NODE_TYPE_ORG: {'color': 'default', 'icon': 'folder'},
}

ORGANIZATION_HIERARCHY = [
    NODE_TYPE_SYSTEM,
    NODE_TYPE_SCHOOL,
    NODE_TYPE_COLLEGE,
    NODE_TYPE_STAFF,
    NODE_TYPE_STUDENT,
]


STAFF_ASSIGNABLE_TYPES = [NODE_TYPE_STAFF, NODE_TYPE_CLASS, NODE_TYPE_ORG]
STUDENT_ASSIGNABLE_TYPES = [NODE_TYPE_STUDENT, NODE_TYPE_CLASS, NODE_TYPE_ORG]
COLLEGE_ADMIN_ASSIGNABLE_TYPES = [
    NODE_TYPE_COLLEGE,
    NODE_TYPE_DEPARTMENT,
    NODE_TYPE_STAFF,
    NODE_TYPE_STUDENT,
    NODE_TYPE_CLASS,
    NODE_TYPE_ORG,
]
COLLEGE_ADMIN_CREATABLE_TYPES = [
    NODE_TYPE_DEPARTMENT,
    NODE_TYPE_STAFF,
    NODE_TYPE_STUDENT,
    NODE_TYPE_CLASS,
    NODE_TYPE_ORG,
]

ALLOWED_CHILD_TYPES = {
    NODE_TYPE_SYSTEM: [NODE_TYPE_SCHOOL],
    NODE_TYPE_SCHOOL: [NODE_TYPE_COLLEGE],
    NODE_TYPE_COLLEGE: [
        NODE_TYPE_DEPARTMENT,
        NODE_TYPE_STAFF,
        NODE_TYPE_STUDENT,
        NODE_TYPE_CLASS,
        NODE_TYPE_ORG,
    ],
    NODE_TYPE_DEPARTMENT: [
        NODE_TYPE_STAFF,
        NODE_TYPE_STUDENT,
        NODE_TYPE_CLASS,
        NODE_TYPE_ORG,
    ],
    NODE_TYPE_STAFF: [NODE_TYPE_CLASS, NODE_TYPE_ORG],
    NODE_TYPE_STUDENT: [NODE_TYPE_CLASS, NODE_TYPE_ORG],
    NODE_TYPE_CLASS: [NODE_TYPE_ORG],
    NODE_TYPE_ORG: [NODE_TYPE_ORG],
}


def normalize_node_type(node_type: str | None) -> str | None:
    if not node_type:
        return node_type
    return NODE_TYPE_ALIASES.get(node_type, node_type)


def get_node_type_label(node_type: str | None) -> str:
    normalized = normalize_node_type(node_type)
    return NODE_TYPE_NAMES.get(normalized or '', normalized or '')


def get_node_type_meta(node_type: str | None) -> dict:
    normalized = normalize_node_type(node_type)
    theme = NODE_TYPE_THEME.get(normalized or '', NODE_TYPE_THEME[NODE_TYPE_ORG])
    return {
        'key': normalized,
        'label': get_node_type_label(normalized),
        'level': NODE_TYPE_LEVELS.get(normalized or '', 99),
        'color': theme['color'],
        'icon': theme['icon'],
        'raw_key': node_type,
    }


def get_node_type_catalog() -> list[dict]:
    catalog = []
    for node_type in [
        NODE_TYPE_SYSTEM,
        NODE_TYPE_SCHOOL,
        NODE_TYPE_COLLEGE,
        NODE_TYPE_DEPARTMENT,
        NODE_TYPE_STAFF,
        NODE_TYPE_STUDENT,
        NODE_TYPE_CLASS,
        NODE_TYPE_ORG,
    ]:
        meta = get_node_type_meta(node_type)
        meta['allowed_children'] = ALLOWED_CHILD_TYPES.get(node_type, [])
        catalog.append(meta)
    return catalog


def get_allowed_child_types(parent_node_type: str | None) -> list[str]:
    return ALLOWED_CHILD_TYPES.get(normalize_node_type(parent_node_type), [])


def validate_child_node_type(parent_node_type: str | None, child_node_type: str | None):
    parent_type = normalize_node_type(parent_node_type)
    child_type = normalize_node_type(child_node_type)
    allowed_types = ALLOWED_CHILD_TYPES.get(parent_type, [])

    if child_type not in allowed_types:
        parent_name = get_node_type_label(parent_type)
        child_name = get_node_type_label(child_type)
        allowed_names = [get_node_type_label(item) for item in allowed_types]

        if allowed_names:
            return False, f'{parent_name} 下仅允许创建：{"、".join(allowed_names)}。当前类型“{child_name}”不符合层级规则。'
        return False, f'{parent_name} 下不允许继续创建子节点。'

    return True, None


def can_see_organization(role: str | None) -> bool:
    return role in {ROLE_SUPER_ADMIN, ROLE_COLLEGE_ADMIN}


def get_user_primary_node_type(user) -> str | None:
    if user.role == ROLE_STAFF:
        return NODE_TYPE_STAFF
    if user.role == ROLE_STUDENT:
        return NODE_TYPE_STUDENT
    if user.role == ROLE_COLLEGE_ADMIN:
        return NODE_TYPE_COLLEGE
    return None


def can_assign_to_node_type(user_role: str | None, target_node_type: str | None, assign_target_role=None) -> bool:
    normalized_target = normalize_node_type(target_node_type)

    if user_role == ROLE_SUPER_ADMIN:
        return normalized_target != NODE_TYPE_SYSTEM

    if user_role == ROLE_COLLEGE_ADMIN:
        return normalized_target in COLLEGE_ADMIN_ASSIGNABLE_TYPES

    return False


def can_be_assigned_to_node(user, node_type: str | None) -> bool:
    normalized_target = normalize_node_type(node_type)

    if normalized_target in {NODE_TYPE_SCHOOL, NODE_TYPE_COLLEGE, NODE_TYPE_DEPARTMENT, NODE_TYPE_ORG}:
        return user.role in {ROLE_COLLEGE_ADMIN, ROLE_STAFF, ROLE_STUDENT}

    if user.role == ROLE_STAFF:
        return normalized_target in STAFF_ASSIGNABLE_TYPES

    if user.role == ROLE_STUDENT:
        return normalized_target in STUDENT_ASSIGNABLE_TYPES

    if user.role == ROLE_COLLEGE_ADMIN:
        return normalized_target in {NODE_TYPE_SCHOOL, NODE_TYPE_COLLEGE, NODE_TYPE_DEPARTMENT, NODE_TYPE_ORG}

    return False


def get_all_child_ids(node) -> list[int]:
    child_ids = []
    for child in getattr(node, 'children', []):
        child_ids.append(child.id)
        child_ids.extend(get_all_child_ids(child))
    return child_ids


def get_college_admin_scope(user) -> list[int]:
    if user.role != ROLE_COLLEGE_ADMIN:
        return []

    scope = set()
    for relation in user.user_organizations:
        if normalize_node_type(relation.node.node_type) == NODE_TYPE_COLLEGE:
            scope.add(relation.node.id)
            scope.update(get_all_child_ids(relation.node))
    return sorted(scope)


def is_node_in_scope(node_id: int, scope_ids: list[int]) -> bool:
    return node_id in set(scope_ids)
