"""Read public, server-rendered calendar facts without executing page scripts."""
import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta

try:
    from .public_feeds import request_bytes, number, stable_id
    from .indicator_registry import classify_indicator
except ImportError:
    from public_feeds import request_bytes, number, stable_id
    from indicator_registry import classify_indicator

SUPPLEMENTAL_CURRENCIES = {'HKD', 'HUF', 'NOK', 'PLN', 'SEK', 'SGD', 'TRY', 'ZAR', 'BRL', 'CZK', 'DKK', 'MXN'}
BASE = 'https://www.fxblue.com/calendar'


def page_objects(document):
    # React's streamed payload is JSON data. Never eval JavaScript or resolve
    # arbitrary references/URLs supplied by the document.
    chunks = []
    for match in re.finditer(r'self\.__next_f\.push\((.*?)\)</script>', document, re.S):
        try:
            chunks.extend(value for value in json.loads(match[1]) if isinstance(value, str))
        except (ValueError, TypeError):
            continue
    stream = ''.join(chunks)
    rows = []
    for match in re.finditer(r'\{"eventId":', stream):
        try:
            row, _ = json.JSONDecoder().raw_decode(stream[match.start():])
            if row.get('eventDateDetailId') and row.get('eventDateTime'):
                rows.append(row)
        except ValueError:
            continue
    return list({row['eventDateDetailId']: row for row in rows}.values())


def normalize(row):
    currency = str(row.get('currency', '')).upper()
    if currency not in SUPPLEMENTAL_CURRENCIES or not row.get('name'):
        return None
    try:
        date = datetime.fromisoformat(str(row['eventDateTime']).removeprefix('$D').replace('Z', '+00:00'))
        if date.tzinfo is None:
            return None
    except (KeyError, ValueError):
        return None
    potency = row.get('potency')
    if potency not in (None, 'ZERO', 'K', 'M', 'B', 'T'):
        return None
    multiplier = {'K': 1e3, 'M': 1e6, 'B': 1e9, 'T': 1e12}.get(potency, 1)
    values = {key: number(row.get(key)) for key in ('actual', 'previous', 'forecast')}
    if number(row.get('revisited')) is not None:
        values['previous'] = number(row['revisited'])
    occurred = date.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
    return {'id': stable_id('global', row['eventDateDetailId']), 'occurredAt': occurred,
            'currency': currency, 'country': row.get('country'), 'name': row['name'].strip(),
            'seriesKey': 'global:' + row['eventId'], 'sourceEventId': row['eventId'],
            'sourceDetailId': row['eventDateDetailId'], 'sourceUrl': detail_url(row),
            'unit': row.get('unit'), 'impact': str(row.get('importance', 'low')).lower(),
            **{key: value * multiplier if value is not None else None for key, value in values.items()}}


def detail_url(row):
    ids = [str(row.get(key, '')) for key in ('eventId', 'eventDateDetailId')]
    if not all(re.fullmatch(r'[a-fA-F0-9-]{36}', value) for value in ids):
        raise ValueError('Invalid calendar identity')
    return BASE + '/item/' + '/'.join(ids)


def fetch_details(row):
    try:
        document = request_bytes(detail_url(row), 'text/html').decode('utf-8')
        return page_objects(document)
    except Exception as error:
        logging.warning('Global calendar detail: %s', type(error).__name__)
        return []


def fetch_global_calendar(previous=(), now=None):
    now = now or datetime.now(timezone.utc)
    raw = page_objects(request_bytes(BASE, 'text/html').decode('utf-8'))
    if not raw:
        raise ValueError('Global calendar page has no release records')
    raw = [row for row in raw if row.get('currency') in SUPPLEMENTAL_CURRENCIES]
    known = {row.get('sourceDetailId'): row for row in previous if row.get('sourceDetailId')}
    # Explore a bounded set of known indicator pages. The public page links are
    # the discovery mechanism; no private endpoint or credentials are used.
    selected = {}
    for row in sorted(raw, key=lambda row: classify_indicator(row['name']).weight, reverse=True):
        rule = classify_indicator(row['name'])
        if rule.direction not in ('higher_is_bullish', 'lower_is_bullish'):
            continue
        bucket = selected.setdefault(row['currency'], {})
        if len(bucket) < 4 and row['eventId'] not in bucket:
            bucket[row['eventId']] = row
    recent_series = set()
    for item in previous:
        if item.get('actual') is None or item.get('previous') is None:
            continue
        try:
            date = datetime.fromisoformat(item['occurredAt'].replace('Z', '+00:00'))
            if now - timedelta(days=30) <= date <= now:
                recent_series.add(item.get('sourceEventId'))
        except (KeyError, ValueError, TypeError):
            continue
    detail_jobs = [row for bucket in selected.values() for row in bucket.values()
                   if row['eventId'] not in recent_series]
    historical = []
    extra_jobs = {}
    with ThreadPoolExecutor(max_workers=3) as pool:
        for details in pool.map(fetch_details, detail_jobs):
            for detail in details:
                raw.append(detail)
                candidates = []
                for past in detail.get('pastEvents', []):
                    occurred = str(past.get('dateTime', '')).removeprefix('$D')
                    try:
                        date = datetime.fromisoformat(occurred.replace('Z', '+00:00'))
                        if not now - timedelta(days=180) <= date <= now:
                            continue
                    except (ValueError, TypeError):
                        continue
                    item = {**detail, **past, 'eventDateTime': occurred,
                            'previous': past.get('previous'), 'revisited': None,
                            'forecast': past.get('consensus')}
                    historical.append(item)
                    prior = known.get(item['eventDateDetailId'], {})
                    if prior.get('actual') is None or prior.get('previous') is None:
                        candidates.append(item)
                # Actual and previous come from the dated release's own page.
                # Backfill the newest release only, not an inferred time shift.
                if candidates:
                    latest = max(candidates, key=lambda row: row['eventDateTime'])
                    extra_jobs[latest['eventDateDetailId']] = latest
        for details in pool.map(fetch_details, extra_jobs.values()):
            raw.extend(details)
    result = {}
    for row in [*historical, *raw]:
        item = normalize(row)
        if item:
            prior = result.get(item['id'], {})
            result[item['id']] = {**item, **prior, **{k: v for k, v in item.items() if v is not None}}
    return list(result.values())
