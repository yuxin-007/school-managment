"""Shared response helpers for Flask blueprints."""

from flask import jsonify


def paginated_response(pagination, serialize_item, *, success=True):
    """Build a standard paginated JSON response.

    Args:
        pagination: SQLAlchemy pagination object (from .paginate())
        serialize_item: callable that converts each item to a dict
        success: response success flag (default True)
    """
    return jsonify({
        'success': success,
        'data': [serialize_item(item) for item in pagination.items],
        'pagination': {
            'page': pagination.page,
            'per_page': pagination.per_page,
            'total': pagination.total,
            'pages': pagination.pages,
            'has_next': pagination.has_next,
            'has_prev': pagination.has_prev,
        },
    })
