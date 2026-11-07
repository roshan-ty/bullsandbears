"""Observed retail volume, options taker volume and point-in-time COT journal.

No inferred pre-collection history, trader identities or historical release dates.
Only aggregates are persisted. Missing evidence is never converted to zero.
"""
import math
import re
from datetime import datetime, timezone, timedelta
from lxml import html

RETAIL_URL = 'https://www.myfxbook.com/community/outlook'
OPTIONS_URL = 'https://www.deribit.com/api/v2/public/get_last_trades_by_currency'


def stamp(value):
    return value.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def moment(value):
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        raise ValueError('Observation requires a timezone')
    return parsed


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def retail_points(document, allowed, now):
    if len(document) > 8_000_000:
        raise ValueError('Retail document too large')
    tree = html.fromstring(document)
    points = {}
    for table in tree.xpath('//table'):
        headers = [' '.join(cell.text_content().split()) for cell in table.xpath('./thead/tr/th')]
        if headers != ['Symbol', 'Action', 'Percentage', 'Volume', 'Positions']:
            continue
        rows = [[' '.join(cell.text_content().split()) for cell in row.xpath('./td')] for row in table.xpath('./tbody/tr')]
        if len(rows) != 2 or len(rows[0]) != 5 or len(rows[1]) != 4:
            continue
        symbol = rows[0][0]
        if symbol not in allowed or rows[0][1] != 'Short' or rows[1][0] != 'Long':
            continue
        try:
            short, long = float(rows[0][2].removesuffix('%')), float(rows[1][1].removesuffix('%'))
            short_lots, long_lots = [float(value.removesuffix(' lots').replace(',', '')) for value in (rows[0][3], rows[1][2])]
            short_count, long_count = [int(value.replace(',', '')) for value in (rows[0][4], rows[1][3])]
            total = short_lots + long_lots
            if not all(math.isfinite(v) and v >= 0 for v in (short, long, short_lots, long_lots, short_count, long_count)) or total <= 0:
                continue
            if abs(short + long - 100) > 1 or abs(long - 100 * long_lots / total) > 1.5:
                continue
            # Published percentages are volume shares, NOT percentages of traders.
            share = 100 * long_lots / total
            points[symbol] = {'kind': 'retail', 'instrument': symbol, 'recordedAt': stamp(now),
                'expiresAt': stamp(now + timedelta(minutes=90)), 'score': (50 - share) / 50 if short_count + long_count >= 100 else None,
                'longPercent': share, 'shortPercent': 100 - share, 'longPositions': long_count, 'shortPositions': short_count,
                'longVolume': long_lots, 'shortVolume': short_lots, 'source': RETAIL_URL,
                'sample': 'Participating retail accounts; open-position volume. Upstream observation time is not published.'}
        except (ValueError, TypeError):
            continue
    if not points:
        raise ValueError('No validated retail aggregates')
    return list(points.values())


def options_point(payload, currency, now):
    result = payload.get('result', {})
    rows = result.get('trades')
    if not isinstance(rows, list):
        raise ValueError('Invalid options response')
    seen, accepted = set(), []
    for row in rows:
        identity = row.get('trade_id')
        name = row.get('instrument_name', '')
        if not identity or identity in seen or not re.fullmatch(currency + r'-\d{1,2}[A-Z]{3}\d{2}-[\d.]+-[CP]', name):
            continue
        seen.add(identity)
        amount, millis = row.get('amount'), row.get('timestamp')
        if not finite(amount) or amount <= 0 or not finite(millis) or row.get('direction') not in ('buy', 'sell'):
            continue
        # Combination legs / blocks need context unavailable in this aggregate.
        if row.get('combo_id') or row.get('block_trade_id') or row.get('block_rfq_id'):
            continue
        if not 0 <= now.timestamp() * 1000 - millis <= 3600_000:
            continue
        sign = (1 if name.endswith('-C') else -1) * (1 if row['direction'] == 'buy' else -1)
        accepted.append((amount, sign, millis))
    if not accepted:
        raise ValueError('No recent eligible options trades')
    total = sum(amount for amount, _, _ in accepted)
    supportive = sum(amount for amount, sign, _ in accepted if sign > 0)
    newest = datetime.fromtimestamp(max(t for _, _, t in accepted) / 1000, timezone.utc)
    return {'kind': 'options', 'instrument': currency + 'USD', 'recordedAt': stamp(now),
        'expiresAt': stamp(min(now + timedelta(minutes=90), newest + timedelta(hours=1))),
        'score': (2 * supportive / total - 1) if len(accepted) >= 20 and now - newest < timedelta(minutes=30) else None,
        'tradeCount': len(accepted), 'supportiveVolume': supportive, 'opposingVolume': total - supportive,
        'windowStart': stamp(datetime.fromtimestamp(min(t for _, _, t in accepted) / 1000, timezone.utc)),
        'windowEnd': stamp(newest), 'truncated': bool(result.get('has_more') and len(rows) >= 1000 and min(r.get('timestamp', 0) for r in rows) > (now.timestamp() - 3600) * 1000),
        'sample': 'Recent single-leg options; at most 1,000 returned trades within one hour. Base-coin volume, not delta exposure.',
        'source': OPTIONS_URL}


