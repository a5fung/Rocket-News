import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute

from app.core.config import settings
from app.routers import alerts, chat, insider, market, news, sentiment
from app.services import alert_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the Telegram Scout in the background if credentials are configured
    task = None
    if settings.telegram_bot_token and settings.telegram_chat_id:
        task = asyncio.create_task(alert_service.run_scout())
    yield
    if task:
        task.cancel()


def _use_route_names_as_operation_ids(app: FastAPI) -> None:
    """Use route function names as operation IDs (optional, cosmetic)."""
    for route in app.routes:
        if isinstance(route, APIRoute):
            route.operation_id = route.name


app = FastAPI(
    title="Rocket News API",
    version="0.1.0",
    description="Backend for the Rocket News stock sentiment dashboard",
    lifespan=lifespan,
)

_origins = settings.cors_origins_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials="*" not in _origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(market.router)
app.include_router(news.router)
app.include_router(sentiment.router)
app.include_router(chat.router)
app.include_router(alerts.router)
app.include_router(insider.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
