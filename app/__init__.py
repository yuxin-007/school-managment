from flask import Flask, jsonify
from flask_login import current_user
from flask_wtf.csrf import CSRFError

from app.blueprints import announcement, assignment, attendance, auth, course, grade, leave, log, main, notification, organization, user
from app.config import Config, validate_runtime_config
from app.extensions import cors, csrf, db, login_manager, migrate


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)
    validate_runtime_config(app)

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

    @app.errorhandler(CSRFError)
    def handle_csrf_error(error):
        return jsonify({'success': False, 'message': error.description or 'CSRF 验证失败，请刷新页面后重试'}), 400

    cors.init_app(
        app,
        supports_credentials=True,
        origins=[
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:3100',
            'http://127.0.0.1:3100',
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

        return db.session.get(User, int(user_id))

    for blueprint in [
        auth.bp,
        main.bp,
        organization.bp,
        user.bp,
        leave.bp,
        course.bp,
        assignment.bp,
        log.bp,
        announcement.bp,
        notification.bp,
        attendance.bp,
        grade.bp,
    ]:
        app.register_blueprint(blueprint)

    from app import models  # noqa: F401

    return app
