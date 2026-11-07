"""Validate and publish the free edition from compressed collector state."""
import argparse
import gzip
import hashlib
import json
import re
import tempfile
from pathlib import Path
from . import pipeline
from .asset_models import CRYPTO
from .validate_snapshot import validate

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / 'data' / 'state.json.gz'
PUBLIC = ROOT / 'public' / 'data' / 'snapshot.json'
HIDDEN = {'source', 'sourceUrl', 'sourceEventId', 'provider', 'providerUrl', 'reference',
          'ticker', 'url', 'bars', 'context', 'cotEvidence', 'positioningEvidence',
          'sourceValues', 'sourceSeriesId', 'sourceDetailId', 'sourcePeriod'}
PROVIDERS = re.compile(r'Yahoo(?: Finance)?|Forex Factory|Fair Economy|CoinMetrics|Coin Metrics|CoinGecko|Coinbase|Binance|Myfxbook|Deribit|DefiLlama|DeFi Llama|GDELT|World Bank|FRED|OECD|BIS|CFTC|Bank of Canada|ECB', re.I)


def neutral(value, field=''):
    if isinstance(value, dict):
        return {key: neutral(item, key) for key, item in value.items() if key not in HIDDEN}
    if isinstance(value, list):
        return [neutral(item, field) for item in value]
    if isinstance(value, str):
        if field in {'id', 'eventId', 'seriesKey'}:
            return hashlib.sha256(value.encode()).hexdigest()[:24]
        return PROVIDERS.sub('market research', value)
    return value


def project(full):
    output = {key: full.get(key) for key in ('schemaVersion', 'generatedAt', 'coreUpdatedAt', 'calendarUpdatedAt')}
    for key in ('currencies', 'pairs', 'events', 'prices', 'analysis'):
        output[key] = neutral([row for row in full.get(key, [])
                               if row.get('instrument', row.get('symbol', row.get('currency'))) not in CRYPTO])
    for key in ('cot', 'cotHistory', 'history', 'scoreHistory', 'cryptoHistory', 'cryptoFundamentals',
                'positioning', 'positioningHistory', 'news', 'setups'):
        output[key] = []
    output['feedHealth'] = [{**row, 'feed': f'Collection {index + 1:02}',
        'message': 'Collection completed.' if row['status'] == 'healthy' else 'Some observations are unavailable. Saved observations are retained.'}
        for index, row in enumerate(full.get('feedHealth', []))
        if not str(row.get('feed', '')).startswith(('crypto', 'http', 'news'))]
    validate(output)
    return output


def atomic_bytes(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_name(path.name + '.tmp')
    pending.write_bytes(content)
    pending.replace(path)


def read_state(state=STATE, public=PUBLIC):
    if state.exists():
        with gzip.open(state, 'rb') as stream:
            content = stream.read(150_000_001)
        if len(content) > 150_000_000:
            raise ValueError('Collector state exceeds limit')
        full = json.loads(content)
    else:
        full = json.loads(public.read_text(encoding='utf-8')) if public.exists() else pipeline.existing_snapshot()
    full.setdefault('feedHealth', [])
    validate(full)
    return full


def refresh(mode, state=STATE, public=PUBLIC):
    full = read_state(state, public)
    if mode != 'project':
        # The existing collector writes here. Its intermediate full payload must
        # never replace the website's last good snapshot until validation passes.
        with tempfile.TemporaryDirectory(prefix='market-state-') as temporary:
            working = Path(temporary) / 'snapshot.json'
            pipeline.atomic_json(working, full)
            original = pipeline.PUBLIC_SNAPSHOT
            try:
                pipeline.PUBLIC_SNAPSHOT = working
                (pipeline.run_core if mode == 'core' else pipeline.run_calendar)()
                full = json.loads(working.read_text(encoding='utf-8'))
            finally:
                pipeline.PUBLIC_SNAPSHOT = original
    validate(full)
    free = project(full)
    encoded = json.dumps(full, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode()
    # State is shared market data only. No credentials or personal journal input
    # are accepted by this entry point; credentials remain Actions environment secrets.
    atomic_bytes(state, gzip.compress(encoded, compresslevel=9, mtime=0))
    atomic_bytes(public, json.dumps(free, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode())
    print(f'Published {len(free["pairs"])} markets, {len(free["events"])} calendar records; {public.stat().st_size} bytes.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['core', 'calendar', 'project'])
    args = parser.parse_args()
    refresh(args.mode)
