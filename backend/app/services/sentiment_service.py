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
import uuid
from datetime import datetime, timezone

import httpx

from app.core.config import settings
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


def _is_finance_post(data: dict, symbol: str) -> bool:
    """Return True if a Reddit post is genuinely about the stock."""
    title = data.get("title", "")
    body = data.get("selftext", "")
    text = f"{title} {body}".lower()

    engagement = data.get("score", 0) + data.get("num_comments", 0)
    if engagement < MIN_ENGAGEMENT:
        return False

    # Fast pass: explicit cashtag
    if f"${symbol.lower()}" in text:
        return True

    # Ticker name present AND at least one finance keyword
    if symbol.lower() in text:
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


async def _fetch_stocktwits(symbol: str, limit: int = 30) -> list[SentimentPost]:
    """
    Fetch recent StockTwits messages for a symbol.
    Native bull/bear tags are used directly — no airlock needed.
    """
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{STOCKTWITS_BASE}/streams/symbol/{symbol}.json",
                params={"limit": min(limit, 30)},
                timeout=8,
                headers={"User-Agent": "RocketNews/0.1"},
            )
            if resp.status_code != 200:
                return []

            messages = resp.json().get("messages", [])
            posts: list[SentimentPost] = []

            for msg in messages:
                user = msg.get("user") or {}
                likes = (msg.get("likes") or {}).get("total", 0)
                reshares = (msg.get("reshares") or {}).get("reshared_count", 0)
                engagement = likes + reshares + 1  # +1 so zero-engagement posts still count

                # Parse created_at — StockTwits uses ISO 8601
                try:
                    dt = datetime.fromisoformat(
                        msg["created_at"].replace("Z", "+00:00")
                    )
                except Exception:
                    dt = datetime.now(timezone.utc)

                posts.append(SentimentPost(
                    id=str(msg.get("id", uuid.uuid4())),
                    ticker=symbol,
                    content=msg.get("body", ""),
                    source="stocktwits",
                    author=user.get("username", "unknown"),
                    engagement=engagement,
                    sentiment_score=_stocktwits_sentiment(msg),
                    relevance_score=8.0,  # StockTwits posts are ticker-specific by definition
                    catalyst=None,
                    published_at=dt.isoformat(),
                    url=f"https://stocktwits.com/{user.get('username', '')}",
                ))

            return posts
        except Exception:
            return []


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
            content=data.get("title", ""),
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
    StockTwits is primary (native sentiment, always returns results).
    Reddit is secondary (richer context, airlock filtered).
    """
    st_posts, reddit_posts = await asyncio.gather(
        _fetch_stocktwits(symbol, limit=25),
        _fetch_reddit(symbol),
    )

    # Merge: StockTwits first (generally more reliable), then Reddit
    combined = st_posts + reddit_posts

    # Sort by engagement descending
    combined.sort(key=lambda p: p.engagement, reverse=True)
    return combined[:limit]


async def get_sentiment(symbol: str) -> SentimentScore:
    """Compute aggregate sentiment score for a symbol, including LLM-extracted themes."""
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

    mid = len(scores) // 2
    early = sum(scores[:mid]) / max(mid, 1)
    late = sum(scores[mid:]) / max(len(scores) - mid, 1)
    trend = (
        "rising" if (late - early) > 0.1
        else "falling" if (early - late) > 0.1
        else "neutral"
    )

    # Extract trending themes from top posts via Claude Haiku (skipped if no API key)
    top_texts = [p.content for p in sorted(posts, key=lambda p: p.engagement, reverse=True)[:15]]
    themes = await airlock.extract_themes(symbol, top_texts)

    return SentimentScore(
        score=round(avg, 3),
        bullish_pct=round(bullish, 1),
        bearish_pct=round(bearish, 1),
        trend=trend,
        post_volume=len(posts),
        window_hours=24,
        themes=themes,
    )


async def get_sentiment_history(symbol: str, days: int = 7) -> list[SentimentDataPoint]:
    """
    Placeholder for Supabase time-series query.
    Uses seeded random walk so the same symbol always shows the same shape.
    """
    import hashlib
    import random
    from datetime import timedelta

    seed = int(hashlib.md5(symbol.encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)

    base_score = rng.uniform(-0.3, 0.3)
    history = []
    buckets = days * 4  # 6-hour buckets

    for i in range(buckets):
        ts = datetime.now(timezone.utc) - timedelta(hours=(buckets - i) * 6)
        base_score += rng.uniform(-0.18, 0.18)
        base_score = max(-0.9, min(0.9, base_score))
        history.append(SentimentDataPoint(
            timestamp=ts.isoformat(),
            score=round(base_score, 3),
            volume=rng.randint(8, 120),
        ))
    return history
