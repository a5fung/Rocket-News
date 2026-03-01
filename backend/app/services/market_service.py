"""
Market data service — Finnhub integration.

Free tier: 60 requests/minute, 15-min delayed quotes.
Upgrade path: Polygon.io WebSocket for real-time.
"""

import asyncio
import time

import httpx

from app.core.config import settings
from app.models.schemas import EarningsEvent, Ticker

FINNHUB_BASE = "https://finnhub.io/api/v1"

# Company names/logos rarely change — cache profiles for process lifetime
_profile_cache: dict[str, tuple[str, str]] = {}  # symbol → (name, logo_url)

# Earnings dates change slowly — 1-hour TTL per symbol
_earnings_cache: dict[str, tuple[float, EarningsEvent | None]] = {}  # symbol → (ts, event)
_EARNINGS_TTL = 3600.0


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

        cached = _profile_cache.get(symbol)
        if cached is None:
            profile = await _get_profile(client, symbol)
            name = profile.get("name", symbol) or symbol
            logo_url = profile.get("logo") or ""
            _profile_cache[symbol] = (name, logo_url)
        else:
            name, logo_url = cached

        return Ticker(
            symbol=symbol,
            name=name,
            price=float(price),
            change=float(change),
            change_percent=float(change_pct),
            logo_url=logo_url or None,
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


async def _get_earnings_for_symbol(symbol: str) -> EarningsEvent | None:
    """Fetch upcoming earnings for a single symbol within the next 7 days."""
    now = time.monotonic()
    cached = _earnings_cache.get(symbol)
    if cached and (now - cached[0]) < _EARNINGS_TTL:
        return cached[1]

    if not settings.finnhub_api_key:
        _earnings_cache[symbol] = (now, None)
        return None

    from datetime import date, timedelta
    today = date.today()
    to_date = today + timedelta(days=7)

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{FINNHUB_BASE}/calendar/earnings",
                params={
                    "from": today.isoformat(),
                    "to": to_date.isoformat(),
                    "symbol": symbol,
                    "token": settings.finnhub_api_key,
                },
                timeout=8,
            )
        if resp.status_code != 200:
            _earnings_cache[symbol] = (now, None)
            return None

        events = resp.json().get("earningsCalendar", [])
        if not events:
            _earnings_cache[symbol] = (now, None)
            return None

        ev = events[0]
        quarter = ev.get("quarter")
        year = ev.get("year")
        fiscal_quarter = f"Q{quarter} {year}" if quarter and year else ""
        result = EarningsEvent(
            symbol=symbol,
            report_date=ev.get("date", ""),
            fiscal_quarter=fiscal_quarter,
            hour=ev.get("hour") or None,
            eps_estimate=ev.get("epsEstimate") or None,
        )
        _earnings_cache[symbol] = (now, result)
        return result
    except Exception:
        _earnings_cache[symbol] = (now, None)
        return None


async def get_earnings_calendar(symbols: list[str]) -> list[EarningsEvent]:
    """Fetch upcoming earnings events for a list of symbols concurrently."""
    results = await asyncio.gather(*[_get_earnings_for_symbol(s) for s in symbols])
    return [r for r in results if r is not None]
