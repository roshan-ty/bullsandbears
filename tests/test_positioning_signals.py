import copy
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
from scripts.positioning_signals import retail_points, options_point, cot_points, collect, retain, stamp, validate_points
from scripts.publish_snapshot import merge_snapshot

NOW = datetime(2026, 10, 26, 12, tzinfo=timezone.utc)
HTML = '''<table><thead><tr><th>Symbol</th><th>Action</th><th>Percentage</th><th>Volume</th><th>Positions</th></tr></thead><tbody>
<tr><td>EURUSD</td><td>Short</td><td>20%</td><td>20 lots</td><td>80</td></tr>
<tr><td>Long</td><td>80%</td><td>80 lots</td><td>20</td></tr></tbody></table>'''


class PositioningTests(unittest.TestCase):
    def test_retail_is_volume_not_position_count_and_rejects_inconsistent_markup(self):
        row = retail_points(HTML, {'EURUSD'}, NOW)[0]
        self.assertEqual(row['longPercent'], 80)
        self.assertEqual(row['longPositions'], 20)
        self.assertAlmostEqual(row['score'], -.6)
        validate_points([row])
        for document, allowed in [(HTML.replace('80 lots','3 lots'), {'EURUSD'}), (HTML, {'GBPUSD'}), ('<h1>Access denied</h1>', {'EURUSD'})]:
            with self.assertRaises(ValueError): retail_points(document, allowed, NOW)

    def test_small_sample_keeps_real_percentages_without_a_signal(self):
        row = retail_points(HTML.replace('<td>80</td>', '<td>1</td>'), {'EURUSD'}, NOW)[0]
        self.assertIsNone(row['score'])
        self.assertEqual(row['longPercent'], 80)

    def test_options_direction_deduplication_and_sample_filters(self):
        rows = [{'trade_id': str(i), 'instrument_name': 'BTC-30OCT26-80000-C', 'direction': 'buy', 'amount': 2,
                 'timestamp': NOW.timestamp()*1000 - i*1000} for i in range(20)]
        rows += [dict(rows[0]), {**rows[0], 'trade_id':'block', 'amount':1e9, 'block_trade_id':'abc'},
                 {**rows[0], 'trade_id':'future', 'timestamp':NOW.timestamp()*1000+1},
                 {**rows[0], 'trade_id':'wrong-contract', 'instrument_name':'BTC-PERPETUAL'},
                 {**rows[0], 'trade_id':'old', 'timestamp':NOW.timestamp()*1000-3600_001},
                 {**rows[0], 'trade_id':'put', 'instrument_name':'BTC-30OCT26-80000-P', 'amount':10}]
        point = options_point({'result': {'trades':rows, 'has_more': True}}, 'BTC', NOW)
        self.assertEqual(point['tradeCount'], 21)
        self.assertAlmostEqual(point['score'], .6)
        self.assertFalse(point['truncated'])
        validate_points([point])
        self.assertIsNone(options_point({'result': {'trades':rows[:2]}}, 'BTC', NOW)['score'])

    def test_cot_requires_both_currency_legs_and_never_backdates(self):
        cot = [{'instrument': symbol, 'normalizedScore': value, 'openInterest':100, 'reportDate':'2026-10-20'} for symbol,value in [('EUR',.4),('USD',-.2)]]
        rows = cot_points({'cot':cot,'pairs':[{'symbol':'EURUSD'},{'symbol':'EURAUD'}]}, NOW)
        self.assertEqual(len(rows), 1)
        self.assertAlmostEqual(rows[0]['score'], .3)
        self.assertEqual(rows[0]['recordedAt'], stamp(NOW))
        self.assertEqual(rows[0]['reportDate'], '2026-10-20')
        self.assertEqual(cot_points({'cot':cot,'pairs':[{'symbol':'EURUSD'}]},NOW+timedelta(days=30)), [])

    def test_retention_preserves_original_timestamp_and_removes_future_rows(self):
        row = retail_points(HTML, {'EURUSD'}, NOW)[0]
        first = {**row,'recordedAt':'2026-10-01T00:12:34Z'}
        second = {**row,'recordedAt':'2026-10-01T00:17:34Z'}
        future = {**row,'recordedAt':stamp(NOW+timedelta(seconds=1))}
        result = retain([second,first,row,future],NOW)
        self.assertEqual([r['recordedAt'] for r in result], [first['recordedAt'],row['recordedAt']])

    def test_outage_preserves_saved_data_and_its_age(self):
        saved = retail_points(HTML, {'EURUSD'}, NOW)[0]
        snapshot = {'pairs':[{'symbol':'EURUSD'}], 'positioning':[saved], 'positioningHistory':[saved], 'feedHealth':[], 'generatedAt':stamp(NOW)}
        with patch('scripts.scraping.fetch_html', side_effect=OSError), patch('curl_cffi.requests.get', side_effect=OSError):
            result = collect(snapshot,NOW+timedelta(minutes=5))
        self.assertEqual(result['positioning'], [saved])
        self.assertTrue(all(r['status']=='unavailable' for r in result['feedHealth']))

    def test_background_jobs_own_only_their_fields(self):
        point = retail_points(HTML, {'EURUSD'}, NOW)[0]
        latest = {'generatedAt':stamp(NOW), 'pairs':[{'symbol':'EURUSD','score':.9}], 'news':['new'], 'positioning':[point], 'feedHealth':[{'feed':'retail-positioning','status':'healthy'}]}
        incoming = {'generatedAt':stamp(NOW), 'pairs':[], 'news':[], 'positioning':[], 'positioningHistory':[], 'feedHealth':[{'feed':'retail-positioning','status':'unavailable'}]}
        merged = merge_snapshot(latest,incoming,'positioning')
        self.assertEqual(merged['pairs'],latest['pairs'])
        self.assertEqual(merged['news'],latest['news'])
        stale_core = copy.deepcopy(incoming)
        self.assertEqual(merge_snapshot(latest,stale_core,'core')['positioning'],[point])
        self.assertEqual(merge_snapshot(latest,stale_core,'core')['feedHealth'][0]['status'],'healthy')

    def test_validation_rejects_nonfinite_and_future_options(self):
        row = retail_points(HTML, {'EURUSD'}, NOW)[0]
        for bad in [{**row, 'score':float('nan')}, {**row,'longPercent':101}, {**row,'expiresAt':'2020-01-01T00:00:00Z'}]:
            with self.assertRaises(ValueError): validate_points([bad])


if __name__ == '__main__': unittest.main()
