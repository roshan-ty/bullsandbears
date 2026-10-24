"""Ordinary public-feed collectors. No authentication or access-control circumvention."""
from __future__ import annotations

import hashlib
import html
import json
import math
import logging
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any


USER_AGENT = "Bulls-Bears-Fundamentals/1.0 public-feed collector"
FOREX_CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc"
DEFAULT_RSS_FEEDS = (
    "https://www.aljazeera.com/xml/rss/all.xml",
    "https://feeds.bbci.co.uk/news/business/rss.xml",
    "https://feeds.bbci.co.uk/news/world/rss.xml",
    "https://www.federalreserve.gov/feeds/press_all.xml",
    "https://www.federalreserve.gov/feeds/speeches.xml",
    "https://www.ecb.europa.eu/rss/press.html",
    "https://www.ecb.europa.eu/rss/blog.html",
    "https://www.bankofengland.co.uk/rss/news",
    "https://www.bankofcanada.ca/feed/",
    "https://www.rba.gov.au/rss/rss-cb-media-releases.xml",
    "https://www.bls.gov/feed/bls_latest.rss",
    "https://www.bea.gov/news/rss.xml",
)

TAG_RULES = {
    "USD": ("dollar", "federal reserve", "fed ", "u.s. economy", "us economy", "treasury"),
    "EUR": ("euro", "ecb", "eurozone", "germany", "german economy"),
    "GBP": ("sterling", "pound", "bank of england", "uk economy", "british economy"),
    "JPY": ("yen", "bank of japan", "boj", "japan economy"),
    "AUD": ("australian dollar", "reserve bank of australia", "rba"),
    "NZD": ("new zealand dollar", "reserve bank of new zealand", "rbnz"),
    "CAD": ("canadian dollar", "bank of canada", "canada economy"),
    "CHF": ("swiss franc", "swiss national bank", "snb"),
    "CNY": ("yuan", "renminbi", "pboc", "china economy", "chinese economy"),
    "XAUUSD": ("gold", "bullion"), "XAGUSD": ("silver",), "OIL": ("crude oil", "oil price", "opec"),
    "BRENT": ("brent",), "COPPER": ("copper",), "BTCUSD": ("bitcoin",), "ETHUSD": ("ethereum", "ether"),
}


def request_bytes(url: str, accept: str) -> bytes:
    if accept == 'text/html':
        try:
            from .scraping import fetch_html
        except ImportError:
            from scraping import fetch_html
        return fetch_html(url)
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': accept})
    with urllib.request.urlopen(request, timeout=25) as response:
        body = response.read(8_000_001)
    if len(body) > 8_000_000:
        raise ValueError("Source response exceeds 8 MB limit")
    return body


def number(value: Any) -> float | None:
    if value is None:
        return None
    cleaned = str(value).strip().replace(",", "").replace("%", "")
    if not cleaned:
        return None
    multiplier = 1.0
    if cleaned[-1:].upper() in {"K", "M", "B", "T"}:
        multiplier = {"K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12}[cleaned[-1].upper()]
        cleaned = cleaned[:-1]
    try:
        result = float(cleaned) * multiplier
        return result if math.isfinite(result) else None
    except ValueError:
        return None


def stable_id(*parts: str) -> str:
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:24]


def canonical_url(value: str) -> str:
    parsed = urllib.parse.urlsplit(value.strip())
    host = parsed.netloc.lower().removeprefix("www.")
    path = re.sub(r"/+$", "", parsed.path) or "/"
    query = urllib.parse.urlencode([(key, value) for key, value in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
                                   if not key.lower().startswith('utm_') and key.lower() not in {'fbclid', 'gclid'}])
    return urllib.parse.urlunsplit((parsed.scheme.lower(), host, path, query, ""))


def fetch_calendar_schedule() -> list[dict[str, Any]]:
    payload = json.loads(request_bytes(FOREX_CALENDAR_URL, "application/json").decode("utf-8"))
    output: list[dict[str, Any]] = []
    for row in payload if isinstance(payload, list) else []:
        currency = str(row.get("country") or "").upper()
        title = str(row.get("title") or "").strip()
        date = str(row.get("date") or "")
        if len(currency) != 3 or not title or not date:
            continue
        try:
            occurred = datetime.fromisoformat(date).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        except ValueError:
            continue
        output.append({
            "id": stable_id(currency, title, occurred), "occurredAt": occurred, "currency": currency,
            "name": title, "impact": str(row.get("impact") or "Low").lower(),
            "actual": number(row.get("actual")), "forecast": number(row.get("forecast")),
            "previous": number(row.get("previous")), "unit": "%" if "%" in "".join(str(row.get(key) or "") for key in ("actual", "forecast", "previous")) else None,
        })
    return output


