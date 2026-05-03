from flask import Blueprint, current_app, jsonify, request, send_file, session
from flask_login import login_required, current_user
from app.models import db, OrganizationNode, User, UserOrganization
from app.services.email_delivery import EmailDeliveryError, send_verification_email
from app.services.contact_identity import normalize_contact, validate_contact_available
from app.services.user_preferences import apply_user_preferences, serialize_user_preferences
from app.utils.permissions import super_admin_required
from app.utils.response import paginated_response
import pandas as pd
import io
import csv
from datetime import datetime, timedelta
import secrets
import xlsxwriter
from sqlalchemy import or_
from app.services.organization_service import ensure_user_chain_memberships
from app.utils.org_permissions import (
    NODE_TYPE_COLLEGE,
    NODE_TYPE_DEPARTMENT,
    NODE_TYPE_SCHOOL,
    can_be_assigned_to_node,
    get_node_type_label,
    normalize_node_type,
)

bp = Blueprint('user', __name__, url_prefix='/user')
CONTACT_CODE_EXPIRES_MINUTES = 10
CONTACT_CODE_STORE = {}


def contact_code_session_key(contact_type):
    return f'contact_binding_token_{contact_type}'


def contact_code_debug_payload(code):
    data = {'expires_in': CONTACT_CODE_EXPIRES_MINUTES * 60}
    debug_enabled = current_app.config.get(
        'AUTH_CODE_DEBUG',
        current_app.config.get('TESTING') or current_app.config.get('ENV') != 'production',
    )
    if debug_enabled:
        data['debug_code'] = code
    return data


def store_contact_code(contact_type, contact):
    token = secrets.token_urlsafe(24)
    code = f'{secrets.randbelow(1000000):06d}'
    CONTACT_CODE_STORE[token] = {
        'user_id': current_user.id,
        'contact_type': contact_type,
        'contact': normalize_contact(contact),
        'code': code,
        'expires_at': datetime.utcnow() + timedelta(minutes=CONTACT_CODE_EXPIRES_MINUTES),
    }
    session[contact_code_session_key(contact_type)] = token
    return code


def discard_contact_code(contact_type):
    token = session.get(contact_code_session_key(contact_type))
    CONTACT_CODE_STORE.pop(token, None)
    session.pop(contact_code_session_key(contact_type), None)


def verify_contact_code(contact_type, contact, code):
    token = session.get(contact_code_session_key(contact_type))
    record = CONTACT_CODE_STORE.get(token)
    if not record:
        return False, '请先获取验证码。'

    if datetime.utcnow() > record['expires_at']:
        CONTACT_CODE_STORE.pop(token, None)
        session.pop(contact_code_session_key(contact_type), None)
        return False, '验证码已过期，请重新获取。'

    if (
        record['user_id'] != current_user.id
        or record['contact_type'] != contact_type
        or record['contact'] != normalize_contact(contact)
        or record['code'] != (code or '').strip()
    ):
        return False, '验证码错误。'

    CONTACT_CODE_STORE.pop(token, None)
    session.pop(contact_code_session_key(contact_type), None)
    return True, None


def contact_changed(contact_type, next_value):
    return normalize_contact(getattr(current_user, contact_type)) != normalize_contact(next_value)


def ensure_contact_code_verified(data, contact_type):
    if contact_type not in data or not contact_changed(contact_type, data.get(contact_type)):
        return True, None

    next_contact = normalize_contact(data.get(contact_type))
    if not next_contact:
        return False, '暂不支持在个人设置中解绑邮箱或手机号，请联系管理员处理。'

    return verify_contact_code(contact_type, next_contact, data.get(f'{contact_type}_code'))

def get_primary_user_relation(user):
    return next((relation for relation in user.user_organizations if relation.is_primary), None)


def serialize_user_payload(user):
    primary_relation = get_primary_user_relation(user)
    primary_node = primary_relation.node if primary_relation and primary_relation.node else None

    payload = user.to_dict()
    payload['primary_node_id'] = primary_node.id if primary_node else None
    payload['primary_node_name'] = primary_node.name if primary_node else ''
    payload['primary_node_type'] = normalize_node_type(primary_node.node_type) if primary_node else None
    payload['primary_node_type_label'] = get_node_type_label(primary_node.node_type) if primary_node else ''
    payload['organization_count'] = len(user.user_organizations)
    return payload


