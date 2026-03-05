"""
Short interest data via Yahoo Finance quoteSummary.

Uses curl_cffi Chrome TLS impersonation (already a project dependency) to
bypass Yahoo's bot detection. 4-hour TTL — FINRA source data updates bi-weekly,
Yahoo propagates it within hours of each settlement date.
"""

import asyncio
import time

_short_cache: dict[str, tuple[float, dict]] = {}  # symbol → (ts, data)
_SHORT_TTL = 14_400.0  # 4 hours


def _fetch_sync(symbol: str) -> dict:
    from curl_cffi import requests as cf_requests
    try:
        resp = cf_requests.get(
            f"https://query1.finance.yahoo.com/v10/finance/quoteSummary/{symbol}",
            params={"modules": "defaultKeyStatistics"},
            impersonate="chrome",
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