def parse_calendar_page(document: str) -> list[dict[str, Any]]:
    """Read the page's JSON event array without evaluating JavaScript."""
    marker = document.find('window.calendarComponentStates[')
    if marker < 0:
        raise ValueError('Calendar event state is unavailable')
    tail = document[marker:]
    match = re.search(r'\bdays:\s*', tail)
    if not match:
        raise ValueError('Calendar event array is unavailable')
    days, _ = json.JSONDecoder().raw_decode(tail[match.end():])
    output = []
    for day in days:
        for row in day.get('events', []):
            currency, title = str(row.get('currency', '')).upper(), clean_text(row.get('name'))
            if len(currency) != 3 or not title or not row.get('dateline'):
                continue
            occurred = datetime.fromtimestamp(int(row['dateline']), timezone.utc).isoformat().replace('+00:00', 'Z')
            previous = row.get('revision') if number(row.get('revision')) is not None else row.get('previous')
            output.append({
                'id': stable_id(currency, title, occurred), 'occurredAt': occurred,
                'currency': currency, 'name': title, 'impact': row.get('impactName', 'low'),
                'actual': number(row.get('actual')), 'forecast': number(row.get('forecast')),
                'previous': number(previous), 'originalPrevious': number(row.get('previous')),
                'unit': '%' if '%' in ''.join(str(row.get(key) or '') for key in ('actual', 'forecast', 'previous')) else None,
            })
    return output


def fetch_public_calendar() -> list[dict[str, Any]]:
    collected = []
    # One normal request per week window. Never bypass a denied/challenged page.
    for week in ('last', 'this', 'next'):
        try:
            page = request_bytes(f'https://www.forexfactory.com/calendar?week={week}', 'text/html').decode('utf-8')
            collected.extend(parse_calendar_page(page))
        except Exception as error:
            logging.warning('Calendar %s window: %s', week, type(error).__name__)
    if not collected:
        collected = fetch_calendar_schedule()
    if not collected:
        raise ValueError('No calendar records returned')
    return list({row['id']: row for row in collected}.values())


def clean_text(value: Any) -> str:
    text = html.unescape(re.sub(r"<[^>]+>", " ", str(value or "")))
    return " ".join(text.split())


def instruments_for(text: str) -> list[str]:
    lower = f" {text.lower()} "
    tags = [instrument for instrument, terms in TAG_RULES.items() if any(term in lower for term in terms)]
    return tags or ["GLOBAL"]


def relevant_news(item):
    """Conservative metadata filter for finance and geopolitical developments."""
    title = str(item.get('headline', '')).lower()
    text = title + ' ' + str(item.get('summary') or '').lower()
    path = urllib.parse.urlsplit(str(item.get('url', ''))).path.lower()
    if re.search(r'/(sports?|entertainment|lifestyle|travel|culture)/', path):
        return False
    if re.search(r'\b(nba|nfl|premier league|world cup|cricket|football|basketball|celebrity)\b', title):
        return False
    official = urllib.parse.urlsplit(str(item.get('sourceUrl', item.get('url', '')))).hostname or ''
    if any(official == host or official.endswith('.' + host) for host in ('federalreserve.gov', 'ecb.europa.eu', 'bankofengland.co.uk', 'bankofcanada.ca', 'rba.gov.au', 'bls.gov', 'bea.gov')):
        return True
    return bool(re.search(r'\b(inflation|econom(?:y|ic|ies)|interest rates?|central bank|monetary|fiscal|budget|deficit|debt|treasury|bonds?|yields?|stocks?|equities|earnings|recession|gdp|payrolls?|unemployment|trade|tariffs?|sanctions?|exports?|imports?|currenc(?:y|ies)|dollar|sterling|yen|yuan|forex|bitcoin|ethereum|crypto|stablecoins?|oil|crude|opec|gold|bullion|copper|silver|energy|gas|supply chain|shipping|war|ceasefire|missiles?|military|elections?|president|government|parliament|geopolitic\w*)\b', text))