def serialize_user_organization_relations(user):
    relations = []
    ordered_relations = sorted(
        user.user_organizations,
        key=lambda relation: (
            0 if relation.is_primary else 1,
            build_node_path(relation.node) if relation.node else '',
            relation.id,
        ),
    )

    for relation in ordered_relations:
        node = relation.node
        if not node:
            continue

        relations.append({
            'id': relation.id,
            'node_id': node.id,
            'node_name': node.name,
            'node_type': normalize_node_type(node.node_type),
            'node_type_label': get_node_type_label(node.node_type),
            'path_label': build_node_path(node),
            'is_primary': relation.is_primary,
            'role_in_node': relation.role_in_node or '',
            'created_at': relation.created_at.strftime('%Y-%m-%d %H:%M:%S') if relation.created_at else '',
        })

    return relations


def apply_primary_organization(user, primary_node_id):
    if primary_node_id in (None, '', 0, '0'):
        for relation in user.user_organizations:
            relation.is_primary = False
        return

    node = db.session.get(OrganizationNode, primary_node_id)
    if not node:
        raise ValueError('目标主组织不存在。')

    if not can_be_assigned_to_node(user, node.node_type):
        raise ValueError('当前用户角色与目标主组织类型不匹配。')

    created = ensure_user_chain_memberships(user, node)

    relation = next((item for item in user.user_organizations if item.node_id == node.id), None)
    if relation is None and not created:
        raise ValueError('主组织关系创建失败，请稍后重试。')

    for item in user.user_organizations:
        item.is_primary = False
    relation.is_primary = True


def build_node_path(node):
    path = []
    current = node
    while current:
        path.append(current.name)
        current = current.parent
    path.reverse()
    return ' / '.join(path)


def apply_user_keyword_filter(query, keyword):
    keyword = (keyword or '').strip()
    if not keyword:
        return query

    pattern = f'%{keyword}%'
    return query.filter(
        or_(
            User.username.like(pattern),
            User.real_name.like(pattern),
            User.employee_id.like(pattern),
            User.student_id.like(pattern),
            User.email.like(pattern),
            User.phone.like(pattern),
        )
    )


def apply_user_contact_filters(query, email='', phone=''):
    email = (email or '').strip()
    phone = (phone or '').strip()

    if email:
        query = query.filter(User.email.like(f'%{email}%'))
    if phone:
        query = query.filter(User.phone.like(f'%{phone}%'))
    return query


def apply_primary_filter(query, has_primary):
    if has_primary == 'true':
        return query.filter(User.user_organizations.any(UserOrganization.is_primary == True))
    if has_primary == 'false':
        return query.filter(~User.user_organizations.any(UserOrganization.is_primary == True))
    return query


@bp.route('/api/profile', methods=['GET'])
@login_required
def get_profile():
    """获取当前登录用户的信息（供 React 前端使用）"""
    return jsonify({
        'success': True,
        'data': current_user.to_dict()
    })


@bp.route('/api/contact-code', methods=['POST'])
@login_required
def send_contact_code():
    data = request.get_json() or {}
    contact_type = (data.get('contact_type') or '').strip()
    contact = normalize_contact(data.get('contact'))

    if contact_type not in {'email', 'phone'}:
        return jsonify({'success': False, 'message': '请选择邮箱或手机号。'}), 400
    if not contact:
        return jsonify({'success': False, 'message': '请填写需要绑定的邮箱或手机号。'}), 400

    try:
        validate_contact_available(
            email=contact if contact_type == 'email' else None,
            phone=contact if contact_type == 'phone' else None,
            exclude_user_id=current_user.id,
        )
    except ValueError as error:
        return jsonify({'success': False, 'message': str(error)}), 400

    code = store_contact_code(contact_type, contact)
    if contact_type == 'email':
        try:
            send_verification_email(contact, code, 'bind_email')
        except EmailDeliveryError as error:
            discard_contact_code(contact_type)
            return jsonify({'success': False, 'message': str(error)}), 503
    return jsonify({
        'success': True,
        'message': '验证码已发送，请完成验证后保存。',
        'data': contact_code_debug_payload(code),
    })


