"""Research-market-price adapter. Replace with a licensed feed for public commercial use."""
from __future__ import annotations

from datetime import datetime, timezone
from math import isfinite, log, sqrt
from statistics import stdev
from typing import Any


TICKERS = {
    'XAUUSD': 'GC=F', 'XAGUSD': 'SI=F', 'XPTUSD': 'PL=F', 'XPDUSD': 'PA=F',
    'OIL': 'CL=F', 'BRENT': 'BZ=F', 'COPPER': 'HG=F',
    "AVAXUSD": "AVAX-USD", "BTCUSD": "BTC-USD",
    "ETHUSD": "ETH-USD", "LTCUSD": "LTC-USD", "SOLUSD": "SOL-USD", "SUIUSD": "SUI20947-USD",
    "XLMUSD": "XLM-USD", "XRPUSD": "XRP-USD", "AUS200": "^AXJO", "CH20": "^SSMI",
    "ES35": "^IBEX", "EU50": "^STOXX50E", "FR40": "^FCHI", "GB100": "^FTSE", "GE40": "^GDAXI",
    "HK50": "^HSI", "JP225": "^N225", "US100": "^NDX", "US30": "^DJI", "US500": "^GSPC",
}


def forex_ticker(symbol: str) -> str:
    return f"{symbol}=X"


def fetch_market_prices(forex_pairs: list[str]) -> list[dict[str, Any]]:
    import yfinance as yf

    mapping = {**TICKERS, **{symbol: forex_ticker(symbol) for symbol in forex_pairs}}
    frame = yf.download(
        list(mapping.values()), period="1y", interval="1d", auto_adjust=False,
        progress=False, threads=4, group_by="column", timeout=15,
    )
    if frame.empty:
        return []
    output: list[dict[str, Any]] = []
    reverse = {ticker: instrument for instrument, ticker in mapping.items()}
    for ticker, instrument in reverse.items():
        try:
            close = frame["Close"][ticker].dropna() if len(mapping) > 1 else frame["Close"].dropna()
            if close.empty:
                continue
            price = float(close.iloc[-1])
            previous = float(close.iloc[-2]) if len(close) > 1 else None
            change = price - previous if previous is not None else None
            change_percent = (change / previous * 100) if change is not None and previous else None
            timestamp = close.index[-1]
            if getattr(timestamp, "tzinfo", None) is None:
                timestamp = timestamp.tz_localize(timezone.utc)
            else:
                timestamp = timestamp.tz_convert(timezone.utc)
            context = price_context([(date.isoformat()[:10], float(value)) for date, value in close.items()], instrument, datetime.now(timezone.utc))
            output.append({
                'context': context,
                "instrument": instrument, "price": price, "previousClose": previous,
                "change": change, "changePercent": change_percent,
                "asOf": timestamp.isoformat().replace("+00:00", "Z"), "currency": 'USD' if ticker.endswith('=F') else None,
                'priceKind': 'Futures benchmark' if ticker.endswith('=F') else 'Market close',
                'priceUnit': 'USD / lb' if instrument == 'COPPER' else 'USD / barrel' if instrument in {'OIL', 'BRENT'} else 'USD / troy oz' if ticker.endswith('=F') else None,
            })
        except (KeyError, TypeError, ValueError, IndexError):
            continue
    return sorted(output, key=lambda item: item["instrument"])


def price_context(observations, instrument, now):
    """Daily price confirmation only; excluded from the fundamental bias score."""
    days = sorted({date: value for date, value in observations if date < now.date().isoformat()
                   and isinstance(value, (int,float)) and isfinite(value) and value > 0}.items())
    if not days: return None
    values = [value for _, value in days]
    averages = {str(n): sum(values[-n:]) / n if len(values) >= n else None for n in (20,50,100,200)}
    ready = all(value is not None for value in averages.values())
    above = sum(values[-1] > value for value in averages.values() if value is not None)
    below = sum(values[-1] < value for value in averages.values() if value is not None)
    crypto = instrument in {'AVAXUSD','BTCUSD','ETHUSD','LTCUSD','SOLUSD','SUIUSD','XLMUSD','XRPUSD'}
    annual_days = 365 if crypto else 252
    returns = [log(values[i]/values[i-1]) for i in range(len(values)-20,len(values))] if len(values)>=21 else []
    return {'asOf':days[-1][0], 'close':values[-1], 'observations':len(values), 'averages':averages,
            'trend':'aligned up' if ready and above == 4 else 'aligned down' if ready and below == 4 else 'mixed' if ready else 'unavailable',
            'realizedVolatility20':stdev(returns)*sqrt(annual_days)*100 if returns else None,
            'annualizationDays':annual_days,
            'return20':(values[-1]/values[-21]-1)*100 if len(values)>=21 else None,
            'scope':'Price context only; excluded from bias. Futures benchmarks may contain roll effects.'}
