from flask import Blueprint, current_app, request, flash, redirect, jsonify, session
from flask_login import login_user, logout_user, current_user
from app.models import db, User
from app.services.email_delivery import EmailDeliveryError, send_verification_email
from app.services.contact_identity import find_unique_user_by_contact
from datetime import datetime, timedelta
import math
import secrets

bp = Blueprint('auth', __name__, url_prefix='/auth')

AUTH_CODE_EXPIRES_MINUTES = 10
AUTH_CODE_STORE = {}
MAX_FAILED_LOGIN_ATTEMPTS = 5
LOGIN_LOCKOUT_MINUTES = 5


def find_user_by_contact(contact_type, contact):
    user, error = find_unique_user_by_contact(contact_type, contact)
    return user, error


def contact_missing_message(contact_type):
    if contact_type == 'phone':
        return '该手机号下无账号'
    if contact_type == 'email':
        return '该邮箱下无账号'
    return '该手机号或邮箱下无账号'


def generate_verification_code():
    return f'{secrets.randbelow(1000000):06d}'


def store_recovery_code(user, purpose, contact_type, contact):
    token = secrets.token_urlsafe(24)
    code = generate_verification_code()
    AUTH_CODE_STORE[token] = {
        'user_id': user.id,
        'purpose': purpose,
        'contact_type': contact_type,
        'contact': contact,
        'code': code,
        'expires_at': datetime.utcnow() + timedelta(minutes=AUTH_CODE_EXPIRES_MINUTES),
    }
    session['auth_recovery_token'] = token
    return code


def discard_recovery_code():
    token = session.get('auth_recovery_token')
    AUTH_CODE_STORE.pop(token, None)
    session.pop('auth_recovery_token', None)


def verify_recovery_code(purpose, contact_type, contact, code):
    token = session.get('auth_recovery_token')
    record = AUTH_CODE_STORE.get(token)
    if not record:
        return None, '请先获取验证码'

    if datetime.utcnow() > record['expires_at']:
        AUTH_CODE_STORE.pop(token, None)
        session.pop('auth_recovery_token', None)
        return None, '验证码已过期，请重新获取'

    if (
        record['purpose'] != purpose
        or record['contact_type'] != contact_type
        or record['contact'] != contact
        or record['code'] != (code or '').strip()
    ):
        return None, '验证码错误'

    user = db.session.get(User, record['user_id'])
    if not user or not user.is_active:
        return None, '账号不存在或已被禁用'

    AUTH_CODE_STORE.pop(token, None)
    session.pop('auth_recovery_token', None)
    return user, None


def debug_code_payload(code):
    data = {'expires_in': AUTH_CODE_EXPIRES_MINUTES * 60}
    debug_enabled = current_app.config.get(
        'AUTH_CODE_DEBUG',
        current_app.config.get('TESTING') or current_app.config.get('ENV') != 'production',
    )
    if debug_enabled:
        data['debug_code'] = code
    return data


def login_lockout_remaining_minutes(user):
    if not user.locked_until:
        return 0
    remaining_seconds = (user.locked_until - datetime.utcnow()).total_seconds()
    if remaining_seconds <= 0:
        return 0
    return max(1, math.ceil(remaining_seconds / 60))


def clear_login_lockout(user):
    user.failed_login_count = 0
    user.locked_until = None
    user.last_failed_login_at = None


def record_failed_login(user):
    user.failed_login_count = (user.failed_login_count or 0) + 1
    user.last_failed_login_at = datetime.utcnow()
    if user.failed_login_count >= MAX_FAILED_LOGIN_ATTEMPTS:
        user.locked_until = datetime.utcnow() + timedelta(minutes=LOGIN_LOCKOUT_MINUTES)
        db.session.commit()
        return (
            f'连续登录失败{MAX_FAILED_LOGIN_ATTEMPTS}次，账号已锁定，请{LOGIN_LOCKOUT_MINUTES}分钟后再试',
            423,
        )

    remaining_attempts = MAX_FAILED_LOGIN_ATTEMPTS - user.failed_login_count
    db.session.commit()
    return f'账号或密码错误，还可尝试 {remaining_attempts} 次', 401


def handle_password_login(user, password, is_json_request, default_error_message):
    if user and user.is_active:
        remaining_minutes = login_lockout_remaining_minutes(user)
        if remaining_minutes:
            message = f'账号已锁定，请{remaining_minutes}分钟后再试'
            if is_json_request:
                return jsonify({'success': False, 'message': message}), 423
            flash(message, 'danger')
            return redirect('/login')

        if user.check_password(password):
            login_user(user)
            user.last_login = datetime.now()
            clear_login_lockout(user)
            db.session.commit()
            if is_json_request:
                return jsonify({'success': True, 'message': f'欢迎回来，{user.real_name}！'})
            flash(f'欢迎回来，{user.real_name}！', 'success')
            return redirect("/")

        message, status_code = record_failed_login(user)
        if is_json_request:
            return jsonify({'success': False, 'message': message}), status_code
        flash(message, 'danger')
        return redirect('/login')

    if is_json_request:
        return jsonify({'success': False, 'message': default_error_message}), 401
    flash(default_error_message, 'danger')
    return redirect('/login')


@bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'GET':
        if current_user.is_authenticated:
            return redirect("/")
        return redirect('/login')

    # POST 登录
    if request.is_json:
        data = request.get_json()
        username = data.get('username', '')
        password = data.get('password', '')
    else:
        username = request.form.get('username', '')
        password = request.form.get('password', '')

    is_json_request = request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest'

    user = User.query.filter_by(username=username).first()
    if user and user.role == 'super_admin':
        return handle_password_login(user, password, is_json_request, '用户名或密码错误，或账号已被禁用')
    else:
        user = User.query.filter_by(employee_id=username).first()
        if not user:
            user = User.query.filter_by(student_id=username).first()
        if not user:
            user = User.query.filter_by(username=username).first()
        return handle_password_login(user, password, is_json_request, '账号/学号或密码错误，或账号已被禁用')


@bp.route('/logout')
def logout():
    logout_user()
    if request.headers.get('Accept') == 'application/json' or request.is_json:
        return jsonify({'success': True, 'message': '已退出登录'})
    flash('您已退出登录', 'info')
    return redirect("/")


@bp.route('/unauthorized')
def unauthorized():
    """Flask-Login 权限重定向端点 - 返回 401 让前端处理"""
    return jsonify({'success': False, 'message': '请先登录'}), 401


@bp.route('/recovery/send-code', methods=['POST'])
def send_recovery_code():
    data = request.get_json() or {}
    purpose = (data.get('purpose') or '').strip()
    contact_type = (data.get('contact_type') or '').strip()
    contact = (data.get('contact') or '').strip()

    if purpose not in {'reset_password', 'email_login', 'phone_login'}:
        return jsonify({'success': False, 'message': '不支持的验证类型'}), 400
    if contact_type not in {'email', 'phone'}:
        return jsonify({'success': False, 'message': '请选择邮箱或手机号'}), 400
    if purpose == 'email_login' and contact_type != 'email':
        return jsonify({'success': False, 'message': '邮箱登录需要使用邮箱验证'}), 400
    if purpose == 'phone_login' and contact_type != 'phone':
        return jsonify({'success': False, 'message': '手机号登录需要使用手机号验证'}), 400
    if not contact:
        return jsonify({'success': False, 'message': '请填写邮箱或手机号'}), 400

    user, contact_error = find_user_by_contact(contact_type, contact)
    if contact_error:
        return jsonify({'success': False, 'message': contact_error}), 409
    if not user or not user.is_active:
        return jsonify({'success': False, 'message': contact_missing_message(contact_type)}), 404

    code = store_recovery_code(user, purpose, contact_type, contact)
    if contact_type == 'email':
        try:
            send_verification_email(contact, code, purpose)
        except EmailDeliveryError as error:
            discard_recovery_code()
            return jsonify({'success': False, 'message': str(error)}), 503
    return jsonify({
        'success': True,
        'message': '验证码已发送',
        'data': debug_code_payload(code),
    })


@bp.route('/recovery/reset-password', methods=['POST'])
def reset_password_with_code():
    data = request.get_json() or {}
    contact_type = (data.get('contact_type') or '').strip()
    contact = (data.get('contact') or '').strip()
    code = (data.get('code') or '').strip()
    new_password = data.get('new_password') or ''
    confirm_password = data.get('confirm_password') or ''

    if len(new_password) < 6:
        return jsonify({'success': False, 'message': '新密码至少6位'}), 400
    if new_password != confirm_password:
        return jsonify({'success': False, 'message': '两次输入的密码不一致'}), 400

    user, error = verify_recovery_code('reset_password', contact_type, contact, code)
    if error:
        return jsonify({'success': False, 'message': error}), 400

    user.set_password(new_password)
    clear_login_lockout(user)
    db.session.commit()
    return jsonify({'success': True, 'message': '密码修改成功，请使用新密码登录'})


@bp.route('/recovery/login', methods=['POST'])
def login_with_recovery_code():
    data = request.get_json() or {}
    contact_type = (data.get('contact_type') or '').strip()
    contact = (data.get('contact') or '').strip()
    code = (data.get('code') or '').strip()
    purpose = f'{contact_type}_login'

    if purpose not in {'email_login', 'phone_login'}:
        return jsonify({'success': False, 'message': '请选择邮箱登录或手机号登录'}), 400

    user, error = verify_recovery_code(purpose, contact_type, contact, code)
    if error:
        return jsonify({'success': False, 'message': error}), 400

    login_user(user)
    user.last_login = datetime.now()
    clear_login_lockout(user)
    db.session.commit()
    return jsonify({'success': True, 'message': f'欢迎回来，{user.real_name}！'})