@bp.route('/api/profile', methods=['PUT'])
@login_required
def update_profile():
    """更新当前用户信息"""
    data = request.get_json() or {}
    try:
        validate_contact_available(
            email=data.get('email') if 'email' in data else None,
            phone=data.get('phone') if 'phone' in data else None,
            exclude_user_id=current_user.id,
        )
    except ValueError as error:
        return jsonify({'success': False, 'message': str(error)}), 400

    for contact_type in ('email', 'phone'):
        verified, error_message = ensure_contact_code_verified(data, contact_type)
        if not verified:
            return jsonify({'success': False, 'message': error_message}), 400

    if 'real_name' in data:
        current_user.real_name = data['real_name']
    if 'email' in data:
        current_user.email = normalize_contact(data['email'])
    if 'phone' in data:
        current_user.phone = normalize_contact(data['phone'])
    db.session.commit()
    return jsonify({'success': True, 'data': current_user.to_dict()})


@bp.route('/api/change_password', methods=['POST'])
@login_required
def change_password():
    """修改当前用户密码"""
    data = request.get_json()
    current_password = data.get('current_password', '')
    new_password = data.get('new_password', '')
    confirm_password = data.get('confirm_password', '')
    
    if not current_user.check_password(current_password):
        return jsonify({'success': False, 'message': '当前密码错误'}), 400
    if len(new_password) < 6:
        return jsonify({'success': False, 'message': '新密码长度不能少于6位'}), 400
    if new_password != confirm_password:
        return jsonify({'success': False, 'message': '两次输入的密码不一致'}), 400
    
    current_user.set_password(new_password)
    db.session.commit()
    return jsonify({'success': True, 'message': '密码修改成功'})


@bp.route('/api/preferences', methods=['GET'])
@login_required
def get_preferences():
    """获取用户偏好设置"""
    return jsonify({'success': True, 'data': serialize_user_preferences(current_user)})


@bp.route('/api/preferences', methods=['PUT'])
@login_required
def update_preferences():
    """更新用户偏好设置"""
    data = request.get_json() or {}
    try:
        updated_preferences = apply_user_preferences(current_user, data)
    except ValueError as error:
        return jsonify({'success': False, 'message': str(error)}), 400
    db.session.commit()
    return jsonify({'success': True, 'message': '偏好设置已更新', 'data': updated_preferences})


@bp.route('/api/users', methods=['GET'])
@login_required
@super_admin_required
def get_users():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    has_primary = request.args.get('has_primary', '').strip().lower()
    per_page = min(per_page, 200)  # 最大200条/页
    # 排除系统管理员
    query = User.query.filter(User.role != 'super_admin')
    query = apply_primary_filter(query, has_primary)
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    return paginated_response(pagination, serialize_user_payload)


@bp.route('/api/users', methods=['POST'])
@login_required
@super_admin_required
def add_user():
    data = request.get_json() or {}
    required = ['username', 'password', 'real_name', 'role']
    for field in required:
        if not data.get(field):
            return jsonify({'success': False, 'message': f'{field}不能为空'})
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'success': False, 'message': '用户名已存在'})
    # 禁止创建系统管理员
    if data['role'] == 'super_admin':
        return jsonify({'success': False, 'message': '系统管理员由系统创建，此处不可添加'})
    try:
        validate_contact_available(email=data.get('email'), phone=data.get('phone'))
    except ValueError as error:
        return jsonify({'success': False, 'message': str(error)}), 400
    user = User(
        username=data['username'],
        real_name=data['real_name'],
        email=normalize_contact(data.get('email')),
        phone=normalize_contact(data.get('phone')),
        role=data['role'],
        position=data.get('position'),
        employee_id=data.get('employee_id'),
        student_id=data.get('student_id'),
        grade=data.get('grade'),
        major=data.get('major'),
        is_active=data.get('is_active', True),
    )
    user.set_password(data['password'])
    db.session.add(user)
    db.session.flush()

    try:
        if 'primary_node_id' in data:
            apply_primary_organization(user, data.get('primary_node_id'))
    except ValueError as error:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(error)}), 400

    db.session.commit()
    return jsonify({'success': True, 'data': serialize_user_payload(user)})


