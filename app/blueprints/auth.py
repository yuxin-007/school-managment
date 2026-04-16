from flask import Blueprint, request, flash, redirect, url_for, jsonify
from flask_login import login_user, logout_user, current_user
from app.models import db, User
from datetime import datetime

bp = Blueprint('auth', __name__, url_prefix='/auth')

FRONTEND_URL = ''


@bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'GET':
        if current_user.is_authenticated:
            return redirect("/")
        return redirect(FRONTEND_URL + '/login')

    # POST 登录
    if request.is_json:
        data = request.get_json()
        username = data.get('username', '')
        password = data.get('password', '')
    else:
        username = request.form.get('username', '')
        password = request.form.get('password', '')

    is_json_request = request.is_json or request.headers.get('X-Requested-With') == 'XMLHttpRequest'

    user = None
    user = User.query.filter_by(username=username).first()
    if user and user.role == 'super_admin':
        if user.is_active and user.check_password(password):
            login_user(user)
            user.last_login = datetime.now()
            db.session.commit()
            if is_json_request:
                return jsonify({'success': True, 'message': f'欢迎回来，{user.real_name}！'})
            flash(f'欢迎回来，{user.real_name}！', 'success')
            return redirect("/")
        else:
            if is_json_request:
                return jsonify({'success': False, 'message': '用户名或密码错误，或账号已被禁用'}), 401
            flash('用户名或密码错误，或账号已被禁用', 'danger')
    else:
        user = User.query.filter_by(employee_id=username).first()
        if not user:
            user = User.query.filter_by(student_id=username).first()
        if not user:
            user = User.query.filter_by(username=username).first()
        if user and user.is_active and user.check_password(password):
            login_user(user)
            user.last_login = datetime.now()
            db.session.commit()
            if is_json_request:
                return jsonify({'success': True, 'message': f'欢迎回来，{user.real_name}！'})
            flash(f'欢迎回来，{user.real_name}！', 'success')
            return redirect("/")
        else:
            if is_json_request:
                return jsonify({'success': False, 'message': '账号/学号或密码错误，或账号已被禁用'}), 401
            flash('账号/学号或密码错误，或账号已被禁用', 'danger')

    return redirect(FRONTEND_URL + '/login')


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
