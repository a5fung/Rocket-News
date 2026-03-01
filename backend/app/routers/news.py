from fastapi import APIRouter, Query

from app.models.schemas import NewsItem
from app.services import news_service

router = APIRouter(prefix="/news", tags=["news"])


# IMPORTANT: /watchlist must be declared before /{symbol} or FastAPI will
# match "watchlist" as a symbol value and query Finnhub for ticker "WATCHLIST".
@router.get("/watchlist", response_model=list[NewsItem], response_model_by_alias=True)
async def get_watchlist_news(
    symbols: str = Query(..., description="Comma-separated ticker symbols"),
    limit: int = Query(20, ge=1, le=100),
):
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    return await news_service.get_news_for_watchlist(symbol_list, limit=limit)


@router.get("/{symbol}", response_model=list[NewsItem], response_model_by_alias=True)
async def get_ticker_news(symbol: str, limit: int = Query(10, ge=1, le=50)):
    return await news_service.get_news_for_ticker(symbol.upper(), days=1, limit=limit)
