from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import Ticker
from app.services import market_service

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/quote/{symbol}", response_model=Ticker, response_model_by_alias=True)
async def get_quote(symbol: str):
    ticker = await market_service.get_quote(symbol.upper())
    if not ticker:
        raise HTTPException(status_code=404, detail=f"Quote not found for {symbol}")
    return ticker


@router.get("/quotes", response_model=list[Ticker], response_model_by_alias=True)
async def get_quotes(symbols: str = Query(..., description="Comma-separated ticker symbols")):
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not symbol_list:
        raise HTTPException(status_code=400, detail="No symbols provided")
    return await market_service.get_quotes(symbol_list)
