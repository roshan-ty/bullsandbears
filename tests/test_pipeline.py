import unittest

from scripts.analysis_engine import build_analysis, build_setups
from scripts.indicator_registry import classify_indicator, normalize_calendar_event
from scripts.pipeline import calculate_biases, merge_calendar, score_event, mean_cot_score, market_symbol


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
    def test_goldman_index_is_not_gold(self):
        self.assertIsNone(market_symbol('GOLDMAN SACHS COMMODITY INDEX - CHICAGO MERCANTILE EXCHANGE'))
        self.assertEqual(market_symbol('GOLD - COMMODITY EXCHANGE INC.'), 'XAUUSD')
        self.assertEqual(market_symbol('MICRO GOLD - COMMODITY EXCHANGE INC.'), 'XAUUSD')
    def test_score_event_uses_previous_when_forecast_missing(self):
        event = normalize_calendar_event({
            "id": "1", "name": "Unemployment Rate", "currency": "USD",
            "actual": 3.9, "forecast": None, "previous": 4.0,
        })
        scored = score_event(event)
        self.assertEqual(scored["comparisonKind"], "previous")
        self.assertEqual(scored["bias"], "bullish")

    def test_analysis_and_setup_require_real_bias(self):
        horizon = {'score': 0.5, 'label': 'bullish', 'coverage': 0.8, 'eventCount': 4}
        pair = {"symbol": "EURUSD", "base": "EUR", "quote": "USD", "score": 0.5, "label": "bullish", "rationale": ["EUR stronger"], 'shortTerm': horizon, 'longTerm': horizon}
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

    def test_calendar_identity_deduplicates_casing_and_provider_ids(self):
        from datetime import datetime, timezone
        old = {'id': 'a', 'currency': 'All', 'name': 'IMF Meetings', 'occurredAt': '2026-10-20T00:00:00Z'}
        new = {**old, 'id': 'b', 'currency': 'ALL'}
        self.assertEqual(len(merge_calendar([new], [old], datetime(2026, 10, 24, tzinfo=timezone.utc))), 1)

    def test_merge_keeps_explicit_null_for_upcoming_actual(self):
        from datetime import datetime, timezone
        event = {'id': 'a', 'currency': 'USD', 'name': 'CPI', 'occurredAt': '2026-10-25T00:00:00Z', 'actual': None}
        merged = merge_calendar([], [event], datetime(2026, 10, 24, tzinfo=timezone.utc))
        self.assertIn('actual', merged[0])
        self.assertIsNone(merged[0]['actual'])

    def test_previous_wins_when_forecast_disagrees(self):
        scored = score_event({'name': 'CPI', 'currency': 'USD', 'actual': 3, 'previous': 4, 'forecast': 2})
        self.assertEqual(scored['bias'], 'bearish')
        self.assertEqual(scored['comparisonKind'], 'previous')
        self.assertEqual(score_event({'name': 'CPI', 'actual': 3, 'previous': 3, 'forecast': 2})['bias'], 'neutral')
        self.assertEqual(score_event({'name': 'CPI', 'actual': 3, 'forecast': 2})['bias'], 'unavailable')

    def test_unknown_and_text_events_are_not_guessed(self):
        for name in ('Mystery index', 'FOMC Statement'):
            self.assertEqual(score_event({'name': name, 'actual': 2, 'previous': 1, 'policySignal': 1})['bias'], 'unavailable')

    def test_five_bullish_points_outweigh_three(self):
        events = [score_event({'id': f'{currency}-{i}', 'name': f'CPI measure {i}', 'currency': currency,
                  'occurredAt': '2026-10-22T00:00:00Z', 'actual': 3, 'previous': 2})
                  for currency, count in [('EUR', 3), ('USD', 5)] for i in range(count)]
        _, pairs = calculate_biases(events, [], '2026-10-23T00:00:00Z')
        pair = next(row for row in pairs if row['symbol'] == 'EURUSD')
        self.assertLess(pair['score'], 0)
        self.assertEqual(pair['label'], 'neutral')  # repeated inflation evidence stays inside the decision band

    def test_stale_cot_is_not_current_bias(self):
        from datetime import datetime, timezone
        row = {'instrument': 'USD', 'normalizedScore': 0.8, 'reportDate': '2026-01-01'}
        self.assertIsNone(mean_cot_score([row], 'USD', datetime(2026, 10, 23, tzinfo=timezone.utc)))

    def test_tiny_cot_market_cannot_dominate_liquid_contract(self):
        from datetime import datetime, timezone
        rows = [{'instrument': 'XAUUSD', 'normalizedScore': score, 'openInterest': oi, 'reportDate': '2026-10-20'}
                for score, oi in [(-1, 1), (0.5, 100000)]]
        self.assertGreater(mean_cot_score(rows, 'XAUUSD', datetime(2026, 10, 24, tzinfo=timezone.utc)), 0.49)

    def test_inventory_does_not_score_usd(self):
        event = score_event({'name': 'Crude Oil Inventories', 'currency': 'USD', 'actual': -2, 'previous': 1})
        self.assertNotIn('USD', event['affectedCurrencies'])
        self.assertIn('CAD', event['affectedCurrencies'])

    def test_setup_requires_coverage_and_agreement(self):
        pair = {'symbol': 'EURUSD', 'base': 'EUR', 'quote': 'USD', 'shortTerm': {'score': 0.9, 'label': 'bullish', 'coverage': 0.1, 'eventCount': 1}}
        analysis = build_analysis(pair, [], [], '2026-10-23T00:00:00Z')
        self.assertEqual(build_setups([pair], [analysis], '2026-10-23T00:00:00Z'), [])


if __name__ == "__main__":
    unittest.main()
