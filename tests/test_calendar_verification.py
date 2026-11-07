import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
from scripts.calendar_verification import verify, matches, enrich_revisions
from scripts.global_calendar import normalize
from scripts.pipeline import merge_calendar, score_event, collect_calendar
from scripts.public_feeds import clean_text

NOW = datetime(2026, 11, 7, 12, tzinfo=timezone.utc)


def primary(**kwargs):
    return {'id': 'primary', 'source': 'Forex Factory', 'sourceEventId': '123',
        'currency': 'USD', 'country': 'US', 'name': 'Average Hourly Earnings m/m',
        'occurredAt': '2026-11-06T13:30:00Z', 'actual': .4, 'actualText': '0.4%',
        'forecast': .3, 'forecastText': '0.3%', 'previous': .1, 'previousText': '0.1%',
        'unit': '%', 'retrievedAt': NOW.isoformat(), **kwargs}


def independent(**kwargs):
    return {**primary(), 'id': 'independent', 'source': 'FX Blue', 'name': 'Average Hourly Earnings (MoM)', **kwargs}


class VerificationTests(unittest.TestCase):
    def test_freshly_retrieved_checks_are_compared_to_completion_clock(self):
        from scripts import pipeline
        earlier = NOW - timedelta(seconds=20)
        with patch.object(pipeline, 'datetime', wraps=datetime) as clock, \
             patch.object(pipeline, 'fetch_public_calendar', return_value=[primary()]), \
             patch.object(pipeline, 'fetch_global_calendar', return_value=[independent()]), \
             patch.object(pipeline, 'fetch_authorized_json', return_value=[]), \
             patch('scripts.calendar_verification.enrich_revisions', side_effect=lambda events, checks, now: checks):
            clock.now.return_value = NOW
            rows = collect_calendar({'events': []}, {}, earlier.isoformat(), fast=True)
        self.assertEqual(rows[0]['verification']['status'], 'confirmed')

    def test_matching_reports_confirm_each_value(self):
        row = verify([primary()], [independent()], NOW)[0]
        self.assertEqual(row['verification']['status'], 'confirmed')
        self.assertEqual(set(row['verification']['fields'].values()), {'confirmed'})

    def test_actual_conflict_retains_primary_but_blocks_scoring(self):
        row = score_event(verify([primary()], [independent(actual=.2)], NOW)[0])
        self.assertEqual(row['actual'], .4)
        self.assertEqual(row['actualText'], '0.4%')
        self.assertEqual(row['verification']['conflictingFields'], ['actual'])
        self.assertIsNone(row['signal'])
        self.assertEqual(row['contribution'], 0)

    def test_different_forecast_surveys_do_not_block_previous_based_signal(self):
        row = score_event(verify([primary()], [independent(forecast=.2)], NOW)[0])
        self.assertEqual(row['verification']['conflictingFields'], ['forecast'])
        self.assertEqual(row['signal'], 1)
        self.assertIn('estimates differ', row['verification']['note'])

    def test_original_previous_is_not_confused_with_revised_previous(self):
        row = verify([primary(previousRevised=True, originalPrevious=.2, originalPreviousText='0.2%')], [independent(previous=.2, previousRevised=False)], NOW)[0]
        self.assertEqual(row['verification']['fields']['previous'], 'single-source')
        self.assertTrue(row['verification']['previousRevisionPending'])
        self.assertNotIn('previous', row['verification']['conflictingFields'])

    def test_conflicting_revised_previous_blocks_scoring(self):
        row = score_event(verify([primary(previousRevised=True)], [independent(previous=.3, previousRevised=True)], NOW)[0])
        self.assertIsNone(row['signal'])

    def test_country_period_variant_units_and_release_window_must_match(self):
        for change in ({'country': 'CA'}, {'currency': 'CAD'}, {'name': 'Average Hourly Earnings (YoY)'},
                       {'unit': None}, {'occurredAt': '2026-10-06T13:30:00Z'}, {'occurredAt': '2026-11-06T14:30:00Z'},
                       {'referencePeriod': '2026-09'}):
            self.assertFalse(matches(primary(referencePeriod='2026-10'), independent(**change)))

    def test_expired_check_and_new_revision_clear_old_confirmation(self):
        original = verify([primary()], [independent()], NOW)[0]
        old = independent(retrievedAt=(NOW-timedelta(days=4)).isoformat())
        self.assertEqual(verify([original], [old], NOW)[0]['verification']['status'], 'single-source')
        self.assertEqual(verify([{**original, 'actual': .8, 'actualText': '0.8%'}], [independent()], NOW)[0]['verification']['status'], 'conflict')

    def test_rounding_tolerance_comes_from_explicit_display_precision(self):
        row = primary(name='JOLTS Job Openings', unit=None, actual=7520000, actualText='7.52M')
        other = independent(name='JOLTS Job Openings', unit=None, actual=7523000)
        self.assertEqual(verify([row], [other], NOW)[0]['verification']['fields']['actual'], 'confirmed')
        other['actual'] = 7503000
        self.assertEqual(verify([row], [other], NOW)[0]['verification']['fields']['actual'], 'conflict')

    def test_ambiguous_multiple_matches_are_not_confirmation(self):
        row = verify([primary()], [independent(), independent(id='other')], NOW)[0]
        self.assertEqual(row['verification']['status'], 'single-source')

    def test_rounding_boundary_is_not_falsely_confirmed(self):
        row = verify([primary(actual=.4, actualText='0.4%')], [independent(actual=.45)], NOW)[0]
        self.assertEqual(row['verification']['fields']['actual'], 'conflict')

    def test_released_textual_actual_is_not_labeled_awaiting_release(self):
        row = verify([primary(actual=None, actualText='<1.25%')], [], NOW)[0]
        self.assertEqual(row['verification']['status'], 'single-source')
        self.assertEqual(row['verification']['fields']['actual'], 'single-source')


