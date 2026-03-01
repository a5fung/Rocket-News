"""
Explain-the-Move service.

When a stock moves ±3%+, asks Claude Haiku to scan recent news and return a
2-4 word reason tag (e.g. "Earnings Beat", "Contract Award", "Analyst Upgrade").

Cache: 30-minute TTL per symbol. Tag is regenerated if the mover list changes
significantly (handled by the frontend only sending symbols that still qualify).
"""

import asyncio
import time

import anthropic

from app.core.config import settings
from app.models.schemas import MoveTag
from app.services import news_service
from app.services.market_service import _profile_cache

_tag_cache: dict[str, tuple[float, str]] = {}  # symbol → (monotonic_ts, tag)
_TAG_TTL = 1800.0  # 30 minutes

_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


_SYSTEM = """\
You are a financial analyst. Given a stock's intraday move and its recent news \
headlines, return a single 2-4 word reason tag that explains WHY the stock is moving.

Rules:
- Be specific, not generic. Good examples: "Earnings Beat", "Revenue Miss", \
"Contract Award", "CEO Departure", "Analyst Upgrade", "FDA Approval", \
"Guidance Raise", "Short Squeeze", "Sympathy Play", "Sector Rotation", \
"Market Selloff", "Macro Fear"
- If no clear catalyst exists in the headlines, return: Unknown Catalyst
- Respond with ONLY the tag text — no punctuation, no quotes, nothing else.\
"""


async def _explain_symbol(symbol: str, change_pct: float) -> MoveTag | None:
    now = time.monotonic()
    cached = _tag_cache.get(symbol)
    if cached and (now - cached[0]) < _TAG_TTL:
        return MoveTag(symbol=symbol, tag=cached[1], change_percent=change_pct)

    if not settings.anthropic_api_key:
        tag = "Unknown Catalyst"
        _tag_cache[symbol] = (now, tag)
        return MoveTag(symbol=symbol, tag=tag, change_percent=change_pct)

    # Pull recent headlines — uses 5-min cache from news_service so no extra cost
    news_items = await news_service.get_news_for_ticker(symbol, days=2, limit=5)
    headlines = [n.headline for n in news_items] if news_items else []
    headlines_text = (
        "\n".join(f"- {h}" for h in headlines) if headlines else "- No recent news found"
    )

    cached_profile = _profile_cache.get(symbol)
    company = cached_profile[0] if cached_profile else symbol
    direction = "up" if change_pct >= 0 else "down"
    user_msg = (
        f"Stock: {symbol} ({company})\n"
        f"Move: {change_pct:+.2f}% ({direction}) today\n\n"
        f"Recent news headlines:\n{headlines_text}"
    )

    try:
        client = _get_client()
        resp = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=20,
            system=_SYSTEM,
            messages=[{"role": "user", "content": user_msg}],
        )
        tag = resp.content[0].text.strip().strip('"').strip("'")
        tag = tag[:40]  # safety cap — should never exceed this
    except Exception:
        tag = "Unknown Catalyst"

    _tag_cache[symbol] = (now, tag)
    return MoveTag(symbol=symbol, tag=tag, change_percent=change_pct)


async def explain_moves(symbols: list[str], changes: list[float]) -> list[MoveTag]:
    """Generate move-explanation tags for a list of symbols concurrently."""
    results = await asyncio.gather(
        *[_explain_symbol(sym, chg) for sym, chg in zip(symbols, changes)]
    )
    # Only return tags where we have a real LLM-generated reason
    return [r for r in results if r is not None and r.tag != "Unknown Catalyst"]
