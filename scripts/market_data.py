"""Research-market-price adapter. Replace with a licensed feed for public commercial use."""
from __future__ import annotations

from datetime import timezone
from typing import Any


TICKERS = {
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
        list(mapping.values()), period="5d", interval="1d", auto_adjust=False,
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
            output.append({
                "instrument": instrument, "price": price, "previousClose": previous,
                "change": change, "changePercent": change_percent,
                "asOf": timestamp.isoformat().replace("+00:00", "Z"), "currency": None,
            })
        except (KeyError, TypeError, ValueError, IndexError):
            continue
    return sorted(output, key=lambda item: item["instrument"])
