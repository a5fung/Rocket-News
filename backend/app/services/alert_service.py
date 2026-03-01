"""
Telegram Scout — background alert worker.

Polls every 5 minutes and fires Telegram alerts for:
  1. Price move >= ALERT_PRICE_PCT (default 5%)
  2. New Tier 1 news (SEC 8-K, BusinessWire, PR Newswire)
  3. Earnings tomorrow or today

Deduplication: each alert key has a cooldown so the same event
never fires twice within the cooldown window.
"""

import asyncio
import time
from datetime import date, timedelta

from app.core.config import settings
from app.models.schemas import Ticker
from app.services import bot_service, market_service

POLL_INTERVAL = 300         # 5 minutes
PRICE_COOLDOWN = 4 * 3600   # 4 hours per symbol
NEWS_COOLDOWN = 7 * 24 * 3600  # 7 days — article IDs are unique anyway
EARNINGS_COOLDOWN = 20 * 3600  # once per earnings date

# Symbols to watch — synced by the frontend via POST /alerts/watchlist
_watched_symbols: list[str] = []

# Alert deduplication — key → monotonic timestamp of last send
_sent_alerts: dict[str, float] = {}


def set_symbols(symbols: list[str]) -> None:
    global _watched_symbols
    _watched_symbols = [s.strip().upper() for s in symbols if s.strip()]


def get_symbols() -> list[str]:
    """Return watched symbols: frontend-synced, falls back to .env."""
    if _watched_symbols:
        return list(_watched_symbols)
    return [s.strip().upper() for s in settings.alert_symbols.split(",") if s.strip()]


def _cooldown_ok(key: str, ttl: float) -> bool:
    """Return True if the alert has NOT been sent recently (safe to send)."""
    ts = _sent_alerts.get(key)
    return ts is None or (time.monotonic() - ts) >= ttl


def _mark_sent(key: str) -> None:
    _sent_alerts[key] = time.monotonic()


# ── Alert checkers ─────────────────────────────────────────────────────────────

async def _check_price_alerts(tickers: list[Ticker]) -> None:
    for t in tickers:
        if abs(t.change_percent) < settings.alert_price_pct:
            continue

        key = f"{t.symbol}:price"
        if not _cooldown_ok(key, PRICE_COOLDOWN):
            continue
        _mark_sent(key)

        arrow = "🚀" if t.change_percent >= 0 else "🔻"
        sign = "+" if t.change_percent >= 0 else ""

        # Include LLM reason tag from explain_service cache if available
        try:
            from app.services.explain_service import _tag_cache
            tag_entry = _tag_cache.get(t.symbol)
            tag_line = f" — _{tag_entry[1]}_" if tag_entry else ""
        except Exception:
            tag_line = ""

        await bot_service.send_message(
            f"{arrow} *{t.symbol}* moved *{sign}{t.change_percent:.2f}%*{tag_line}\n"
            f"💰 ${t.price:.2f}  ({sign}${t.change:.2f})\n"
            f"_via Rocket News Scout_"
        )


async def _check_news_alerts(symbols: list[str]) -> None:
    # Read directly from the news cache — no extra API calls
    from app.services.news_service import _news_cache

    for symbol in symbols:
        cached = _news_cache.get(symbol)
        if not cached:
            continue
        _, items = cached

        for item in items:
            if item.tier != 1:
                continue
            key = f"news:{item.id}"
            if not _cooldown_ok(key, NEWS_COOLDOWN):
                continue
            _mark_sent(key)

            await bot_service.send_message(
                f"📢 *{symbol}* — Tier 1 News\n"
                f"{item.headline}\n"
                f"[Read more]({item.url})"
            )


async def _check_earnings_alerts(symbols: list[str]) -> None:
    from app.services.market_service import _earnings_cache

    today = date.today()

    for symbol in symbols:
        cached = _earnings_cache.get(symbol)
        if not cached:
            continue
        _, event = cached
        if not event or not event.report_date:
            continue

        try:
            report_date = date.fromisoformat(event.report_date)
        except ValueError:
            continue

        days_away = (report_date - today).days
        if days_away not in (0, 1):
            continue

        key = f"{symbol}:earnings:{event.report_date}"
        if not _cooldown_ok(key, EARNINGS_COOLDOWN):
            continue
        _mark_sent(key)

        when = "today" if days_away == 0 else "tomorrow"
        hour_labels = {
            "amc": "After Market Close",
            "bmo": "Before Market Open",
            "dmh": "During Market Hours",
        }
        hour_str = hour_labels.get(event.hour or "", "")
        timing = f" ({hour_str})" if hour_str else ""
        eps_line = f"\n📊 EPS Estimate: ${event.eps_estimate:.2f}" if event.eps_estimate else ""
        qtr_line = f" · {event.fiscal_quarter}" if event.fiscal_quarter else ""

        await bot_service.send_message(
            f"📅 *{symbol}* reports *{when}*{timing}{qtr_line}{eps_line}\n"
            f"_via Rocket News Scout_"
        )


# ── Scout loop ─────────────────────────────────────────────────────────────────

async def run_scout() -> None:
    """Runs forever in the background. Polls every POLL_INTERVAL seconds."""
    await asyncio.sleep(15)  # let the server fully start first

    while True:
        try:
            symbols = get_symbols()
            if symbols:
                tickers = await market_service.get_quotes(symbols)
                await asyncio.gather(
                    _check_price_alerts(tickers),
                    _check_news_alerts(symbols),
                    _check_earnings_alerts(symbols),
                )
        except Exception:
            pass  # never crash the background task
        await asyncio.sleep(POLL_INTERVAL)
