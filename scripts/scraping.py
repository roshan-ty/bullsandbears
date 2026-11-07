"""Scrapling HTML transport with bounded retries and strict extraction.
Adaptive selectors are intentionally disabled for financial values.
"""
from urllib.parse import urlsplit
from scrapling import Selector
from scrapling.fetchers import Fetcher
import time

ALLOWED_HOSTS = {'www.forexfactory.com','www.fxblue.com','www.a1trading.com','www.myfxbook.com'}
MAX_HTML_BYTES = 8_000_000


def fetch_html(url, attempts=2):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname not in ALLOWED_HOSTS or parsed.username or parsed.password or parsed.port not in (None,443):
        raise ValueError('HTML source is not allowlisted')
    for attempt in range(attempts):
        try:
            response = Fetcher.get(url,timeout=25,retries=0,follow_redirects=False,verify=True,
                                   stealthy_headers=False,headers={'User-Agent':'Bulls-Bears-Fundamentals/3.0 public-data research'},
                                   selector_config={'adaptive':False,'huge_tree':False})
        except Exception:
            if attempt+1 == attempts: raise
            time.sleep(1)
            continue
        if response.status in (429,500,502,503,504) and attempt+1 < attempts:
            # Respect a bounded Retry-After; large delays defer to the next scheduled run.
            delay = str(response.headers.get('Retry-After', response.headers.get('retry-after','1')))
            if not delay.isdigit() or int(delay)>10: raise ValueError('HTML source requested a later retry')
            time.sleep(max(1,int(delay)))
            continue
        if response.status != 200: raise ValueError(f'HTML source returned HTTP {response.status}')
        body = response.body
        if len(body)>MAX_HTML_BYTES: raise ValueError('HTML source exceeds size limit')
        return body
    raise ValueError('HTML collection exhausted')


def script_texts(document):
    if len(document.encode('utf-8'))>MAX_HTML_BYTES: raise ValueError('HTML document exceeds size limit')
    page = Selector(document,adaptive=False,huge_tree=False)
    return page.css('script::text').getall()