def cot_points(snapshot, now):
    from scripts.pipeline import mean_cot_score
    from scripts.pipeline import CURRENCIES
    cot = snapshot.get('cot', [])
    result = []
    for pair in snapshot.get('pairs', []):
        symbol = pair['symbol']
        if len(symbol) == 6 and symbol[:3] in CURRENCIES and symbol[3:] in CURRENCIES:
            legs = (symbol[:3], symbol[3:])
            base, quote = [mean_cot_score(cot, leg, now) for leg in legs]
            value = (base - quote) / 2 if base is not None and quote is not None else None
        else:
            legs = (symbol,)
            value = mean_cot_score(cot, symbol, now)
        if value is None:
            continue
        dates = [row['reportDate'] for row in cot if row['instrument'] in legs and row.get('normalizedScore') is not None]
        # Expire against the OLDEST required leg, not just the retrieval timestamp.
        expiry = min(datetime.fromisoformat(day[:10]).replace(tzinfo=timezone.utc) + timedelta(days=21) for day in dates)
        result.append({'kind': 'cot', 'instrument': symbol, 'recordedAt': stamp(now), 'expiresAt': stamp(expiry),
            'score': value, 'reportDate': min(dates), 'sample': 'Selected speculative futures categories; net / open interest. FX = (base − quote) / 2.'})
    return result


def retain(rows, now):
    """Keep actual first observations per time bucket; never average/backdate them."""
    kept = {}
    for row in sorted(rows, key=lambda r: r['recordedAt']):
        age = (now - moment(row['recordedAt'])).total_seconds()
        if not 0 <= age <= 1095 * 86400:
            continue
        width = 300 if age < 2 * 86400 else 3600 if age < 30 * 86400 else 86400
        identity = (row['instrument'], row['kind'], int(moment(row['recordedAt']).timestamp()) // width)
        kept.setdefault(identity, row)
    return sorted(kept.values(), key=lambda r: (r['recordedAt'], r['instrument'], r['kind']))


def collect(snapshot, now=None):
    from scripts.scraping import fetch_html
    from curl_cffi import requests
    now = now or datetime.now(timezone.utc)
    allowed = {row['symbol'] for row in snapshot['pairs']}
    current, health = [], []
    sources = [('retail-positioning', lambda: retail_points(fetch_html(RETAIL_URL), allowed, now))]
    for currency in ('BTC', 'ETH'):
        def fetch(currency=currency):
            response = requests.get(OPTIONS_URL, params={'currency': currency, 'kind': 'option', 'count': 1000, 'include_old': 'true', 'sorting': 'desc'}, timeout=25)
            response.raise_for_status()
            if len(response.content) > 2_000_000:
                raise ValueError('Options response too large')
            return [options_point(response.json(), currency, now)]
        sources.append(('options-positioning-' + currency, fetch))
    prior_health = {row['feed']: row for row in snapshot.get('feedHealth', [])}
    for name, fetch in sources:
        try:
            points = fetch()
            current.extend(points)
            health.append({'feed': name, 'status': 'healthy', 'lastAttemptAt': stamp(now), 'lastSuccessAt': stamp(now), 'staleAfterHours': 1.5, 'itemCount': len(points), 'message': 'Aggregate observations saved.'})
        except Exception:
            health.append({'feed': name, 'status': 'unavailable', 'lastAttemptAt': stamp(now), 'lastSuccessAt': prior_health.get(name, {}).get('lastSuccessAt'), 'staleAfterHours': 1.5, 'itemCount': 0, 'message': 'Collection unavailable. Saved observations retain their original timestamps.'})
    current.extend(cot_points(snapshot, now))
    previous = {(row['kind'], row['instrument']): row for row in snapshot.get('positioning', [])}
    previous.update({(row['kind'], row['instrument']): row for row in current})
    return {**snapshot, 'generatedAt': max(snapshot.get('generatedAt') or '', stamp(now)),
        'positioningUpdatedAt': stamp(now), 'positioning': list(previous.values()),
        'positioningHistory': retain([*snapshot.get('positioningHistory', []), *current], now),
        'feedHealth': health}


def validate_points(rows):
    for row in rows:
        if row.get('kind') not in ('retail', 'options', 'cot') or not re.fullmatch(r'[A-Z0-9]{3,12}', row.get('instrument', '')):
            raise ValueError('Invalid positioning identity')
        if moment(row['expiresAt']) < moment(row['recordedAt']):
            raise ValueError('Expired new observation')
        value = row.get('score')
        if value is not None and (not finite(value) or not -1 <= value <= 1):
            raise ValueError('Invalid positioning signal')
        if row['kind'] == 'retail':
            if not all(finite(row.get(k)) and row[k] >= 0 for k in ('longPercent','shortPercent','longVolume','shortVolume','longPositions','shortPositions')) or abs(row['longPercent'] + row['shortPercent'] - 100) > 1e-6:
                raise ValueError('Invalid retail aggregate')
        if row['kind'] == 'options':
            if not all(finite(row.get(k)) and row[k] >= 0 for k in ('tradeCount','supportiveVolume','opposingVolume')) or moment(row['windowEnd']) > moment(row['recordedAt']) or moment(row['windowStart']) > moment(row['windowEnd']):
                raise ValueError('Invalid options aggregate')
