from flask import Blueprint, jsonify
from flask_login import login_required, current_user
from sqlalchemy import text

from app.extensions import db
from app.models import SystemSettings
from app.utils.frontend import frontend_dist_exists, serve_frontend_asset, serve_frontend_index
from app.utils.permissions import super_admin_required

bp = Blueprint('main', __name__)

@bp.route('/api/health')
def health():
    database_ok = True
    try:
        db.session.execute(text('SELECT 1'))
    except Exception:
        database_ok = False

    return jsonify({
        'success': True,
        'data': {
            'app': 'ok',
            'database': 'ok' if database_ok else 'error',
            'frontend_dist': 'ready' if frontend_dist_exists() else 'missing',
        }
    }), (200 if database_ok else 503)


@bp.route('/')
@bp.route('/dashboard')
@bp.route('/settings')
@bp.route('/login')
def index():
    return serve_frontend_index()


@bp.route('/assets/<path:filename>')
def frontend_assets(filename):
    return serve_frontend_asset(f'assets/{filename}')


@bp.route('/favicon.svg')
def frontend_favicon():
    return serve_frontend_asset('favicon.svg')


@bp.route('/icons.svg')
def frontend_icons():
    return serve_frontend_asset('icons.svg')


@bp.route('/organization')
@bp.route('/users')
@bp.route('/leave')
@bp.route('/courses')
@bp.route('/course-selection')
@bp.route('/course-schedule')
@bp.route('/grade-entry')
@bp.route('/my-grades')
@bp.route('/attendance')
@bp.route('/attendance-manage')
@bp.route('/announcements')
@bp.route('/announcement-manage')
@bp.route('/notifications')
@bp.route('/logs')
def frontend_routes():
    return serve_frontend_index()


@bp.route('/api/user/profile', methods=['GET', 'PUT'])
@login_required
def user_profile():
    from flask import request
    if request.method == 'GET':
        return jsonify({'success': True, 'data': current_user.to_dict()})

    data = request.json
    if 'real_name' in data:
        current_user.real_name = data['real_name']
    if 'email' in data:
        current_user.email = data['email']
    if 'phone' in data:
        current_user.phone = data['phone']
    db.session.commit()
    return jsonify({'success': True, 'message': '更新成功'})


@bp.route('/api/user/change_password', methods=['POST'])
@login_required
def change_password():
    from flask import request
    data = request.json
    if not current_user.check_password(data.get('current_password', '')):
        return jsonify({'success': False, 'message': '当前密码错误'})
    new_pwd = data.get('new_password', '')
    if len(new_pwd) < 6:
        return jsonify({'success': False, 'message': '新密码至少6位'})
    if new_pwd != data.get('confirm_password'):
        return jsonify({'success': False, 'message': '两次输入的密码不一致'})
    current_user.set_password(new_pwd)
    db.session.commit()
    return jsonify({'success': True, 'message': '密码修改成功'})


@bp.route('/api/user/preferences', methods=['GET', 'PUT'])
@login_required
def user_preferences():
    from flask import request
    if request.method == 'GET':
        return jsonify({
            'success': True,
            'data': {
                'theme': current_user.theme or 'light',
                'language': current_user.language or 'zh-CN'
            }
        })

    data = request.json
    if 'theme' in data and data['theme'] in ['light', 'dark']:
        current_user.theme = data['theme']
    if 'language' in data and data['language'] in ['zh-CN', 'en']:
        current_user.language = data['language']
    db.session.commit()
    return jsonify({'success': True, 'message': '偏好设置已保存'})


@bp.route('/api/system/settings', methods=['GET', 'PUT'])
@login_required
@super_admin_required
def system_settings():
    from flask import request
    settings = SystemSettings.query.filter_by(key='appearance').first()
    if not settings:
        settings = SystemSettings(key='appearance')
        db.session.add(settings)
        db.session.commit()

    if request.method == 'GET':
        return jsonify({'success': True, 'data': settings.to_dict()})

    data = request.json
    if 'background_type' in data:
        settings.background_type = data['background_type']
    if 'background_color' in data:
        settings.background_color = data['background_color']
    if 'background_gradient_start' in data:
        settings.background_gradient_start = data['background_gradient_start']
    if 'background_gradient_end' in data:
        settings.background_gradient_end = data['background_gradient_end']
    if 'background_image' in data:
        settings.background_image = data['background_image']
    if 'background_image_opacity' in data:
        settings.background_image_opacity = float(data['background_image_opacity'])
    if 'primary_color' in data:
        settings.primary_color = data['primary_color']
    if 'accent_color' in data:
        settings.accent_color = data['accent_color']
    if 'saturation' in data:
        settings.saturation = int(data['saturation'])
    if 'brightness' in data:
        settings.brightness = int(data['brightness'])
    if 'hue_shift' in data:
        settings.hue_shift = int(data['hue_shift'])
    if 'border_radius' in data:
        settings.border_radius = data['border_radius']
    if 'card_style' in data:
        settings.card_style = data['card_style']
    if 'animation_enabled' in data:
        settings.animation_enabled = bool(data['animation_enabled'])

    settings.updated_by = current_user.id
    db.session.commit()
    return jsonify({'success': True, 'message': '系统外观设置已保存'})


