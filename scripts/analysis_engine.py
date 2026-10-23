"""Deterministic fundamental narratives and setup ranking."""
from __future__ import annotations

from typing import Any


def strongest_events(events: list[dict[str, Any]], currencies: set[str], limit: int = 5) -> list[dict[str, Any]]:
    eligible = [event for event in events if event.get("currency") in currencies and event.get("signal") is not None]
    return sorted(eligible, key=lambda event: abs(float(event.get("contribution", 0))), reverse=True)[:limit]


def event_sentence(event: dict[str, Any]) -> str:
    comparison = event.get("comparisonKind") or "comparison"
    return (
        f"{event.get('currency')} {event.get('name')} was {event.get('bias')} versus the {comparison}; "
        f"its weighted contribution is {float(event.get('contribution', 0)):+.2f}."
    )


def build_analysis(pair: dict[str, Any], events: list[dict[str, Any]], cot: list[dict[str, Any]], generated_at: str) -> dict[str, Any] | None:
    horizons = [("shortTerm", pair.get("shortTerm") or {"score": pair.get("score", 0), "label": pair.get("label", "unavailable")}), ("longTerm", pair.get("longTerm") or {"score": pair.get("score", 0), "label": pair.get("label", "unavailable")})]
    available = [(name, value) for name, value in horizons if value.get("label") != "unavailable"]
    if not available:
        return None
    horizon, active = max(available, key=lambda item: abs(float(item[1].get("score", 0))))
    base, quote = str(pair.get("base", "")), str(pair.get("quote", ""))
    macro_currencies = set(pair.get("macroCurrencies") or (base, quote))
    drivers = strongest_events(events, macro_currencies)
    positioning = [item for item in cot if item.get("instrument") in {base, quote, pair.get("symbol")} and item.get("normalizedScore") is not None]
    driver_body = " ".join(event_sentence(event) for event in drivers) or "No released event currently meets the scoring requirements."
    position_body = " ".join(
        f"{item['instrument']} {item['category']} net positioning is {float(item['net']):,.0f} contracts."
        for item in positioning[:4]
    ) or "No scoreable positioning record is currently mapped to this instrument."
    score = float(active.get("score", 0))
    is_forex = len(base) == 3 and len(quote) == 3
    relative = (
        f"{base} is stronger than {quote}." if is_forex and score > 0 else
        f"{quote} is stronger than {base}." if is_forex and score < 0 else
        f"{pair['symbol']} has positive mapped fundamental alignment." if score > 0 else
        f"{pair['symbol']} has negative mapped fundamental alignment." if score < 0 else
        f"{pair['symbol']} is broadly balanced."
    )
    return {
        "instrument": pair["symbol"], "generatedAt": generated_at, "bias": active["label"], "score": score, "horizon": horizon,
        "sections": [
            {"title": "Relative fundamental balance", "body": f"{relative} Active {horizon} score is {score:+.2f}. Short-term and long-term readings are calculated independently."},
            {"title": "Primary economic drivers", "body": driver_body},
            {"title": "Positioning", "body": position_body},
            {"title": "Interpretation", "body": "The directional reading uses released calendar surprises and mapped positioning only. Market prices, yields and headlines are displayed as confirmation and are excluded from the official bias score."},
        ],
    }


def build_setups(pairs: list[dict[str, Any]], analyses: list[dict[str, Any]], generated_at: str) -> list[dict[str, Any]]:
    analysed = {item["instrument"]: item for item in analyses}
    candidates = [(pair, analysed[pair["symbol"]]) for pair in pairs if pair.get("symbol") in analysed and abs(float(analysed[pair["symbol"]].get("score", 0))) >= 0.30]
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
