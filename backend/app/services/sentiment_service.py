"""
Sentiment service — StockTwits (primary) + Reddit (secondary).

StockTwits:
  - Native bullish/bearish tags per post — no LLM classification needed
  - Free public API, no auth required for stream endpoint
  - ~200 req/hour rate limit

Reddit:
  - Finance-focused subreddits (investing, stocks, wallstreetbets, options)
  - Pre-filter: cashtag OR finance keyword + ticker name
  - Airlock LLM scores for relevance and catalyst detection
  - Note: use sort=top&t=week for best recall; sort=new ignores the 't' param
"""

import asyncio
import html as _html
import logging
import re
import time
import uuid
from datetime import datetime, timezone

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)
from app.models.schemas import SentimentDataPoint, SentimentPost, SentimentScore
from app.services import airlock

REDDIT_BASE = "https://www.reddit.com"
STOCKTWITS_BASE = "https://api.stocktwits.com/api/2"

SUBREDDITS = ["investing", "stocks", "wallstreetbets", "options", "SecurityAnalysis"]

FINANCE_KEYWORDS = {
    "stock", "share", "shares", "earnings", "eps", "revenue", "guidance",
    "price target", "buy", "sell", "bullish", "bearish", "calls", "puts",
    "options", "squeeze", "short", "long", "market cap", "valuation",
    "dividend", "quarter", "ipo", "analyst", "upgrade", "downgrade",
    "price action", "technical", "fundamental", "bull", "bear", "chart",
    "breakout", "support", "resistance", "volume",
}

# Lower bar for engagement — smaller stocks attract fewer votes per post
MIN_ENGAGEMENT = 3

# Simple in-process cache — avoids hammering Reddit on every UI poll
# Key: symbol, Value: (timestamp, posts_list)
_posts_cache: dict[str, tuple[float, list]] = {}
CACHE_TTL = 900  # seconds (15 minutes)


def _is_finance_post(data: dict, symbol: str) -> bool:
    """Return True if a Reddit post is genuinely about the stock.

    Short tickers (≤ 3 chars, e.g. BE, ON, GO, A) are common English words or
    letter combinations that appear in almost every sentence. For these we require
    an explicit cashtag ($BE) — plain word matching would produce massive noise.
    Longer tickers use regex word-boundary matching to avoid substring hits
    (e.g. "AAPL" inside "pineapple" isn't a match, though that's a contrived case).
    """
    title = data.get("title", "")
    body = data.get("selftext", "")
    text = f"{title} {body}".lower()

    engagement = data.get("score", 0) + data.get("num_comments", 0)
    if engagement < MIN_ENGAGEMENT:
        return False

    # Always accept an explicit cashtag — unambiguous signal
    if f"${symbol.lower()}" in text:
        return True

    # Short tickers must have the cashtag; plain word check would flood results
    if len(symbol) <= 3:
        return False

    # Longer tickers: whole-word match (word-boundary) + at least one finance keyword
    if re.search(r"\b" + re.escape(symbol.lower()) + r"\b", text):
        return any(kw in text for kw in FINANCE_KEYWORDS)

    return False


# ── StockTwits ─────────────────────────────────────────────────────────────────

def _stocktwits_sentiment(msg: dict) -> float:
    """Convert StockTwits native bull/bear tag to a sentiment score."""
    sentiment = (msg.get("entities") or {}).get("sentiment") or {}
    basic = (sentiment.get("basic") or "").lower()
    if basic == "bullish":
        return 0.75
    if basic == "bearish":
        return -0.75
    return 0.0


def _stocktwits_sync(symbol: str, limit: int) -> list[dict]:
    """
    Synchronous StockTwits fetch using curl_cffi (Chrome TLS impersonation).
    Run via run_in_executor to avoid event-loop conflicts with uvicorn's asyncio.
    Import is lazy so curl_cffi doesn't slow down module-level startup.
    """
    from curl_cffi import requests as cffi_requests  # lazy — avoids startup overhead
    try:
        resp = cffi_requests.get(
            f"{STOCKTWITS_BASE}/streams/symbol/{symbol}.json",
            params={"limit": min(limit, 30)},
            impersonate="chrome110",
            timeout=10,
        )
        if resp.status_code == 403:
            logger.warning("StockTwits 403 for %s — Cloudflare block not bypassed", symbol)
            return []
        if resp.status_code != 200:
            logger.debug("StockTwits %s for %s", resp.status_code, symbol)
            return []
        return resp.json().get("messages", [])
    except Exception as exc:
        logger.warning("StockTwits fetch failed for %s: %s", symbol, exc)
        return []


