"""
Short interest data via Yahoo Finance quoteSummary.

Yahoo Finance v10 now requires a crumb token obtained from an authenticated
session. We use curl_cffi Chrome impersonation to get valid cookies, then
fetch the crumb, then query the API. Crumb is cached for 1 hour; data 4 hours.
"""

import asyncio
import time

_short_cache: dict[str, tuple[float, dict]] = {}   # symbol → (ts, data)
_crumb_cache: tuple[float, str, object] | None = None  # (ts, crumb, session)
_SHORT_TTL  = 14_400.0   # 4 hours
_CRUMB_TTL  = 3_600.0    # 1 hour


def _get_crumb_sync():
    """Return (crumb, session) with fresh cookies from Yahoo Finance."""
    from curl_cffi import requests as cf
    session = cf.Session(impersonate="chrome")
    # Establish cookies via the main finance page
    session.get("https://finance.yahoo.com/", timeout=10)
    resp = session.get(
        "https://query1.finance.yahoo.com/v1/test/getcrumb",
        timeout=10,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"crumb fetch failed: {resp.status_code}")
    return resp.text.strip(), session


def _fetch_sync(symbol: str) -> dict:
    global _crumb_cache
    try:
        now = time.monotonic()
        # Refresh crumb if stale
        if _crumb_cache is None or (now - _crumb_cache[0]) > _CRUMB_TTL:
            crumb, session = _get_crumb_sync()
            _crumb_cache = (now, crumb, session)
        else:
            _, crumb, session = _crumb_cache

        resp = session.get(
            f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{symbol}",
            params={"modules": "defaultKeyStatistics", "crumb": crumb},
            timeout=10,
        )
        # Crumb expired mid-session — refresh once and retry
        if resp.status_code == 401:
            crumb, session = _get_crumb_sync()
            _crumb_cache = (time.monotonic(), crumb, session)
            resp = session.get(
                f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{symbol}",
                params={"modules": "defaultKeyStatistics", "crumb": crumb},
                timeout=10,
            )
        if resp.status_code != 200:
            return {}
        data = resp.json()
        ks = (
            data.get("quoteSummary", {})
                .get("result", [{}])[0]
                .get("defaultKeyStatistics", {})
        )
        return {
            "shortPercentOfFloat": ks.get("shortPercentOfFloat", {}).get("raw"),
            "shortRatio":          ks.get("shortRatio", {}).get("raw"),
            "sharesShort":         ks.get("sharesShort", {}).get("raw"),
        }
    except Exception:
        return {}


async def get_short_interest(symbol: str) -> dict:
    now = time.monotonic()
    cached = _short_cache.get(symbol)
    if cached and (now - cached[0]) < _SHORT_TTL:
        return cached[1]
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _fetch_sync, symbol)
    _short_cache[symbol] = (now, result)
    return result


async def get_short_interest_batch(symbols: list[str]) -> dict[str, dict]:
    results = await asyncio.gather(*[get_short_interest(s) for s in symbols])
    return {sym: res for sym, res in zip(symbols, results)}