@bp.route('/api/users/<int:user_id>', methods=['GET'])
@login_required
@super_admin_required
def get_user(user_id):
    """获取单个用户详情"""
    user = db.get_or_404(User, user_id)
    payload = serialize_user_payload(user)
    payload['organization_relations'] = serialize_user_organization_relations(user)
    return jsonify({
        'success': True,
        'data': payload
    })


@bp.route('/api/users/<int:user_id>', methods=['PUT'])
@login_required
@super_admin_required
def update_user(user_id):
    user = db.get_or_404(User, user_id)
    # 禁止修改系统管理员
    if user.role == 'super_admin':
        return jsonify({'success': False, 'message': '系统管理员不可修改'})
    data = request.get_json() or {}
    try:
        validate_contact_available(
            email=data.get('email') if 'email' in data else None,
            phone=data.get('phone') if 'phone' in data else None,
            exclude_user_id=user.id,
        )
    except ValueError as error:
        return jsonify({'success': False, 'message': str(error)}), 400
    if 'real_name' in data:
        user.real_name = data['real_name']
    if 'email' in data:
        user.email = normalize_contact(data['email'])
    if 'phone' in data:
        user.phone = normalize_contact(data['phone'])
    if 'role' in data:
        # 禁止修改为系统管理员
        if data['role'] == 'super_admin':
            return jsonify({'success': False, 'message': '不可设置为系统管理员角色'})
        user.role = data['role']
    if 'position' in data:
        user.position = data['position']
    if 'employee_id' in data:
        user.employee_id = data['employee_id']
    if 'student_id' in data:
        user.student_id = data['student_id']
    if 'grade' in data:
        user.grade = data['grade']
    if 'major' in data:
        user.major = data['major']
    if 'is_active' in data:
        user.is_active = data['is_active']

    try:
        if 'primary_node_id' in data:
            apply_primary_organization(user, data.get('primary_node_id'))
    except ValueError as error:
        db.session.rollback()
        return jsonify({'success': False, 'message': str(error)}), 400

    db.session.commit()
    return jsonify({'success': True, 'data': serialize_user_payload(user)})


@bp.route('/api/users/<int:user_id>', methods=['DELETE'])
@login_required
@super_admin_required
def delete_user(user_id):
    if user_id == current_user.id:
        return jsonify({'success': False, 'message': '不能删除自己'})
    user = db.get_or_404(User, user_id)
    # 禁止删除系统管理员
    if user.role == 'super_admin':
        return jsonify({'success': False, 'message': '系统管理员不可删除'})
    db.session.delete(user)
    db.session.commit()
    return jsonify({'success': True, 'message': '删除成功'})


@bp.route('/api/users/search', methods=['GET'])
@login_required
@super_admin_required
def search_users():
    keyword = request.args.get('keyword', '').strip()
    email = request.args.get('email', '').strip()
    phone = request.args.get('phone', '').strip()
    role = request.args.get('role', '').strip()
    has_primary = request.args.get('has_primary', '').strip().lower()
    query = User.query.filter(User.role != 'super_admin')
    query = apply_user_keyword_filter(query, keyword)
    query = apply_user_contact_filters(query, email=email, phone=phone)
    if role:
        query = query.filter_by(role=role)
    query = apply_primary_filter(query, has_primary)
    users = query.all()
    return jsonify({'success': True, 'data': [serialize_user_payload(u) for u in users]})


@bp.route('/api/statistics/users', methods=['GET'])
@login_required
@super_admin_required
def get_user_statistics():
    # 排除系统管理员的统计
    base_query = User.query.filter(User.role != 'super_admin')
    total = base_query.count()
    role_stats = {
        'college_admin': base_query.filter_by(role='college_admin').count(),
        'staff': base_query.filter_by(role='staff').count(),
        'student': base_query.filter_by(role='student').count()
    }
    status_stats = {
        'active': base_query.filter_by(is_active=True).count(),
        'inactive': base_query.filter_by(is_active=False).count()
    }
    thirty_days_ago = datetime.now() - timedelta(days=30)
    recent_users = base_query.filter(User.created_at >= thirty_days_ago).count()
    users_without_primary = base_query.filter(~User.user_organizations.any(UserOrganization.is_primary == True)).count()
    return jsonify({
        'success': True,
        'data': {
            'total_users': total,
            'role_distribution': role_stats,
            'status_distribution': status_stats,
            'recent_users': recent_users,
            'users_without_primary': users_without_primary
        }
    })