async def _fetch_stocktwits(symbol: str, limit: int = 30) -> list[SentimentPost]:
    """
    Fetch recent StockTwits messages for a symbol.
    curl_cffi impersonates Chrome 110 at the TLS layer to bypass Cloudflare.
    Runs synchronously in a thread pool to avoid asyncio event-loop conflicts.
    Native bull/bear tags used directly — no airlock needed.
    """
    loop = asyncio.get_event_loop()
    messages = await loop.run_in_executor(None, _stocktwits_sync, symbol, limit)

    posts: list[SentimentPost] = []
    for msg in messages:
        user = msg.get("user") or {}
        likes = (msg.get("likes") or {}).get("total", 0)
        reshares = (msg.get("reshares") or {}).get("reshared_count", 0)
        engagement = likes + reshares + 1  # +1 so zero-engagement posts still count

        try:
            dt = datetime.fromisoformat(msg["created_at"].replace("Z", "+00:00"))
        except Exception:
            dt = datetime.now(timezone.utc)

        posts.append(SentimentPost(
            id=str(msg.get("id", uuid.uuid4())),
            ticker=symbol,
            content=_html.unescape(msg.get("body", "")),
            source="stocktwits",
            author=user.get("username", "unknown"),
            engagement=engagement,
            sentiment_score=_stocktwits_sentiment(msg),
            relevance_score=8.0,  # ticker-specific by definition
            catalyst=None,
            published_at=dt.isoformat(),
            url=f"https://stocktwits.com/{user.get('username', '')}",
        ))

    return posts


# ── Reddit ─────────────────────────────────────────────────────────────────────

async def _search_reddit(symbol: str, subreddit: str) -> list[dict]:
    """
    Search a subreddit for ticker mentions.

    Uses sort=top&t=week — broader window than sort=new which ignores the 't' param
    and often returns zero results for less-active tickers.
    """
    headers = {"User-Agent": settings.reddit_user_agent}
    async with httpx.AsyncClient(headers=headers) as client:
        try:
            resp = await client.get(
                f"{REDDIT_BASE}/r/{subreddit}/search.json",
                params={
                    "q": f"${symbol}",
                    "sort": "top",
                    "t": "week",
                    "limit": 15,
                    "restrict_sr": "on",
                },
                timeout=10,
            )
            if resp.status_code == 429:
                return []  # rate-limited; cache will prevent immediate retry
            if resp.status_code != 200:
                return []
            return resp.json().get("data", {}).get("children", [])
        except Exception:
            return []


async def _fetch_reddit(symbol: str) -> list[SentimentPost]:
    """Fetch, pre-filter, and airlock-score Reddit posts for a symbol."""
    raw_batches = await asyncio.gather(
        *[_search_reddit(symbol, sub) for sub in SUBREDDITS]
    )
    raw_posts = [child for batch in raw_batches for child in batch]

    # Deduplicate by post ID
    seen_ids: set[str] = set()
    unique: list[dict] = []
    for child in raw_posts:
        pid = child["data"].get("id", "")
        if pid and pid not in seen_ids:
            seen_ids.add(pid)
            unique.append(child)

    # Pre-filter for finance relevance before expensive LLM calls
    finance_posts = [p for p in unique if _is_finance_post(p["data"], symbol)]
    if not finance_posts:
        return []

    texts = [
        f"{p['data'].get('title', '')} {p['data'].get('selftext', '')[:300]}"
        for p in finance_posts
    ]
    scores = await airlock.score_batch(symbol, texts)

    posts: list[SentimentPost] = []
    for raw, score in zip(finance_posts, scores):
        if not score.passes:
            continue
        data = raw["data"]
        posts.append(SentimentPost(
            id=data.get("id", str(uuid.uuid4())),
            ticker=symbol,
            content=_html.unescape(data.get("title", "")),
            source="reddit",
            author=data.get("author", "unknown"),
            engagement=data.get("score", 0) + data.get("num_comments", 0),
            sentiment_score=score.sentiment_score,
            relevance_score=score.relevance_score,
            catalyst=score.catalyst,
            published_at=datetime.fromtimestamp(
                data.get("created_utc", 0), tz=timezone.utc
            ).isoformat(),
            url=f"https://reddit.com{data.get('permalink', '')}",
        ))

    return posts


# ── Public API ─────────────────────────────────────────────────────────────────

