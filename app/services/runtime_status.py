import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import text

from app.extensions import db
from app.utils.frontend import frontend_dist_exists


PROJECT_ROOT = Path(__file__).resolve().parents[2]
RUNTIME_STATE_FILE = PROJECT_ROOT / 'instance' / 'runtime-status.json'

SERVICE_URLS = {
    'backend': 'http://127.0.0.1:5000',
    'web': 'http://localhost:3000',
    'mobile': 'http://127.0.0.1:3100',
}


def read_runtime_state(path: Path = RUNTIME_STATE_FILE) -> dict[str, Any]:
    if not path.exists():
        return {}

    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return {}


def database_status() -> str:
    try:
        db.session.execute(text('SELECT 1'))
    except Exception:
        return 'error'
    return 'ok'


def _client_service_status(name: str, state: dict[str, Any]) -> dict[str, Any]:
    stored = (state.get('services') or {}).get(name) or {}
    status = stored.get('status') or ('running' if stored.get('pid') else 'unknown')

    return {
        'status': status,
        'url': stored.get('url') or SERVICE_URLS[name],
        'pid': stored.get('pid'),
    }


def build_runtime_status(app, state: dict[str, Any] | None = None) -> dict[str, Any]:
    runtime_state = read_runtime_state() if state is None else state
    mode = app.config.get('ENV') or os.environ.get('FLASK_ENV') or 'development'

    return {
        'mode': mode,
        'started_at': runtime_state.get('started_at'),
        'checked_at': datetime.now(timezone.utc).isoformat(),
        'frontend_dist': 'ready' if frontend_dist_exists() else 'missing',
        'services': {
            'backend': {
                'status': 'running',
                'url': SERVICE_URLS['backend'],
                'pid': ((runtime_state.get('services') or {}).get('backend') or {}).get('pid'),
            },
            'database': {
                'status': database_status(),
            },
            'web': _client_service_status('web', runtime_state),
            'mobile': _client_service_status('mobile', runtime_state),
        },
    }
