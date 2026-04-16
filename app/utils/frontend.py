from pathlib import Path

from flask import current_app, send_from_directory


PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIST_DIR = PROJECT_ROOT / 'frontend' / 'dist'


def frontend_dist_exists() -> bool:
    return FRONTEND_DIST_DIR.exists() and (FRONTEND_DIST_DIR / 'index.html').exists()


def serve_frontend_index():
    return send_from_directory(FRONTEND_DIST_DIR, 'index.html')


def serve_frontend_asset(filename: str):
    return send_from_directory(FRONTEND_DIST_DIR, filename)
