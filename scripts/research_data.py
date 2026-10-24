"""Free macro histories and crypto network data, with per-source failure isolation."""
import csv
import io
import json
import math
import urllib.parse
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta

AREAS = dict(zip('US XM GB AU NZ CA JP CH CN HK HU NO PL SE SG TR ZA BR CZ DK MX'.split(),
                 'USD EUR GBP AUD NZD CAD JPY CHF CNY HKD HUF NOK PLN SEK SGD TRY ZAR BRL CZK DKK MXN'.split()))
WB_AREAS = {**AREAS, 'XC': 'EUR'}
ASSETS = {'btc': 'BTCUSD', 'eth': 'ETHUSD', 'ltc': 'LTCUSD', 'xrp': 'XRPUSD', 'xlm': 'XLMUSD', 'sol': 'SOLUSD', 'avax': 'AVAXUSD', 'sui': 'SUIUSD'}
CHAINS = {'Ethereum': 'ETHUSD', 'Solana': 'SOLUSD', 'Avalanche': 'AVAXUSD', 'Sui': 'SUIUSD', 'XRPL': 'XRPUSD', 'Stellar': 'XLMUSD'}
METRICS = {'AdrActCnt': ('Active addresses', 'addresses', 'usage'), 'TxCnt': ('Transactions', 'transactions', 'usage'),
           'FeeTotNtv': ('Network fees', 'native units', 'fees'), 'SplyCur': ('Current supply', 'native units', 'supply')}


def get_bytes(url, limit=20_000_000):
    request = urllib.request.Request(url, headers={'User-Agent': 'Bulls-Bears-Fundamentals/2.0', 'Accept': 'application/json,text/csv,*/*'})
    with urllib.request.urlopen(request, timeout=35) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError('Response exceeds collector limit')
    return data


def get_json(url):
    return json.loads(get_bytes(url))


