from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import settings
from app.services import alert_service, bot_service

router = APIRouter(prefix="/alerts", tags=["alerts"])


class WatchlistBody(BaseModel):
    symbols: list[str]


@router.get("/status")
async def get_status():
    return {
        "configured": bool(settings.telegram_bot_token and settings.telegram_chat_id),
        "symbols": alert_service.get_symbols(),
        "priceThresholdPct": settings.alert_price_pct,
    }


@router.post("/watchlist")
async def set_watchlist(body: WatchlistBody):
    alert_service.set_symbols(body.symbols)
    return {"symbols": alert_service.get_symbols()}


@router.post("/test")
async def send_test():
    symbols = alert_service.get_symbols()
    watching = ", ".join(symbols) if symbols else "no symbols synced yet"
    ok = await bot_service.send_message(
        f"🚀 *Rocket News Scout* is active!\n"
        f"Watching: {watching}\n"
        f"Price threshold: ±{settings.alert_price_pct}%"
    )
    return {"ok": ok, "error": None if ok else "Failed — check TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in backend/.env"}
