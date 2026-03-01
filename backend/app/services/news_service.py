"""
News service — multi-source pipeline for maximum small-cap coverage.

Sources (in priority order):
  1. Finnhub company-news  — best for mid/large caps, aggregates major wire services
  2. Yahoo Finance RSS      — covers virtually every listed ticker, free, no key needed
  3. SEC EDGAR 8-K feed    — material event filings for any SEC-registered company (Tier 1)

All text-based sources pass through the AI airlock (relevance + catalyst tagging).
SEC filings skip the airlock — they are always material events by definition.
"""

import asyncio
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

import httpx

from app.core.config import settings
from app.models.schemas import NewsItem
from app.services import airlock

FINNHUB_BASE = "https://finnhub.io/api/v1"

TIER1_SOURCES = {
    "sec.gov", "edgar", "8-k", "ir.", "investor.",
    "businesswire", "prnewswire", "globenewswire",
}
TIER2_SOURCES = {
    "reuters", "bloomberg", "wsj", "marketwatch",
    "benzinga", "seekingalpha", "cnbc", "yahoo",
}


def _classify_tier(source: str) -> int:
    s = source.lower()
    if any(t in s for t in TIER1_SOURCES):
        return 1
    return 2


def _parse_datetime(value) -> str:
    """Convert UNIX timestamp (int) or ISO string to ISO 8601."""
    if isinstance(value, (int, float)) and value > 0:
        return datetime.fromtimestamp(value, tz=timezone.utc).isoformat()
    if isinstance(value, str) and value:
        return value
    return datetime.now(timezone.utc).isoformat()


ALPACA_NEWS_URL = "https://data.alpaca.markets/v1beta1/news"
FMP_NEWS_URL    = "https://financialmodelingprep.com/api/v3/stock_news"

# ── Individual source fetchers ─────────────────────────────────────────────────

async def _fetch_finnhub(symbol: str, from_date: str, to_date: str) -> list[dict]:
    if not settings.finnhub_api_key:
        return []
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{FINNHUB_BASE}/company-news",
                params={
                    "symbol": symbol,
                    "from": from_date,
                    "to": to_date,
                    "token": settings.finnhub_api_key,
                },
                timeout=10,
            )
            if resp.status_code != 200:
                return []
            return [
                {
                    "id": item.get("id"),
                    "headline": item.get("headline", ""),
                    "summary": item.get("summary", ""),
                    "source": item.get("source", ""),
                    "url": item.get("url", ""),
                    "datetime": item.get("datetime", 0),
                }
                for item in resp.json()[:20]
            ]
        except Exception:
            return []


async def _fetch_yahoo_rss(symbol: str, days: int = 3) -> list[dict]:
    """Yahoo Finance RSS — covers virtually every listed ticker, free and keyless."""
    url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={symbol}&region=US&lang=en-US"
    headers = {"User-Agent": "RocketNews/0.1 (financial dashboard research tool)"}
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
        try:
            resp = await client.get(url, timeout=8)
            if resp.status_code != 200:
                return []

            root = ET.fromstring(resp.text)
            items: list[dict] = []

            for item in root.findall(".//item"):
                title = item.findtext("title") or ""
                link = item.findtext("link") or ""
                pub_date = item.findtext("pubDate") or ""
                description = item.findtext("description") or ""
                source_el = item.find("source")
                source = source_el.text if source_el is not None else "Yahoo Finance"

                try:
                    dt = parsedate_to_datetime(pub_date) if pub_date else datetime.now(timezone.utc)
                except Exception:
                    dt = datetime.now(timezone.utc)

                if dt < cutoff:
                    continue

                items.append({
                    "id": str(uuid.uuid4()),
                    "headline": title,
                    "summary": description[:300],
                    "source": source or "Yahoo Finance",
                    "url": link,
                    "published_at": dt.isoformat(),
                })

            return items[:15]
        except Exception:
            return []


async def _fetch_alpaca(symbol: str) -> list[dict]:
    """
    Alpaca paper-trading API — gives access to Benzinga's catalyst-driven feed
    for free with a paper trading account (alpaca.markets).
    Covers analyst upgrades, earnings beats, contract awards for mid/small caps.
    """
    if not settings.alpaca_api_key or not settings.alpaca_api_secret:
        return []
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                ALPACA_NEWS_URL,
                params={"symbols": symbol, "limit": 15, "sort": "desc"},
                headers={
                    "APCA-API-KEY-ID": settings.alpaca_api_key,
                    "APCA-API-SECRET-KEY": settings.alpaca_api_secret,
                },
                timeout=8,
            )
            if resp.status_code != 200:
                return []
            return [
                {
                    "id": str(item.get("id", uuid.uuid4())),
                    "headline": item.get("headline", ""),
                    "summary": item.get("summary", ""),
                    "source": item.get("source", "Benzinga"),
                    "url": item.get("url", ""),
                    "published_at": item.get("created_at", ""),
                }
                for item in resp.json().get("news", [])
            ]
        except Exception:
            return []


