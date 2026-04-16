from datetime import datetime

from flask import Flask, jsonify
from flask_login import current_user

from app.blueprints import announcement, attendance, auth, course, grade, leave, log, main, notification, organization, user
from app.config import Config
from app.extensions import cors, csrf, db, login_manager, migrate


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    login_manager.init_app(app)
    migrate.init_app(app, db)
    csrf.init_app(app)
    login_manager.login_view = None
    login_manager.login_message = '请先登录'
    login_manager.login_message_category = 'warning'

    @login_manager.unauthorized_handler
    def unauthorized():
        return jsonify({'success': False, 'message': '请先登录'}), 401

    cors.init_app(
        app,
        supports_credentials=True,
        origins=[
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:5173',
            'http://127.0.0.1:5173',
        ],
    )

    @app.before_request
    def set_user_language():
        app._current_user_lang = 'zh-CN'
        try:
            if current_user.is_authenticated:
                app._current_user_lang = current_user.language or 'zh-CN'
        except Exception:
            pass

    @login_manager.user_loader
    def load_user(user_id):
        from app.models import User

        return User.query.get(int(user_id))

    for blueprint in [
        auth.bp,
        main.bp,
        organization.bp,
        user.bp,
        leave.bp,
        course.bp,
        log.bp,
        announcement.bp,
        notification.bp,
        attendance.bp,
        grade.bp,
    ]:
        app.register_blueprint(blueprint)
        csrf.exempt(blueprint)

    @app.template_global()
    def now():
        return datetime.now()

    @app.template_global()
    def t(key):
        return key

    @app.context_processor
    def inject_globals():
        lang = getattr(app, '_current_user_lang', 'zh-CN')
        return {
            'page_lang': lang,
            't': lambda key: t(key),
        }

    with app.app_context():
        from app import models  # noqa: F401

        db.create_all()

    return app
