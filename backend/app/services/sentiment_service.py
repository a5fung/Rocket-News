"""
Sentiment service — Reddit as primary source.

Pre-filter pipeline (before airlock):
1. Cashtag presence ($TICKER) OR finance keyword + ticker mention
2. Minimum engagement (upvotes + comments >= 5)
3. Deduplicate by post ID

Then the airlock LLM scores for relevance/sentiment.
"""

import asyncio
import uuid
from datetime import datetime, timezone

import httpx

from app.core.config import settings
from app.models.schemas import SentimentDataPoint, SentimentPost, SentimentScore
from app.services import airlock

REDDIT_BASE = "https://www.reddit.com"

# Only finance-focused subreddits — excludes product/shopping communities
SUBREDDITS = ["investing", "stocks", "wallstreetbets", "options", "SecurityAnalysis"]

# Finance context keywords — post must contain cashtag OR one of these + ticker name
FINANCE_KEYWORDS = {
    "stock", "share", "shares", "earnings", "eps", "revenue", "guidance",
    "price target", "buy", "sell", "bullish", "bearish", "calls", "puts",
    "options", "squeeze", "short", "long", "market cap", "valuation",
    "dividend", "quarter", "ipo", "analyst", "upgrade", "downgrade",
    "price action", "technical", "fundamental", "bull", "bear",
}

MIN_ENGAGEMENT = 5  # upvotes + comments threshold


def _is_finance_post(data: dict, symbol: str) -> bool:
    """Return True if a Reddit post is genuinely about the stock, not noise."""
    title = data.get("title", "")
    body = data.get("selftext", "")
    text = f"{title} {body}".lower()

    # Must have minimum engagement
    engagement = data.get("score", 0) + data.get("num_comments", 0)
    if engagement < MIN_ENGAGEMENT:
        return False

    cashtag = f"${symbol.lower()}"

    # Fast pass: cashtag explicitly present
    if cashtag in text:
        return True

    # Slower check: ticker name present AND finance keyword present
    if symbol.lower() in text:
        return any(kw in text for kw in FINANCE_KEYWORDS)

    return False


async def _search_reddit(symbol: str, subreddit: str, limit: int = 25) -> list[dict]:
    """Search a subreddit for cashtag mentions, returning raw children."""
    headers = {"User-Agent": settings.reddit_user_agent}
    async with httpx.AsyncClient(headers=headers) as client:
        try:
            resp = await client.get(
                f"{REDDIT_BASE}/r/{subreddit}/search.json",
                params={"q": f"${symbol}", "sort": "new", "limit": limit, "t": "day"},
                timeout=10,
            )
            if resp.status_code != 200:
                return []
            return resp.json().get("data", {}).get("children", [])
        except Exception:
            return []


async def get_posts(symbol: str, limit: int = 20) -> list[SentimentPost]:
    """Fetch, pre-filter, and airlock-score Reddit posts for a symbol."""
    raw_batches = await asyncio.gather(
        *[_search_reddit(symbol, sub, limit=12) for sub in SUBREDDITS]
    )
    raw_posts = [child for batch in raw_batches for child in batch]

    # Deduplicate by post ID
    seen_ids: set[str] = set()
    unique_posts: list[dict] = []
    for child in raw_posts:
        post_id = child["data"].get("id", "")
        if post_id and post_id not in seen_ids:
            seen_ids.add(post_id)
            unique_posts.append(child)

    # Pre-filter for finance relevance before expensive LLM calls
    finance_posts = [p for p in unique_posts if _is_finance_post(p["data"], symbol)]

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
        posts.append(
            SentimentPost(
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
            )
        )

    posts.sort(key=lambda p: p.engagement, reverse=True)
    return posts[:limit]


async def get_sentiment(symbol: str) -> SentimentScore:
    """Compute aggregate sentiment score for a symbol."""
    posts = await get_posts(symbol, limit=40)

    if not posts:
        return SentimentScore(
            score=0.0,
            bullish_pct=50.0,
            bearish_pct=50.0,
            trend="neutral",
            post_volume=0,
            window_hours=24,
        )

    scores = [p.sentiment_score for p in posts]
    avg = sum(scores) / len(scores)
    bullish = sum(1 for s in scores if s > 0.2) / len(scores) * 100
    bearish = sum(1 for s in scores if s < -0.2) / len(scores) * 100

    mid = len(scores) // 2
    early = sum(scores[:mid]) / max(mid, 1)
    late = sum(scores[mid:]) / max(len(scores) - mid, 1)
    trend = "rising" if (late - early) > 0.1 else "falling" if (early - late) > 0.1 else "neutral"

    return SentimentScore(
        score=round(avg, 3),
        bullish_pct=round(bullish, 1),
        bearish_pct=round(bearish, 1),
        trend=trend,
        post_volume=len(posts),
        window_hours=24,
    )


async def get_sentiment_history(symbol: str, days: int = 7) -> list[SentimentDataPoint]:
    """
    Placeholder for Supabase time-series query.
    Uses a seeded random walk so the same symbol always gets the same shape
    (deterministic), making it less obviously fake during development.
    """
    import hashlib
    import random
    from datetime import timedelta

    # Seed with symbol so each ticker gets a unique but consistent chart shape
    seed = int(hashlib.md5(symbol.encode()).hexdigest()[:8], 16)
    rng = random.Random(seed)

    base_score = rng.uniform(-0.3, 0.3)
    history = []
    buckets = days * 4  # 6h buckets

    for i in range(buckets):
        ts = datetime.now(timezone.utc) - timedelta(hours=(buckets - i) * 6)
        base_score += rng.uniform(-0.18, 0.18)
        base_score = max(-0.9, min(0.9, base_score))
        history.append(
            SentimentDataPoint(
                timestamp=ts.isoformat(),
                score=round(base_score, 3),
                volume=rng.randint(8, 120),
            )
        )
    return history