@bp.route('/api/users/organization-options', methods=['GET'])
@login_required
@super_admin_required
def get_user_organization_options():
    role = request.args.get('role', '').strip()
    nodes = (
        OrganizationNode.query.filter_by(is_active=True)
        .order_by(OrganizationNode.order_index.asc(), OrganizationNode.id.asc())
        .all()
    )

    results = []
    for node in nodes:
        normalized_type = normalize_node_type(node.node_type)
        if normalized_type == 'system':
            continue

        if role:
            mock_user = type('MockUser', (), {'role': role})()
            if not can_be_assigned_to_node(mock_user, node.node_type):
                continue

        results.append({
            'id': node.id,
            'name': node.name,
            'node_type': normalized_type,
            'node_type_label': get_node_type_label(node.node_type),
            'path_label': build_node_path(node),
        })

    return jsonify({'success': True, 'data': results})


@bp.route('/api/users/batch-primary-organization', methods=['POST'])
@login_required
@super_admin_required
def batch_update_primary_organization():
    data = request.get_json() or {}
    user_ids = data.get('user_ids') or []
    primary_node_id = data.get('primary_node_id')

    if not user_ids or not isinstance(user_ids, list):
        return jsonify({'success': False, 'message': '请至少选择一个用户。'}), 400

    users = User.query.filter(User.id.in_(user_ids), User.role != 'super_admin').all()
    if len(users) != len(set(user_ids)):
        return jsonify({'success': False, 'message': '部分用户不存在或不可操作。'}), 400

    role_set = {user.role for user in users}
    if len(role_set) > 1:
        return jsonify({'success': False, 'message': '批量配置主组织时，请选择同一角色的用户。'}), 400

    if primary_node_id in (None, '', 0, '0'):
        for user in users:
            apply_primary_organization(user, None)
        db.session.commit()
        return jsonify({
            'success': True,
            'message': f'已清除 {len(users)} 个用户的主组织归属。',
            'data': {'updated_count': len(users)},
        })

    node = db.session.get(OrganizationNode, primary_node_id)
    if not node:
        return jsonify({'success': False, 'message': '目标主组织不存在。'}), 400

    invalid_users = [user.real_name for user in users if not can_be_assigned_to_node(user, node.node_type)]
    if invalid_users:
        return jsonify({
            'success': False,
            'message': f'以下用户与目标组织类型不匹配：{", ".join(invalid_users)}',
        }), 400

    for user in users:
        apply_primary_organization(user, primary_node_id)

    db.session.commit()
    return jsonify({
        'success': True,
        'message': f'已为 {len(users)} 个用户配置主组织。',
        'data': {
            'updated_count': len(users),
            'node_id': node.id,
            'node_name': node.name,
        },
    })


