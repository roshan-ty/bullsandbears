import json
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from scripts.global_calendar import page_objects, normalize, fetch_global_calendar
from scripts.pipeline import assign_position_scores, calculate_biases, score_event, fetch_cftc_dataset, fetch_cftc
from scripts.quality import archive_positions
from scripts.analysis_engine import build_analysis, build_setups


class GlobalCalendarTests(unittest.TestCase):
    def row(self, **overrides):
        return {'eventId': '00000000-0000-0000-0000-000000000001',
                'eventDateDetailId': '00000000-0000-0000-0000-000000000002',
                'eventDateTime': '$D2026-10-22T06:00:00.000Z', 'currency': 'NOK',
                'name': 'Retail Sales', 'actual': 2.5, 'previous': 2, 'forecast': 3,
                'potency': 'B', 'unit': None, 'importance': 'LOW', **overrides}

    def page(self, row):
        return '<script>self.__next_f.push(' + json.dumps([1, '12:' + json.dumps(row)]) + ')</script>'

    def test_page_is_data_and_preserves_units_zero_revision(self):
        rows = page_objects(self.page(self.row(revisited=0)))
        result = normalize(rows[0])
        self.assertEqual(result['actual'], 2500000000)
        self.assertEqual(result['previous'], 0)
        self.assertEqual(result['occurredAt'], '2026-10-22T06:00:00Z')

    def test_missing_previous_is_never_inferred_from_neighbor(self):
        detail = self.row(actual=None, previous=2, pastEvents=[
            {'eventDateDetailId': '00000000-0000-0000-0000-000000000003',
             'dateTime': '2026-09-22T06:00:00Z', 'actual': 2},
            {'eventDateDetailId': '00000000-0000-0000-0000-000000000004',
             'dateTime': '2026-08-22T06:00:00Z', 'actual': 1}])
        with patch('scripts.global_calendar.request_bytes', return_value=self.page(detail).encode()), patch('scripts.global_calendar.fetch_details', return_value=[detail]):
            rows = fetch_global_calendar(now=datetime(2026, 10, 24, tzinfo=timezone.utc))
        historical = [row for row in rows if row['occurredAt'].startswith('2026-09')][0]
        self.assertIsNone(historical['previous'])
        self.assertIsNone(score_event(historical)['signal'])

    def test_challenge_unknown_units_and_timezone_do_not_become_data(self):
        self.assertEqual(page_objects('<html>Sign in</html>'), [])
        self.assertIsNone(normalize(self.row(potency='UNKNOWN')))
        self.assertIsNone(normalize(self.row(eventDateTime='2026-10-22T06:00:00')))


class AssetModelTests(unittest.TestCase):
    def pair(self, symbol, name, actual=2, previous=1):
        event = score_event({'id': 'test', 'currency': 'USD', 'name': name,
            'occurredAt': '2026-10-22T12:00:00Z', 'actual': actual, 'previous': previous})
        _, pairs = calculate_biases([event], [], '2026-10-24T00:00:00Z')
        return next(row for row in pairs if row['symbol'] == symbol), event

    def test_growth_and_inflation_have_opposite_index_effects(self):
        self.assertEqual(self.pair('US500', 'GDP')[0]['label'], 'bullish')
        self.assertEqual(self.pair('US500', 'CPI')[0]['label'], 'bearish')
        self.assertEqual(self.pair('US500', 'Interest Rate Decision', 1, 2)[0]['label'], 'bullish')

    def test_crypto_does_not_invert_every_usd_indicator(self):
        self.assertEqual(self.pair('BTCUSD', 'GDP')[0]['label'], 'unavailable')
        pair, event = self.pair('AVAXUSD', 'CPI', 1, 2)
        self.assertEqual(pair['label'], 'bullish')
        self.assertLessEqual(pair['shortTerm']['coverage'], 0.35)
        analysis = build_analysis(pair, [event], [], '2026-10-24T00:00:00Z')
        self.assertEqual(build_setups([pair], [analysis], '2026-10-24T00:00:00Z'), [])

    def test_analysis_explains_the_scored_effect(self):
        pair, event = self.pair('US500', 'CPI')
        analysis = build_analysis(pair, [event], [], '2026-10-24T00:00:00Z')
        section = next(row for row in analysis['sections'] if row['title'] == 'CPI')
        self.assertIn('weighs on US500', section['body'])

    def test_asset_analysis_cannot_claim_usd_positioning_as_direct_evidence(self):
        pair, event = self.pair('BTCUSD', 'CPI')
        cot = [{'instrument': 'USD', 'category': 'Leveraged Money', 'net': 100,
                'normalizedScore': 0.5, 'reportDate': '2026-10-20'}]
        analysis = build_analysis(pair, [event], cot, '2026-10-24T00:00:00Z')
        section = next(row for row in analysis['sections'] if row['title'] == 'Positioning')
        self.assertNotIn('USD Leveraged', section['body'])
        self.assertIsNone(score_event({'name': 'UoM Inflation Expectations', 'actual': 3, 'previous': 2})['signal'])


class ReportFamilyTests(unittest.TestCase):
    def test_failed_families_retain_and_migrate_their_previous_records(self):
        old = [{'instrument': instrument, 'marketId': instrument, 'category': category,
                'reportDate': '2026-10-20', 'net': 1, 'openInterest': 100}
               for instrument, category in [('USD', 'Leveraged Money'), ('XAUUSD', 'Managed Money')]]
        with patch('scripts.pipeline.existing_snapshot', return_value={'cot': old}), \
             patch('scripts.pipeline.fetch_cftc_dataset', side_effect=OSError), \
             patch('scripts.pipeline.fetch_annual_report', side_effect=OSError), \
             patch('scripts.pipeline.atomic_json'):
            rows = fetch_cftc()
        self.assertEqual({row['reportFamily'] for row in rows}, {'tff', 'disaggregated'})
        self.assertEqual(len(rows), 2)

    def test_overlap_and_small_contracts_cannot_inflate_bias(self):
        rows = [{'instrument': 'BTCUSD', 'marketId': market, 'reportFamily': family,
                 'category': category, 'openInterest': oi, 'net': 10, 'reportDate': '2026-10-20'}
                for market, family, category, oi in [
                    ('1', 'tff', 'Leveraged Money', 1000), ('1', 'tff-combined', 'Leveraged Money', 1200),
                    ('1', 'legacy', 'Non-commercial', 1000), ('2', 'tff', 'Leveraged Money', 20)]]
        with patch('scripts.pipeline.datetime') as clock:
            clock.now.return_value = datetime(2026, 10, 24, tzinfo=timezone.utc)
            clock.fromisoformat.side_effect = datetime.fromisoformat
            assign_position_scores(rows)
        self.assertEqual([row['normalizedScore'] for row in rows], [0.01, None, None, None])

    def test_archive_keeps_same_contract_in_distinct_families(self):
        rows = [{'reportFamily': family, 'marketId': '1', 'category': 'Non-reportable', 'reportDate': '2026-10-20'} for family in ('tff', 'legacy')]
        self.assertEqual(len(archive_positions(rows, [], datetime(2026, 10, 24, tzinfo=timezone.utc))), 2)

    def test_pagination_does_not_silently_truncate(self):
        with patch('scripts.pipeline.request_json', side_effect=[[{'MixedCase': '1'}] * 5000, [{}] * 3]) as request:
            rows = fetch_cftc_dataset('gpe5-46if')
            self.assertEqual(len(rows), 5003)
            self.assertEqual(rows[0], {'mixedcase': '1'})
            self.assertIn('%24offset=5000', request.call_args[0][0])
