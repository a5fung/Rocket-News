"""
News service — Finnhub news API + tiering + airlock scoring.

Tier 1: SEC filings, earnings releases (Finnhub category: general + filtered)
Tier 2: Major outlets via Finnhub company news endpoint
"""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import httpx

from app.core.config import settings
from app.models.schemas import NewsItem, NewsTier
from app.services import airlock

FINNHUB_BASE = "https://finnhub.io/api/v1"

TIER1_SOURCES = {"sec.gov", "ir.", "investor.", "businesswire", "prnewswire", "globenewswire"}
TIER2_SOURCES = {"reuters", "bloomberg", "wsj", "marketwatch", "benzinga", "seekingalpha", "cnbc"}


def _classify_tier(source: str) -> int:
    source_lower = source.lower()
    if any(t in source_lower for t in TIER1_SOURCES):
        return 1
    return 2


async def get_news_for_ticker(symbol: str, days: int = 1, limit: int = 10) -> list[NewsItem]:
    """Fetch, score, and return news for a single ticker."""
    from_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    to_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    async with httpx.AsyncClient() as client:
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

        raw_items = resp.json()[:30]  # cap before airlock to save LLM calls

    # Score through airlock concurrently
    texts = [f"{item.get('headline', '')} {item.get('summary', '')}" for item in raw_items]
    scores = await airlock.score_batch(symbol, texts)

    items: list[NewsItem] = []
    for raw, score in zip(raw_items, scores):
        if not score.passes:
            continue
        items.append(
            NewsItem(
                id=str(raw.get("id", uuid.uuid4())),
                tickers=[symbol],
                headline=raw.get("headline", ""),
                summary=raw.get("summary", ""),
                source=raw.get("source", ""),
                url=raw.get("url", ""),
                published_at=datetime.fromtimestamp(
                    raw.get("datetime", 0), tz=timezone.utc
                ).isoformat(),
                tier=_classify_tier(raw.get("source", "")),
                catalyst=score.catalyst,
                sentiment_score=score.sentiment_score,
                relevance_score=score.relevance_score,
            )
        )

    # Sort by tier then recency
    items.sort(key=lambda n: (n.tier, n.published_at), reverse=False)
    return items[:limit]


async def get_news_for_watchlist(symbols: list[str], limit: int = 20) -> list[NewsItem]:
    """Fetch news for multiple tickers, merge and deduplicate."""
    results = await asyncio.gather(*[get_news_for_ticker(s, days=1, limit=10) for s in symbols])
    all_items: list[NewsItem] = [item for sublist in results for item in sublist]

    # Deduplicate by headline similarity (simple: exact headline match)
    seen: set[str] = set()
    deduped: list[NewsItem] = []
    for item in sorted(all_items, key=lambda n: n.published_at, reverse=True):
        key = item.headline[:80]
        if key not in seen:
            seen.add(key)
            deduped.append(item)

    return deduped[:limit]
