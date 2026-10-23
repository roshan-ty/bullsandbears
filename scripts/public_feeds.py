"""Ordinary public-feed collectors. No authentication or access-control circumvention."""
from __future__ import annotations

import hashlib
import html
import json
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
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": accept})
    with urllib.request.urlopen(request, timeout=35) as response:
        return response.read()


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
        return float(cleaned) * multiplier
    except ValueError:
        return None


def stable_id(*parts: str) -> str:
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:24]


def canonical_url(value: str) -> str:
    parsed = urllib.parse.urlsplit(value.strip())
    host = parsed.netloc.lower().removeprefix("www.")
    path = re.sub(r"/+$", "", parsed.path) or "/"
    return urllib.parse.urlunsplit((parsed.scheme.lower(), host, path, "", ""))


def fetch_public_calendar() -> list[dict[str, Any]]:
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


def clean_text(value: Any) -> str:
    text = html.unescape(re.sub(r"<[^>]+>", " ", str(value or "")))
    return " ".join(text.split())


def instruments_for(text: str) -> list[str]:
    lower = f" {text.lower()} "
    tags = [instrument for instrument, terms in TAG_RULES.items() if any(term in lower for term in terms)]
    return tags or ["GLOBAL"]


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


def fetch_public_news(extra_feeds: tuple[str, ...] = ()) -> list[dict[str, Any]]:
    collected: list[dict[str, Any]] = []
    try:
        collected.extend(fetch_gdelt_news())
    except Exception:
        pass
    for url in (*DEFAULT_RSS_FEEDS, *extra_feeds):
        try:
            collected.extend(fetch_rss(url))
        except Exception:
            continue
    deduplicated: dict[str, dict[str, Any]] = {}
    seen_titles: set[str] = set()
    for item in sorted(collected, key=lambda row: row["publishedAt"], reverse=True):
        title_key = re.sub(r"\W+", " ", item["headline"].lower()).strip()
        if item["id"] in deduplicated or title_key in seen_titles:
            continue
        deduplicated[item["id"]] = item
        seen_titles.add(title_key)
    return list(deduplicated.values())[:500]
