from flask import Blueprint, current_app, jsonify
from flask_login import login_required, current_user
from flask_wtf.csrf import generate_csrf
from sqlalchemy import text

from app.extensions import db
from app.services.runtime_status import build_runtime_status
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


@bp.route('/api/runtime/status')
def runtime_status():
    return jsonify({'success': True, 'data': build_runtime_status(current_app)})


@bp.route('/api/csrf-token')
def csrf_token():
    return jsonify({'success': True, 'data': {'csrf_token': generate_csrf()}})


@bp.route('/api/app/version')
def app_version():
    """移动端版本检查接口，无需认证"""
    return jsonify({
        'success': True,
        'data': {
            'versionCode': 1,
            'versionName': '1.0.0',
            'downloadUrl': '',
            'forceUpdate': False,
            'releaseNotes': '初始版本',
        }
    })


@bp.route('/')
@bp.route('/dashboard')
@bp.route('/settings')
@bp.route('/login')
@bp.route('/forgot-password')
def index():
    return serve_frontend_index()


@bp.route('/assets/<path:filename>')
def frontend_assets(filename):
    return serve_frontend_asset(f'assets/{filename}')


@bp.route('/favicon.svg')
def frontend_favicon():
    return serve_frontend_asset('favicon.svg')


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

