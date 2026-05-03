import os

from dotenv import load_dotenv


load_dotenv()


def env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {'1', 'true', 'yes', 'on'}


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-key-change-in-production')
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', 'sqlite:///instance/dev.db')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    ENV = os.environ.get('FLASK_ENV', 'development')
    WTF_CSRF_ENABLED = True
    AUTH_CODE_DEBUG = env_bool('AUTH_CODE_DEBUG', ENV != 'production')
    AUTH_CODE_EXPIRES_MINUTES = int(os.environ.get('AUTH_CODE_EXPIRES_MINUTES', '10'))
    MAIL_SERVER = os.environ.get('MAIL_SERVER')
    MAIL_PORT = int(os.environ.get('MAIL_PORT', '465'))
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD')
    MAIL_DEFAULT_SENDER = os.environ.get('MAIL_DEFAULT_SENDER') or os.environ.get('MAIL_USERNAME')
    MAIL_USE_TLS = env_bool('MAIL_USE_TLS', False)
    MAIL_USE_SSL = env_bool('MAIL_USE_SSL', True)
    MAIL_TIMEOUT = int(os.environ.get('MAIL_TIMEOUT', '10'))
    MAIL_SUPPRESS_SEND = env_bool('MAIL_SUPPRESS_SEND', False)


def validate_runtime_config(app):
    """Fail fast for unsafe production configuration."""
    if app.config.get('TESTING'):
        return

    env = (app.config.get('ENV') or '').lower()
    if env != 'production':
        return

    secret_key = app.config.get('SECRET_KEY')
    if not secret_key or secret_key == 'dev-key-change-in-production':
        raise RuntimeError('SECRET_KEY must be configured with a non-default value in production.')

    database_uri = app.config.get('SQLALCHEMY_DATABASE_URI') or ''
    if not database_uri:
        raise RuntimeError('DATABASE_URL must be configured in production.')
    if '://root:' in database_uri or '://root@' in database_uri:
        raise RuntimeError('DATABASE_URL must not use the root database account in production.')
