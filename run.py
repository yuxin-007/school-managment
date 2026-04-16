import os
os.environ.setdefault('FLASK_ENV', 'production')

from app import create_app
from waitress import serve

app = create_app()

print("\n==> School Management System Started")
print("==> Frontend: http://localhost:3000")
print("==> Backend:  http://127.0.0.1:5000\n")

if __name__ == '__main__':
    serve(app, host='127.0.0.1', port=5000)