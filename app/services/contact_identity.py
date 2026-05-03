from __future__ import annotations

from app.models import User


def normalize_contact(value):
    normalized = (value or '').strip()
    return normalized or None


def contact_label(contact_type):
    return '邮箱' if contact_type == 'email' else '手机号'


def find_unique_user_by_contact(contact_type, contact):
    normalized = normalize_contact(contact)
    if not normalized:
        return None, None

    if contact_type == 'email':
        query = User.query.filter_by(email=normalized)
    elif contact_type == 'phone':
        query = User.query.filter_by(phone=normalized)
    else:
        return None, '请选择邮箱或手机号'

    matches = query.limit(2).all()
    if len(matches) > 1:
        return None, f'该{contact_label(contact_type)}已绑定多个账号，请联系管理员处理'
    return (matches[0] if matches else None), None


def validate_contact_available(email=None, phone=None, exclude_user_id=None):
    checks = [('email', normalize_contact(email)), ('phone', normalize_contact(phone))]

    for contact_type, value in checks:
        if not value:
            continue
        query = User.query.filter(getattr(User, contact_type) == value)
        if exclude_user_id is not None:
            query = query.filter(User.id != exclude_user_id)
        if query.first():
            raise ValueError(f'{contact_label(contact_type)}已被其他账号绑定')
