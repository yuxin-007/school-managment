import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-key-change-in-production')
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', 'mysql+pymysql://root:dtbsexk955@localhost/school_management')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    ENV = os.environ.get('FLASK_ENV', 'development')
    # Flask-WTF CSRF 配置
    WTF_CSRF_ENABLED = True  # 保持开启，但 API 蓝图会被豁免