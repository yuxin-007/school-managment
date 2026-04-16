from datetime import datetime

from flask import Blueprint, jsonify, redirect, request
from flask_login import current_user, login_required
from sqlalchemy import or_

from app.models import Notification, db

bp = Blueprint('notification', __name__, url_prefix='/notification')

FRONTEND_URL = ''


@bp.route('/')
@login_required
def index():
    return redirect(FRONTEND_URL + '/notifications')


@bp.route('/api/notifications')
@login_required
def get_notifications():
    """获取当前用户的通知列表"""
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

    return jsonify(
        {
            'success': True,
            'data': [item.to_dict() for item in pagination.items],
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': pagination.total,
                'pages': pagination.pages,
                'has_next': pagination.has_next,
                'has_prev': pagination.has_prev,
            },
        }
    )


@bp.route('/api/notifications/count')
@login_required
def get_unread_count():
    """获取未读通知数量"""
    count = Notification.query.filter_by(user_id=current_user.id, is_read=False).count()
    return jsonify({'success': True, 'data': {'unread': count, 'unread_count': count}})


@bp.route('/api/notifications/<int:notif_id>/read', methods=['POST'])
@login_required
def mark_as_read(notif_id):
    """标记单条通知为已读"""
    notif = Notification.query.get_or_404(notif_id)

    if notif.user_id != current_user.id:
        return jsonify({'success': False, 'message': '无权操作。'}), 403

    notif.is_read = True
    notif.read_at = datetime.now()
    db.session.commit()

    return jsonify({'success': True, 'message': '通知已标记为已读。'})


@bp.route('/api/notifications/read-all', methods=['POST'])
@login_required
def mark_all_as_read():
    """标记所有通知为已读"""
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
    """删除通知"""
    notif = Notification.query.get_or_404(notif_id)

    if notif.user_id != current_user.id:
        return jsonify({'success': False, 'message': '无权操作。'}), 403

    db.session.delete(notif)
    db.session.commit()
    return jsonify({'success': True, 'message': '通知已删除。'})


def create_notification(user_id, title, content, notification_type, related_id=None, related_type=None):
    """创建通知（供其他蓝图调用）"""
    notif = Notification(
        user_id=user_id,
        title=title,
        content=content,
        notification_type=notification_type,
        related_id=related_id,
        related_type=related_type,
    )
    db.session.add(notif)
    db.session.commit()
    return notif


def notify_leave_result(leave_app, approved=True, reason=''):
    """发送请假审批结果通知"""
    title = '请假申请已通过' if approved else '请假申请被驳回'
    leave_type_display = leave_app.get_leave_type_display()
    content = f'您的{leave_type_display}申请（{leave_app.start_date} 至 {leave_app.end_date}）'
    content += '已通过。' if approved else f'被驳回。原因：{reason}'
    create_notification(
        user_id=leave_app.staff_id,
        title=title,
        content=content,
        notification_type='leave_approved' if approved else 'leave_rejected',
        related_id=leave_app.id,
        related_type='LeaveApplication',
    )
