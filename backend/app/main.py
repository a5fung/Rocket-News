from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute

from app.core.config import settings
from app.routers import chat, market, news, sentiment


def _use_route_names_as_operation_ids(app: FastAPI) -> None:
    """Use route function names as operation IDs (optional, cosmetic)."""
    for route in app.routes:
        if isinstance(route, APIRoute):
            route.operation_id = route.name


app = FastAPI(
    title="Rocket News API",
    version="0.1.0",
    description="Backend for the Rocket News stock sentiment dashboard",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(market.router)
app.include_router(news.router)
app.include_router(sentiment.router)
app.include_router(chat.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