async def get_posts(symbol: str, limit: int = 20) -> list[SentimentPost]:
    """
    Fetch sentiment posts from StockTwits + Reddit, merge and rank.
    Results are cached for CACHE_TTL seconds to prevent Reddit rate-limiting.
    """
    now = time.monotonic()
    cached = _posts_cache.get(symbol)
    if cached and (now - cached[0]) < CACHE_TTL:
        return cached[1][:limit]

    st_posts, reddit_posts = await asyncio.gather(
        _fetch_stocktwits(symbol, limit=25),
        _fetch_reddit(symbol),
    )

    # StockTwits engagement (likes+reshares) is naturally much lower than Reddit
    # vote counts — a naive global sort starves StockTwits. Guarantee each source
    # gets up to half the slots, sorted by engagement within its own range.
    half = max(limit // 2, 5)
    combined = (
        sorted(st_posts, key=lambda p: p.engagement, reverse=True)[:half]
        + sorted(reddit_posts, key=lambda p: p.engagement, reverse=True)[:half]
    )
    combined.sort(key=lambda p: p.engagement, reverse=True)
    result = combined[:limit]

    _posts_cache[symbol] = (now, result)
    return result


async def get_sentiment(symbol: str) -> SentimentScore:
    """
    Compute aggregate sentiment score for a symbol.

    Runs three LLM tasks in parallel (when an API key is configured):
      1. Theme extraction — trending catalysts from top posts
      2. News sentiment  — avg airlock score from recent news articles
      3. Whisper number  — crowd expectation (only when earnings ≤7 days)
    """
    from datetime import date as _date
    from app.services import market_service as _market_svc
    from app.services import news_service as _news_svc

    posts = await get_posts(symbol, limit=40)

    if not posts:
        return SentimentScore(
            score=0.0,
            bullish_pct=50.0,
            bearish_pct=50.0,
            trend="neutral",
            post_volume=0,
            window_hours=24,
            themes=[],
        )

    scores = [p.sentiment_score for p in posts]
    avg = sum(scores) / len(scores)
    bullish = sum(1 for s in scores if s > 0.2) / len(scores) * 100
    bearish = sum(1 for s in scores if s < -0.2) / len(scores) * 100

    # Sort chronologically so early/late split reflects time, not fetch order
    sorted_posts = sorted(posts, key=lambda p: p.published_at)
    sorted_scores = [p.sentiment_score for p in sorted_posts]
    mid = len(sorted_scores) // 2
    early = sum(sorted_scores[:mid]) / max(mid, 1)
    late  = sum(sorted_scores[mid:]) / max(len(sorted_scores) - mid, 1)
    trend = (
        "rising" if (late - early) > 0.1
        else "falling" if (early - late) > 0.1
        else "neutral"
    )

    top_texts = [p.content for p in sorted(posts, key=lambda p: p.engagement, reverse=True)[:15]]

    # Check for upcoming earnings to decide whether to run whisper extraction
    earnings_event = await _market_svc.get_upcoming_earnings(symbol)
    earnings_near = False
    if earnings_event:
        try:
            days_away = (_date.fromisoformat(earnings_event.report_date) - _date.today()).days
            earnings_near = 0 <= days_away <= 7
        except Exception:
            pass

    # Parallel: themes + news items fetch (+ whisper when earnings near)
    parallel_tasks = [
        airlock.extract_themes(symbol, top_texts),
        _news_svc.get_news_for_ticker(symbol, limit=10),
    ]
    if earnings_near:
        parallel_tasks.append(airlock.extract_whisper(symbol, top_texts))

    results = await asyncio.gather(*parallel_tasks)
    themes: list[str] = results[0]
    news_items = results[1]
    whisper: str | None = results[2] if earnings_near else None

    # News sentiment: average of scored news articles (uses news cache — usually free)
    news_scores = [
        item.sentiment_score
        for item in news_items
        if item.sentiment_score is not None
    ]
    news_sentiment = round(sum(news_scores) / len(news_scores), 3) if news_scores else None

    return SentimentScore(
        score=round(avg, 3),
        bullish_pct=round(bullish, 1),
        bearish_pct=round(bearish, 1),
        trend=trend,
        post_volume=len(posts),
        window_hours=24,
        themes=themes,
        news_sentiment=news_sentiment,
        whisper=whisper,
    )


async def get_sentiment_history(
    symbol: str,
    days: int = 7,
    current_score: float = 0.0,
) -> list[SentimentDataPoint]:
    """
    Placeholder for Supabase time-series query.

    Generates a seeded random walk (reproducible per symbol) then applies a
    linear offset so the final point lands exactly on `current_score`. This
    ensures the chart always ends where the live gauge reads — avoiding the
    confusing case where a stock shows "65 Bullish" but the chart trends red.
    """
    import hashlib
    import random
    from datetime import timedelta

    seed = int(hashlib.md5(symbol.encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)

    buckets = days * 4  # 6-hour buckets

    # Generate raw walk
    raw: list[float] = []
    val = rng.uniform(-0.3, 0.3)
    for _ in range(buckets):
        val += rng.uniform(-0.18, 0.18)
        val = max(-0.9, min(0.9, val))
        raw.append(val)

    # Linearly shift so the last point equals current_score
    end_delta = current_score - raw[-1]
    adjusted = [
        max(-0.9, min(0.9, v + end_delta * (i / max(buckets - 1, 1))))
        for i, v in enumerate(raw)
    ]

    history = []
    for i, score in enumerate(adjusted):
        ts = datetime.now(timezone.utc) - timedelta(hours=(buckets - i) * 6)
        history.append(SentimentDataPoint(
            timestamp=ts.isoformat(),
            score=round(score, 3),
            volume=rng.randint(8, 120),
        ))
    return history
