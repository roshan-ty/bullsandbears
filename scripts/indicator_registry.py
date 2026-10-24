"""Indicator classification used to normalize authorized calendar records."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class IndicatorRule:
    indicator_id: str
    keywords: tuple[str, ...]
    direction: str
    weight: float
    impact: str


COMMON_RULES = (
    IndicatorRule('inflation-expectations', ('inflation expectations',), 'custom', 0.5, 'low'),
    IndicatorRule("policy-rate", ("interest rate", "bank rate", "cash rate", "policy rate", "overnight rate", "refinancing rate", "loan prime rate", "federal funds rate", "official cash rate"), "higher_is_bullish", 1.50, "high"),
    IndicatorRule("policy-communication", ("rate statement", "monetary policy statement", "policy assessment", "press conference", "fomc statement"), "text_policy", 1.45, "high"),
    IndicatorRule("employment-change", ("employment change", "non-farm employment", "nonfarm employment", "adp non-farm"), "higher_is_bullish", 1.35, "high"),
    IndicatorRule("unemployment-rate", ("unemployment rate", "unemployment (mom)", "jobless rate"), "lower_is_bullish", 1.30, "high"),
    IndicatorRule("jobless-claims", ("unemployment claims", "jobless claims", "claimant count change"), "lower_is_bullish", 1.05, "medium"),
    IndicatorRule("wages", ("average hourly earnings", "average earnings", "average cash earnings", "wage price index", "corporate sector wages"), "higher_is_bullish", 1.15, "high"),
    IndicatorRule("core-inflation", ("core cpi", "core pce", "trimmed mean cpi", "median cpi", "core ppi", "core inflation"), "higher_is_bullish", 1.30, "high"),
    IndicatorRule("inflation", ("cpi", "consumer price index", "ppi", "producer price index", "pce price", "inflation", "personal consumption expenditures - price"), "higher_is_bullish", 1.20, "high"),
    IndicatorRule("gdp", ("gdp", "gross domestic product"), "higher_is_bullish", 1.25, "high"),
    IndicatorRule("manufacturing-pmi", ("manufacturing pmi", "manufacturing index", "tankan large manufacturers"), "higher_is_bullish", 1.00, "medium"),
    IndicatorRule("services-pmi", ("services pmi", "non-manufacturing pmi"), "higher_is_bullish", 1.00, "medium"),
    IndicatorRule("business-sentiment", ("ifo business climate", "zew economic sentiment", "kof economic barometer", "consumer confidence", "consumer sentiment", "business confidence", "industrial outlook", "manufacturing confidence"), "higher_is_bullish", 0.80, "medium"),
    IndicatorRule("retail-sales", ("retail sales",), "higher_is_bullish", 0.95, "medium"),
    IndicatorRule("industrial-production", ("industrial production", "industrial output"), "higher_is_bullish", 0.85, "medium"),
    IndicatorRule("housing", ("building permits", "housing starts"), "higher_is_bullish", 0.65, "medium"),
    IndicatorRule("trade-balance", ("trade balance",), "higher_is_bullish", 0.75, "medium"),
    IndicatorRule("exports", ("exports",), "higher_is_bullish", 0.65, "medium"),
    IndicatorRule("imports", ("imports",), "higher_is_bullish", 0.55, "medium"),
    IndicatorRule("foreign-reserves", ("foreign currency reserves", "foreign exchange reserves"), "custom", 0.55, "low"),
    IndicatorRule("dairy-prices", ("globaldairytrade", "gdt price index", "dairy trade price"), "higher_is_bullish", 0.75, "medium"),
    IndicatorRule("oil-inventories", ("crude oil inventories", "eia inventories"), "lower_is_bullish", 1.00, "high"),
    IndicatorRule("oil-policy", ("opec", "jmmc"), "text_policy", 1.20, "high"),
)


def slugify(value: str) -> str:
    return "-".join("".join(character.lower() if character.isalnum() else " " for character in value).split())


def classify_indicator(name: str) -> IndicatorRule:
    normalized = " ".join(name.lower().replace("&", " and ").split())
    matches = [rule for rule in COMMON_RULES if any(keyword in normalized for keyword in rule.keywords)]
    if matches:
        return max(matches, key=lambda rule: max(len(keyword) for keyword in rule.keywords if keyword in normalized))
    return IndicatorRule(slugify(name) or "unknown-event", (), "custom", 0.50, "low")


def normalize_calendar_event(event: dict) -> dict:
    name = str(event.get("name") or event.get("title") or event.get("event") or "Unknown event").strip()
    rule = classify_indicator(name)
    normalized = dict(event)
    normalized['currency'] = str(event.get('currency', '')).upper()
    normalized["name"] = name
    # Derived fields may come from an older published snapshot. Reclassify on
    # every run so obsolete defaults cannot survive a registry correction.
    normalized["indicatorId"] = rule.indicator_id
    normalized["direction"] = rule.direction
    normalized["weight"] = rule.weight
    normalized["impact"] = str(event.get("impact") or rule.impact).lower()
    if normalized["impact"] not in {"low", "medium", "high"}:
        normalized["direction"] = "custom"
        normalized["impact"] = "low"
    # Inventories are not evidence of USD strength. Their direct effects are on
    # energy and CAD; retain the release currency for calendar display.
    normalized["affectedCurrencies"] = (
        ["CAD", "OIL", "BRENT"] if rule.indicator_id == "oil-inventories" else
        ["CNY", "AUD", "NZD"] if normalized["currency"] == "CNY" and rule.indicator_id in
        {"manufacturing-pmi", "inflation", "industrial-production", "gdp", "imports"} else
        [normalized["currency"]]
    )
    if rule.indicator_id == "foreign-reserves" and normalized["currency"] == "CHF":
        normalized["direction"] = "lower_is_bullish"
    return normalized