async def _fetch_fmp(symbol: str) -> list[dict]:
    """
    Financial Modeling Prep — free tier (250 req/day with a free account key).
    Good SEC filing and earnings coverage for small/mid caps.
    Register at: https://financialmodelingprep.com/developer/docs
    """
    if not settings.fmp_api_key:
        return []
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                FMP_NEWS_URL,
                params={"tickers": symbol, "limit": 10, "apikey": settings.fmp_api_key},
                timeout=8,
            )
            if resp.status_code != 200:
                return []
            return [
                {
                    "id": str(uuid.uuid4()),
                    "headline": item.get("title", ""),
                    "summary": item.get("text", "")[:300],
                    "source": item.get("site", "FMP"),
                    "url": item.get("url", ""),
                    "published_at": item.get("publishedDate", ""),
                }
                for item in resp.json()
                if isinstance(item, dict)
            ]
        except Exception:
            return []


async def _fetch_sec_edgar(symbol: str, from_date: str) -> list[NewsItem]:
    """
    SEC EDGAR 8-K filing alerts — covers every SEC-registered company.
    Returns NewsItem directly (skips airlock — SEC filings are always material events).
    SEC requires an identifying User-Agent header.
    """
    headers = {
        "User-Agent": "RocketNews dev@rocketnews.app",
        "Accept": "application/atom+xml, text/xml",
    }
    from_dt = datetime.strptime(from_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)

    async with httpx.AsyncClient(headers=headers, follow_redirects=True) as client:
        try:
            resp = await client.get(
                "https://www.sec.gov/cgi-bin/browse-edgar",
                params={
                    "action": "getcompany",
                    "CIK": symbol,
                    "type": "8-K",
                    "dateb": "",
                    "owner": "include",
                    "count": "5",
                    "output": "atom",
                },
                timeout=10,
            )
            if resp.status_code != 200:
                return []

            root = ET.fromstring(resp.text)
            ns = {"atom": "http://www.w3.org/2005/Atom"}
            items: list[NewsItem] = []

            for entry in root.findall("atom:entry", ns):
                title = entry.findtext("atom:title", namespaces=ns) or "SEC 8-K Filing"
                updated = entry.findtext("atom:updated", namespaces=ns) or ""
                link_el = entry.find("atom:link", ns)
                link = link_el.get("href", "") if link_el is not None else ""

                try:
                    dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
                except Exception:
                    dt = datetime.now(timezone.utc)

                if dt < from_dt:
                    continue

                items.append(NewsItem(
                    id=str(uuid.uuid4()),
                    tickers=[symbol],
                    headline=f"SEC 8-K: {title}",
                    summary=(
                        "Material event disclosure filed with the SEC. "
                        "Click to view the full filing for details."
                    ),
                    source="SEC EDGAR",
                    url=link,
                    published_at=dt.isoformat(),
                    tier=1,
                    catalyst=None,
                    sentiment_score=None,
                    relevance_score=9.0,
                ))

            return items
        except Exception:
            return []


# ── Public API ─────────────────────────────────────────────────────────────────

async def get_news_for_ticker(symbol: str, days: int = 3, limit: int = 10) -> list[NewsItem]:
    """Fetch, score, and return news for a single ticker from all sources."""
    from_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    to_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Fetch all sources concurrently
    finnhub_raw, yahoo_raw, alpaca_raw, fmp_raw, edgar_items = await asyncio.gather(
        _fetch_finnhub(symbol, from_date, to_date),
        _fetch_yahoo_rss(symbol, days=days),
        _fetch_alpaca(symbol),
        _fetch_fmp(symbol),
        _fetch_sec_edgar(symbol, from_date),
    )

    # Merge text sources; deduplicate by headline prefix before airlock
    # Alpaca (Benzinga) first — highest catalyst signal for small caps
    combined = alpaca_raw + finnhub_raw + fmp_raw + yahoo_raw
    seen: set[str] = set()
    deduped: list[dict] = []
    for item in combined:
        key = item.get("headline", "")[:60].lower()
        if key and key not in seen:
            seen.add(key)
            deduped.append(item)

    # Cap before airlock to keep LLM cost manageable
    deduped = deduped[:25]

    # SEC filings are pre-qualified (always Tier 1, always relevant)
    items: list[NewsItem] = list(edgar_items)

    if deduped:
        texts = [
            f"{r.get('headline', '')} {r.get('summary', '')}"
            for r in deduped
        ]
        scores = await airlock.score_batch(symbol, texts)

        for raw, score in zip(deduped, scores):
            if not score.passes:
                continue
            items.append(NewsItem(
                id=str(raw.get("id") or uuid.uuid4()),
                tickers=[symbol],
                headline=raw.get("headline", ""),
                summary=raw.get("summary", ""),
                source=raw.get("source", ""),
                url=raw.get("url", ""),
                published_at=_parse_datetime(
                    raw.get("datetime") or raw.get("published_at", "")
                ),
                tier=_classify_tier(raw.get("source", "")),
                catalyst=score.catalyst,
                sentiment_score=score.sentiment_score,
                relevance_score=score.relevance_score,
            ))

    # Sort: Tier 1 first, then most recent
    items.sort(key=lambda n: (n.tier, n.published_at), reverse=False)
    return items[:limit]


async def get_news_for_watchlist(symbols: list[str], limit: int = 20) -> list[NewsItem]:
    """Fetch news for multiple tickers, merge and deduplicate."""
    results = await asyncio.gather(
        *[get_news_for_ticker(s, days=3, limit=8) for s in symbols]
    )
    all_items = [item for sublist in results for item in sublist]

    seen: set[str] = set()
    deduped: list[NewsItem] = []
    for item in sorted(all_items, key=lambda n: n.published_at, reverse=True):
        key = item.headline[:80]
        if key not in seen:
            seen.add(key)
            deduped.append(item)

    return deduped[:limit]
