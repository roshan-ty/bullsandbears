"""Run real collectors in an isolated project directory and record coverage, never fixtures."""
import json
import os
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def main():
    from scripts import pipeline
    from scripts.price_charts import fetch_chart
    from scripts.runtime import load_env
    from scripts.validate_snapshot import validate
    import yfinance as yf
    load_env(ROOT)
    work = ROOT / 'data/private' / ('source-audit-' + str(time.time_ns()))
    work.mkdir(parents=True)
    print('Audit directory: ' + str(work), flush=True)
    shutil.copyfile(ROOT / 'public/data/snapshot.json', work / 'snapshot.json')
    pipeline.PUBLIC_SNAPSHOT = work / 'snapshot.json'
    pipeline.STAGING = work / 'staging'
    pipeline.STAGING.mkdir()
    yf.set_tz_cache_location(str(work / 'cache'))
    os.environ['REFRESH_RESEARCH'] = 'true'
    pipeline.run_core()
    print('Core collection completed.', flush=True)
    pipeline.run_news()
    snapshot = json.loads(pipeline.PUBLIC_SNAPSHOT.read_text(encoding='utf-8'))
    validate(snapshot)
    probes = []
    for symbol in ('EURUSD', 'BTCUSD', 'XAUUSD', 'US500'):
        try:
            chart = fetch_chart(symbol, '5m')
            (work / (symbol + '-5m.json')).write_text(json.dumps(chart, allow_nan=False), encoding='utf-8')
            probes.append({'instrument': symbol, 'bars': len(chart['bars']), 'asOf': chart['asOf'], 'status': 'healthy'})
        except Exception as error:
            probes.append({'instrument': symbol, 'status': 'unavailable', 'error': type(error).__name__})
    events = snapshot['events']
    now = datetime.now(timezone.utc).isoformat()
    expected = set(pipeline.PAIRS) | set(pipeline.NON_FX_MODELS)
    covered = {row['instrument'] for row in snapshot['prices'] if row.get('bars')}
    report = {'collectedAt': now, 'calendar': {'events': len(events), 'actuals': sum(row['actual'] is not None for row in events),
        'forecasts': sum(row['forecast'] is not None for row in events), 'previous': sum(row['previous'] is not None for row in events)},
        'dailyCharts': {'covered': len(covered), 'expected': len(expected), 'missing': sorted(expected - covered)},
        'intradayProbes': probes, 'feeds': snapshot['feedHealth']}
    (work / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2), flush=True)


if __name__ == '__main__':
    main()