@bp.route('/api/users/template', methods=['GET'])
@login_required
@super_admin_required
def download_template():
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output)
    worksheet = workbook.add_worksheet('用户导入模板')
    headers = ['用户名', '密码', '真实姓名', '角色', '邮箱', '手机号', '岗位', '工号/学号']
    for col, header in enumerate(headers):
        worksheet.write(0, col, header)
    worksheet.write(1, 0, 'zhangsan')
    worksheet.write(1, 1, '123456')
    worksheet.write(1, 2, '张三')
    worksheet.write(1, 3, 'staff')
    workbook.close()
    output.seek(0)
    return send_file(output, as_attachment=True, download_name='用户导入模板.xlsx', mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


@bp.route('/api/users/import', methods=['POST'])
@login_required
@super_admin_required
def import_users():
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': '未上传文件'})
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': '文件名为空'})
    try:
        if file.filename.endswith('.csv'):
            df = pd.read_csv(file)
        else:
            df = pd.read_excel(file)
        required = ['用户名', '真实姓名', '角色']
        for col in required:
            if col not in df.columns:
                return jsonify({'success': False, 'message': f'缺少列：{col}'})
        success = 0
        errors = []
        for idx, row in df.iterrows():
            username = str(row['用户名']).strip()
            real_name = str(row['真实姓名']).strip()
            role = str(row['角色']).strip()
            if not username or not real_name or not role:
                errors.append(f'第{idx+2}行：用户名、真实姓名、角色不能为空')
                continue
            # 禁止导入系统管理员
            if role == 'super_admin':
                errors.append(f'第{idx+2}行：系统管理员不可导入')
                continue
            if User.query.filter_by(username=username).first():
                errors.append(f'第{idx+2}行：用户名 {username} 已存在')
                continue
            password = str(row['密码']).strip() if pd.notna(row.get('密码')) else '123456'
            user = User(
                username=username,
                real_name=real_name,
                email=str(row['邮箱']).strip() if pd.notna(row.get('邮箱')) else None,
                phone=str(row['手机号']).strip() if pd.notna(row.get('手机号')) else None,
                role=role,
                position=str(row['岗位']).strip() if pd.notna(row.get('岗位')) else None,
                employee_id=str(row['工号/学号']).strip() if pd.notna(row.get('工号/学号')) else None
            )
            user.set_password(password)
            db.session.add(user)
            success += 1
        db.session.commit()
        return jsonify({'success': True, 'message': f'导入完成，成功{success}条，失败{len(errors)}条', 'data': {'success_count': success, 'error_count': len(errors), 'errors': errors[:10]}})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@bp.route('/api/users/staff-by-college', methods=['GET'])
@login_required
@super_admin_required
def get_staff_by_college():
    """教师按学院分类列表"""
    from app.models import OrganizationNode
    # 取所有学院节点（node_type='college' 或顶层子节点）
    colleges = [
        node
        for node in OrganizationNode.query.filter(OrganizationNode.is_active == True)
        .order_by(OrganizationNode.order_index)
        .all()
        if normalize_node_type(node.node_type) in {NODE_TYPE_COLLEGE, NODE_TYPE_DEPARTMENT, NODE_TYPE_SCHOOL}
    ]

    result = []
    # 无学院归属的教师
    staff_all = User.query.filter(User.role.in_(['staff', 'college_admin'])).all()
    assigned_ids = set()

    college_list = []
    for college in colleges:
        # 该学院下的所有教职员工（通过 user_organizations）
        staff_in_college = []
        for uo in college.node_users:
            u = uo.user
            if u.role in ['staff', 'college_admin']:
                assigned_ids.add(u.id)
                staff_in_college.append({
                    'id': u.id,
                    'number': u.employee_id or '-',
                    'real_name': u.real_name,
                    'role_display': u.get_role_display(),
                    'position': u.position or '-',
                    'email': u.email or '-',
                    'phone': u.phone or '-',
                    'is_active': u.is_active
                })
        if staff_in_college:
            college_list.append({
                'college_id': college.id,
                'college_name': college.name,
                'count': len(staff_in_college),
                'staff': staff_in_college
            })

    # 未分配学院的教师
    unassigned = []
    for u in staff_all:
        if u.id not in assigned_ids:
            unassigned.append({
                'id': u.id,
                'number': u.employee_id or '-',
                'real_name': u.real_name,
                'role_display': u.get_role_display(),
                'position': u.position or '-',
                'email': u.email or '-',
                'phone': u.phone or '-',
                'is_active': u.is_active
            })

    return jsonify({
        'success': True,
        'data': {
            'colleges': college_list,
            'unassigned': unassigned,
            'total': len(staff_all)
        }
    })


@bp.route('/api/users/student-by-org', methods=['GET'])
@login_required
@super_admin_required
def get_student_by_org():
    """学生按学院/年级-专业分类列表"""
    from app.models import OrganizationNode
    # 获取所有组织节点（含各级）
    all_nodes = {n.id: n for n in OrganizationNode.query.filter_by(is_active=True).all()}

    students_all = User.query.filter_by(role='student').all()
    assigned_ids = set()

    # 按组织节点归类
    node_students = {}
    for u in students_all:
        primary_uo = next((uo for uo in u.user_organizations if uo.is_primary), None)
        if not primary_uo:
            continue
        node_id = primary_uo.node_id
        assigned_ids.add(u.id)
        if node_id not in node_students:
            node_students[node_id] = []
        node_students[node_id].append(u)

    # 从节点向上找最近的学院（college/school/department 类型）
    def find_college(node_id):
        node = all_nodes.get(node_id)
        if not node:
            return None
        if normalize_node_type(node.node_type) in {NODE_TYPE_COLLEGE, NODE_TYPE_SCHOOL, NODE_TYPE_DEPARTMENT}:
            return node
        if node.parent_id:
            return find_college(node.parent_id)
        return node  # 顶层

    # 构建结果：学院 -> [{node_name, students}]
    college_groups = {}  # college_id -> {name, sub_groups}
    for node_id, students in node_students.items():
        college = find_college(node_id)
        college_id = college.id if college else 0
        college_name = college.name if college else '未分类'
        node = all_nodes.get(node_id)
        node_name = node.name if node else '未知节点'

        if college_id not in college_groups:
            college_groups[college_id] = {'college_name': college_name, 'sub_groups': {}}
        sub = college_groups[college_id]['sub_groups']
        if node_name not in sub:
            sub[node_name] = []
        for u in students:
            sub[node_name].append({
                'id': u.id,
                'number': u.student_id or '-',
                'real_name': u.real_name,
                'grade': u.grade or '-',
                'major': u.major or '-',
                'email': u.email or '-',
                'phone': u.phone or '-',
                'is_active': u.is_active
            })

    # 未分配的学生
    unassigned = []
    for u in students_all:
        if u.id not in assigned_ids:
            unassigned.append({
                'id': u.id,
                'number': u.student_id or '-',
                'real_name': u.real_name,
                'grade': u.grade or '-',
                'major': u.major or '-',
                'email': u.email or '-',
                'phone': u.phone or '-',
                'is_active': u.is_active
            })

    # 格式化结果
    result_colleges = []
    for cid, cdata in college_groups.items():
        sub_list = []
        total = 0
        for sub_name, stu_list in cdata['sub_groups'].items():
            sub_list.append({'group_name': sub_name, 'count': len(stu_list), 'students': stu_list})
            total += len(stu_list)
        result_colleges.append({
            'college_id': cid,
            'college_name': cdata['college_name'],
            'total': total,
            'sub_groups': sub_list
        })

    return jsonify({
        'success': True,
        'data': {
            'colleges': result_colleges,
            'unassigned': unassigned,
            'total': len(students_all)
        }
    })


@bp.route('/api/users/export', methods=['GET'])
@login_required
@super_admin_required
def export_users():
    format_type = request.args.get('format', 'excel')
    keyword = request.args.get('keyword', '')
    email = request.args.get('email', '')
    phone = request.args.get('phone', '')
    role = request.args.get('role', '')
    has_primary = request.args.get('has_primary', '').strip().lower()
    query = User.query
    query = apply_user_keyword_filter(query, keyword)
    query = apply_user_contact_filters(query, email=email, phone=phone)
    if role:
        query = query.filter_by(role=role)
    query = query.filter(User.role != 'super_admin')
    query = apply_primary_filter(query, has_primary)
    users = query.all()
    data = []
    for u in users:
        data.append([u.id, u.username, u.real_name, u.get_role_display(), u.email or '', u.phone or '', u.position or '', u.employee_id or u.student_id or '', '正常' if u.is_active else '禁用', u.created_at.strftime('%Y-%m-%d %H:%M:%S') if u.created_at else ''])
    headers = ['ID', '用户名', '真实姓名', '角色', '邮箱', '手机号', '岗位', '工号/学号', '状态', '创建时间']
    if format_type == 'csv':
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(headers)
        writer.writerows(data)
        output.seek(0)
        return send_file(io.BytesIO(output.getvalue().encode('utf-8-sig')), as_attachment=True, download_name=f'用户数据_{datetime.now().strftime("%Y%m%d_%H%M%S")}.csv', mimetype='text/csv')
    else:
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output)
        worksheet = workbook.add_worksheet('用户数据')
        for col, h in enumerate(headers):
            worksheet.write(0, col, h)
        for row_idx, row in enumerate(data, 1):
            for col_idx, val in enumerate(row):
                worksheet.write(row_idx, col_idx, val)
        workbook.close()
        output.seek(0)
        return send_file(output, as_attachment=True, download_name=f'用户数据_{datetime.now().strftime("%Y%m%d_%H%M%S")}.xlsx', mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

