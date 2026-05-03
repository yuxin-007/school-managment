from functools import wraps

from flask import jsonify
from flask_login import current_user


def super_admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or current_user.role != 'super_admin':
            return jsonify({'success': False, 'message': '权限不足，需要超级管理员权限'}), 403
        return f(*args, **kwargs)

    return decorated_function


def college_admin_or_super_admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated or current_user.role not in ['super_admin', 'college_admin']:
            return jsonify({'success': False, 'message': '权限不足，需要管理员权限'}), 403
        return f(*args, **kwargs)

    return decorated_function
