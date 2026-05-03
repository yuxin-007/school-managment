import argparse
import json
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parent
RUNTIME_STATE_FILE = PROJECT_ROOT / 'instance' / 'runtime-status.json'

SERVICE_URLS = {
    'backend': 'http://127.0.0.1:5000',
    'web': 'http://localhost:3000',
    'mobile': 'http://127.0.0.1:3100',
}


def npm_command() -> str:
    return 'npm.cmd' if os.name == 'nt' else 'npm'


def resolve_dev_services(include_web: bool, include_mobile: bool) -> list[str]:
    services = ['backend']
    if include_web:
        services.append('web')
    if include_mobile:
        services.append('mobile')
    return services


def build_runtime_state(mode: str, service_pids: dict[str, int | None]) -> dict[str, Any]:
    services: dict[str, dict[str, Any]] = {}
    for name, url in SERVICE_URLS.items():
        pid = service_pids.get(name)
        services[name] = {
            'status': 'running' if pid else 'stopped',
            'url': url,
            'pid': pid,
        }

    return {
        'mode': mode,
        'started_at': datetime.now(timezone.utc).isoformat(),
        'services': services,
    }


def write_runtime_state(state: dict[str, Any]) -> None:
    RUNTIME_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    RUNTIME_STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')


def read_runtime_state() -> dict[str, Any]:
    if not RUNTIME_STATE_FILE.exists():
        return {}
    try:
        return json.loads(RUNTIME_STATE_FILE.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return {}


def mark_runtime_stopped() -> None:
    state = read_runtime_state()
    if not state:
        return
    for service in (state.get('services') or {}).values():
        service['status'] = 'stopped'
        service['pid'] = None
    write_runtime_state(state)


def service_command(name: str) -> tuple[list[str], Path]:
    if name == 'backend':
        return [
            sys.executable,
            '-m',
            'waitress',
            '--listen=0.0.0.0:5000',
            'wsgi:app',
        ], PROJECT_ROOT
    if name == 'web':
        return [
            npm_command(),
            'run',
            'dev',
            '--',
            '--host',
            '127.0.0.1',
            '--port',
            '3000',
        ], PROJECT_ROOT / 'frontend'
    if name == 'mobile':
        return [npm_command(), 'run', 'dev'], PROJECT_ROOT / 'mobile'
    raise ValueError(f'Unknown service: {name}')


def start_services(service_names: list[str]) -> dict[str, subprocess.Popen]:
    processes = {}
    for service_name in service_names:
        command, cwd = service_command(service_name)
        print(f'==> Starting {service_name}: {" ".join(command)}')
        processes[service_name] = subprocess.Popen(command, cwd=cwd)
    return processes


def terminate_process_tree(pid: int) -> None:
    if os.name == 'nt':
        subprocess.run(['taskkill', '/PID', str(pid), '/T', '/F'], check=False)
        return
    os.kill(pid, signal.SIGTERM)


def serve_backend(mode: str = 'development') -> None:
    os.environ['FLASK_ENV'] = mode

    from app import create_app
    from waitress import serve

    app = create_app()
    write_runtime_state(build_runtime_state(mode=mode, service_pids={'backend': os.getpid()}))
    print('==> Backend: http://0.0.0.0:5000')
    serve(app, host='0.0.0.0', port=5000)


def command_backend(_args: argparse.Namespace) -> int:
    serve_backend('development')
    return 0


def command_dev(args: argparse.Namespace) -> int:
    include_web = args.web or args.all or not args.mobile
    include_mobile = args.mobile or args.all
    services = resolve_dev_services(include_web=include_web, include_mobile=include_mobile)
    processes = start_services(services)
    write_runtime_state(build_runtime_state('development', {name: process.pid for name, process in processes.items()}))

    print('\n==> School Management System started')
    print('==> Backend: http://127.0.0.1:5000')
    if 'web' in services:
        print('==> Web:     http://localhost:3000')
    if 'mobile' in services:
        print('==> App:     http://127.0.0.1:3100')
    print('==> Press Ctrl+C to stop all managed services.\n')

    try:
        while True:
            exited = [name for name, process in processes.items() if process.poll() is not None]
            if exited:
                print(f'==> Service exited: {", ".join(exited)}')
                return 1
            time.sleep(1)
    except KeyboardInterrupt:
        print('\n==> Stopping managed services...')
        return 0
    finally:
        for process in processes.values():
            if process.poll() is None:
                terminate_process_tree(process.pid)
        mark_runtime_stopped()


def command_build(args: argparse.Namespace) -> int:
    targets = ['web', 'mobile'] if args.target == 'all' else [args.target]
    for target in targets:
        cwd = PROJECT_ROOT / ('frontend' if target == 'web' else 'mobile')
        subprocess.run([npm_command(), 'run', 'build'], cwd=cwd, check=True)
    return 0


def command_serve(_args: argparse.Namespace) -> int:
    serve_backend('production')
    return 0


def command_status(_args: argparse.Namespace) -> int:
    try:
        with urllib.request.urlopen(f'{SERVICE_URLS["backend"]}/api/runtime/status', timeout=2) as response:
            print(response.read().decode('utf-8'))
            return 0
    except (OSError, urllib.error.URLError):
        state = read_runtime_state()
        print(json.dumps(state or {'services': {}, 'message': 'backend is not reachable'}, ensure_ascii=False, indent=2))
        return 1


def command_stop(_args: argparse.Namespace) -> int:
    state = read_runtime_state()
    services = state.get('services') or {}
    for service in services.values():
        pid = service.get('pid')
        if pid:
            terminate_process_tree(int(pid))
    mark_runtime_stopped()
    print('==> Managed runtime state marked as stopped.')
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description='School Management unified launcher')
    subparsers = parser.add_subparsers(dest='command', required=True)

    backend_parser = subparsers.add_parser('backend', help='start backend only')
    backend_parser.set_defaults(func=command_backend)

    dev_parser = subparsers.add_parser('dev', help='start synchronized development services')
    dev_parser.add_argument('--web', action='store_true', help='start backend and web client')
    dev_parser.add_argument('--mobile', action='store_true', help='start backend and app client')
    dev_parser.add_argument('--all', action='store_true', help='start backend, web, and app clients')
    dev_parser.set_defaults(func=command_dev)

    build_parser_command = subparsers.add_parser('build', help='build web or app assets')
    build_parser_command.add_argument('target', choices=['web', 'mobile', 'all'])
    build_parser_command.set_defaults(func=command_build)

    serve_parser = subparsers.add_parser('serve', help='serve production backend and built web assets')
    serve_parser.set_defaults(func=command_serve)

    status_parser = subparsers.add_parser('status', help='print synchronized runtime status')
    status_parser.set_defaults(func=command_status)

    stop_parser = subparsers.add_parser('stop', help='stop services recorded by the launcher')
    stop_parser.set_defaults(func=command_stop)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == '__main__':
    raise SystemExit(main())
