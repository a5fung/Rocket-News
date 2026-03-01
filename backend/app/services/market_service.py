"""
Market data service — Finnhub integration.

Free tier: 60 requests/minute, 15-min delayed quotes.
Upgrade path: Polygon.io WebSocket for real-time.
"""

import httpx

from app.core.config import settings
from app.models.schemas import Ticker

FINNHUB_BASE = "https://finnhub.io/api/v1"

# Company names rarely change — cache profiles for 24 hours to halve Finnhub call count
_profile_cache: dict[str, str] = {}  # symbol → company name


async def get_quote(symbol: str) -> Ticker | None:
    """Fetch a single real-time quote from Finnhub."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{FINNHUB_BASE}/quote",
            params={"symbol": symbol, "token": settings.finnhub_api_key},
            timeout=10,
        )
        if resp.status_code != 200:
            return None

        data = resp.json()

        # Finnhub returns null for d/dp outside market hours or for unknown tickers.
        # .get("d", 0) won't help when the key exists but the value is null — use `or 0`.
        price = data.get("c") or 0.0
        prev_close = data.get("pc") or price
        change = data.get("d") or 0.0
        change_pct = data.get("dp") or 0.0

        # Skip tickers Finnhub doesn't recognise (price stays 0)
        if price == 0:
            return None

        name = _profile_cache.get(symbol)
        if name is None:
            profile = await _get_profile(client, symbol)
            name = profile.get("name", symbol) or symbol
            _profile_cache[symbol] = name

        return Ticker(
            symbol=symbol,
            name=name,
            price=float(price),
            change=float(change),
            change_percent=float(change_pct),
        )


async def get_quotes(symbols: list[str]) -> list[Ticker]:
    """Fetch quotes for multiple tickers concurrently."""
    import asyncio
    results = await asyncio.gather(*[get_quote(s) for s in symbols])
    return [r for r in results if r is not None]


async def _get_profile(client: httpx.AsyncClient, symbol: str) -> dict:
    try:
        resp = await client.get(
            f"{FINNHUB_BASE}/stock/profile2",
            params={"symbol": symbol, "token": settings.finnhub_api_key},
            timeout=5,
        )
        return resp.json() if resp.status_code == 200 else {}
    except Exception:
        return {}
