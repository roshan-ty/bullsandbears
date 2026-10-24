import io
import json
import unittest
import zipfile
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from scripts.evidence import balance_events, crypto_fundamentals, blend_crypto
from scripts.research_data import parse_bis, parse_network, fetch_stablecoins, collect_research
from scripts.pipeline import label, HORIZONS, pair_horizon

NOW = datetime(2026, 10, 24, 12, tzinfo=timezone.utc)

def points(metric='TxCnt', group='usage', count=70):
    return [{'instrument': 'BTCUSD', 'metric': metric, 'name': metric, 'group': group,
             'date': (NOW - timedelta(days=i)).date().isoformat(), 'value': 200 if i <= 7 else 100}
            for i in range(1, count + 1)]

class EvidenceTests(unittest.TestCase):
    def test_correlated_events_share_a_capped_factor(self):
        score, factors, _ = balance_events([({'indicatorId': 'inflation', 'contribution': 3}, 1)] * 50)
        self.assertEqual(len(factors), 1)
        self.assertLess(score, .47)
        diverse, factors, _ = balance_events([({'indicatorId': key, 'contribution': 3}, 1) for key in ['inflation', 'policy-rate', 'employment-change']])
        self.assertGreater(diverse, score)
        self.assertEqual(len(factors), 3)

    def test_small_scores_are_neutral(self):
        self.assertEqual(label(.079), 'neutral')
        self.assertEqual(label(-.079), 'neutral')
        self.assertEqual(label(.09), 'bullish')

    def test_fixed_windows_exclude_partial_and_nonfinite_observations(self):
        rows = points() + [{'instrument': 'BTCUSD', 'metric': 'TxCnt', 'name': 'x', 'group': 'usage', 'date': NOW.date().isoformat(), 'value': 1e9}]
        result = crypto_fundamentals(rows, NOW)[0]['shortTerm']
        self.assertAlmostEqual(result['metrics'][0]['change'], 100)
        self.assertEqual(result['metrics'][0]['observations'], 14)
        rows[0]['value'] = float('nan')
        self.assertEqual(crypto_fundamentals(rows, NOW)[0]['shortTerm']['metrics'][0]['observations'], 13)

    def test_sparse_window_is_not_resampled_as_daily(self):
        rows = [r for i, r in enumerate(points()) if i % 2 == 0]
        self.assertFalse(crypto_fundamentals(rows, NOW)[0]['shortTerm']['available'])

    def test_stale_metrics_are_excluded(self):
        self.assertFalse(crypto_fundamentals(points()[5:], NOW)[0]['shortTerm']['available'])

    def test_correlated_network_metrics_get_one_vote(self):
        rows = points() + points('AdrActCnt') + points('FeeTotNtv', 'fees')
        self.assertEqual(crypto_fundamentals(rows, NOW)[0]['shortTerm']['groupCount'], 1)

    def test_issuance_acceleration_is_negative(self):
        rows = points('SplyCur', 'supply')
        for i, row in enumerate(rows):
            row['value'] = 1000 * (1.01 ** (70-i)) if i < 7 else 1000
        self.assertLess(crypto_fundamentals(rows, NOW)[0]['shortTerm']['metrics'][0]['score'], 0)

    def test_one_group_and_conflicting_macro_cannot_look_broad(self):
        horizon = {'eventCount': 2, 'eventScore': -.6, 'cotScore': 0, 'factorCount': 2, 'agreement': 1}
        direct = {'available': True, 'groupCount': 1, 'score': .8, 'coverage': 1/3, 'agreement': 1}
        result = blend_crypto(horizon, direct, HORIZONS['shortTerm'])
        self.assertTrue(result['componentConflict'])
        self.assertLessEqual(result['coverage'], .5)
        self.assertEqual(result['evidenceQuality'], 'limited')

    def test_pair_retains_weakest_leg_quality(self):
        a = {'label': 'bullish', 'score': .6, 'coverage': .8, 'eventCount': 4, 'agreement': .8, 'factorCount': 3}
        b = {**a, 'score': -.3, 'coverage': .2, 'agreement': .1}
        result = pair_horizon(a,b,NOW.isoformat())
        self.assertEqual(result['evidenceQuality'], 'limited')
        self.assertEqual(result['agreement'], .1)

class ResearchTests(unittest.TestCase):
    def test_bis_monthly_yoy_filters_units_and_labels_periods(self):
        data = 'FREQ:Frequency,REF_AREA:Reference area,TIME_PERIOD:Time period or range,OBS_VALUE:Observation Value,UNIT_MEASURE:Unit of measure\nM:Monthly,NO:Norway,2026-08,3.5,771:YoY\nM:Monthly,NO:Norway,2026-08,200,628:Index\nD:Daily,NO:Norway,2026-08-01,3,771:YoY\n'
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as z: z.writestr('test.csv',data)
        rows = parse_bis(buffer.getvalue(),'inflation',NOW.isoformat())
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0]['value'],3.5)
        self.assertEqual(rows[0]['instrument'],'NOK')
        self.assertFalse(rows[0]['releaseDateKnown'])

    def test_network_parser_excludes_invalid_negative_and_partial_days(self):
        rows = parse_network([{'time':'2026-10-24','TxCnt':'100'}, {'time':'2026-10-23','TxCnt':'NaN'}, {'time':'2026-10-22','TxCnt':'-1'}, {'time':'2026-10-21','TxCnt':'123'}], 'BTCUSD',['TxCnt'],NOW)
        self.assertEqual([r['value'] for r in rows],[123])

    @patch('scripts.research_data.get_json')
    def test_stablecoin_other_currency_pegs_are_not_added(self,mock):
        mock.return_value=[{'date':int((NOW-timedelta(days=1)).timestamp()),'totalCirculating':{'peggedUSD':100,'peggedEUR':200}}]
        self.assertEqual(fetch_stablecoins('Ethereum','ETHUSD',NOW)[0]['value'],100)

    @patch('scripts.research_data.fetch_stablecoins',side_effect=ValueError)
    @patch('scripts.research_data.fetch_worldbank',side_effect=ValueError)
    @patch('scripts.research_data.fetch_bis',side_effect=ValueError)
    @patch('scripts.research_data.get_json',side_effect=ValueError)
    def test_failed_sources_preserve_original_observation_dates(self,*mocks):
        old={'seriesId':'bis:policy-rate:NO','date':'2026-08-01','value':4}
        prior={'history':[old],'cryptoHistory':points()}
        history,crypto,health=collect_research(prior,NOW)
        self.assertEqual(history,[old])
        self.assertEqual(crypto,prior['cryptoHistory'])
        self.assertTrue(all(r['status']=='degraded' for r in health))
