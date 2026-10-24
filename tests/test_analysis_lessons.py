import unittest
from scripts.analysis_engine import build_analysis
from scripts.pipeline import calculate_biases, score_event
from scripts.validate_snapshot import validate, ARRAY_KEYS


class AnalysisLessonTests(unittest.TestCase):
    stamp = '2026-10-24T00:00:00Z'

    def event(self, identity, currency='USD', name='CPI', actual=3, previous=2, date='2026-10-14T00:00:00Z'):
        return score_event({'id': identity, 'currency': currency, 'name': name,
                            'occurredAt': date, 'actual': actual, 'previous': previous})

    def report(self, symbol, events, horizon='shortTerm'):
        _, pairs = calculate_biases(events, [], self.stamp)
        pair = next(p for p in pairs if p['symbol'] == symbol)
        return build_analysis(pair, events, [], self.stamp, selected_horizon=horizon)

    def test_asset_mapping_and_decay_are_the_actual_model_inputs(self):
        event = self.event('cpi')
        report = self.report('US500', [event])
        evidence = report['lessonEvidence'][0]
        self.assertEqual(evidence['eventId'], 'cpi')
        self.assertEqual(evidence['assetSensitivity'], -1)
        self.assertEqual(evidence['regionWeight'], 1)
        self.assertEqual(evidence['mappedContribution'], -event['contribution'])
        self.assertAlmostEqual(evidence['decay'], .5)

    def test_quote_and_shared_exposure_are_not_mislabeled_as_direct_base_news(self):
        events = [self.event('us'), self.event('eu', 'EUR'), self.event('cn', 'CNY', 'Manufacturing PMI')]
        self.assertEqual(next(e for e in self.report('EURUSD', events)['lessonEvidence'] if e['eventId'] == 'us')['affectedLegs'], ['USD'])
        shared = next(e for e in self.report('AUDNZD', events)['lessonEvidence'] if e['eventId'] == 'cn')
        self.assertEqual(shared['affectedLegs'], ['AUD', 'NZD'])

    def test_all_series_including_zero_are_taught_but_old_future_and_missing_are_not(self):
        events = [self.event(str(i), name=f'CPI series {i}', actual=2, previous=2) for i in range(15)]
        events += [self.event('older', name='CPI series 0', date='2026-10-10T00:00:00Z'),
                   self.event('future', date='2026-10-25T00:00:00Z'),
                   self.event('missing', name='GDP', actual=None),
                   self.event('aged', name='Retail Sales', date='2026-09-01T00:00:00Z')]
        short = self.report('US500', events)['lessonEvidence']
        self.assertEqual(len(short), 15)
        self.assertTrue(all(e['mappedContribution'] == 0 for e in short))
        long = self.report('US500', events, 'longTerm')['lessonEvidence']
        self.assertIn('aged', {e['eventId'] for e in long})
        self.assertNotIn('future', {e['eventId'] for e in long})

    def test_crypto_does_not_teach_unmapped_gdp_as_a_scored_token_driver(self):
        evidence = self.report('BTCUSD', [self.event('cpi'), self.event('gdp', name='GDP')])['lessonEvidence']
        self.assertEqual([e['eventId'] for e in evidence], ['cpi'])

    def test_publisher_rejects_broken_references_and_wrong_decay(self):
        event = self.event('cpi')
        report = self.report('US500', [event])
        payload = {key: [] for key in ARRAY_KEYS}
        payload.update(schemaVersion=1, generatedAt=self.stamp, events=[event], analysis=[report])
        validate(payload)
        item = report['lessonEvidence'][0]
        item['decay'] = .9
        with self.assertRaisesRegex(ValueError, 'Incorrect lesson decay'):
            validate(payload)
        item['decay'] = .5
        item['eventId'] = 'not-published'
        with self.assertRaisesRegex(ValueError, 'references missing event'):
            validate(payload)


if __name__ == '__main__':
    unittest.main()
