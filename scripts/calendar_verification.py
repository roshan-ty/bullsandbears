"""Conservative independent comparisons; source disagreements never become certainty."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from math import isclose
import re

from .global_calendar import fetch_details, normalize, ALL_CURRENCIES
from .public_feeds import number

# Explicit series correspondences only. A shared broad indicator classification
# (such as inflation or employment) is never enough to identify the same release.
ALIASES = {
    ('US', 'Non-Farm Employment Change'): ('Nonfarm Payrolls', 'number'),
    ('US', 'ADP Non-Farm Employment Change'): ('ADP Employment Change', 'number'),
    ('US', 'Unemployment Claims'): ('Initial Jobless Claims', 'number'),
    ('US', 'Average Hourly Earnings m/m'): ('Average Hourly Earnings (MoM)', '%'),
    ('US', 'Unemployment Rate'): ('Unemployment Rate', '%'),
    ('US', 'JOLTS Job Openings'): ('JOLTS Job Openings', 'number'),
    ('US', 'Factory Orders m/m'): ('Factory Orders (MoM)', '%'),
    ('US', 'Construction Spending m/m'): ('Construction Spending (MoM)', '%'),
    ('US', 'ISM Manufacturing PMI'): ('ISM Manufacturing PMI', 'number'),
    ('US', 'ISM Manufacturing Prices'): ('ISM Manufacturing Prices Paid', 'number'),
    ('US', 'ISM Services PMI'): ('ISM Services PMI', 'number'),
    ('US', 'Final Manufacturing PMI'): ('S&P Global Manufacturing PMI', 'number'),
    ('US', 'Final Services PMI'): ('S&P Global Services PMI', 'number'),
    ('US', 'Prelim UoM Consumer Sentiment'): ('Michigan Consumer Sentiment Index', 'number'),
    ('US', 'Prelim UoM Inflation Expectations'): ('UoM 1-year Consumer Inflation Expectations', '%'),
    ('US', 'CPI m/m'): ('Consumer Price Index (MoM)', '%'),
    ('US', 'CPI y/y'): ('Consumer Price Index (YoY)', '%'),
    ('US', 'Core CPI m/m'): ('Consumer Price Index ex Food & Energy (MoM)', '%'),
    ('US', 'Crude Oil Inventories'): ('EIA Crude Oil Stocks Change', 'number'),
    ('UK', 'Official Bank Rate'): ('BoE Interest Rate Decision', '%'),
    ('UK', 'Final Manufacturing PMI'): ('S&P Global Manufacturing PMI', 'number'),
    ('UK', 'Final Services PMI'): ('S&P Global Services PMI', 'number'),
    ('UK', 'Construction PMI'): ('S&P Global Construction PMI', 'number'),
    ('UK', 'Lloyds HPI m/m'): ('Lloyds House Price Index (MoM)', '%'),
    ('AU', 'Cash Rate'): ('RBA Interest Rate Decision', '%'),
    ('AU', 'Building Approvals m/m'): ('Building Permits (MoM)', '%'),
    ('AU', 'MI Inflation Gauge m/m'): ('TD-MI Inflation Gauge (MoM)', '%'),
    ('AU', 'Commodity Prices y/y'): ('RBA Commodity Index SDR (YoY)', '%'),
    ('NZ', 'Building Consents m/m'): ('Building Permits s.a. (MoM)', '%'),
    ('NZ', 'Employment Change q/q'): ('Employment Change', '%'),
    ('NZ', 'Unemployment Rate'): ('Unemployment Rate', '%'),
    ('NZ', 'Labor Cost Index q/q'): ('Labour Cost Index (QoQ)', '%'),
    ('NZ', 'ANZ Commodity Prices m/m'): ('ANZ Commodity Price', '%'),
    ('NZ', 'GDT Price Index'): ('GDT Price Index', '%'),
    ('CA', 'Employment Change'): ('Net Change in Employment', 'number'),
    ('CA', 'Unemployment Rate'): ('Unemployment Rate', '%'),
    ('CA', 'Ivey PMI'): ('Ivey Purchasing Managers Index s.a', 'number'),
    ('CA', 'Manufacturing PMI'): ('S&P Global Manufacturing PMI', 'number'),
    ('JP', 'Average Cash Earnings y/y'): ('Labor Cash Earnings (YoY)', '%'),
    ('JP', 'Monetary Base y/y'): ('Monetary Base (YoY)', '%'),
    ('JP', 'Final Manufacturing PMI'): ('Jibun Bank Manufacturing PMI', 'number'),
    ('CH', 'CPI m/m'): ('Consumer Price Index (MoM)', '%'),
    ('CH', 'CPI y/y'): ('Consumer Price Index (YoY)', '%'),
    ('CH', 'Retail Sales y/y'): ('Real Retail Sales (YoY)', '%'),
    ('CH', 'Manufacturing PMI'): ("SVME - Purchasing Managers' Index", 'number'),
    ('CH', 'Foreign Currency Reserves'): ('Foreign Currency Reserves', 'number'),
    ('DE', 'German Retail Sales m/m'): ('Retail Sales (MoM)', '%'),
    ('DE', 'German Factory Orders m/m'): ('Factory Orders s.a. (MoM)', '%'),
    ('DE', 'German Industrial Production m/m'): ('Industrial Production s.a. (MoM)', '%'),
    ('DE', 'German Final Manufacturing PMI'): ('HCOB Manufacturing PMI', 'number'),
    ('DE', 'German Final Services PMI'): ('HCOB Services PMI', 'number'),
    ('FR', 'French Final Manufacturing PMI'): ('HCOB Manufacturing PMI', 'number'),
    ('FR', 'French Final Services PMI'): ('HCOB Services PMI', 'number'),
    ('FR', 'French Industrial Production m/m'): ('Industrial Output (MoM)', '%'),
    ('ES', 'Spanish Manufacturing PMI'): ('HCOB Manufacturing PMI', 'number'),
    ('ES', 'Spanish Services PMI'): ('HCOB Services PMI', 'number'),
    ('IT', 'Italian Manufacturing PMI'): ('HCOB Manufacturing PMI', 'number'),
    ('IT', 'Italian Services PMI'): ('HCOB Services PMI', 'number'),
    ('IT', 'Italian Retail Sales m/m'): ('Retail Sales s.a. (MoM)', '%'),
    ('EMU', 'Final Manufacturing PMI'): ('HCOB Manufacturing PMI', 'number'),
    ('EMU', 'Final Services PMI'): ('HCOB Services PMI', 'number'),
    ('EMU', 'Retail Sales m/m'): ('Retail Sales (MoM)', '%'),
    ('EMU', 'PPI m/m'): ('Producer Price Index (MoM)', '%'),
}


def stamp(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        return parsed if parsed.tzinfo else None
    except (TypeError, ValueError):
        return None


def country(row):
    if row.get('country'):
        return {'GB': 'UK', 'EU': 'EMU'}.get(row['country'], row['country'])
    if row.get('currency') == 'EUR':
        for prefix, code in [('German ', 'DE'), ('French ', 'FR'), ('Spanish ', 'ES'), ('Italian ', 'IT')]:
            if row.get('name', '').startswith(prefix):
                return code
        return 'EMU'
    return dict(USD='US', GBP='UK', JPY='JP', CHF='CH', AUD='AU', NZD='NZ', CAD='CA', CNY='CN').get(row.get('currency'))


def primary(row):
    return str(row.get('source', '')).startswith('Forex Factory')


def matches(left, right):
    mapping = ALIASES.get((country(left), left.get('name')))
    if not mapping or right.get('source') != 'FX Blue' or right.get('name') != mapping[0]:
        return False
    if left.get('currency') != right.get('currency') or country(left) != country(right):
        return False
    # Exact release identity includes variant, country, unit and a narrow release
    # window. This never matches neighboring months, GDP vintages or YoY vs MoM.
    a, b = stamp(left.get('occurredAt')), stamp(right.get('occurredAt'))
    if not a or not b or a.date() != b.date() or abs((a-b).total_seconds()) > 300:
        return False
    if left.get('referencePeriod') and right.get('referencePeriod') and left['referencePeriod'] != right['referencePeriod']:
        return False
    if mapping[1] == '%':
        return left.get('unit') == right.get('unit') == '%'
    return left.get('unit') is None and right.get('unit') is None


def equal_value(left, right, field):
    a, b = number(left.get(field)), number(right.get(field))
    if a is None or b is None:
        return False
    # Independent reports may publish different decimal precision (7.52M vs
    # 7.523M). Compare at the precision explicitly printed by the primary report.
    text = str(left.get(field + 'Text') or '').strip().replace(',', '').removesuffix('%')
    match = re.fullmatch(r'[+-]?\d+(?:\.(\d+))?([KMBT])?', text, re.I)
    if match:
        scale = {'K': 1e3, 'M': 1e6, 'B': 1e9, 'T': 1e12}.get((match.group(2) or '').upper(), 1)
        quantum = Decimal(1).scaleb(-len(match.group(1) or ''))
        try:
            return (Decimal(str(a)) / Decimal(str(scale))).quantize(quantum, rounding=ROUND_HALF_UP) == (Decimal(str(b)) / Decimal(str(scale))).quantize(quantum, rounding=ROUND_HALF_UP)
        except InvalidOperation:
            return False
    return isclose(a, b, rel_tol=1e-12, abs_tol=1e-8)


def update_checks(current, previous, now):
    rows = {row['id']: row for row in previous if stamp(row.get('occurredAt')) and stamp(row['occurredAt']) >= now - timedelta(days=180)}
    rows.update({row['id']: row for row in current})
    return list(rows.values())


def enrich_revisions(events, checks, now):
    jobs = {}
    for left in events:
        if not primary(left):
            continue
        candidates = [right for right in checks if matches(left, right)]
        if len(candidates) != 1:
            continue
        right = candidates[0]
        if any(left.get(field) is not None and right.get(field) is not None and not equal_value(left, right, field) for field in ('actual', 'previous')):
            if right.get('sourceEventId') and right.get('sourceDetailId'):
                jobs[right['id']] = {'eventId': right['sourceEventId'], 'eventDateDetailId': right['sourceDetailId']}
    # Bounded requests, at most three concurrent. Mismatches outside this budget
    # remain explicitly unconfirmed instead of guessing a revision.
    updates = {}
    with ThreadPoolExecutor(max_workers=3) as pool:
        for details in pool.map(fetch_details, list(jobs.values())[:32]):
            for raw in details:
                row = normalize(raw, ALL_CURRENCIES)
                if row and row['id'] in jobs:
                    updates[row['id']] = row
    return [updates.get(row['id'], row) for row in checks]


def verify(events, checks, now):
    result = []
    for original in events:
        row = {**original}
        # Recompute every time: a previous confirmation must not survive a fresh
        # conflicting revision or an expired independent observation.
        candidates = [right for right in checks if primary(row) and matches(row, right)
                      and (checked := stamp(right.get('retrievedAt'))) and 0 <= (now-checked).total_seconds() <= 72 * 3600]
        right = candidates[0] if len(candidates) == 1 else None
        fields = {}
        revision_pending = False
        for field in ('actual', 'forecast', 'previous'):
            if row.get(field) is None:
                fields[field] = 'single-source' if row.get(field + 'Text') else 'pending'
            elif not right or right.get(field) is None:
                fields[field] = 'single-source'
            elif equal_value(row, right, field):
                fields[field] = 'confirmed'
            elif field == 'previous' and row.get('previousRevised') and not right.get('previousRevised') and equal_value({**row, 'previous': row.get('originalPrevious'), 'previousText': row.get('originalPreviousText')}, right, 'previous'):
                fields[field] = 'single-source'
                revision_pending = True
            else:
                fields[field] = 'conflict'
        conflicting = [field for field, status in fields.items() if status == 'conflict']
        status = 'conflict' if conflicting else 'pending' if row.get('actual') is None and not row.get('actualText') and row.get('hasNumericRelease') is not False else 'confirmed' if fields['actual'] == 'confirmed' else 'single-source'
        note = ('Reported values differ; disputed actual or previous values are excluded from bias.' if any(field in conflicting for field in ('actual', 'previous')) else
                'Forecast estimates differ between surveys.' if 'forecast' in conflicting else
                'The revised previous value awaits independent confirmation.' if revision_pending else
                'Independent reports agree at the displayed precision.' if status == 'confirmed' else
                'Awaiting a released actual.' if status == 'pending' else 'One report is available for this release.')
        row['verification'] = {'status': status, 'checkedAt': now.isoformat(), 'sourceCount': 2 if right else 1,
            'fields': fields, 'conflictingFields': conflicting, 'previousRevisionPending': revision_pending, 'note': note}
        result.append(row)
    return result
