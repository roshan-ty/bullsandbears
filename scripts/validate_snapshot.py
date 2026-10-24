#!/usr/bin/env python3
from __future__ import annotations

import json
import math
from urllib.parse import urlparse
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "public" / "data" / "snapshot.json"
ARRAY_KEYS = ("currencies", "pairs", "events", "cot", "history", "prices", "news", "analysis", "setups", "feedHealth")
LABELS = {"bullish", "bearish", "neutral", "unavailable"}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def valid_time(value: Any, optional: bool = False) -> bool:
    if value is None:
        return optional
    try:
        datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


def unique(records: list[dict[str, Any]], key: str, name: str) -> None:
    values = [record.get(key) for record in records]
    require(None not in values and "" not in values, f"{name} contains a missing {key}.")
    require(len(values) == len(set(values)), f"{name} contains duplicate {key} values.")


def finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate(payload: dict[str, Any]) -> None:
    require(payload.get("schemaVersion") == 1, "Unsupported schemaVersion.")
    require(valid_time(payload.get("generatedAt"), optional=True), "generatedAt is invalid.")
    for key in ARRAY_KEYS:
        require(isinstance(payload.get(key), list), f"{key} must be an array.")
    unique(payload["events"], "id", "events")
    unique(payload["prices"], "instrument", "prices")
    unique(payload["analysis"], "instrument", "analysis")
    unique(payload["setups"], "instrument", "setups")
    unique(payload['currencies'], 'symbol', 'currencies')
    unique(payload['pairs'], 'symbol', 'pairs')
    for row in payload["currencies"] + payload["pairs"]:
        require(row.get("label") in LABELS, f"Invalid bias label for {row.get('symbol')}.")
        score = row.get("score")
        require(isinstance(score, (int, float)) and -1.000001 <= score <= 1.000001, f"Invalid score for {row.get('symbol')}.")
        for horizon_name in ("shortTerm", "longTerm"):
            horizon = row.get(horizon_name)
            require(isinstance(horizon, dict), f"Missing {horizon_name} bias for {row.get('symbol')}.")
            require(horizon.get("label") in LABELS, f"Invalid {horizon_name} label for {row.get('symbol')}.")
            require(isinstance(horizon.get("score"), (int, float)) and -1.000001 <= horizon["score"] <= 1.000001, f"Invalid {horizon_name} score for {row.get('symbol')}.")
            require(isinstance(horizon.get("coverage"), (int, float)) and 0 <= horizon["coverage"] <= 1, f"Invalid {horizon_name} coverage for {row.get('symbol')}.")
            require(isinstance(horizon.get("eventCount"), int) and horizon["eventCount"] >= 0, f"Invalid {horizon_name} event count for {row.get('symbol')}.")
            require(valid_time(horizon.get("updatedAt"), optional=True), f"Invalid {horizon_name} timestamp for {row.get('symbol')}.")
    for event in payload["events"]:
        require(event.get("bias") in LABELS, f"Invalid event bias for {event.get('id')}.")
        require(valid_time(event.get("occurredAt")), f"Invalid occurredAt for {event.get('id')}.")
        for key in ('actual', 'previous', 'forecast'):
            require(key in event, f'Missing nullable event field {key}.')
            require(event.get(key) is None or finite(event[key]), f'Invalid event {key}.')
        require(event.get('signal') in (None, -1, 0, 1), 'Invalid event signal.')
        require(finite(event.get('contribution')), 'Invalid contribution.')
    for key in ('cot', 'cotHistory'):
        identities = [(row.get('reportFamily', 'unknown'), row['marketId'], row['category'], row['reportDate']) for row in payload.get(key, [])]
        require(len(identities) == len(set(identities)), f'Duplicate report identity in {key}.')
    score_inputs = {}
    category_sets = {}
    for row in payload['cot']:
        if row.get('reportFamily'):
            category_sets.setdefault((row['reportFamily'], row['marketId']), set()).add(row['category'])
        if row.get('normalizedScore') is not None and row.get('reportFamily'):
            require(row['reportFamily'] in {'tff', 'disaggregated', 'legacy'}, 'Overlapping report family used in bias.')
            score_inputs.setdefault(row['instrument'], set()).add((row['reportFamily'], row['marketId']))
    require(all(len(inputs) == 1 for inputs in score_inputs.values()), 'Overlapping contracts used in positioning bias.')
    expected_categories = {'tff': 5, 'tff-combined': 5, 'disaggregated': 5, 'disaggregated-combined': 5,
                           'legacy': 3, 'legacy-combined': 3, 'supplemental': 4}
    for (family, market), categories in category_sets.items():
        require(len(categories) == expected_categories.get(family), f'Incomplete categories for {family}/{market}.')
    for row in payload['cot'] + payload.get('cotHistory', []):
        require(valid_time(row.get('reportDate')), 'Invalid positioning date.')
        for key in ('long', 'short', 'net'):
            require(finite(row.get(key)), f'Invalid positioning {key}.')
        require(row['long'] >= 0 and row['short'] >= 0, 'Negative contract count.')
        require(abs(row['long'] - row['short'] - row['net']) < 0.001, 'Positioning net does not reconcile.')
        for key in ('openInterest', 'spread'):
            require(row.get(key) is None or (finite(row[key]) and row[key] >= 0), f'Invalid positioning {key}.')
        require(row.get('normalizedScore') is None or (finite(row['normalizedScore']) and -1 <= row['normalizedScore'] <= 1), 'Invalid normalized positioning score.')
    for row in payload['history']:
        require(finite(row.get('value')) and valid_time(row.get('date')), 'Invalid historical observation.')
    for row in payload['news']:
        url = urlparse(str(row.get('url', '')))
        require(url.scheme in {'http', 'https'} and bool(url.netloc), 'Invalid news link.')
        require(valid_time(row.get('publishedAt')), 'Invalid news timestamp.')
    for price in payload["prices"]:
        require(finite(price.get("price")) and price["price"] > 0, f"Invalid price for {price.get('instrument')}.")
        require(valid_time(price.get("asOf")), f"Invalid price timestamp for {price.get('instrument')}.")
    analysis_symbols = {row["instrument"] for row in payload["analysis"]}
    for analysis in payload["analysis"]:
        require(analysis.get("horizon") in {"shortTerm", "longTerm"}, f"Invalid analysis horizon for {analysis.get('instrument')}.")
    for setup in payload["setups"]:
        require(setup.get("instrument") in analysis_symbols, f"Setup {setup.get('instrument')} has no analysis.")
        require(setup.get("direction") in {"long", "short"}, f"Invalid setup direction for {setup.get('instrument')}.")
        require(0 <= float(setup.get("conviction", -1)) <= 1, f"Invalid setup conviction for {setup.get('instrument')}.")
        require(setup.get("horizon") in {"shortTerm", "longTerm"}, f"Invalid setup horizon for {setup.get('instrument')}.")
    unique(payload["feedHealth"], "feed", "feedHealth")
    for feed in payload["feedHealth"]:
        require(feed.get("status") in {"healthy", "degraded", "unavailable"}, f"Invalid feed status for {feed.get('feed')}.")
        require(valid_time(feed.get("lastAttemptAt")), f"Invalid feed attempt time for {feed.get('feed')}.")
        require(valid_time(feed.get("lastSuccessAt"), optional=True), f"Invalid feed success time for {feed.get('feed')}.")
        require(isinstance(feed.get("staleAfterHours"), (int, float)) and feed["staleAfterHours"] > 0, f"Invalid staleness window for {feed.get('feed')}.")
        require(isinstance(feed.get("itemCount"), int) and feed["itemCount"] >= 0, f"Invalid item count for {feed.get('feed')}.")


def main() -> None:
    payload = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    require(isinstance(payload, dict), "Snapshot root must be an object.")
    validate(payload)
    print(f"Validated {SNAPSHOT}")


if __name__ == "__main__":
    main()
