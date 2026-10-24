"""Deterministic fundamental narratives and setup ranking."""
from __future__ import annotations

from typing import Any
from datetime import datetime, timezone
from math import exp, log
try:
    from .fundamental_rules import RULES, GROUPS
    from .asset_models import asset_events, model_note
except ImportError:
    from fundamental_rules import RULES, GROUPS
    from asset_models import asset_events, model_note


def strongest_events(events: list[dict[str, Any]], currencies: set[str], limit: int | None = 12, generated_at: str | None = None, horizon: str = 'shortTerm') -> list[dict[str, Any]]:
    now = datetime.fromisoformat(generated_at.replace('Z', '+00:00')) if generated_at else datetime.now(timezone.utc)
    latest = {}
    for event in sorted(events, key=lambda row: str(row.get('occurredAt', ''))):
        try:
            date = datetime.fromisoformat(event['occurredAt'].replace('Z', '+00:00'))
            age = (now - date).total_seconds() / 86400
        except (KeyError, ValueError, TypeError):
            continue
        if currencies.intersection(event.get('affectedCurrencies', [event.get('currency')])) and event.get('signal') is not None and 0 <= age <= (30 if horizon == 'shortTerm' else 180):
            latest[(event.get('currency'), event.get('seriesKey') or event.get('name'))] = event
    eligible = list(latest.values())
    return sorted(eligible, key=lambda event: abs(float(event.get("contribution", 0))), reverse=True)[:limit]


def event_sentence(event: dict[str, Any]) -> str:
    comparison = event.get("comparisonKind") or "comparison"
    return (
        f"{event.get('currency')} {event.get('name')}: actual {event.get('actual')} versus {comparison} {event.get('comparison')}, {event.get('bias')}; "
        f"its weighted contribution is {float(event.get('contribution', 0)):+.2f}."
    )


