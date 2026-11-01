#!/usr/bin/env python3
"""Create an independent application from this shell without local state."""
import argparse
from pathlib import Path
import re
import shutil


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--name', required=True, help='Lowercase project slug, e.g. engine-bench')
    parser.add_argument('--title', help='Display name, e.g. Engine Bench')
    parser.add_argument('--backend-port', type=int, default=8002)
    parser.add_argument('--frontend-port', type=int, default=5175)
    parser.add_argument('--mail-port', type=int, default=8027)
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z][a-z0-9]*(?:-[a-z0-9]+)*', args.name):
        parser.error('--name must be a lowercase hyphen-separated project slug')
    title = args.title or args.name.replace('-', ' ').title()
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9 _-]*', title):
        parser.error('--title must contain letters, numbers, spaces, underscores or hyphens')
    ports = [args.backend_port, args.frontend_port, args.mail_port]
    if len(set(ports)) != 3 or not all(1024 <= port <= 65535 for port in ports):
        parser.error('ports must be distinct and between 1024 and 65535')
    source = Path(__file__).resolve().parents[1]
    destination = args.destination.resolve()
    if source == destination or source in destination.parents:
        parser.error('destination must be outside the template directory')
    if destination.exists() and (not destination.is_dir() or any(destination.iterdir())):
        parser.error('destination must be absent or an empty directory')
    source_env = (source / '.env.example').read_text()
    source_slug = re.search(r'^COMPOSE_PROJECT_NAME=(.+)$', source_env, re.M).group(1)
    source_title = re.search(r'^APP_NAME="(.+)"$', source_env, re.M).group(1)
    source_db = source_slug.replace('-', '_')
    port_changes = {
        re.search(r'^'+key+r'=(\d+)$', source_env, re.M).group(1): str(value)
        for key, value in [('BACKEND_PORT', args.backend_port), ('FRONTEND_PORT', args.frontend_port), ('MAIL_UI_PORT', args.mail_port)]
    }
    omitted = {'.git', '.idea', '.vscode', 'node_modules', 'vendor', 'dist', 'dist-ssr',
               '__pycache__', '.phpunit.cache', '.phpunit.result.cache', '.DS_Store'}

    def ignore(directory, names):
        relative = Path(directory).relative_to(source)
        skipped = []
        for name in names:
            if name in omitted or (name.startswith('.env') and name != '.env.example'):
                skipped.append(name)
            elif name.endswith(('.log', '.tsbuildinfo')):
                skipped.append(name)
            elif relative == Path('backend/bootstrap/cache') and name != '.gitignore':
                skipped.append(name)
            elif Path('backend/storage') in relative.parents or relative == Path('backend/storage'):
                if (Path(directory) / name).is_file() and name != '.gitignore':
                    skipped.append(name)
                elif name not in {'app', 'private', 'public', 'framework', 'cache', 'data',
                                  'sessions', 'testing', 'views', 'logs', '.gitignore'}:
                    skipped.append(name)
        return skipped

    shutil.copytree(source, destination, ignore=ignore, dirs_exist_ok=True)
    # Composer's package name and lockfile remain generic to preserve their content hash.
    for file in destination.rglob('*'):
        if not file.is_file() or file.name in {'composer.json', 'composer.lock', 'create-project.py'}:
            continue
        text = file.read_text()
        text = text.replace(source_title, title).replace(source_slug, args.name).replace(source_db, args.name.replace('-', '_'))
        text = re.sub(r'(?<!\d)(?:'+ '|'.join(port_changes) + r')(?!\d)', lambda match: port_changes[match.group()], text)
        file.write_text(text)
    print(f'Created {title} at {destination}')
    print('Run ./scripts/setup.sh in the new project to install dependencies and start the backend.')


if __name__ == '__main__':
    main()
