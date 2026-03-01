"""Telegram Bot API — message sender for the Scout alert system."""

import httpx

from app.core.config import settings

TELEGRAM_API = "https://api.telegram.org"


async def send_message(text: str, parse_mode: str = "Markdown") -> bool:
    """Send a message to the configured Telegram chat. Returns True on success."""
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        return False
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{TELEGRAM_API}/bot{settings.telegram_bot_token}/sendMessage",
                json={
                    "chat_id": settings.telegram_chat_id,
                    "text": text,
                    "parse_mode": parse_mode,
                    "disable_web_page_preview": True,
                },
                timeout=10,
            )
            return resp.status_code == 200
    except Exception:
        return False
