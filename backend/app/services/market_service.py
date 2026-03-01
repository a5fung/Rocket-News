"""
Market data service — Finnhub integration.

Free tier: 60 requests/minute, 15-min delayed quotes.
Upgrade path: Polygon.io WebSocket for real-time.
"""

import httpx

from app.core.config import settings
from app.models.schemas import Ticker

FINNHUB_BASE = "https://finnhub.io/api/v1"


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
        price = data.get("c", 0)
        prev_close = data.get("pc", price)
        change = data.get("d", 0)
        change_pct = data.get("dp", 0)

        # Get company name via profile endpoint
        profile = await _get_profile(client, symbol)

        return Ticker(
            symbol=symbol,
            name=profile.get("name", symbol),
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
