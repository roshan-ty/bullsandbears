"""Publish one collector's fields without replacing another collector's updates."""
import argparse
import json
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

POSITIONING_FIELDS = {'positioning', 'positioningHistory', 'positioningUpdatedAt'}
NEWS_FIELDS = {'news', 'newsUpdatedAt'}
CALENDAR_FIELDS = {'events', 'currencies', 'pairs', 'analysis', 'setups', 'calendarUpdatedAt'}
CORE_FIELDS = {'scoreHistory', 'methodology', 'currencies', 'pairs', 'events', 'cot', 'cotHistory', 'history', 'prices', 'analysis', 'setups', 'coreUpdatedAt', 'researchUpdatedAt', 'cryptoHistory', 'cryptoFundamentals'}


def merge_snapshot(latest, collected, mode):
    owned = POSITIONING_FIELDS if mode == 'positioning' else NEWS_FIELDS if mode == 'news' else CALENDAR_FIELDS if mode == 'calendar' else CORE_FIELDS | {'calendarUpdatedAt'}
    merged = {**latest, **{key: collected[key] for key in owned if key in collected}}
    health = {row['feed']: row for row in latest.get('feedHealth', [])}
    health.pop('https://www.bea.gov/news/rss.xml', None)
    for row in collected.get('feedHealth', []):
        news_feed = row['feed'] == 'news' or row['feed'].startswith('http')
        calendar_feed = row['feed'].startswith('calendar')
        positioning_feed = '-positioning' in row['feed']
        if (mode == 'positioning' and positioning_feed) or (not positioning_feed and mode != 'positioning' and ((mode == 'calendar' and calendar_feed) or (mode != 'calendar' and news_feed == (mode == 'news')))):
            health[row['feed']] = row
    if mode == 'core' and ('scoreHistory' in latest or 'scoreHistory' in collected):
        def key(row):
            return (row['instrument'], row['horizon'], row['recordedAt'], row['modelVersion'])
        journal = {key(row): row for row in collected.get('scoreHistory', [])}
        # A record already published on the branch wins any same-timestamp race.
        journal.update({key(row): row for row in latest.get('scoreHistory', [])})
        stamp = max(filter(None, [latest.get('generatedAt'), collected.get('generatedAt')]), default=None)
        if stamp:
            cutoff = (datetime.fromisoformat(stamp.replace('Z', '+00:00')) - timedelta(days=1095)).date().isoformat()
            journal = {identity: row for identity, row in journal.items() if cutoff <= row['recordedAt'][:10] <= stamp[:10]}
        merged['scoreHistory'] = sorted(journal.values(), key=lambda row: (datetime.fromisoformat(row['recordedAt'].replace('Z', '+00:00')), row['instrument'], row['horizon']))
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
