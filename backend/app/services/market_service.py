"""
Market data service — Finnhub integration.

Free tier: 60 requests/minute, 15-min delayed quotes.
Upgrade path: Polygon.io WebSocket for real-time.
"""

import asyncio
import time

import httpx

from app.core.config import settings
from app.models.schemas import CandlePoint, EarningsEvent, Ticker

FINNHUB_BASE = "https://finnhub.io/api/v1"

# Shared client — reuses TCP connections across all Finnhub API calls
_http = httpx.AsyncClient(
    limits=httpx.Limits(max_connections=30, max_keepalive_connections=10),
    timeout=httpx.Timeout(10.0),
)

# Company names/logos rarely change — cache profiles for process lifetime
_profile_cache: dict[str, tuple[str, str]] = {}  # symbol → (name, logo_url)

# Earnings dates change slowly — 1-hour TTL per symbol
_earnings_cache: dict[str, tuple[float, EarningsEvent | None]] = {}  # symbol → (ts, event)
_EARNINGS_TTL = 3600.0

# Intraday candles — 5-min TTL (candles update every 5 min during market hours)
_candles_cache: dict[str, tuple[float, list[CandlePoint]]] = {}  # symbol → (ts, points)
_CANDLES_TTL = 300.0

# Daily candles — 1-hour TTL (one data point per market day, rarely changes intraday)
_daily_candles_cache: dict[str, tuple[float, list[CandlePoint]]] = {}
_DAILY_CANDLES_TTL = 3600.0


async def get_quote(symbol: str) -> Ticker | None:
    """Fetch a single real-time quote from Finnhub."""
    resp = await _http.get(
        f"{FINNHUB_BASE}/quote",
        params={"symbol": symbol, "token": settings.finnhub_api_key},
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
        profile = await _get_profile(symbol)
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


async def _get_profile(symbol: str) -> dict:
    try:
        resp = await _http.get(
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
        resp = await _http.get(
            f"{FINNHUB_BASE}/calendar/earnings",
            params={
                "from": today.isoformat(),
                "to": to_date.isoformat(),
                "symbol": symbol,
                "token": settings.finnhub_api_key,
            },
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


async def _get_candles_for_symbol(symbol: str) -> list[CandlePoint]:
    """Fetch today's 5-minute intraday candles for a single symbol."""
    now_mono = time.monotonic()
    cached = _candles_cache.get(symbol)
    if cached and (now_mono - cached[0]) < _CANDLES_TTL:
        return cached[1]

    if not settings.finnhub_api_key:
        return []

    from datetime import datetime, timezone
    now_ts = int(datetime.now(timezone.utc).timestamp())
    from_ts = now_ts - 8 * 3600  # last 8 hours always covers the full US trading session

    try:
        resp = await _http.get(
            f"{FINNHUB_BASE}/stock/candle",
            params={
                "symbol": symbol,
                "resolution": "5",
                "from": from_ts,
                "to": now_ts,
                "token": settings.finnhub_api_key,
            },
        )
        if resp.status_code != 200:
            _candles_cache[symbol] = (now_mono, [])
            return []

        data = resp.json()
        if data.get("s") != "ok":
            _candles_cache[symbol] = (now_mono, [])
            return []

        points = [
            CandlePoint(t=t, c=c)
            for t, c in zip(data.get("t", []), data.get("c", []))
        ]
        _candles_cache[symbol] = (now_mono, points)
        return points
    except Exception:
        _candles_cache[symbol] = (now_mono, [])
        return []


async def get_candles_batch(symbols: list[str]) -> dict[str, list[CandlePoint]]:
    """Fetch intraday candles for multiple symbols concurrently."""
    results = await asyncio.gather(*[_get_candles_for_symbol(s) for s in symbols])
    return {symbol: pts for symbol, pts in zip(symbols, results)}


async def get_daily_candles(symbol: str, days: int = 10) -> list[CandlePoint]:
    """
    Fetch daily (end-of-day) close prices for the last `days` calendar days.
    Used to overlay price action on the 7-day sentiment trend chart.
    Finnhub resolution='D' returns one bar per market day.
    """
    now_mono = time.monotonic()
    cached = _daily_candles_cache.get(symbol)
    if cached and (now_mono - cached[0]) < _DAILY_CANDLES_TTL:
        return cached[1]

    if not settings.finnhub_api_key:
        _daily_candles_cache[symbol] = (now_mono, [])
        return []

    from datetime import datetime, timezone, timedelta
    now_ts = int(datetime.now(timezone.utc).timestamp())
    from_ts = int((datetime.now(timezone.utc) - timedelta(days=days)).timestamp())

    try:
        resp = await _http.get(
            f"{FINNHUB_BASE}/stock/candle",
            params={
                "symbol": symbol,
                "resolution": "D",
                "from": from_ts,
                "to": now_ts,
                "token": settings.finnhub_api_key,
            },
        )
        if resp.status_code != 200:
            _daily_candles_cache[symbol] = (now_mono, [])
            return []

        data = resp.json()
        if data.get("s") != "ok":
            _daily_candles_cache[symbol] = (now_mono, [])
            return []

        points = [
            CandlePoint(t=t, c=c)
            for t, c in zip(data.get("t", []), data.get("c", []))
        ]
        _daily_candles_cache[symbol] = (now_mono, points)
        return points
    except Exception:
        _daily_candles_cache[symbol] = (now_mono, [])
        return []


async def get_upcoming_earnings(symbol: str) -> "EarningsEvent | None":
    """Return the nearest upcoming earnings event (within 7 days), else None."""
    return await _get_earnings_for_symbol(symbol)