def iso_time(value: str) -> str | None:
    if not value:
        return None
    for parser in (
        lambda item: datetime.fromisoformat(item.replace("Z", "+00:00")),
        parsedate_to_datetime,
        lambda item: datetime.strptime(item, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc),
    ):
        try:
            parsed = parser(value)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        except (ValueError, TypeError, OverflowError):
            continue
    return None


def fetch_gdelt_news() -> list[dict[str, Any]]:
    query = '(forex OR inflation OR "central bank" OR gold OR oil OR bitcoin OR "bond yields" OR sanctions OR war)'
    params = urllib.parse.urlencode({"query": query, "mode": "artlist", "maxrecords": 100, "format": "json", "sort": "datedesc"})
    payload = json.loads(request_bytes(f"{GDELT_URL}?{params}", "application/json").decode("utf-8"))
    output: list[dict[str, Any]] = []
    for row in payload.get("articles", []) if isinstance(payload, dict) else []:
        title, url = clean_text(row.get("title")), str(row.get("url") or "")
        published = iso_time(str(row.get("seendate") or ""))
        if not title or not url.startswith(("http://", "https://")) or not published:
            continue
        canonical = canonical_url(url)
        output.append({"id": stable_id(canonical), "publishedAt": published, "headline": title, "summary": None, "url": canonical, "instruments": instruments_for(title)})
    return output


def fetch_rss(url: str) -> list[dict[str, Any]]:
    root = ET.fromstring(request_bytes(url, "application/rss+xml, application/atom+xml, application/xml, text/xml"))
    output: list[dict[str, Any]] = []
    nodes = root.findall(".//item") or root.findall(".//{http://www.w3.org/2005/Atom}entry")
    for node in nodes:
        title = clean_text(node.findtext("title") or node.findtext("{http://www.w3.org/2005/Atom}title"))
        link = node.findtext("link") or ""
        if not link:
            link_node = node.find("{http://www.w3.org/2005/Atom}link")
            link = link_node.attrib.get("href", "") if link_node is not None else ""
        published = iso_time(node.findtext("pubDate") or node.findtext("{http://www.w3.org/2005/Atom}published") or node.findtext("{http://www.w3.org/2005/Atom}updated") or "")
        summary = clean_text(node.findtext("description") or node.findtext("{http://www.w3.org/2005/Atom}summary")) or None
        if title and published and link.startswith(("http://", "https://")):
            canonical = canonical_url(link)
            output.append({"id": stable_id(canonical), "publishedAt": published, "headline": title, "summary": summary[:360] if summary else None, "url": canonical, "instruments": instruments_for(f"{title} {summary or ''}")})
    return output


def fetch_public_news(extra_feeds: tuple[str, ...] = (), health: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    collected: list[dict[str, Any]] = []
    for url in (GDELT_URL, *DEFAULT_RSS_FEEDS, *extra_feeds):
        attempted = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
        rows: list[dict[str, Any]] = []
        message = 'No valid dated metadata returned.'
        try:
            rows = fetch_gdelt_news() if url == GDELT_URL else fetch_rss(url)
            for row in rows:
                row['sourceUrl'] = url
                row['retrievedAt'] = attempted
            collected.extend(rows)
            if rows:
                message = f'Retrieved {len(rows)} metadata records; publication dates are preserved.'
        except Exception as error:
            message = f'Collection failed: {type(error).__name__}'
            logging.warning('%s: %s', url, message)
        if health is not None:
            health.append({'feed': url, 'status': 'healthy' if rows else 'degraded',
                           'lastAttemptAt': attempted, 'lastSuccessAt': attempted if rows else None,
                           'staleAfterHours': 24, 'itemCount': len(rows), 'message': message})
    deduplicated: dict[str, dict[str, Any]] = {}
    seen_titles: set[str] = set()
    for item in sorted(collected, key=lambda row: row["publishedAt"], reverse=True):
        title_key = re.sub(r"\W+", " ", item["headline"].lower()).strip()
        if not relevant_news(item) or item["id"] in deduplicated or title_key in seen_titles:
            continue
        deduplicated[item["id"]] = item
        seen_titles.add(title_key)
    return list(deduplicated.values())[:500]