def build_analysis(pair: dict[str, Any], events: list[dict[str, Any]], cot: list[dict[str, Any]], generated_at: str, crypto=None, selected_horizon=None) -> dict[str, Any] | None:
    horizons = [("shortTerm", pair.get("shortTerm") or {"score": pair.get("score", 0), "label": pair.get("label", "unavailable")}), ("longTerm", pair.get("longTerm") or {"score": pair.get("score", 0), "label": pair.get("label", "unavailable")})]
    available = [(name, value) for name, value in horizons if value.get("label") != "unavailable" and (selected_horizon is None or name == selected_horizon)]
    if not available:
        return None
    horizon, active = max(available, key=lambda item: abs(float(item[1].get("score", 0))))
    base, quote = str(pair.get("base", "")), str(pair.get("quote", ""))
    macro_currencies = set(pair.get("macroCurrencies") or (base, quote))
    model_events = asset_events(pair['symbol'], events, pair.get('macroWeights', {})) if pair.get('modelVersion') else events
    drivers = strongest_events(model_events, macro_currencies | {pair['symbol']}, generated_at=generated_at, horizon=horizon)
    now = datetime.fromisoformat(generated_at.replace('Z', '+00:00'))
    positioning = []
    position_symbols = {pair['symbol']} if pair.get('modelVersion') else {base, quote, pair.get('symbol')}
    for item in cot:
        try:
            age = (now - datetime.fromisoformat(item['reportDate']).replace(tzinfo=timezone.utc)).days
            if item.get('instrument') in position_symbols and item.get('normalizedScore') is not None and 0 <= age <= 21:
                positioning.append(item)
        except (KeyError, ValueError, TypeError):
            continue
    driver_body = " ".join(event_sentence(event) for event in drivers) or "No released event currently meets the scoring requirements."
    position_body = " ".join(
        f"{item['instrument']} {item['category']} net positioning is {float(item['net']):,.0f} contracts."
        for item in positioning[:4]
    ) or "No scoreable positioning record is currently mapped to this instrument."
    score = float(active.get("score", 0))
    is_forex = len(base) == 3 and len(quote) == 3 and 'macroCurrencies' not in pair
    # Keep every eligible latest release for the teaching report, not just the
    # largest drivers. Values reference the snapshot rather than duplicating it.
    evidence = []
    originals = {event['id']: event for event in events}
    for event in strongest_events(model_events, macro_currencies | {pair['symbol']}, limit=None, generated_at=generated_at, horizon=horizon):
        original = originals[event['id']]
        age = (now - datetime.fromisoformat(event['occurredAt'].replace('Z', '+00:00'))).total_seconds() / 86400
        direct = pair['symbol'] in original.get('affectedCurrencies', [])
        evidence.append({'eventId': event['id'], 'ageDays': age,
                         'decay': exp(-log(2) * age / (10 if horizon == 'shortTerm' else 60)),
                         'mappedContribution': event['contribution'] or 0.0,
                         'assetSensitivity': event.get('assetEffect'),
                         'regionWeight': (1.0 if direct else pair.get('macroWeights', {}).get(event.get('currency'))) if not is_forex else None,
                         'affectedLegs': [leg for leg in (base, quote) if leg in original.get('affectedCurrencies', [original.get('currency')])] if is_forex else [],
                         'factor': GROUPS.get(original.get('indicatorId'), 'growth')})
    relative = (
        f"{pair['symbol']} is within the neutral score band." if active["label"] == "neutral" else
        f"{base} is stronger than {quote}." if is_forex and score > 0 else
        f"{quote} is stronger than {base}." if is_forex and score < 0 else
        f"{pair['symbol']} has positive mapped fundamental alignment." if score > 0 else
        f"{pair['symbol']} has negative mapped fundamental alignment." if score < 0 else
        f"{pair['symbol']} is broadly balanced."
    )
    driver_sections = []
    for event in drivers:
        effect = float(event.get('contribution', 0))
        affected = event.get('affectedCurrencies', [event.get('currency')])
        if is_forex and base in affected and quote in affected:
            driver_sections.append({'title': event['name'], 'body': event_sentence(event) + f" This enters both {base} and {quote} theme calculations; its isolated effect on {pair['symbol']} cannot be read from the release sign alone."})
            continue
        if is_forex and quote in event.get('affectedCurrencies', [event.get('currency')]):
            effect *= -1
        elif not is_forex and not pair.get('modelVersion'):
            effect *= float(pair.get('macroWeights', {}).get(event.get('currency'), 1))
        direction = 'supports' if effect > 0 else 'weighs on' if effect < 0 else 'is neutral for'
        driver_sections.append({'title': event['name'], 'body': event_sentence(event) + f" This {direction} {pair['symbol']}."})
    themes = {GROUPS.get(event.get('indicatorId'), 'growth') for event in drivers}
    rule_sections = [{'title': 'Economic channel · ' + rule['name'], 'body': rule['mechanism'] + ' Model assumption: ' + rule['mapping'] + ' Conditions: ' + rule['limit']} for rule in RULES if rule['id'] in themes]
    direct = next((row.get(horizon, {}) for row in (crypto or []) if row['instrument'] == pair['symbol']), {})
    direct_sections = [{'title': metric['name'], 'body': f"{metric['windowDays']}-day window comparison: {metric['change']:+.2f} {metric['changeUnit']}. Data through {metric['asOf']}; directional component {metric['score']:+.2f}."} for metric in direct.get('metrics', [])]
    result = {
        "instrument": pair["symbol"], "generatedAt": generated_at, "bias": active["label"], "score": score, "horizon": horizon,
        "lessonEvidence": evidence,
        "sections": [
            *([{'title': 'Model scope', 'body': pair.get('rationale', [model_note(pair['symbol'], bool(positioning))])[0]}] if pair.get('modelVersion') else []),
            {"title": "Relative fundamental balance", "body": f"{relative} Active {horizon} score is {score:+.2f}. Short-term and long-term readings are calculated independently."},
            {"title": "Primary economic drivers", "body": driver_body},
            *driver_sections,
            *direct_sections,
            *rule_sections,
            {"title": "Positioning", "body": position_body},
            {"title": "Interpretation", "body": "The directional reading balances released actual-versus-previous changes by independent economic theme and includes mapped positioning. Crypto additionally uses available network, issuance and chain-liquidity evidence. Historical macro series provide context and are not treated as dated release surprises. Market prices, yields and headlines are displayed as confirmation and are excluded from the official bias score."},
        ],
    }
    if selected_horizon is None:
        result['horizonViews'] = {key: view for key in ('shortTerm', 'longTerm')
            if (view := build_analysis(pair, events, cot, generated_at, crypto, key)) is not None}
    return result


def build_setups(pairs: list[dict[str, Any]], analyses: list[dict[str, Any]], generated_at: str) -> list[dict[str, Any]]:
    analysed = {item["instrument"]: item for item in analyses}
    candidates = []
    for pair in pairs:
        analysis = analysed.get(pair.get('symbol'))
        if not analysis:
            continue
        active = pair.get(analysis['horizon'], {})
        short, long = pair.get('shortTerm', {}), pair.get('longTerm', {})
        conflict = short.get('label') in {'bullish', 'bearish'} and long.get('label') in {'bullish', 'bearish'} and short['label'] != long['label']
        if abs(float(analysis.get('score', 0))) >= 0.30 and active.get('coverage', 0) >= 0.60 and active.get('eventCount', 0) >= 3 and not conflict and not active.get('componentConflict') and active.get('agreement', 1) >= .35:
            candidates.append((pair, analysis))
    candidates.sort(key=lambda item: abs(float(item[1]["score"])), reverse=True)
    return [
        {
            "instrument": pair["symbol"], "horizon": analysis.get("horizon", "shortTerm"),
            "direction": "long" if float(analysis["score"]) > 0 else "short",
            "conviction": min(1.0, abs(float(analysis["score"]))),
            "generatedAt": generated_at,
            "reasons": pair.get("rationale", [])[:3],
            "confirmations": ["Check price structure, yield direction and current headlines separately."],
            "risks": ["A new high-impact release or material revision can invalidate the current reading."],
        }
        for pair, analysis in candidates[:12]
    ]
