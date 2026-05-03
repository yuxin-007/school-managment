from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from app.models import db, OperationLog
from app.utils.permissions import super_admin_required
from app.utils.response import paginated_response
from datetime import datetime

bp = Blueprint('log', __name__, url_prefix='/log')

@bp.route('/api/logs')
@login_required
@super_admin_required
def get_logs():
    """获取操作日志列表（支持分页）"""
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    per_page = min(per_page, 200)

    action = request.args.get('action', '').strip()
    keyword = request.args.get('keyword', '').strip()
    start_date = request.args.get('start_date', '').strip()
    end_date = request.args.get('end_date', '').strip()

    query = OperationLog.query

    if action:
        query = query.filter_by(action=action)
    if keyword:
        query = query.filter(
            db.or_(
                OperationLog.target_name.like(f'%{keyword}%'),
                OperationLog.detail.like(f'%{keyword}%')
            )
        )
    if start_date:
        query = query.filter(OperationLog.created_at >= datetime.strptime(start_date, '%Y-%m-%d'))
    if end_date:
        query = query.filter(OperationLog.created_at <= datetime.strptime(end_date + ' 23:59:59', '%Y-%m-%d %H:%M:%S'))

    pagination = query.order_by(OperationLog.created_at.desc()).paginate(page=page, per_page=per_page, error_out=False)

    return paginated_response(pagination, lambda log: log.to_dict())


@bp.route('/api/logs/stats')
@login_required
@super_admin_required
def get_stats():
    """获取操作统计"""
    today = datetime.now().date()
    week_ago = datetime.combine(today, datetime.min.time())

    stats = {
        'total': OperationLog.query.count(),
        'today': OperationLog.query.filter(OperationLog.created_at >= today).count(),
        'week': OperationLog.query.filter(OperationLog.created_at >= week_ago).count(),
        'by_action': {}
    }

    # 按操作类型统计
    action_counts = db.session.query(
        OperationLog.action,
        db.func.count(OperationLog.id)
    ).group_by(OperationLog.action).all()

    for action, count in action_counts:
        log = OperationLog(action=action)
        stats['by_action'][action] = {
            'count': count,
            'display': log.get_action_display()
        }

    return jsonify({'success': True, 'data': stats})


def log_operation(
    user_id,
    action,
    target_type=None,
    target_id=None,
    target_name=None,
    detail=None,
    ip_address=None,
    user_agent=None,
    commit=False,
):
    """记录操作日志（供其他蓝图调用）"""
    log = OperationLog(
        user_id=user_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        target_name=target_name,
        detail=detail,
        ip_address=ip_address,
        user_agent=user_agent
    )
    db.session.add(log)
    if commit:
        db.session.commit()
    return log
