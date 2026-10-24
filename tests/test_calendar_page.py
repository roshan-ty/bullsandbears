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

    def test_archive_is_read_without_extracting_paths(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w') as archive:
            archive.writestr('../report.csv', 'Market_and_Exchange_Names,Report_Date_as_YYYY-MM-DD\nGOLD,10/20/2026\n')
        rows = read_zip_rows(buffer.getvalue())
        self.assertEqual(rows[0]['report_date_as_yyyy_mm_dd'], '2026-10-20')
