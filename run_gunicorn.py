# Gunicorn 启动脚本 (生产环境)
# 运行: gunicorn -w 4 -b 0.0.0.0:5000 run:app
import os
os.environ.setdefault('FLASK_ENV', 'production')

from app import create_app
app = create_app()