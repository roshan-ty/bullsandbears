import unittest
from scripts.publish_snapshot import merge_snapshot


class PublishTests(unittest.TestCase):
    def test_calendar_commit_preserves_price_history_cooldown_and_news_fields(self):
        latest = {'events': [1], 'news': [2], 'prices': [3], 'cot': [4], 'history': [5], 'coreUpdatedAt': '2026-10-20T12:00:00Z',
                  'feedHealth': [{'feed': 'news', 'status': 'healthy'}]}
        update = {'events': [6], 'news': [], 'prices': [], 'cot': [], 'history': [], 'coreUpdatedAt': 'wrong',
                  'feedHealth': [{'feed': 'calendar', 'status': 'healthy'}, {'feed': 'news', 'status': 'degraded'}]}
        result = merge_snapshot(latest, update, 'calendar')
        self.assertEqual(result['events'], [6])
        for key in ('news', 'prices', 'cot', 'history', 'coreUpdatedAt'):
            self.assertEqual(result[key], latest[key])
        self.assertEqual(result['feedHealth'][0]['status'], 'healthy')

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
