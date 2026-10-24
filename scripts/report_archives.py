"""Bounded CFTC ZIP/CSV ingestion, without extracting files to disk."""
import csv
import io
import re
import urllib.request
import zipfile
from datetime import datetime, timezone


def read_zip_rows(body: bytes) -> list[dict]:
    if len(body) > 30_000_000:
        raise ValueError('Archive exceeds download limit')
    output = []
    with zipfile.ZipFile(io.BytesIO(body)) as archive:
        members = [item for item in archive.infolist() if item.filename.lower().endswith(('.txt', '.csv'))]
        if sum(item.file_size for item in members) > 150_000_000:
            raise ValueError('Archive exceeds expanded size limit')
        for member in members:
            with archive.open(member) as stream:
                for row in csv.DictReader(io.TextIOWrapper(stream, encoding='utf-8-sig', errors='replace')):
                    normalized = {re.sub(r'[^a-z0-9]+', '_', key.lower()).strip('_'): value for key, value in row.items() if key}
                    date = normalized.get('report_date_as_yyyy_mm_dd') or normalized.get('as_of_date_in_form_yyyy_mm_dd')
                    if date:
                        for fmt in ('%Y-%m-%d', '%m/%d/%Y'):
                            try:
                                normalized['report_date_as_yyyy_mm_dd'] = datetime.strptime(date[:10], fmt).date().isoformat()
                                break
                            except ValueError:
                                pass
                    output.append(normalized)
                    if len(output) > 100_000:
                        raise ValueError('Archive exceeds record limit')
    if not output:
        raise ValueError('No tabular report in archive')
    return output


def fetch_annual_report(family: str) -> list[dict]:
    prefix = {'tff': 'fut_fin_txt_', 'disaggregated': 'fut_disagg_txt_', 'tff-combined': 'com_fin_txt_', 'disaggregated-combined': 'com_disagg_txt_', 'legacy': 'deacot', 'legacy-combined': 'deahistfo', 'supplemental': 'dea_cit_txt_'}[family]
    year = datetime.now(timezone.utc).year
    url = f'https://www.cftc.gov/files/dea/history/{prefix}{year}.zip'
    request = urllib.request.Request(url, headers={'User-Agent': 'Bulls-Bears-Fundamentals/1.0'})
    with urllib.request.urlopen(request, timeout=45) as response:
        body = response.read(30_000_001)
    return read_zip_rows(body)
