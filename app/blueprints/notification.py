from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required
from sqlalchemy import or_

from app.models import Notification, User, db
from app.services.user_preferences import should_deliver_notification
from app.utils.response import paginated_response

bp = Blueprint('notification', __name__, url_prefix='/notification')


@bp.route('/api/notifications')
@login_required
def get_notifications():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    is_read = request.args.get('is_read', '').strip()
    notification_type = request.args.get('notification_type', '').strip()
    keyword = request.args.get('keyword', '').strip()

    query = Notification.query.filter_by(user_id=current_user.id)

    if is_read == 'true':
        query = query.filter_by(is_read=True)
    elif is_read == 'false':
        query = query.filter_by(is_read=False)

    if notification_type:
        query = query.filter_by(notification_type=notification_type)

    if keyword:
        query = query.filter(
            or_(
                Notification.title.like(f'%{keyword}%'),
                Notification.content.like(f'%{keyword}%'),
            )
        )

    pagination = query.order_by(Notification.created_at.desc()).paginate(
        page=page,
        per_page=per_page,
        error_out=False,
    )

    return paginated_response(pagination, lambda item: item.to_dict())


@bp.route('/api/notifications/count')
@login_required
def get_unread_count():
    count = Notification.query.filter_by(user_id=current_user.id, is_read=False).count()
    return jsonify({'success': True, 'data': {'unread': count, 'unread_count': count}})


@bp.route('/api/notifications/<int:notif_id>/read', methods=['POST'])
@login_required
def mark_as_read(notif_id):
    notif = db.get_or_404(Notification, notif_id)

    if notif.user_id != current_user.id:
        return jsonify({'success': False, 'message': '无权操作。'}), 403

    notif.is_read = True
    notif.read_at = datetime.now()
    db.session.commit()

    return jsonify({'success': True, 'message': '通知已标记为已读。'})


@bp.route('/api/notifications/read-all', methods=['POST'])
@login_required
def mark_all_as_read():
    Notification.query.filter_by(user_id=current_user.id, is_read=False).update(
        {
            'is_read': True,
            'read_at': datetime.now(),
        }
    )
    db.session.commit()
    return jsonify({'success': True, 'message': '已全部标记为已读。'})


@bp.route('/api/notifications/<int:notif_id>', methods=['DELETE'])
@login_required
def delete_notification(notif_id):
    notif = db.get_or_404(Notification, notif_id)

    if notif.user_id != current_user.id:
        return jsonify({'success': False, 'message': '无权操作。'}), 403

    db.session.delete(notif)
    db.session.commit()
    return jsonify({'success': True, 'message': '通知已删除。'})


def create_notification(
    user_id,
    title,
    content,
    notification_type,
    related_id=None,
    related_type=None,
    commit=False,
):
    user = db.session.get(User, user_id)
    if user is None or not should_deliver_notification(user, notification_type):
        return None

    notif = Notification(
        user_id=user_id,
        title=title,
        content=content,
        notification_type=notification_type,
        related_id=related_id,
        related_type=related_type,
    )
    db.session.add(notif)
    if commit:
        db.session.commit()
    return notif
