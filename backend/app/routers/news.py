import datetime

from fastapi import APIRouter, Query

from app.models.schemas import NewsBrief, NewsItem
from app.services import news_service

router = APIRouter(prefix="/news", tags=["news"])


# IMPORTANT: /watchlist and /brief must be declared before /{symbol} or FastAPI
# will match those path segments as symbol values.
@router.get("/watchlist", response_model=list[NewsItem], response_model_by_alias=True)
async def get_watchlist_news(
    symbols: str = Query(..., description="Comma-separated ticker symbols"),
    limit: int = Query(20, ge=1, le=100),
):
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    return await news_service.get_news_for_watchlist(symbol_list, limit=limit)


@router.get("/{symbol}/brief", response_model=NewsBrief, response_model_by_alias=True)
async def get_ticker_brief(symbol: str):
    sym = symbol.upper()
    brief = await news_service.get_news_brief(sym)
    return NewsBrief(
        symbol=sym,
        brief=brief,
        generatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    )


@router.get("/{symbol}", response_model=list[NewsItem], response_model_by_alias=True)
async def get_ticker_news(symbol: str, limit: int = Query(10, ge=1, le=50)):
    return await news_service.get_news_for_ticker(symbol.upper(), days=1, limit=limit)