def numeric(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None


def parse_bis(body, kind, retrieved):
    output = {}
    with zipfile.ZipFile(io.BytesIO(body)) as archive:
        members = [entry for entry in archive.infolist() if entry.filename.endswith('.csv')]
        if sum(entry.file_size for entry in members) > 600_000_000:
            raise ValueError('BIS archive exceeds expanded limit')
        for member in members:
            with archive.open(member) as stream:
                for index, row in enumerate(csv.DictReader(io.TextIOWrapper(stream, encoding='utf-8-sig'))):
                    if index > 2_000_000:
                        raise ValueError('BIS record limit exceeded')
                    if not row.get('FREQ:Frequency', '').startswith('M:'):
                        continue
                    area = row.get('REF_AREA:Reference area', '').split(':')[0]
                    period = row.get('TIME_PERIOD:Time period or range', '')
                    value = numeric(row.get('OBS_VALUE:Observation Value'))
                    if area not in AREAS or len(period) != 7 or period < '2000-01' or value is None:
                        continue
                    if kind == 'inflation' and not row.get('UNIT_MEASURE:Unit of measure', '').startswith('771:'):
                        continue
                    series = f'bis:{kind}:{area}'
                    output[(series, period)] = {'seriesId': series, 'instrument': AREAS[area],
                        'name': 'Policy rate · monthly end-period' if kind == 'policy-rate' else 'Consumer inflation · year over year',
                        'date': period + '-01', 'period': period, 'frequency': 'monthly', 'value': value,
                        'unit': '%', 'retrievedAt': retrieved, 'releaseDateKnown': False,
                        'sourceUrl': 'https://data.bis.org/topics/CBPOL' if kind == 'policy-rate' else 'https://data.bis.org/topics/CPI'}
    if not output:
        raise ValueError('No mapped monthly observations')
    return list(output.values())


def fetch_bis(kind, now):
    code = 'WS_CBPOL' if kind == 'policy-rate' else 'WS_LONG_CPI'
    return parse_bis(get_bytes(f'https://data.bis.org/static/bulk/{code}_csv_flat.zip'), kind, now.isoformat())


def fetch_worldbank(indicator, now):
    countries = ';'.join('EMU' if area == 'XM' else area for area in AREAS)
    url = f'https://api.worldbank.org/v2/country/{countries}/indicator/{indicator}?date=2000:{now.year-1}&format=json&per_page=20000'
    payload = get_json(url)
    if not isinstance(payload, list) or len(payload) < 2 or not isinstance(payload[1], list):
        raise ValueError('Invalid annual history response')
    if payload[0].get('pages', 1) != 1:
        raise ValueError('Annual history pagination limit exceeded')
    output = []
    for row in payload[1]:
        area = row.get('country', {}).get('id')
        symbol = 'EUR' if row.get('countryiso3code') == 'EMU' else WB_AREAS.get(area)
        value = numeric(row.get('value'))
        if symbol and value is not None:
            output.append({'seriesId': f'wb:{indicator}:{symbol}', 'instrument': symbol,
                'name': row['indicator']['value'], 'date': row['date'] + '-12-31', 'period': row['date'],
                'frequency': 'annual', 'value': value, 'unit': '%', 'retrievedAt': now.isoformat(),
                'releaseDateKnown': False, 'sourceUrl': 'https://data.worldbank.org/indicator/' + indicator})
    return output


def parse_network(payload, symbol, metrics, now):
    output = []
    cutoff = (now - timedelta(days=730)).date().isoformat()
    for row in payload:
        date = str(row.get('time', ''))[:10]
        if not cutoff <= date < now.date().isoformat():
            continue  # exclude partial UTC days and future values
        for metric in metrics:
            value = numeric(row.get(metric))
            if value is not None and value >= 0:
                name, unit, group = METRICS[metric]
                output.append({'instrument': symbol, 'metric': metric, 'name': name, 'group': group,
                               'date': date, 'value': value, 'unit': unit, 'source': 'network',
                               'retrievedAt': now.isoformat()})
    return output


def fetch_network(asset, metrics, now):
    query = {'assets': asset, 'metrics': ','.join(metrics), 'frequency': '1d',
             'start_time': (now - timedelta(days=730)).date().isoformat(), 'page_size': 1000}
    rows = []
    for _ in range(5):
        payload = get_json('https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?' + urllib.parse.urlencode(query))
        rows.extend(payload.get('data', []))
        token = payload.get('next_page_token')
        if not token:
            return parse_network(rows, ASSETS[asset], metrics, now)
        query['next_page_token'] = token
    raise ValueError('Network data pagination exceeded')


def fetch_stablecoins(chain, symbol, now):
    payload = get_json('https://stablecoins.llama.fi/stablecoincharts/' + urllib.parse.quote(chain))
    output = []
    for row in payload:
        date = datetime.fromtimestamp(int(row['date']), timezone.utc).date()
        value = numeric(row.get('totalCirculating', {}).get('peggedUSD'))
        # Other pegs are denominated in other currencies; never sum them as USD.
        if value is not None and value >= 0 and (now - timedelta(days=730)).date() <= date < now.date():
            output.append({'instrument': symbol, 'metric': 'StablecoinSupplyUSD', 'name': 'USD-pegged stablecoin supply',
                'group': 'liquidity', 'date': date.isoformat(), 'value': value, 'unit': 'USD', 'source': 'liquidity', 'retrievedAt': now.isoformat()})
    return output


def collect_research(previous, now):
    history, crypto, health = [], [], []
    jobs = {'history-policy': lambda: fetch_bis('policy-rate', now), 'history-inflation': lambda: fetch_bis('inflation', now),
            'history-growth': lambda: fetch_worldbank('NY.GDP.MKTP.KD.ZG', now),
            'history-employment': lambda: fetch_worldbank('SL.UEM.TOTL.ZS', now)}
    try:
        catalog = get_json('https://community-api.coinmetrics.io/v4/catalog-all-v2/asset-metrics?assets=' + ','.join(ASSETS))
        for row in catalog.get('data', []):
            metrics = [item['metric'] for item in row.get('metrics', []) if item['metric'] in METRICS and any(f['frequency'] == '1d' and not f.get('experimental', False) for f in item.get('frequencies', []))]
            if metrics:
                jobs['crypto-' + row['asset']] = lambda a=row['asset'], m=metrics: fetch_network(a, m, now)
    except Exception as error:
        health.append({'feed': 'crypto-catalog', 'status': 'degraded', 'message': type(error).__name__, 'itemCount': 0,
                       'lastAttemptAt': now.isoformat(), 'lastSuccessAt': None, 'staleAfterHours': 48})
    for chain, symbol in CHAINS.items():
        jobs['crypto-liquidity-' + symbol] = lambda c=chain, s=symbol: fetch_stablecoins(c, s, now)
    def collect(item):
        name, fetch = item
        try:
            rows = fetch()
            if not rows:
                raise ValueError('No observations returned')
            return name, rows, None
        except Exception as error:
            return name, [], type(error).__name__
    with ThreadPoolExecutor(max_workers=3) as pool:
        for name, rows, error in pool.map(collect, jobs.items()):
            (history if name.startswith('history-') else crypto).extend(rows)
            health.append({'feed': name, 'status': 'degraded' if error else 'healthy', 'message': error or 'Observations collected.',
                           'itemCount': len(rows), 'lastAttemptAt': now.isoformat(), 'lastSuccessAt': None if error else now.isoformat(), 'staleAfterHours': 48})
    # Replace successful observations only. Retain failed feeds with their original dates.
    history_map = {(r['seriesId'], r['date']): r for r in previous.get('history', []) if r['seriesId'].startswith(('bis:', 'wb:'))}
    history_map.update({(r['seriesId'], r['date']): r for r in history})
    crypto_map = {(r['instrument'], r['metric'], r['date']): r for r in previous.get('cryptoHistory', [])}
    crypto_map.update({(r['instrument'], r['metric'], r['date']): r for r in crypto})
    cutoff = (now - timedelta(days=730)).date().isoformat()
    return list(history_map.values()), [r for r in crypto_map.values() if r['date'] >= cutoff], health
