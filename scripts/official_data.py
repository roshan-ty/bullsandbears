"""Bounded official reference observations, separate from release surprises."""
import json
import math
import ssl
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone

ECB_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml'
BOC_URL = 'https://www.bankofcanada.ca/valet/observations/V39079/json?recent=750'


def read_public(url):
    context = ssl.create_default_context()
    try:
        import certifi
        context.load_verify_locations(certifi.where())
    except ImportError:
        pass
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'Bulls-Bears-Research/2.0', 'Accept': 'application/json,application/xml,text/xml'})
            with urllib.request.urlopen(request, timeout=20, context=context) as response:
                body = response.read(4_000_001)
            if len(body) > 4_000_000:
                raise ValueError('Reference response too large')
            return body
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise
            time.sleep(2 ** attempt)


def number(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None


def parse_policy(payload, now):
    series = payload.get('seriesDetail', {}).get('V39079', {})
    if 'overnight' not in series.get('label', '').lower():
        raise ValueError('Unexpected policy series')
    rows = {}
    for item in payload.get('observations', []):
        try:
            day = date.fromisoformat(item['d'])
        except (ValueError, KeyError, TypeError):
            continue
        value = number(item.get('V39079', {}).get('v'))
        if value is None or not -5 <= value <= 100 or not now.date() - timedelta(days=1100) <= day <= now.date():
            continue
        rows[day.isoformat()] = {'seriesId': 'boc:policy-rate:CAD', 'instrument': 'CAD',
            'name': 'Policy rate · business daily', 'date': day.isoformat(), 'period': day.isoformat(),
            'frequency': 'daily', 'value': value, 'unit': '%', 'retrievedAt': now.isoformat(),
            'releaseDateKnown': False, 'sourceUrl': BOC_URL.split('?')[0]}
    if not rows:
        raise ValueError('No valid policy observations')
    return sorted(rows.values(), key=lambda row: row['date'])


def parse_reference_prices(body, instruments, now):
    if b'<!DOCTYPE' in body.upper() or b'<!ENTITY' in body.upper():
        raise ValueError('Unexpected XML declaration')
    daily = {}
    for cube in ET.fromstring(body).iter():
        if 'time' not in cube.attrib:
            continue
        try:
            day = date.fromisoformat(cube.attrib['time'])
        except ValueError:
            continue
        if not now.date() - timedelta(days=100) <= day <= now.date():
            continue
        rates = {'EUR': 1.0}
        for row in cube:
            currency, value = row.attrib.get('currency', ''), number(row.attrib.get('rate'))
            if len(currency) == 3 and currency.isalpha() and value is not None and value > 0:
                rates[currency] = value
        if len(rates) > 1:
            daily[day.isoformat()] = rates
    if not daily:
        raise ValueError('No valid reference rates')
    output = []
    for instrument in instruments:
        base, quote = instrument[:3], instrument[3:]
        points = [(day, rates[quote] / rates[base]) for day, rates in sorted(daily.items())
                  if len(instrument) == 6 and base in rates and quote in rates]
        if not points:
            continue
        day, value = points[-1]
        prior = points[-2][1] if len(points) > 1 else None
        output.append({'instrument': instrument, 'price': value, 'previousClose': prior,
            'change': value - prior if prior is not None else None,
            'changePercent': (value / prior - 1) * 100 if prior else None,
            'asOf': day + 'T00:00:00Z', 'referenceDate': day, 'timePrecision': 'day',
            'priceKind': 'Daily reference rate', 'priceUnit': quote + ' per ' + base,
            'delayNotice': 'Daily reference rate; not an executable market quote.',
            'retrievedAt': now.isoformat(), 'source': 'ECB', 'sourceUrl': ECB_URL})
    return output


def supplement(previous, prices, history, health, instruments, now):
    """A failed source never destroys saved rows or advances its success time."""
    history_map = {(row['seriesId'], row['date']): row for row in history}
    price_map = {row['instrument']: row for row in prices}
    jobs = [('official-policy', lambda: parse_policy(json.loads(read_public(BOC_URL)), now)),
            ('official-reference', lambda: parse_reference_prices(read_public(ECB_URL), instruments, now))]
    for name, fetch in jobs:
        prior = health.get(name, {})
        try:
            rows = fetch()
            if not rows:
                raise ValueError('Empty reference collection')
            if name == 'official-policy':
                history_map.update({(row['seriesId'], row['date']): row for row in rows})
            else:
                for row in rows:
                    old = price_map.get(row['instrument'])
                    # Use the independent daily reference only when market quotes
                    # are absent or older. Never replace a same-day market quote.
                    if not old or str(old.get('asOf', ''))[:10] < row['referenceDate']:
                        price_map[row['instrument']] = row
            latest = max(row.get('referenceDate', row.get('date')) for row in rows)
            observed = datetime.combine(date.fromisoformat(latest), datetime.min.time(), tzinfo=timezone.utc)
            fresh = 0 <= (now - observed).total_seconds() <= 96 * 3600
            health[name] = {'feed': name, 'status': 'healthy' if fresh else 'degraded', 'itemCount': len(rows),
                'lastAttemptAt': now.isoformat(), 'lastSuccessAt': observed.isoformat(),
                'staleAfterHours': 96, 'message': 'Reference observations collected.' if fresh else 'Source observations are stale; observation dates are preserved.'}
        except Exception as error:
            health[name] = {**prior, 'feed': name, 'status': 'degraded', 'itemCount': 0,
                'lastAttemptAt': now.isoformat(), 'lastSuccessAt': prior.get('lastSuccessAt'),
                'staleAfterHours': 96, 'message': type(error).__name__}
    return list(price_map.values()), list(history_map.values())
