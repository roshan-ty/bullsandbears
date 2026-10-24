import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from scripts.pipeline import as_number, recency_factor
from scripts.public_feeds import canonical_url, fetch_public_news, number


class PublicFeedTests(unittest.TestCase):
    def test_zero_revision_replaces_original_previous_value(self):
        from scripts.public_feeds import parse_calendar_page
        document = 'window.calendarComponentStates[0] = {days: [{"events":[{"currency":"USD","name":"GDP","dateline":1792756800,"actual":1,"revision":0,"previous":2}]}]}'
        row = parse_calendar_page(document)[0]
        self.assertEqual(row['previous'], 0)
        self.assertEqual(row['originalPrevious'], 2)

    def test_nonfinite_numbers_are_missing(self):
        for value in ('NaN', 'Infinity', '-Infinity'):
            self.assertIsNone(number(value))
            self.assertIsNone(as_number(value))

    def test_preserves_article_identifier_query(self):
        self.assertEqual(canonical_url('https://example.com/article?id=42&utm_source=rss'),
                         'https://example.com/article?id=42')

    def test_future_events_cannot_influence_bias(self):
        self.assertEqual(recency_factor({'occurredAt': '2030-01-01T00:00:00Z'},
                                        datetime(2026, 1, 1, tzinfo=timezone.utc)), 0)

    @patch('scripts.public_feeds.fetch_rss', side_effect=ValueError('blocked'))
    @patch('scripts.public_feeds.fetch_gdelt_news', return_value=[])
    def test_failed_sources_are_visible_and_never_fabricated(self, _gdelt, _rss):
        health = []
        self.assertEqual(fetch_public_news(health=health), [])
        self.assertGreater(len(health), 1)
        self.assertTrue(all(row['status'] == 'degraded' for row in health))
        self.assertTrue(all(row['lastSuccessAt'] is None for row in health))
class NewsRelevanceTests(unittest.TestCase):
    def test_rejects_sports_even_when_a_currency_word_occurs(self):
        from scripts.public_feeds import relevant_news
        self.assertFalse(relevant_news({'headline':'Chicago Bulls earn a million dollar win in NBA', 'url':'https://example.com/sports/bulls'}))
        self.assertFalse(relevant_news({'headline':'A family discovers its history', 'url':'https://example.com/story'}))
        self.assertTrue(relevant_news({'headline':'Oil prices rise on sanctions and shipping risk', 'url':'https://example.com/story'}))
        self.assertTrue(relevant_news({'headline':'New statistical release', 'url':'https://www.bls.gov/news.release/test.htm'}))
