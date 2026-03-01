"""
Airlock — LLM-powered relevance filter.

Scores incoming news/posts 1-10 for relevance to a given ticker.
Only items scoring >= PASS_THRESHOLD are passed to the frontend.
Uses Claude Haiku for cost efficiency (~$0.00025 per call).
"""

import json

import anthropic

from app.core.config import settings
from app.models.schemas import AirlockResult, CatalystTag

PASS_THRESHOLD = 7.0

# ── Keyword-based sentiment fallback (used when no Anthropic API key) ──────────

_BULLISH = frozenset([
    "bullish", "bull", "buy", "long", "calls", "moon", "squeeze", "breakout",
    "upgrade", "beat", "strong", "growth", "surge", "rally", "bounce",
    "outperform", "upside", "accumulate", "oversold", "dip", "undervalued",
    "catalyst", "guidance raise", "beat expectations", "record",
])
_BEARISH = frozenset([
    "bearish", "bear", "sell", "short", "puts", "crash", "dump", "downgrade",
    "miss", "weak", "decline", "fall", "drop", "overvalued", "avoid",
    "underperform", "overbought", "resistance", "ceiling", "layoffs", "recall",
    "investigation", "lawsuit", "fraud",
])


def _keyword_sentiment(text: str) -> float:
    """Simple bag-of-words sentiment score, capped at ±0.75."""
    lower = text.lower()
    bull = sum(1 for w in _BULLISH if w in lower)
    bear = sum(1 for w in _BEARISH if w in lower)
    total = bull + bear
    if total == 0:
        return 0.0
    return round((bull - bear) / total * 0.75, 2)

SYSTEM_PROMPT = """\
You are a financial relevance scoring engine for a stock trading dashboard.

Given a piece of text and a stock ticker, respond ONLY with a JSON object (no markdown):
{
  "relevance_score": <1-10, integer>,
  "sentiment_score": <-1.0 to 1.0, float, negative=bearish, positive=bullish>,
  "catalyst": <one of: Earnings|Regulatory|Analyst|Macro|Insider|Contract|Product|Other|null>
}

Scoring guide for relevance_score:
- 9-10: Direct company news (earnings, SEC filing, major contract, CEO change)
- 7-8: Strong indirect relevance (sector news that clearly affects the stock)
- 4-6: Weak relevance (general market commentary mentioning the stock in passing)
- 1-3: Irrelevant (spam, crypto, unrelated content mentioning the ticker by accident)
"""


_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


async def score(ticker: str, text: str) -> AirlockResult:
    """Score a single piece of content for relevance and sentiment."""
    if not settings.anthropic_api_key:
        # No LLM key: pass everything, use keyword-based sentiment as fallback
        return AirlockResult(
            relevance_score=8.0,
            sentiment_score=_keyword_sentiment(text),
            catalyst=None,
            passes=True,
        )

    client = _get_client()
    user_msg = f"Ticker: {ticker}\n\nText:\n{text[:1000]}"  # cap at 1000 chars

    try:
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=128,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )
        raw = response.content[0].text.strip()
        data = json.loads(raw)
        rel = float(data.get("relevance_score", 5))
        sent = float(data.get("sentiment_score", 0))
        catalyst_raw = data.get("catalyst")
        catalyst = CatalystTag(catalyst_raw) if catalyst_raw and catalyst_raw != "null" else None
        return AirlockResult(
            relevance_score=rel,
            sentiment_score=max(-1.0, min(1.0, sent)),
            catalyst=catalyst,
            passes=rel >= PASS_THRESHOLD,
        )
    except Exception:
        # On any failure, let content through with neutral score
        return AirlockResult(
            relevance_score=7.0,
            sentiment_score=0.0,
            catalyst=None,
            passes=True,
        )


async def score_batch(ticker: str, texts: list[str]) -> list[AirlockResult]:
    """Score multiple texts concurrently."""
    import asyncio
    return await asyncio.gather(*[score(ticker, t) for t in texts])


_THEMES_PROMPT = """\
You are a financial analyst reading social media posts about a stock.
Extract 2-3 specific trending themes or catalysts driving the discussion.

Rules:
- Return ONLY a JSON array of short hashtag-style strings
- Be specific and actionable (e.g. "#GuidanceRaise", "#ShortSqueeze", "#CEOInterview")
- Avoid generic terms like "#Bullish", "#Bearish", "#Stock", "#Market"
- If there are no clear themes, return []

Example output: ["#EarningsBeat", "#AnalystUpgrade"]
"""


async def extract_themes(ticker: str, post_texts: list[str]) -> list[str]:
    """
    Use Claude Haiku to extract 2-3 trending catalyst themes from social posts.
    Returns [] when no API key is configured.
    """
    if not settings.anthropic_api_key or not post_texts:
        return []

    client = _get_client()
    combined = "\n---\n".join(t[:200] for t in post_texts[:12])
    user_msg = f"Ticker: ${ticker}\n\nPosts:\n{combined[:2500]}"

    try:
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=80,
            system=_THEMES_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )
        raw = response.content[0].text.strip()
        themes = json.loads(raw)
        if isinstance(themes, list):
            return [str(t) for t in themes[:3] if isinstance(t, str)]
        return []
    except Exception:
        return []
