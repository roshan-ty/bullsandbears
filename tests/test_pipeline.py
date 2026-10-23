import unittest

from scripts.analysis_engine import build_analysis, build_setups
from scripts.indicator_registry import classify_indicator, normalize_calendar_event
from scripts.pipeline import calculate_biases, merge_calendar, score_event


class IndicatorRegistryTests(unittest.TestCase):
    def test_unemployment_is_lower_is_bullish(self):
        rule = classify_indicator("Unemployment Rate")
        self.assertEqual(rule.direction, "lower_is_bullish")
        self.assertGreater(rule.weight, 1)

    def test_normalization_applies_registry_defaults(self):
        event = normalize_calendar_event({"name": "Core CPI y/y", "currency": "USD"})
        self.assertEqual(event["direction"], "higher_is_bullish")
        self.assertEqual(event["impact"], "high")


class PipelineTests(unittest.TestCase):
    def test_score_event_uses_previous_when_forecast_missing(self):
        event = normalize_calendar_event({
            "id": "1", "name": "Unemployment Rate", "currency": "USD",
            "actual": 3.9, "forecast": None, "previous": 4.0,
        })
        scored = score_event(event)
        self.assertEqual(scored["comparisonKind"], "previous")
        self.assertEqual(scored["bias"], "bullish")

    def test_analysis_and_setup_require_real_bias(self):
        pair = {"symbol": "EURUSD", "base": "EUR", "quote": "USD", "score": 0.5, "label": "bullish", "rationale": ["EUR stronger"]}
        analysis = build_analysis(pair, [], [], "2026-10-23T00:00:00Z")
        self.assertIsNotNone(analysis)
        setups = build_setups([pair], [analysis], "2026-10-23T00:00:00Z")
        self.assertEqual(setups[0]["direction"], "long")

    def test_horizons_use_distinct_lookbacks(self):
        events = [score_event({"id": "old", "name": "GDP", "currency": "USD", "occurredAt": "2026-09-01T00:00:00Z", "actual": 2, "forecast": 1, "previous": 1, "impact": "high"})]
        currencies, _ = calculate_biases(events, [], "2026-10-23T00:00:00Z")
        usd = next(item for item in currencies if item["symbol"] == "USD")
        self.assertEqual(usd["shortTerm"]["label"], "unavailable")
        self.assertEqual(usd["longTerm"]["label"], "bullish")

    def test_calendar_merge_preserves_actual(self):
        previous = [{"id": "event", "occurredAt": "2026-10-22T00:00:00Z", "actual": 4.0, "forecast": 3.9}]
        current = [{"id": "event", "occurredAt": "2026-10-22T00:00:00Z", "actual": None, "forecast": 4.1}]
        merged = merge_calendar(current, previous, __import__('datetime').datetime(2026, 10, 23, tzinfo=__import__('datetime').timezone.utc))
        self.assertEqual(merged[0]["actual"], 4.0)
        self.assertEqual(merged[0]["forecast"], 4.1)


if __name__ == "__main__":
    unittest.main()