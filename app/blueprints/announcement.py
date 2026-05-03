from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from app.extensions import db
from app.models import Announcement
from app.services.access_scope_service import get_scope_user_ids
from app.utils.org_permissions import ROLE_COLLEGE_ADMIN, ROLE_SUPER_ADMIN
from app.utils.permissions import college_admin_or_super_admin_required

bp = Blueprint("announcement", __name__, url_prefix="/announcement")

def get_manageable_announcement_query():
    query = Announcement.query
    if current_user.role == ROLE_SUPER_ADMIN:
        return query
    if current_user.role == ROLE_COLLEGE_ADMIN:
        scoped_user_ids = get_scope_user_ids(current_user)
        return query.filter(Announcement.author_id.in_(scoped_user_ids))
    return query.filter(Announcement.author_id == current_user.id)


def is_announcement_publicly_visible(announcement):
    today = datetime.now().date()
    start_ok = announcement.start_date is None or announcement.start_date <= today
    end_ok = announcement.end_date is None or announcement.end_date >= today
    return announcement.is_active and start_ok and end_ok


def parse_announcement_dates(data):
    start_date = datetime.strptime(data["start_date"], "%Y-%m-%d").date() if data.get("start_date") else None
    end_date = datetime.strptime(data["end_date"], "%Y-%m-%d").date() if data.get("end_date") else None
    if start_date and end_date and start_date > end_date:
        raise ValueError("失效日期不能早于生效日期。")
    return start_date, end_date


@bp.route("/api/announcements")
@login_required
def get_announcements():
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 10, type=int)
    category = request.args.get("category", "").strip()

    query = Announcement.query.filter_by(is_active=True)
    today = datetime.now().date()
    query = query.filter(
        db.or_(Announcement.start_date.is_(None), Announcement.start_date <= today),
        db.or_(Announcement.end_date.is_(None), Announcement.end_date >= today),
    )

    if category:
        query = query.filter_by(category=category)

    pagination = query.order_by(Announcement.is_pinned.desc(), Announcement.created_at.desc()).paginate(
        page=page,
        per_page=per_page,
        error_out=False,
    )
    return jsonify(
        {
            "success": True,
            "data": [item.to_dict() for item in pagination.items],
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": pagination.total,
                "pages": pagination.pages,
                "has_next": pagination.has_next,
                "has_prev": pagination.has_prev,
            },
        }
    )


@bp.route("/api/announcements/all")
@login_required
@college_admin_or_super_admin_required
def get_all_announcements():
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 20, type=int)

    pagination = get_manageable_announcement_query().order_by(
        Announcement.is_pinned.desc(),
        Announcement.created_at.desc(),
    ).paginate(page=page, per_page=per_page, error_out=False)

    return jsonify(
        {
            "success": True,
            "data": [item.to_dict() for item in pagination.items],
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": pagination.total,
                "pages": pagination.pages,
                "has_next": pagination.has_next,
                "has_prev": pagination.has_prev,
            },
        }
    )


@bp.route("/api/announcements/<int:ann_id>")
@login_required
def get_announcement(ann_id):
    announcement = db.get_or_404(Announcement, ann_id)
    can_manage = get_manageable_announcement_query().filter(Announcement.id == ann_id).first() is not None

    if not is_announcement_publicly_visible(announcement) and not can_manage:
        return jsonify({"success": False, "message": "当前账号无权查看该公告。"}), 403

    should_increment = request.args.get("increment_view", "true").lower() != "false"
    if should_increment and is_announcement_publicly_visible(announcement):
        announcement.view_count += 1
        db.session.commit()

    return jsonify({"success": True, "data": announcement.to_dict()})


@bp.route("/api/announcements", methods=["POST"])
@login_required
@college_admin_or_super_admin_required
def create_announcement():
    data = request.get_json() or {}
    if not data.get("title") or not data.get("content"):
        return jsonify({"success": False, "message": "公告标题和内容不能为空。"}), 400

    try:
        start_date, end_date = parse_announcement_dates(data)
    except ValueError as error:
        return jsonify({"success": False, "message": str(error)}), 400

    announcement = Announcement(
        title=data["title"].strip(),
        content=data["content"].strip(),
        category=data.get("category", "general"),
        priority=data.get("priority", "normal"),
        author_id=current_user.id,
        is_pinned=data.get("is_pinned", False),
        is_active=data.get("is_active", True),
        start_date=start_date,
        end_date=end_date,
    )

    db.session.add(announcement)
    db.session.commit()

    from app.blueprints.log import log_operation

    log_operation(
        user_id=current_user.id,
        action="create_announcement",
        target_type="Announcement",
        target_id=announcement.id,
        target_name=announcement.title,
        ip_address=request.remote_addr,
        user_agent=request.headers.get("User-Agent"),
        commit=True,
    )

    return jsonify({"success": True, "data": announcement.to_dict(), "message": "公告发布成功。"})


@bp.route("/api/announcements/<int:ann_id>", methods=["PUT"])
@login_required
@college_admin_or_super_admin_required
def update_announcement(ann_id):
    announcement = get_manageable_announcement_query().filter(Announcement.id == ann_id).first_or_404()
    data = request.get_json() or {}

    try:
        start_date, end_date = parse_announcement_dates(
            {
                "start_date": data.get("start_date", announcement.start_date.strftime("%Y-%m-%d") if announcement.start_date else ""),
                "end_date": data.get("end_date", announcement.end_date.strftime("%Y-%m-%d") if announcement.end_date else ""),
            }
        )
    except ValueError as error:
        return jsonify({"success": False, "message": str(error)}), 400

    if "title" in data:
        announcement.title = data["title"].strip()
    if "content" in data:
        announcement.content = data["content"].strip()
    if "category" in data:
        announcement.category = data["category"]
    if "priority" in data:
        announcement.priority = data["priority"]
    if "is_pinned" in data:
        announcement.is_pinned = data["is_pinned"]
    if "is_active" in data:
        announcement.is_active = data["is_active"]
    if "start_date" in data:
        announcement.start_date = start_date
    if "end_date" in data:
        announcement.end_date = end_date

    db.session.commit()

    from app.blueprints.log import log_operation

    log_operation(
        user_id=current_user.id,
        action="update_announcement",
        target_type="Announcement",
        target_id=announcement.id,
        target_name=announcement.title,
        ip_address=request.remote_addr,
        user_agent=request.headers.get("User-Agent"),
        commit=True,
    )

    return jsonify({"success": True, "data": announcement.to_dict(), "message": "公告更新成功。"})


@bp.route("/api/announcements/<int:ann_id>", methods=["DELETE"])
@login_required
@college_admin_or_super_admin_required
def delete_announcement(ann_id):
    announcement = get_manageable_announcement_query().filter(Announcement.id == ann_id).first_or_404()
    title = announcement.title
    db.session.delete(announcement)
    db.session.commit()

    from app.blueprints.log import log_operation

    log_operation(
        user_id=current_user.id,
        action="delete_announcement",
        target_type="Announcement",
        target_id=ann_id,
        target_name=title,
        ip_address=request.remote_addr,
        user_agent=request.headers.get("User-Agent"),
        commit=True,
    )

    return jsonify({"success": True, "message": "公告已删除。"})
