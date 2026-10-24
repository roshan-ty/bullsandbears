import unittest
from scripts.publish_snapshot import merge_snapshot


class PublishTests(unittest.TestCase):
    def test_news_preserves_newer_core(self):
        latest = {'events': [2], 'news': [], 'generatedAt': '2026-10-24T12:00:00Z'}
        collected = {'events': [1], 'news': [3], 'generatedAt': '2026-10-24T11:00:00Z'}
        result = merge_snapshot(latest, collected, 'news')
        self.assertEqual(result['events'], [2])
        self.assertEqual(result['news'], [3])
        self.assertEqual(result['generatedAt'], latest['generatedAt'])

    def test_core_preserves_news_and_health(self):
        latest = {'news': [1], 'feedHealth': [{'feed': 'news', 'status': 'healthy'}]}
        result = merge_snapshot(latest, {'news': [], 'events': [2], 'feedHealth': []}, 'core')
        self.assertEqual(result['news'], [1])
        self.assertEqual(result['feedHealth'], latest['feedHealth'])