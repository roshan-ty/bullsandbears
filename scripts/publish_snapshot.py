"""Publish one collector's fields without replacing another collector's updates."""
import argparse
import json
import subprocess
from pathlib import Path

NEWS_FIELDS = {'news'}
CORE_FIELDS = {'currencies', 'pairs', 'events', 'cot', 'cotHistory', 'history', 'prices', 'analysis', 'setups'}


def merge_snapshot(latest, collected, mode):
    owned = NEWS_FIELDS if mode == 'news' else CORE_FIELDS
    merged = {**latest, **{key: collected[key] for key in owned if key in collected}}
    health = {row['feed']: row for row in latest.get('feedHealth', [])}
    for row in collected.get('feedHealth', []):
        news_feed = row['feed'] == 'news' or row['feed'].startswith('http')
        if news_feed == (mode == 'news'):
            health[row['feed']] = row
    merged['feedHealth'] = list(health.values())
    merged['generatedAt'] = max(filter(None, [latest.get('generatedAt'), collected.get('generatedAt')]), default=None)
    return merged


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['news', 'core'])
    args = parser.parse_args()
    path = Path('public/data/snapshot.json')
    collected = json.loads(path.read_text(encoding='utf-8'))
    subprocess.run(['git', 'restore', '--', str(path)], check=True)
    subprocess.run(['git', 'fetch', 'origin', 'main'], check=True)
    subprocess.run(['git', 'merge', '--ff-only', 'origin/main'], check=True)
    latest = json.loads(path.read_text(encoding='utf-8'))
    merged = merge_snapshot(latest, collected, args.mode)
    from validate_snapshot import validate
    validate(merged)
    path.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    if subprocess.run(['git', 'diff', '--quiet', '--', str(path)]).returncode == 0:
        return
    subprocess.run(['git', 'add', str(path)], check=True)
    subprocess.run(['git', 'commit', '-m', f'data: refresh {args.mode}'], check=True)
    subprocess.run(['git', 'push', 'origin', 'HEAD:main'], check=True)


if __name__ == '__main__':
    main()