from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import CandlePoint, EarningsEvent, MoveTag, ShortInterest, Ticker
from app.services import explain_service, market_service, short_interest_service

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/explain", response_model=list[MoveTag], response_model_by_alias=True)
async def get_explain(
    symbols: str = Query(..., description="Comma-separated ticker symbols"),
    changes: str = Query(..., description="Comma-separated % changes matching symbols"),
):
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    try:
        change_list = [float(c) for c in changes.split(",") if c.strip()]
    except ValueError:
        raise HTTPException(status_code=400, detail="changes must be numeric")
    if not symbol_list or len(symbol_list) != len(change_list):
        raise HTTPException(status_code=400, detail="symbols and changes must be equal length")
    return await explain_service.explain_moves(symbol_list, change_list)


@router.get("/earnings", response_model=list[EarningsEvent], response_model_by_alias=True)
async def get_earnings(symbols: str = Query(..., description="Comma-separated ticker symbols")):
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not symbol_list:
        raise HTTPException(status_code=400, detail="No symbols provided")
    return await market_service.get_earnings_calendar(symbol_list)


@router.get("/candles/daily", response_model=list[CandlePoint])
async def get_daily_candles(symbol: str = Query(..., description="Ticker symbol")):
    return await market_service.get_daily_candles(symbol.upper())


@router.get("/candles", response_model=dict[str, list[CandlePoint]])
async def get_candles(symbols: str = Query(..., description="Comma-separated ticker symbols")):
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not symbol_list:
        raise HTTPException(status_code=400, detail="No symbols provided")
    return await market_service.get_candles_batch(symbol_list)


@router.get("/short-interest", response_model=list[ShortInterest], response_model_by_alias=True)
async def get_short_interest(symbols: str = Query(..., description="Comma-separated ticker symbols")):
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not symbol_list:
        raise HTTPException(status_code=400, detail="No symbols provided")
    batch = await short_interest_service.get_short_interest_batch(symbol_list)
    return [ShortInterest(symbol=sym, **data) for sym, data in batch.items() if data]


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
