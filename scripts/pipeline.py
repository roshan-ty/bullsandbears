#!/usr/bin/env python3
"""GitHub Actions ingestion pipeline. Uses only stdlib and never manufactures fallback data."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from math import exp, log, tanh
from math import isfinite
from pathlib import Path
from typing import Any

try:
    from scripts.report_archives import fetch_annual_report
    from scripts.global_calendar import fetch_global_calendar
    from scripts.research_data import collect_research
    from scripts.evidence import balance_events, crypto_fundamentals, blend_crypto
    from scripts.asset_models import asset_events, macro_weights as asset_macro_weights, model_note, CRYPTO
    from scripts.runtime import load_env, safe_error
    from scripts.analysis_engine import build_analysis, build_setups
    from scripts.indicator_registry import normalize_calendar_event
    from scripts.market_data import fetch_market_prices
    from scripts.public_feeds import fetch_public_calendar, fetch_public_news, relevant_news
    from scripts.quality import calendar_health, archive_positions, observation_health
except ModuleNotFoundError:
    from report_archives import fetch_annual_report
    from global_calendar import fetch_global_calendar
    from research_data import collect_research
    from evidence import balance_events, crypto_fundamentals, blend_crypto
    from asset_models import asset_events, macro_weights as asset_macro_weights, model_note, CRYPTO
    from runtime import load_env, safe_error
    from analysis_engine import build_analysis, build_setups
    from indicator_registry import normalize_calendar_event
    from market_data import fetch_market_prices
    from public_feeds import fetch_public_calendar, fetch_public_news, relevant_news
    from quality import calendar_health, archive_positions, observation_health

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_SNAPSHOT = ROOT / "public" / "data" / "snapshot.json"
STAGING = ROOT / "data" / "staging"
USER_AGENT = "Bulls-Bears-Fundamentals/0.1 (scheduled public-data ingestion)"
IMPACT = {"low": 0.5, "medium": 1.0, "high": 1.75}
HORIZONS = {
    "shortTerm": {"halfLifeDays": 10.0, "maxAgeDays": 30.0, "eventWeight": 0.85, "cotWeight": 0.15},
    "longTerm": {"halfLifeDays": 60.0, "maxAgeDays": 180.0, "eventWeight": 0.65, "cotWeight": 0.35},
}

CURRENCIES = ["USD", "EUR", "GBP", "AUD", "NZD", "CAD", "JPY", "CHF", "CNY", "HKD", "HUF", "NOK", "PLN", "SEK", "SGD", "TRY", "ZAR", "BRL", "CZK", "DKK", "MXN"]
PAIRS = [
    "AUDCAD", "AUDCHF", "AUDJPY", "AUDNZD", "AUDUSD", "CADCHF", "CADJPY", "CHFJPY",
    "EURAUD", "EURCAD", "EURCHF", "EURGBP", "EURHKD", "EURHUF", "EURJPY", "EURNOK",
    "EURNZD", "EURPLN", "EURSEK", "EURSGD", "EURTRY", "EURUSD", "EURZAR", "GBPAUD",
    "GBPCAD", "GBPCHF", "GBPHKD", "GBPHUF", "GBPJPY", "GBPNOK", "GBPNZD", "GBPPLN",
    "GBPSEK", "GBPTRY", "GBPUSD", "GBPZAR", "NZDCAD", "NZDCHF", "NZDJPY", "NZDSGD",
    "NZDUSD", "USDBRL", "USDCAD", "USDCHF", "USDCNY", "USDCZK", "USDDKK", "USDHUF",
    "USDJPY", "USDMXN", "USDNOK", "USDPLN", "USDSEK", "USDSGD",
]

NON_FX_MODELS = {
    "XAGUSD": {"USD": -1.0}, "XAUUSD": {"USD": -1.0}, "XPDUSD": {"USD": -1.0}, "XPTUSD": {"USD": -1.0},
    "AVAXUSD": {"USD": -1.0}, "BTCUSD": {"USD": -1.0}, "ETHUSD": {"USD": -1.0},
    "LTCUSD": {"USD": -1.0}, "SOLUSD": {"USD": -1.0}, "SUIUSD": {"USD": -1.0},
    "XLMUSD": {"USD": -1.0}, "XRPUSD": {"USD": -1.0},
    "BRENT": {"USD": -0.5}, "OIL": {"USD": -0.5}, "COPPER": {"CNY": 0.6, "USD": -0.4},
    "AUS200": {"AUD": 1.0}, "CH20": {"CHF": 1.0}, "ES35": {"EUR": 1.0}, "EU50": {"EUR": 1.0},
    "FR40": {"EUR": 1.0}, "GB100": {"GBP": 1.0}, "GE40": {"EUR": 1.0}, "HK50": {"CNY": 1.0},
    "JP225": {"JPY": 1.0}, "US100": {"USD": 1.0}, "US30": {"USD": 1.0}, "US500": {"USD": 1.0},
}

FRED_SERIES = {
    "DGS2": ("USD", "US 2-Year Treasury Yield", "Percent"),
    "DGS5": ("USD", "US 5-Year Treasury Yield", "Percent"),
    "DGS10": ("USD", "US 10-Year Treasury Yield", "Percent"),
    "DGS30": ("USD", "US 30-Year Treasury Yield", "Percent"),
    "DFII10": ("XAUUSD", "US 10-Year Real Yield", "Percent"),
    "DTWEXBGS": ("USD", "Trade Weighted US Dollar Index", "Index"),
    "FEDFUNDS": ("USD", "Effective Federal Funds Rate", "Percent"),
    "CPIAUCSL": ("USD", "Consumer Price Index", "Index 1982–1984=100"),
    "CPILFESL": ("USD", "Core Consumer Price Index", "Index 1982–1984=100"),
    "PCEPILFE": ("USD", "Core PCE Price Index", "Index 2017=100"),
    "UNRATE": ("USD", "Unemployment Rate", "Percent"),
    "PAYEMS": ("USD", "Total Nonfarm Employment", "Thousands of persons"),
    "ICSA": ("USD", "Initial Unemployment Claims", "Persons"),
    "GDPC1": ("USD", "Real Gross Domestic Product", "Billions of chained 2017 dollars"),
    "RSAFS": ("USD", "Retail and Food Services Sales", "Millions of dollars"),
    "INDPRO": ("USD", "Industrial Production", "Index 2017=100"),
    "HOUST": ("USD", "Housing Starts", "Thousands of units"),
}

CFTC_DATASETS = {
    "tff": "gpe5-46if",
    "disaggregated": "72hh-3qpy",
    "tff-combined": "yw9f-hn96", "disaggregated-combined": "kh3c-gbw2",
    "legacy": "6dca-aqww", "legacy-combined": "jun7-fc8e", "supplemental": "4zgm-a668",
}

CFTC_MARKETS = {
    "EURO FX": "EUR", "BRITISH POUND": "GBP", "JAPANESE YEN": "JPY", "SWISS FRANC": "CHF",
    "CANADIAN DOLLAR": "CAD", "AUSTRALIAN DOLLAR": "AUD", "NEW ZEALAND DOLLAR": "NZD",
    "U.S. DOLLAR INDEX": "USD", "GOLD": "XAUUSD", "SILVER": "XAGUSD", "COPPER": "COPPER",
    "CRUDE OIL": "OIL", "BRENT": "BRENT", "BITCOIN": "BTCUSD", "ETHER": "ETHUSD",
    "S&P 500": "US500", "NASDAQ-100": "US100", "DOW JONES": "US30",
    "PLATINUM": "XPTUSD", "PALLADIUM": "XPDUSD",
    "SOLANA": "SOLUSD", "XRP": "XRPUSD", "SWEDISH KRONA": "SEK", "NORWEGIAN KRONE": "NOK", "SOUTH AFRICAN RAND": "ZAR",
    "USD INDEX": "USD", "NZ DOLLAR": "NZD", "MEXICAN PESO": "MXN", "BRAZILIAN REAL": "BRL", "DJIA": "US30",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def request_json(url: str, headers: dict[str, str] | None = None) -> Any:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json", **(headers or {})})
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.load(response)


def atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def existing_snapshot() -> dict[str, Any]:
    if not PUBLIC_SNAPSHOT.exists():
        return {"schemaVersion": 1, "generatedAt": None, "currencies": [], "pairs": [], "events": [], "cot": [], "history": [], "prices": [], "news": [], "analysis": [], "setups": []}
    return json.loads(PUBLIC_SNAPSHOT.read_text(encoding="utf-8"))


def as_number(value: Any) -> float | None:
    if value in (None, "", ".", "N/A"):
        return None
    try:
        result = float(str(value).replace(",", "").replace("%", "").strip())
        return result if isfinite(result) else None
    except ValueError:
        return None


def first_number(row: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        result = as_number(row.get(key))
        if result is not None:
            return result
    return None


def fetch_fred() -> list[dict[str, Any]]:
    key = os.environ.get("FRED_API_KEY")
    if not key:
        print("FRED_API_KEY is not configured; retaining existing history.")
        return []
    history: list[dict[str, Any]] = []
    for series_id, (instrument, name, unit) in FRED_SERIES.items():
        query = urllib.parse.urlencode({
            "series_id": series_id, "api_key": key, "file_type": "json",
            "sort_order": "asc", "observation_start": "2000-01-01",
        })
        try:
            payload = request_json(f"https://api.stlouisfed.org/fred/series/observations?{query}")
        except Exception as error:
            print(f'History series {series_id} unavailable: {safe_error(error)}', file=sys.stderr)
            continue
        for observation in payload.get("observations", []):
            value = as_number(observation.get("value"))
            if value is None:
                continue
            history.append({"seriesId": series_id, "instrument": instrument, "name": name, "date": observation["date"], "value": value, "unit": unit})
    atomic_json(STAGING / "fred.json", history)
    return history


def market_symbol(name: str) -> str | None:
    upper = name.upper()
    if 'PAX GOLD' in upper or 'REAL ESTATE' in upper:
        return None
    matches = [(needle, symbol) for needle, symbol in CFTC_MARKETS.items()
               if re.search(r'(?<![A-Z])' + re.escape(needle) + r'(?![A-Z])', upper)]
    if not matches:
        return None
    return max(matches, key=lambda item: len(item[0]))[1]


def fetch_cftc_dataset(dataset_id: str) -> list[dict[str, Any]]:
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(days=100)).date().isoformat()
    collected = []
    for offset in range(0, 30000, 5000):
        query = urllib.parse.urlencode({"$limit": "5000", "$offset": offset,
            "$where": f"report_date_as_yyyy_mm_dd >= '{cutoff}T00:00:00'",
            "$order": "report_date_as_yyyy_mm_dd DESC, cftc_contract_market_code ASC"})
        rows = request_json(f"https://publicreporting.cftc.gov/resource/{dataset_id}.json?{query}")
        if not isinstance(rows, list):
            raise ValueError('Invalid positioning response')
        collected.extend({key.lower(): value for key, value in row.items()} for row in rows)
        if len(rows) < 5000:
            return collected
    raise ValueError('Positioning pagination exceeded bounded record limit')


def append_position(output: list[dict[str, Any]], row: dict[str, Any], instrument: str, category: str, long_keys: tuple[str, ...], short_keys: tuple[str, ...], spread_keys: tuple[str, ...] = ()) -> None:
    long_value, short_value = first_number(row, *long_keys), first_number(row, *short_keys)
    if long_value is None or short_value is None:
        return
    spread = first_number(row, *spread_keys) if spread_keys else None
    output.append({
        "reportFamily": row.get("_family", "tff"),
        "marketId": str(row.get("cftc_contract_market_code") or row.get("id") or instrument),
        "marketName": str(row.get('market_and_exchange_names') or row.get('contract_market_name') or instrument),
        "instrument": instrument,
        "reportDate": str(row.get("report_date_as_yyyy_mm_dd", ""))[:10],
        "category": category,
        "long": long_value,
        "short": short_value,
        "spread": spread,
        "openInterest": first_number(row, "open_interest_all"),
        "net": long_value - short_value,
        "weeklyNetChange": None,
        "normalizedScore": None,
    })


def fetch_cftc() -> list[dict[str, Any]]:
    historical_positions: list[dict[str, Any]] = []
    old = existing_snapshot().get('cot', [])
    # Migrate the original two-family snapshot before partial-failure retention.
    commodity_instruments = {'XAUUSD', 'XAGUSD', 'XPTUSD', 'XPDUSD', 'OIL', 'BRENT', 'COPPER'}
    for row in old:
        row.setdefault('reportFamily', 'disaggregated' if row.get('instrument') in commodity_instruments else 'tff')
    retained = []
    family_health = []
    attempted = utc_now()
    from concurrent.futures import ThreadPoolExecutor
    def collect_family(family):
        try:
            return fetch_cftc_dataset(CFTC_DATASETS[family])
        except Exception:
            return fetch_annual_report(family)
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {family: pool.submit(collect_family, family) for family in CFTC_DATASETS}
    for family, future in futures.items():
        try:
            rows = future.result()
            if not rows:
                raise ValueError('Empty positioning report')
            latest_date = max(str(row.get('report_date_as_yyyy_mm_dd', ''))[:10] for row in rows)
            recent = parse_event_time(latest_date)
            fresh = recent is not None and 0 <= (datetime.now(timezone.utc) - recent).total_seconds() <= 21 * 86400
            family_health.append({'feed': 'positioning-' + family, 'status': 'healthy' if fresh else 'degraded',
                'lastAttemptAt': attempted, 'lastSuccessAt': attempted,
                'staleAfterHours': 24, 'itemCount': len(rows), 'message': 'Latest report date: ' + latest_date})
        except Exception as error:
            retained.extend(row for row in old if row.get('reportFamily') == family)
            family_health.append({'feed': 'positioning-' + family, 'status': 'degraded',
                'lastAttemptAt': attempted, 'lastSuccessAt': None,
                'staleAfterHours': 24, 'itemCount': 0, 'message': safe_error(error)})
            continue
        for row in rows:
            row["_family"] = family
            instrument = market_symbol(str(row.get("market_and_exchange_names") or row.get("contract_market_name") or ""))
            if not instrument and family == 'supplemental':
                instrument = str(row.get('contract_market_name') or row.get('market_and_exchange_names'))
            if not instrument:
                continue
            if family.startswith("tff"):
                append_position(historical_positions, row, instrument, "Dealer", ("dealer_positions_long", "dealer_positions_long_all"), ("dealer_positions_short", "dealer_positions_short_all"), ("dealer_positions_spread", "dealer_positions_spread_all"))
                append_position(historical_positions, row, instrument, "Asset Manager", ("asset_mgr_positions_long", "asset_mgr_positions_long_all"), ("asset_mgr_positions_short", "asset_mgr_positions_short_all"), ("asset_mgr_positions_spread", "asset_mgr_positions_spread_all"))
                append_position(historical_positions, row, instrument, "Leveraged Money", ("lev_money_positions_long", "lev_money_positions_long_all"), ("lev_money_positions_short", "lev_money_positions_short_all"), ("lev_money_positions_spread", "lev_money_positions_spread_all"))
                append_position(historical_positions, row, instrument, "Other Reportable", ("other_rept_positions_long", "other_rept_positions_long_all"), ("other_rept_positions_short", "other_rept_positions_short_all"), ("other_rept_positions_spread", "other_rept_positions_spread_all"))
                append_position(historical_positions, row, instrument, "Non-reportable", ("nonrept_positions_long", "nonrept_positions_long_all"), ("nonrept_positions_short", "nonrept_positions_short_all"))
            elif family.startswith("disaggregated"):
                append_position(historical_positions, row, instrument, "Producer/Merchant", ("prod_merc_positions_long", "prod_merc_positions_long_all"), ("prod_merc_positions_short", "prod_merc_positions_short_all"))
                append_position(historical_positions, row, instrument, "Swap Dealer", ("swap_positions_long", "swap_positions_long_all"), ("swap_positions_short", "swap_positions_short_all", "swap__positions_short_all"), ("swap_positions_spread", "swap_positions_spread_all", "swap__positions_spread_all"))
                append_position(historical_positions, row, instrument, "Managed Money", ("m_money_positions_long", "m_money_positions_long_all"), ("m_money_positions_short", "m_money_positions_short_all"), ("m_money_positions_spread", "m_money_positions_spread_all"))
                append_position(historical_positions, row, instrument, "Other Reportable", ("other_rept_positions_long", "other_rept_positions_long_all"), ("other_rept_positions_short", "other_rept_positions_short_all"), ("other_rept_positions_spread", "other_rept_positions_spread_all"))
                append_position(historical_positions, row, instrument, "Non-reportable", ("nonrept_positions_long", "nonrept_positions_long_all"), ("nonrept_positions_short", "nonrept_positions_short_all"))
            elif family.startswith('legacy'):
                append_position(historical_positions, row, instrument, 'Non-commercial', ('noncomm_positions_long_all',), ('noncomm_positions_short_all',), ('noncomm_postions_spread_all', 'noncomm_positions_spread_all'))
                append_position(historical_positions, row, instrument, 'Commercial', ('comm_positions_long_all',), ('comm_positions_short_all',))
                append_position(historical_positions, row, instrument, 'Non-reportable', ('nonrept_positions_long_all',), ('nonrept_positions_short_all',))
            elif family == 'supplemental':
                append_position(historical_positions, row, instrument, 'Non-commercial ex CIT', ('ncomm_postions_long_all_nocit', 'noncommercial_positions_long_all_nocit'), ('ncomm_postions_short_all_nocit', 'noncommercial_positions_short_all_nocit'), ('ncomm_postions_spread_all_nocit',))
                append_position(historical_positions, row, instrument, 'Commercial ex CIT', ('comm_positions_long_all_nocit',), ('comm_positions_short_all_nocit',))
                append_position(historical_positions, row, instrument, 'Index Traders', ('cit_positions_long_all',), ('cit_positions_short_all',))
                append_position(historical_positions, row, instrument, 'Non-reportable', ('nonrept_positions_long_all',), ('nonrept_positions_short_all',))
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for position in historical_positions:
        grouped.setdefault((position["reportFamily"], position["marketId"], position["category"]), []).append(position)
    positions: list[dict[str, Any]] = []
    for records in grouped.values():
        ordered = sorted(records, key=lambda item: item["reportDate"], reverse=True)
        latest = ordered[0]
        # A gap is not a one-week change.
        weekly = len(ordered) > 1 and (datetime.fromisoformat(latest['reportDate']) - datetime.fromisoformat(ordered[1]['reportDate'])).days == 7
        latest["weeklyNetChange"] = latest["net"] - ordered[1]["net"] if weekly else None
        positions.append(latest)
    positions.extend(retained)
    assign_position_scores(positions)
    atomic_json(STAGING / 'cot-health.json', family_health)
    atomic_json(STAGING / "cftc.json", positions)
    atomic_json(STAGING / 'cot-history.json', historical_positions)
    return positions


def assign_position_scores(positions):
    """One family and liquid contract per instrument; overlapping reports are display-only."""
    priority = {'tff': 0, 'disaggregated': 0, 'legacy': 1}
    selected = {}
    now = datetime.now(timezone.utc)
    for row in positions:
        row['normalizedScore'] = None
        family = row.get('reportFamily')
        date = parse_event_time(row.get('reportDate'))
        if family not in priority or not row.get('openInterest') or date is None or not 0 <= (now - date).total_seconds() <= 21 * 86400:
            continue
        candidate = (priority[family], -float(row['openInterest']), row['marketId'])
        if row['instrument'] not in selected or candidate < selected[row['instrument']][0]:
            selected[row['instrument']] = (candidate, family, row['marketId'])
    categories = {'tff': {'Asset Manager', 'Leveraged Money'},
                  'disaggregated': {'Managed Money'}, 'legacy': {'Non-commercial'}}
    for row in positions:
        choice = selected.get(row['instrument'])
        if choice and (row.get('reportFamily'), row['marketId']) == choice[1:] and row['category'] in categories[choice[1]]:
            row['normalizedScore'] = max(-1.0, min(1.0, row['net'] / row['openInterest']))


def fetch_authorized_json(url_env: str, key_env: str, output_name: str) -> list[dict[str, Any]]:
    url = os.environ.get(url_env)
    if not url:
        print(f"{url_env} is not configured; retaining existing {output_name} data.")
        return []
    key = os.environ.get(key_env)
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    payload = request_json(url, headers)
    rows = payload if isinstance(payload, list) else payload.get("items", [])
    if not isinstance(rows, list):
        raise ValueError(f"{url_env} response must be a JSON array or an object containing an items array.")
    atomic_json(STAGING / f"{output_name}.json", rows)
    return rows


def score_event(event: dict[str, Any]) -> dict[str, Any]:
    event = normalize_calendar_event(event)
    actual, forecast, previous = as_number(event.get("actual")), as_number(event.get("forecast")), as_number(event.get("previous"))
    comparison_kind = "previous" if previous is not None else None
    comparison = previous
    direction = event.get("direction", "higher_is_bullish")
    signal = None
    surprise = None if actual is None or comparison is None else actual - comparison
    if direction in ("higher_is_bullish", "lower_is_bullish") and surprise is not None:
        signal = 0 if surprise == 0 else (1 if surprise > 0 else -1)
        if direction == "lower_is_bullish":
            signal *= -1
    weight = float(event.get("weight", 1))
    contribution = 0 if signal is None else signal * weight * IMPACT.get(str(event.get("impact", "medium")).lower(), 1)
    bias = "unavailable" if signal is None else "bullish" if signal > 0 else "bearish" if signal < 0 else "neutral"
    return {**event, "actual": actual, "forecast": forecast, "previous": previous, "comparison": comparison, "comparisonKind": comparison_kind, "surprise": surprise, "signal": signal, "contribution": contribution, "bias": bias}


def label(score: float) -> str:
    return "bullish" if score > 0.08 else "bearish" if score < -0.08 else "neutral"


def parse_event_time(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def recency_factor(event: dict[str, Any], now: datetime, half_life_days: float = 45.0, max_age_days: float = 180.0) -> float:
    occurred_at = parse_event_time(event.get("occurredAt"))
    if occurred_at is None:
        return 0.0
    age_days = (now - occurred_at).total_seconds() / 86400
    if age_days < 0:
        return 0.0
    return 0.0 if age_days > max_age_days else exp(-log(2) * age_days / half_life_days)


def mean_cot_score(cot: list[dict[str, Any]], instrument: str, now: datetime | None = None) -> float | None:
    now = now or datetime.now(timezone.utc)
    eligible = [item for item in cot
              if item.get("instrument") == instrument and item.get("normalizedScore") is not None
              and (date := parse_event_time(item.get('reportDate'))) is not None
              and 0 <= (now - date).total_seconds() <= 21 * 86400]
    # A nearly inactive one-contract market must not outweigh a liquid contract.
    weighted = [(float(item['normalizedScore']), float(item.get('openInterest') or 0)) for item in eligible]
    denominator = sum(weight for _, weight in weighted if weight > 0)
    return sum(value * weight for value, weight in weighted if weight > 0) / denominator if denominator else None


def horizon_bias(events: list[dict[str, Any]], cot_value: float | None, now: datetime, config: dict[str, float]) -> dict[str, Any]:
    # One latest observation per named indicator, so weekly series cannot drown
    # monthly data simply by having more observations in the lookback.
    latest = {}
    for item in sorted(events, key=lambda row: str(row.get('occurredAt', ''))):
        if item.get('signal') is not None and recency_factor(item, now, config['halfLifeDays'], config['maxAgeDays']) > 0:
            latest[(item.get('currency'), item.get('seriesKey') or item.get('name'))] = item
    eligible = [(item, recency_factor(item, now, config["halfLifeDays"], config["maxAgeDays"])) for item in latest.values()]
    eligible = [(item, decay) for item, decay in eligible if decay > 0]
    # A fixed scale preserves the difference between three and five bullish
    # points; dividing by each currency's own count would make both +1.
    event_score, factors, agreement = balance_events(eligible)
    has_events, has_cot = bool(eligible), cot_value is not None
    if has_events and has_cot:
        score = event_score * config["eventWeight"] + float(cot_value) * config["cotWeight"]
    else:
        score = event_score if has_events else float(cot_value or 0.0)
    coverage = min(1.0, len(factors) / 4) * config["eventWeight"] + (config["cotWeight"] if has_cot else 0.0)
    available = has_events or has_cot
    conflict = has_events and has_cot and abs(event_score) > .08 and abs(cot_value) > .08 and event_score * cot_value < 0
    return {
        "score": max(-1.0, min(1.0, score)), "label": label(score) if available else "unavailable",
        "eventScore": event_score, "cotScore": float(cot_value or 0.0), "eventCount": len(eligible),
        "componentConflict": conflict, "factorCount": len(factors), "factors": factors, "agreement": round(agreement, 4), "hasPositioning": has_cot,
        "evidenceQuality": "limited" if coverage < .5 or agreement < .35 or conflict else "moderate" if coverage < .8 else "broad",
        "coverage": round(min(1.0, coverage), 4), "updatedAt": now.isoformat().replace("+00:00", "Z") if available else None,
    }


def pair_horizon(base: dict[str, Any], quote: dict[str, Any], generated_at: str) -> dict[str, Any]:
    available = base["label"] != "unavailable" and quote["label"] != "unavailable"
    score = (float(base["score"]) - float(quote["score"])) / 2 if available else 0.0
    coverage = min(float(base['coverage']), float(quote['coverage'])) if available else 0.0
    agreement = min(base.get('agreement', 0), quote.get('agreement', 0))
    return {'score': score, 'label': label(score) if available else 'unavailable', 'coverage': coverage,
            'eventCount': int(base['eventCount']) + int(quote['eventCount']), 'updatedAt': generated_at if available else None,
            'factorCount': min(base.get('factorCount', 0), quote.get('factorCount', 0)), 'agreement': agreement,
            'componentConflict': base.get('componentConflict', False) or quote.get('componentConflict', False),
            'evidenceQuality': 'limited' if coverage < .5 or agreement < .35 else 'moderate' if coverage < .8 else 'broad'}


def merge_calendar(current: list[dict[str, Any]], previous: list[dict[str, Any]], now: datetime) -> list[dict[str, Any]]:
    merged = {}
    for item in [*previous, *current]:
        if not item.get('id'):
            continue
        # Different feeds and currency casing can assign different IDs to the
        # same release. Preserve one observation and its last non-null actual.
        key = (str(item['currency']).upper(), str(item['name']).strip(), item.get('occurredAt')) if item.get('currency') and item.get('name') else item['id']
        prior = merged.get(key, {})
        merged[key] = {**item, **prior, **{field: value for field, value in item.items() if value is not None}}
    cutoff = now.timestamp() - 180 * 86400
    return [item for item in merged.values() if (occurred := parse_event_time(item.get("occurredAt"))) is not None and occurred.timestamp() >= cutoff]


def calculate_biases(events: list[dict[str, Any]], cot: list[dict[str, Any]], generated_at: str, crypto: list[dict] | None = None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    now = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
    currency_rows: list[dict[str, Any]] = []
    for symbol in CURRENCIES:
        cot_value = mean_cot_score(cot, symbol, now)
        symbol_events = [item for item in events if symbol in item.get('affectedCurrencies', [item.get('currency')])]
        short = horizon_bias(symbol_events, cot_value, now, HORIZONS["shortTerm"])
        long = horizon_bias(symbol_events, cot_value, now, HORIZONS["longTerm"])
        currency_rows.append({"symbol": symbol, "score": short["score"], "label": short["label"], "eventScore": short["eventScore"], "cotScore": short["cotScore"], "eventCount": short["eventCount"], "updatedAt": short["updatedAt"], "shortTerm": short, "longTerm": long})
    by_symbol = {item["symbol"]: item for item in currency_rows}
    pairs: list[dict[str, Any]] = []
    for symbol in PAIRS:
        base, quote = by_symbol[symbol[:3]], by_symbol[symbol[3:]]
        short = pair_horizon(base["shortTerm"], quote["shortTerm"], generated_at)
        long = pair_horizon(base["longTerm"], quote["longTerm"], generated_at)
        pairs.append({"symbol": symbol, "base": base["symbol"], "quote": quote["symbol"], "score": short["score"], "label": short["label"], "updatedAt": short["updatedAt"], "shortTerm": short, "longTerm": long, "rationale": [f"Short term: {base['symbol']} {base['shortTerm']['label']} ({base['shortTerm']['score']:.2f}) vs {quote['symbol']} {quote['shortTerm']['label']} ({quote['shortTerm']['score']:.2f}).", f"Long term: {base['symbol']} {base['longTerm']['label']} ({base['longTerm']['score']:.2f}) vs {quote['symbol']} {quote['longTerm']['label']} ({quote['longTerm']['score']:.2f})."] if short["label"] != "unavailable" or long["label"] != "unavailable" else ["Required currency bias data is not yet available."]})
    crypto_by_symbol = {row["instrument"]: row for row in (crypto or [])}
    for instrument, defaults in NON_FX_MODELS.items():
        weights = asset_macro_weights(instrument, defaults)
        cot_value = mean_cot_score(cot, instrument, now)
        relevant = asset_events(instrument, events, weights)
        horizons = {key: horizon_bias(relevant, cot_value, now, config) for key, config in HORIZONS.items()}
        scope = 'macro-and-positioning' if cot_value is not None else 'macro-only'
        if instrument in CRYPTO:
            direct = crypto_by_symbol.get(instrument, {})
            for key, config in HORIZONS.items():
                horizons[key] = blend_crypto(horizons[key], direct.get(key), config)
                if horizons[key]['eventCount'] or cot_value is not None or direct.get(key, {}).get('available'):
                    horizons[key]['label'] = label(horizons[key]['score'])
                    horizons[key]['updatedAt'] = generated_at
            if any(direct.get(key, {}).get('available') for key in HORIZONS):
                scope = 'network-and-macro'
        short, long = horizons['shortTerm'], horizons['longTerm']
        note = model_note(instrument, cot_value is not None)
        if scope == 'network-and-macro':
            note = 'Network activity, issuance pressure and chain stablecoin liquidity are evaluated separately from the macro backdrop. Metrics are grouped to avoid repeated votes; missing or stale groups reduce coverage. These are directional rules, not validated return forecasts.'
        rationale = [note, f"Short term: {short['eventCount']} eligible releases; long term: {long['eventCount']}."]
        if cot_value is not None:
            rationale.append(f"Direct positioning score {cot_value:+.2f}; overlapping report families excluded.")
        pairs.append({'symbol': instrument, 'base': instrument, 'quote': 'USD',
            'score': short['score'], 'label': short['label'], 'updatedAt': short['updatedAt'],
            'shortTerm': short, 'longTerm': long, 'rationale': rationale,
            'macroCurrencies': list(weights), 'macroWeights': weights,
            'modelScope': scope, 'modelVersion': 'balanced-evidence-v3'})
    return currency_rows, pairs


def run_core() -> None:
    previous = existing_snapshot()
    try:
        fresh_history = fetch_fred()
        refreshed = {item['seriesId'] for item in fresh_history}
        history = [item for item in previous.get('history', []) if item['seriesId'] not in refreshed] + fresh_history
    except Exception as error:
        print(f"History ingestion failed; retaining last valid data: {safe_error(error)}", file=sys.stderr)
        history = previous.get("history", [])
    try:
        cot = fetch_cftc() or previous.get("cot", [])
    except Exception as error:
        print(f"Positioning ingestion failed; retaining last valid data: {safe_error(error)}", file=sys.stderr)
        cot = previous.get("cot", [])
    generated_at = utc_now()
    now = datetime.fromisoformat(generated_at.replace("Z", "+00:00"))
    health = {item.get("feed"): item for item in previous.get("feedHealth", []) if isinstance(item, dict) and item.get("feed")}
    try:
        public_calendar = []
        for feed, collector in [('calendar-major', fetch_public_calendar),
                                ('calendar-global', lambda: fetch_global_calendar(previous.get('events', []), now))]:
            try:
                fresh = collector()
                public_calendar.extend(fresh)
                health[feed] = {**calendar_health(fresh, generated_at), 'feed': feed}
            except Exception as error:
                prior = health.get(feed, {})
                health[feed] = {**prior, 'feed': feed, 'status': 'degraded', 'lastAttemptAt': generated_at,
                    'lastSuccessAt': prior.get('lastSuccessAt'), 'staleAfterHours': 12, 'itemCount': 0, 'message': safe_error(error)}
        try:
            configured_calendar = fetch_authorized_json("CALENDAR_API_URL", "CALENDAR_API_KEY", "calendar")
        except Exception as error:
            print(f"Supplemental calendar ingestion failed: {safe_error(error)}", file=sys.stderr)
            configured_calendar = []
        calendar = merge_calendar([*configured_calendar, *public_calendar], previous.get("events", []), now)
        health["calendar"] = calendar_health([*configured_calendar, *public_calendar], generated_at)
    except Exception as error:
        print(f"Calendar ingestion failed; retaining last valid data: {safe_error(error)}", file=sys.stderr)
        calendar = previous.get("events", [])
        prior = health.get("calendar", {})
        health["calendar"] = {**prior, "feed": "calendar", "status": "degraded", "lastAttemptAt": generated_at, "lastSuccessAt": prior.get("lastSuccessAt"), "staleAfterHours": 12, "itemCount": len(calendar), "message": safe_error(error)}
    health_file = STAGING / 'cot-health.json'
    if health_file.exists():
        for item in json.loads(health_file.read_text(encoding='utf-8')):
            if item['lastSuccessAt'] is None:
                item['lastSuccessAt'] = health.get(item['feed'], {}).get('lastSuccessAt')
            health[item['feed']] = item
    research_time = parse_event_time(previous.get('researchUpdatedAt'))
    research_history, crypto_history = [], previous.get('cryptoHistory', [])
    research_updated = previous.get('researchUpdatedAt')
    if os.environ.get('REFRESH_RESEARCH') == 'true' or research_time is None or (now - research_time).total_seconds() >= 24 * 3600:
        research_history, crypto_history, research_health = collect_research(previous, now)
        for item in research_health:
            if item['lastSuccessAt'] is None:
                item['lastSuccessAt'] = health.get(item['feed'], {}).get('lastSuccessAt')
            health[item['feed']] = item
        research_updated = generated_at
    history_lookup = {(row['seriesId'], row['date']): row for row in history}
    history_lookup.update({(row['seriesId'], row['date']): row for row in research_history})
    history = list(history_lookup.values())
    crypto = crypto_fundamentals(crypto_history, now)
    scored = sorted((score_event(item) for item in calendar), key=lambda item: str(item.get("occurredAt", "")), reverse=True)
    currencies, pairs = calculate_biases(scored, cot, generated_at, crypto)
    try:
        fresh_prices = fetch_market_prices(PAIRS)
        updated_prices = {row['instrument'] for row in fresh_prices}
        prices = fresh_prices + [row for row in previous.get('prices', []) if row['instrument'] not in updated_prices]
    except Exception as error:
        print(f"Market-price ingestion failed; retaining last valid data: {safe_error(error)}", file=sys.stderr)
        prices = previous.get("prices", [])
    for feed, rows, date_key, age in [('positioning', cot, 'reportDate', 21), ('history', history, 'date', 7), ('prices', prices, 'asOf', 5)]:
        health[feed] = observation_health(feed, rows, date_key, generated_at, age)
    analyses = [analysis for pair in pairs if (analysis := build_analysis(pair, scored, cot, generated_at, crypto=crypto)) is not None]
    setups = build_setups(pairs, analyses, generated_at)
    archive_file = STAGING / 'cot-history.json'
    downloaded_history = json.loads(archive_file.read_text(encoding='utf-8')) if archive_file.exists() else []
    verified_archive = [row for row in previous.get('cotHistory', [])
                        if row.get('reportFamily') and row.get('marketName') and (market_symbol(row['marketName']) == row.get('instrument') or row['reportFamily'] == 'supplemental')]
    cot_history = archive_positions([*downloaded_history, *cot], verified_archive, now)
    atomic_json(PUBLIC_SNAPSHOT, {**previous, "schemaVersion": 1, "generatedAt": generated_at, "coreUpdatedAt": generated_at, "researchUpdatedAt": research_updated, "cryptoHistory": crypto_history, "cryptoFundamentals": crypto, "currencies": currencies, "pairs": pairs, "events": scored, "cot": cot, "cotHistory": cot_history, "history": history, "prices": prices, "analysis": analyses, "setups": setups, "feedHealth": list(health.values())})


def run_news() -> None:
    previous = existing_snapshot()
    generated_at = utc_now()
    health = {item.get("feed"): item for item in previous.get("feedHealth", []) if isinstance(item, dict) and item.get("feed")}
    try:
        source_health: list[dict[str, Any]] = []
        fresh_news = fetch_public_news(health=source_health)
        for source in source_health:
            prior = health.get(source['feed'], {})
            if source['lastSuccessAt'] is None:
                source['lastSuccessAt'] = prior.get('lastSuccessAt')
            health[source['feed']] = source
        try:
            fresh_news.extend(fetch_authorized_json("NEWS_API_URL", "NEWS_API_KEY", "news"))
        except Exception:
            print('Supplemental news failed; continuing with public sources.', file=sys.stderr)
    except Exception as error:
        prior = health.get("news", {})
        health["news"] = {**prior, "feed": "news", "status": "degraded", "lastAttemptAt": generated_at, "lastSuccessAt": prior.get("lastSuccessAt"), "staleAfterHours": 1, "itemCount": len(previous.get("news", [])), "message": safe_error(error)}
        atomic_json(PUBLIC_SNAPSHOT, {**previous, "generatedAt": generated_at, "feedHealth": list(health.values())})
        return
    required = {"id", "publishedAt", "headline", "url", "instruments"}
    valid_fresh = [item for item in fresh_news if isinstance(item, dict) and required.issubset(item) and relevant_news(item)]
    valid = [item for item in [*valid_fresh, *previous.get("news", [])] if isinstance(item, dict) and required.issubset(item) and relevant_news(item)]
    if not valid:
        health["news"] = {"feed": "news", "status": "unavailable", "lastAttemptAt": generated_at, "lastSuccessAt": health.get("news", {}).get("lastSuccessAt"), "staleAfterHours": 1, "itemCount": 0, "message": "No valid public news records were returned; no headlines were fabricated."}
        atomic_json(PUBLIC_SNAPSHOT, {**previous, "news": [], "generatedAt": generated_at, "feedHealth": list(health.values())})
        return
    deduplicated: dict[str, dict[str, Any]] = {}
    titles: set[str] = set()
    for item in sorted(valid, key=lambda row: row["publishedAt"], reverse=True):
        title = " ".join(str(item["headline"]).lower().split())
        if item["id"] in deduplicated or title in titles:
            continue
        deduplicated[item["id"]] = item
        titles.add(title)
    published = list(deduplicated.values())[:500]
    fresh_count = len(valid_fresh)
    health["news"] = {"feed": "news", "status": "healthy" if fresh_count else "degraded", "lastAttemptAt": generated_at, "lastSuccessAt": generated_at if fresh_count else health.get("news", {}).get("lastSuccessAt"), "staleAfterHours": 1, "itemCount": len(published), "message": f"Refreshed {fresh_count} public news records." if fresh_count else "No fresh public news records were returned; retained the last validated headlines."}
    atomic_json(PUBLIC_SNAPSHOT, {**previous, "generatedAt": generated_at, "newsUpdatedAt": generated_at if fresh_count else previous.get("newsUpdatedAt"), "news": published, "feedHealth": list(health.values())})


def main() -> None:
    load_env(ROOT)
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("core", "news"))
    args = parser.parse_args()
    run_core() if args.mode == "core" else run_news()


if __name__ == "__main__":
    main()
