from __future__ import annotations

from app.extensions import db
from app.models import UserNotificationPreference


ALLOWED_THEMES = {'light', 'dark', 'auto'}
ALLOWED_LANGUAGES = {'zh-CN', 'en'}
NOTIFICATION_PREFERENCE_KEYS = ('leave', 'attendance', 'announcement', 'grade', 'course', 'system')

DEFAULT_NOTIFICATION_PREFERENCES = {
    'leave': True,
    'attendance': True,
    'announcement': True,
    'grade': True,
    'course': True,
    'system': True,
}


def get_or_create_notification_preferences(user, create: bool = False) -> UserNotificationPreference | None:
    preference = user.notification_preferences
    if preference or not create:
        return preference

    preference = UserNotificationPreference(user_id=user.id)
    db.session.add(preference)
    return preference


def serialize_user_preferences(user) -> dict:
    preference = get_or_create_notification_preferences(user, create=False)
    notification_preferences = preference.to_dict() if preference else DEFAULT_NOTIFICATION_PREFERENCES.copy()
    return {
        'theme': user.theme or 'light',
        'language': user.language or 'zh-CN',
        'notification_preferences': notification_preferences,
    }


def apply_user_preferences(user, data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError('偏好设置数据格式错误')

    if 'theme' in data:
        if data['theme'] not in ALLOWED_THEMES:
            raise ValueError('不支持的主题设置')
        user.theme = data['theme']

    if 'language' in data:
        if data['language'] not in ALLOWED_LANGUAGES:
            raise ValueError('不支持的语言设置')
        user.language = data['language']

    if 'notification_preferences' in data:
        raw_preferences = data['notification_preferences']
        if not isinstance(raw_preferences, dict):
            raise ValueError('通知偏好设置格式错误')

        preference = get_or_create_notification_preferences(user, create=True)
        for key, value in raw_preferences.items():
            if key not in NOTIFICATION_PREFERENCE_KEYS:
                raise ValueError(f'不支持的通知偏好类型: {key}')
            if not isinstance(value, bool):
                raise ValueError(f'通知偏好必须是布尔值: {key}')
            setattr(preference, f'{key}_enabled', value)

    return serialize_user_preferences(user)


def get_notification_preference_key(notification_type: str | None) -> str:
    normalized = (notification_type or '').strip().lower()
    if normalized.startswith('leave_'):
        return 'leave'
    if normalized.startswith('supplement_'):
        return 'attendance'
    if normalized.startswith('course_'):
        return 'course'
    if normalized.startswith('assignment_'):
        return 'course'
    if normalized.startswith('grade_'):
        return 'grade'
    if normalized == 'announcement':
        return 'announcement'
    return 'system'


def should_deliver_notification(user, notification_type: str | None) -> bool:
    preference = get_or_create_notification_preferences(user, create=False)
    if preference is None:
        return True

    key = get_notification_preference_key(notification_type)
    return bool(getattr(preference, f'{key}_enabled', True))
