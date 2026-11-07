import gzip
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
from scripts.official_data import parse_policy, parse_reference_prices, supplement
from scripts.web_refresh import project, refresh

NOW = datetime(2026, 11, 7, 12, tzinfo=timezone.utc)


class OfficialReferenceTests(unittest.TestCase):
    def test_cross_reference_conversion_and_missing_rates(self):
        body = b'<Envelope><Cube><Cube time="2026-11-06"><Cube currency="USD" rate="1.2"/><Cube currency="JPY" rate="180"/><Cube currency="GBP" rate="NaN"/></Cube><Cube time="2026-11-05"><Cube currency="USD" rate="1.25"/><Cube currency="JPY" rate="175"/></Cube></Cube></Envelope>'
        result = {row['instrument']: row for row in parse_reference_prices(body, ['USDJPY', 'EURUSD', 'GBPUSD'], NOW)}
        self.assertEqual(result['USDJPY']['price'], 150)
        self.assertEqual(result['USDJPY']['previousClose'], 140)
        self.assertEqual(result['USDJPY']['priceKind'], 'Daily reference rate')
        self.assertNotIn('GBPUSD', result)

    def test_future_and_malformed_reference_dates_do_not_become_prices(self):
        for body in (b'<Cube time="2027-01-01"><Cube currency="USD" rate="1.2"/></Cube>', b'<Cube time="invalid"><Cube currency="USD" rate="1.2"/></Cube>'):
            with self.assertRaises(ValueError):
                parse_reference_prices(body, ['EURUSD'], NOW)

    def test_policy_days_are_observations_not_invented_release_events(self):
        payload = {'seriesDetail': {'V39079': {'label': 'Target for the overnight rate'}}, 'observations': [
            {'d': '2026-11-06', 'V39079': {'v': '2.5'}}, {'d': '2026-11-07', 'V39079': {'v': 'NaN'}},
            {'d': '2027-01-01', 'V39079': {'v': '3'}}]}
        rows = parse_policy(payload, NOW)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['value'], 2.5)
        self.assertFalse(rows[0]['releaseDateKnown'])
        self.assertNotIn('occurredAt', rows[0])

    def test_failures_retain_previous_observations_and_success_time(self):
        prices = [{'instrument': 'EURUSD', 'price': 1.1, 'asOf': '2026-11-05T00:00:00Z'}]
        history = [{'seriesId': 'boc:policy-rate:CAD', 'date': '2026-11-04', 'value': 2.5}]
        health = {'official-policy': {'lastSuccessAt': '2026-11-05T00:00:00Z'}}
        with patch('scripts.official_data.read_public', side_effect=TimeoutError):
            actual_prices, actual_history = supplement({}, prices, history, health, ['EURUSD'], NOW)
        self.assertEqual(actual_prices, prices)
        self.assertEqual(actual_history, history)
        self.assertEqual(health['official-policy']['lastSuccessAt'], '2026-11-05T00:00:00Z')
        self.assertEqual(health['official-policy']['status'], 'degraded')

    def test_same_day_market_quote_is_not_replaced_by_daily_reference(self):
        prices = [{'instrument': 'EURUSD', 'price': 1.15, 'asOf': '2026-11-06T21:00:00Z'}]
        body = b'<Cube time="2026-11-06"><Cube currency="USD" rate="1.2"/></Cube>'
        with patch('scripts.official_data.read_public', side_effect=[TimeoutError(), body]):
            result, _ = supplement({}, prices, [], {}, ['EURUSD'], NOW)
        self.assertEqual(result, prices)

    def test_new_reference_replaces_older_quote_with_explicit_reference_label(self):
        prices = [{'instrument': 'EURUSD', 'price': 1.15, 'asOf': '2026-11-05T21:00:00Z'}]
        body = b'<Cube time="2026-11-06"><Cube currency="USD" rate="1.2"/></Cube>'
        with patch('scripts.official_data.read_public', side_effect=[TimeoutError(), body]):
            result, _ = supplement({}, prices, [], {}, ['EURUSD'], NOW)
        self.assertEqual(result[0]['price'], 1.2)
        self.assertEqual(result[0]['priceKind'], 'Daily reference rate')

    def test_stale_reference_response_cannot_claim_fresh_collection_health(self):
        body = b'<Cube time="2026-09-01"><Cube currency="USD" rate="1.2"/></Cube>'
        health = {}
        with patch('scripts.official_data.read_public', side_effect=[TimeoutError(), body]):
            result, _ = supplement({}, [], [], health, ['EURUSD'], NOW)
        self.assertEqual(result[0]['referenceDate'], '2026-09-01')
        self.assertEqual(health['official-reference']['status'], 'degraded')
        self.assertEqual(health['official-reference']['lastSuccessAt'], '2026-09-01T00:00:00+00:00')
        self.assertEqual(health['official-reference']['lastAttemptAt'], NOW.isoformat())

    def test_policy_health_uses_source_date_not_download_time(self):
        policy = {'seriesDetail': {'V39079': {'label': 'Target for the overnight rate'}},
                  'observations': [{'d': '2026-10-01', 'V39079': {'v': '2.5'}}]}
        health = {}
        with patch('scripts.official_data.read_public', side_effect=[json.dumps(policy).encode(), TimeoutError()]):
            _, rows = supplement({}, [], [], health, [], NOW)
        self.assertEqual(rows[0]['value'], 2.5)
        self.assertEqual(health['official-policy']['status'], 'degraded')
        self.assertEqual(health['official-policy']['lastSuccessAt'], '2026-10-01T00:00:00+00:00')


class PublicationTests(unittest.TestCase):
    def fixture(self):
        return {'schemaVersion': 1, 'generatedAt': NOW.isoformat(), **{key: [] for key in
            ('currencies', 'pairs', 'events', 'cot', 'history', 'prices', 'news', 'analysis', 'setups', 'feedHealth')}}

    def test_premium_arrays_and_source_metadata_not_published(self):
        full = self.fixture()
        full['prices'] = [{'instrument': 'EURUSD', 'price': 1.1, 'asOf': NOW.isoformat(), 'source': 'private-label', 'sourceUrl': 'https://example.test', 'bars': []}, {'instrument': 'BTCUSD', 'price': 90000}]
        full['cot'] = [{'private': 'position'}]
        free = project(full)
        self.assertEqual(free['cot'], [])
        self.assertEqual(len(free['prices']), 1)
        self.assertNotIn('sourceUrl', free['prices'][0])
        self.assertNotIn('bars', free['prices'][0])

    def test_collector_failure_does_not_replace_public_or_state(self):
        with tempfile.TemporaryDirectory() as folder:
            state, public = Path(folder) / 'state.gz', Path(folder) / 'snapshot.json'
            encoded = json.dumps(self.fixture()).encode()
            state.write_bytes(gzip.compress(encoded))
            public.write_bytes(encoded)
            before = state.read_bytes()
            with patch('scripts.pipeline.run_calendar', side_effect=RuntimeError('failed')):
                with self.assertRaises(RuntimeError):
                    refresh('calendar', state, public)
            self.assertEqual(public.read_bytes(), encoded)
            self.assertEqual(state.read_bytes(), before)

    def test_corrupt_saved_state_is_not_silently_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            state, public = Path(folder) / 'state.gz', Path(folder) / 'snapshot.json'
            state.write_bytes(b'corrupt')
            public.write_text(json.dumps(self.fixture()))
            with self.assertRaises(gzip.BadGzipFile):
                refresh('project', state, public)
            self.assertEqual(state.read_bytes(), b'corrupt')


if __name__ == '__main__':
    unittest.main()
