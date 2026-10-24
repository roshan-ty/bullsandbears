import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
from types import SimpleNamespace
from scripts.pipeline import calculate_biases, score_event
from scripts.fundamental_rules import record_scores
from scripts.market_data import price_context
from scripts.scraping import fetch_html, script_texts

STAMP='2026-10-24T12:00:00Z'
NOW=datetime(2026,10,24,12,tzinfo=timezone.utc)
def event(currency='USD', name='GDP', actual=2, previous=1):
    return score_event({'id':currency+name,'currency':currency,'name':name,'occurredAt':'2026-10-23T12:00:00Z','actual':actual,'previous':previous})

class ScorecardTests(unittest.TestCase):
    def test_all_asset_models_reconcile_including_fx_quote_sign(self):
        currencies,pairs=calculate_biases([event(),event('EUR',actual=1,previous=2),event(name='CPI')],[],STAMP)
        for row in currencies+pairs:
            for key in ('shortTerm','longTerm'):
                self.assertAlmostEqual(sum(c['contribution'] for c in row[key]['components']),row[key]['score'])
        eur=next(r for r in pairs if r['symbol']=='EURUSD')['shortTerm']
        quote=next(r for r in eur['components'] if r['key']=='quote-macro')
        self.assertLess(quote['weight'],0)
        self.assertLess(quote['contribution'],0)
    def test_crypto_components_reconcile_without_macro(self):
        direct={'available':True,'groupCount':2,'score':.4,'coverage':2/3,'agreement':1}
        _,pairs=calculate_biases([],[],STAMP,[{'instrument':'BTCUSD','shortTerm':direct,'longTerm':direct}])
        h=next(r for r in pairs if r['symbol']=='BTCUSD')['shortTerm']
        self.assertAlmostEqual(h['score'],.4)
        self.assertEqual([r['weight'] for r in h['components']],[0,0,1])
    def test_journal_never_rewrites_a_published_day(self):
        _,pairs=calculate_biases([event(),event('EUR')],[],STAMP)
        first=record_scores([],pairs,[],STAMP)
        pairs[0]['shortTerm']['score']=.99
        self.assertEqual(first,record_scores(first,pairs,[],'2026-10-24T18:00:00Z'))
        self.assertEqual(len(record_scores(first,pairs,[],'2026-10-25T12:00:00Z')),2*len(first))
    def test_journal_excludes_future_price_and_separates_versions(self):
        _,pairs=calculate_biases([event(),event('EUR')],[],STAMP)
        pair=next(r for r in pairs if r['symbol']=='EURUSD')
        first=record_scores([],[pair],[{'instrument':'EURUSD','price':1.2,'asOf':'2026-10-25T00:00:00Z'}],STAMP)
        self.assertIsNone(first[0]['referencePrice'])
        pair['modelVersion']='experimental-v4'
        self.assertEqual(len(record_scores(first,[pair],[],STAMP)),4)

class PriceContextTests(unittest.TestCase):
    def observations(self):
        return [((NOW-timedelta(days=250-i)).date().isoformat(),100+i) for i in range(250)]
    def test_complete_daily_prices_and_minimum_lookback(self):
        rows=self.observations()+[(NOW.date().isoformat(),1)]
        ctx=price_context(rows,'US500',NOW)
        self.assertEqual(ctx['close'],349)
        self.assertEqual(ctx['trend'],'aligned up')
        self.assertEqual(ctx['observations'],250)
        self.assertEqual(price_context(rows[-20:],'US500',NOW)['trend'],'unavailable')
    def test_volatility_annualization_is_asset_specific(self):
        stock=price_context(self.observations(),'US500',NOW)
        crypto=price_context(self.observations(),'BTCUSD',NOW)
        self.assertAlmostEqual(crypto['realizedVolatility20']/stock['realizedVolatility20'],(365/252)**.5)

class ScrapingTests(unittest.TestCase):
    @patch('scripts.scraping.Fetcher.get')
    def test_denied_pages_are_not_retried_with_evasion(self,fetch):
        fetch.return_value=SimpleNamespace(status=403,body=b'Access denied',headers={})
        with self.assertRaisesRegex(ValueError,'403'):fetch_html('https://www.fxblue.com/calendar')
        self.assertEqual(fetch.call_count,1)
    @patch('scripts.scraping.time.sleep')
    @patch('scripts.scraping.Fetcher.get')
    def test_transient_retry_and_large_delay_deferred(self,fetch,sleep):
        fetch.side_effect=[SimpleNamespace(status=429,headers={'Retry-After':'2'}),SimpleNamespace(status=200,body=b'<html>ok</html>',headers={})]
        self.assertEqual(fetch_html('https://www.fxblue.com/calendar'),b'<html>ok</html>')
        sleep.assert_called_once_with(2)
        fetch.side_effect=None;fetch.return_value=SimpleNamespace(status=429,headers={'Retry-After':'120'})
        with self.assertRaisesRegex(ValueError,'later retry'):fetch_html('https://www.fxblue.com/calendar')
    def test_allowlisted_https_and_nonexecuting_extraction(self):
        for url in ['http://www.fxblue.com/calendar','https://localhost/','https://www.fxblue.com.evil.example/','https://user:password@www.fxblue.com/']:
            with self.assertRaises(ValueError):fetch_html(url)
        self.assertEqual(script_texts('<script>throw new Error("never execute")</script>'),['throw new Error("never execute")'])


class JournalPublicationTests(unittest.TestCase):
    def test_merging_cannot_resurrect_expired_records(self):
        from scripts.publish_snapshot import merge_snapshot
        row = {'instrument':'EURUSD','horizon':'shortTerm','recordedAt':'2020-01-01T00:00:00Z','modelVersion':'v3','score':.2}
        latest = {'scoreHistory':[row], 'feedHealth':[], 'generatedAt':STAMP}
        self.assertEqual(merge_snapshot(latest, {'scoreHistory':[], 'feedHealth':[]}, 'core')['scoreHistory'], [])

    def test_an_already_published_record_wins_a_concurrent_refresh(self):
        from scripts.publish_snapshot import merge_snapshot
        row = {'instrument':'EURUSD','horizon':'shortTerm','recordedAt':STAMP,'modelVersion':'v3','score':.2}
        latest = {'scoreHistory':[row], 'feedHealth':[]}
        collected = {'scoreHistory':[{**row,'score':.9}], 'feedHealth':[]}
        self.assertEqual(merge_snapshot(latest,collected,'core')['scoreHistory'],[row])