class MergeTests(unittest.TestCase):
    def test_previous_update_clears_revision_metadata_owned_by_old_reading(self):
        old = primary(previous=.1, originalPrevious=.2, originalPreviousText='0.2%', previousRevised=True)
        fresh = primary(previous=.3, previousText='0.3%')
        row = merge_calendar([fresh], [old], NOW)[0]
        self.assertEqual(row['previous'], .3)
        self.assertFalse(row['previousRevised'])
        self.assertIsNone(row['originalPrevious'])
        self.assertIsNone(row['originalPreviousText'])

    def test_pending_previous_does_not_erase_saved_value_and_its_revision_metadata(self):
        old = primary(previous=.1, originalPrevious=.2, originalPreviousText='0.2%', previousRevised=True)
        fresh = primary(previous=None, previousText=None)
        row = merge_calendar([fresh], [old], NOW)[0]
        self.assertEqual(row['previous'], .1)
        self.assertTrue(row['previousRevised'])
        self.assertEqual(row['originalPreviousText'], '0.2%')

    def test_new_number_cannot_keep_old_display_text_or_verification(self):
        old = primary(verification={'status': 'confirmed'})
        fresh = primary(actual=.6, actualText=None)
        row = merge_calendar([fresh], [old], NOW)[0]
        self.assertEqual(row['actual'], .6)
        self.assertIsNone(row['actualText'])
        self.assertNotIn('verification', row)

    def test_nonnumeric_correction_clears_old_numeric_vote(self):
        row = merge_calendar([primary(actual=None, actualText='Revised')], [primary()], NOW)[0]
        self.assertIsNone(row['actual'])
        self.assertIsNone(score_event(row)['signal'])

    def test_schedule_is_same_publisher_not_independent_duplicate(self):
        scheduled = primary(source='Forex Factory schedule', sourceEventId=None, actual=None, actualText=None)
        rows = merge_calendar([scheduled], [primary()], NOW)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['actual'], .4)

    def test_unrelated_publisher_values_are_not_spliced_into_primary(self):
        rows = merge_calendar([independent(name=primary()['name'], actual=.8)], [primary()], NOW)
        self.assertEqual(len(rows), 2)
        self.assertEqual({row['actual'] for row in rows}, {.4, .8})

    def test_rescheduled_same_source_identity_does_not_duplicate_event(self):
        rows = merge_calendar([primary(occurredAt='2026-11-06T13:33:00Z')], [primary()], NOW)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['occurredAt'], '2026-11-06T13:33:00Z')

    def test_prior_duplicate_release_uses_newest_retrieval_not_list_order(self):
        confirmed = primary(occurredAt='2026-11-06T13:33:00Z')
        tentative = primary(occurredAt='2026-11-06T13:30:00Z', actual=None, actualText=None,
                            retrievedAt=(NOW-timedelta(days=10)).isoformat())
        rows = merge_calendar([], [confirmed, tentative], NOW)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['occurredAt'], confirmed['occurredAt'])
        self.assertEqual(rows[0]['actual'], .4)

    def test_zero_display_text_and_scale_are_preserved(self):
        self.assertEqual(clean_text(0), '0')
        raw = {'eventId': '00000000-0000-0000-0000-000000000001', 'eventDateDetailId': '00000000-0000-0000-0000-000000000002',
            'name': 'Employment', 'currency': 'NOK', 'eventDateTime': NOW.isoformat(), 'potency': 'K',
            'actual': '165K', 'previous': 100, 'revisited': 110}
        row = normalize(raw)
        self.assertEqual(row['actual'], 165000)
        self.assertEqual(row['previous'], 110000)
        self.assertEqual(row['originalPrevious'], 100000)
        self.assertIsNone(normalize({**raw, 'unit': '%'}))


if __name__ == '__main__':
    unittest.main()
