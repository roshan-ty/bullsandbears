import io
import json
import unittest
import zipfile
from scripts.public_feeds import parse_calendar_page
from scripts.report_archives import read_zip_rows


class CalendarPageTests(unittest.TestCase):
    def test_structured_page_preserves_actual_and_revision(self):
        event = {'currency': 'USD', 'name': 'Employment Change', 'dateline': 1792359000,
                 'actual': '150K', 'previous': '100K', 'revision': '110K', 'forecast': '160K', 'impactName': 'high'}
        document = 'window.calendarComponentStates[1] = { days: ' + json.dumps([{'events': [event]}]) + ' };'
        rows = parse_calendar_page(document)
        self.assertEqual(rows[0]['actual'], 150000)
        self.assertEqual(rows[0]['previous'], 110000)
        self.assertEqual(rows[0]['originalPrevious'], 100000)

    def test_challenge_is_not_data(self):
        with self.assertRaises(ValueError):
            parse_calendar_page('<html>Verify you are human</html>')

    def test_preserves_complex_releases_zero_and_event_types(self):
        events = [
            {'id': 1, 'currency': 'USD', 'name': 'Bond Auction', 'dateline': 1792359000, 'actual': '4.25|2.7', 'forecast': '0', 'previous': '4.2|2.6', 'hasDataValues': True},
            {'id': 2, 'currency': 'USD', 'name': 'Fed Speech', 'dateline': 1792359001, 'actual': '', 'forecast': '', 'previous': '', 'hasDataValues': False},
            {'id': 3, 'currency': 'USD', 'name': 'Invalid timestamp', 'dateline': 'not a date'},
        ]
        rows = parse_calendar_page('window.calendarComponentStates[1] = { days: ' + json.dumps([{'events': events}]) + ' };')
        self.assertEqual(len(rows), 2)
        self.assertIsNone(rows[0]['actual'])
        self.assertEqual(rows[0]['actualText'], '4.25|2.7')
        self.assertEqual(rows[0]['forecast'], 0)
        self.assertFalse(rows[1]['hasNumericRelease'])
        self.assertTrue(rows[0]['sourceUrl'].startswith('https://www.forexfactory.com/'))

    def test_refresh_replaces_pending_actual_without_erasing_forecast(self):
        from datetime import datetime, timezone
        from scripts.pipeline import merge_calendar
        old = {'id': 'one', 'currency': 'USD', 'name': 'CPI', 'occurredAt': '2026-10-23T12:30:00Z', 'actual': None, 'forecast': 2.5, 'previous': 2.4}
        fresh = {**old, 'actual': 2.6, 'forecast': None, 'previous': 2.3}
        row = merge_calendar([fresh], [old], datetime(2026, 10, 26, tzinfo=timezone.utc))[0]
        self.assertEqual((row['actual'], row['forecast'], row['previous']), (2.6, 2.5, 2.3))

    def test_archive_is_read_without_extracting_paths(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr('../report.csv', 'Market_and_Exchange_Names,Report_Date_as_YYYY-MM-DD\nGOLD,10/20/2026\n')
        rows = read_zip_rows(buffer.getvalue())
        self.assertEqual(rows[0]['report_date_as_yyyy_mm_dd'], '2026-10-20')
