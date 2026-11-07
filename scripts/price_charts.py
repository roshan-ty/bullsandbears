"""Unadjusted, source-dated OHLC bars. Never interpolate or invent missing candles."""
from datetime import datetime, timezone
from math import isfinite
from urllib.parse import quote

from scripts.market_data import TICKERS, forex_ticker

INTERVALS = {'1m': '5d', '5m': '1mo', '15m': '1mo', '1h': '3mo', '1d': '2y', '1wk': '5y'}


def chart_request(instrument, interval):
    from scripts.pipeline import PAIRS
    if not isinstance(instrument, str) or instrument not in {*PAIRS, *TICKERS}:
        raise ValueError('Unsupported chart instrument.')
    if not isinstance(interval, str) or interval not in INTERVALS:
        raise ValueError('Unsupported chart interval.')
    return TICKERS.get(instrument, forex_ticker(instrument))


def frame_bars(frame, now=None):
    now = now or datetime.now(timezone.utc)
    bars = {}
    for stamp, row in frame.iterrows():
        try:
            stamp = stamp.tz_localize(timezone.utc) if stamp.tzinfo is None else stamp.tz_convert(timezone.utc)
            if stamp.timestamp() > now.timestamp():
                continue
            values = {key.lower(): float(row[key]) for key in ('Open', 'High', 'Low', 'Close')}
            if not all(isfinite(v) and v > 0 for v in values.values()):
                continue
            if not values['low'] <= min(values['open'], values['close']) <= max(values['open'], values['close']) <= values['high']:
                continue
            volume = float(row.get('Volume', float('nan')))
            timestamp = stamp.isoformat().replace('+00:00', 'Z')
            bars[timestamp] = {'time': timestamp, **values, 'volume': volume if isfinite(volume) and volume > 0 else None}
        except (KeyError, TypeError, ValueError, AttributeError):
            continue
    return [bars[key] for key in sorted(bars)][-2500:]


def chart_metadata(instrument, ticker):
    futures = ticker.endswith('=F')
    return {'instrument': instrument, 'ticker': ticker, 'source': 'Yahoo Finance',
            'sourceUrl': 'https://finance.yahoo.com/quote/' + quote(ticker, safe=''),
            'priceKind': 'Futures benchmark' if futures else 'Cash index' if ticker.startswith('^') else 'Spot FX' if ticker.endswith('=X') else 'Crypto / USD',
            'priceUnit': 'USD / lb' if instrument == 'COPPER' else 'USD / barrel' if instrument in {'OIL', 'BRENT'} else 'USD / troy oz' if futures else instrument[3:] if ticker.endswith('=X') else 'index points' if ticker.startswith('^') else 'USD',
            'delayNotice': 'Source quotes may be delayed. The newest candle may still be forming. No prices are interpolated.'}


def fetch_chart(instrument, interval):
    import yfinance as yf
    ticker = chart_request(instrument, interval)
    handle = yf.Ticker(ticker)
    frame = handle.history(period=INTERVALS[interval], interval=interval, auto_adjust=False,
                                      actions=False, repair=False, keepna=False, timeout=20, raise_errors=True)
    bars = frame_bars(frame)
    if not bars:
        raise ValueError('No valid source candles returned for this instrument and interval.')
    metadata = handle.get_history_metadata()
    quote_data, session = None, None
    if isinstance(metadata, dict):
        price, stamp = metadata.get('regularMarketPrice'), metadata.get('regularMarketTime')
        if isinstance(price, (int, float)) and isfinite(price) and price > 0 and isinstance(stamp, (int, float)) and 0 < stamp <= datetime.now(timezone.utc).timestamp() + 2:
            quote_data = {'price': price, 'time': stamp}
        regular = metadata.get('currentTradingPeriod', {}).get('regular', {})
        start, end = regular.get('start'), regular.get('end')
        bar_start = datetime.fromisoformat(bars[-1]['time'].replace('Z', '+00:00')).timestamp()
        span = 604800 if interval == '1wk' else 86400
        if interval in ('1d', '1wk') and all(isinstance(v, (int, float)) for v in (start, end, stamp)) and start <= stamp < end and bar_start <= stamp < bar_start + span:
            session = {'start': start, 'end': end, 'barTime': bars[-1]['time']}
    return {**chart_metadata(instrument, ticker), 'interval': interval, 'bars': bars, 'quote': quote_data, 'currentSession': session,
            'asOf': bars[-1]['time'], 'retrievedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')}
