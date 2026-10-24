import unittest
from datetime import datetime, timezone
from scripts.quality import archive_positions, calendar_health


class QualityTests(unittest.TestCase):
    def test_download_without_actuals_is_degraded(self):
        self.assertEqual(calendar_health([{'actual': None}], '2026-10-24T00:00:00Z')['status'], 'degraded')

    def test_archive_preserves_weeks_and_replaces_revision(self):
        old = {'marketId': '1', 'category': 'Managed Money', 'reportDate': '2026-10-20', 'net': 10}
        new = {**old, 'net': 12}
        result = archive_positions([new], [old], datetime(2026, 10, 24, tzinfo=timezone.utc))
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['net'], 12)