from fastapi import APIRouter, Query

from app.models.schemas import InsiderTrade, InsiderTransaction
from app.services import insider_service

router = APIRouter(prefix="/insider", tags=["insider"])


@router.get("/{symbol}", response_model=list[InsiderTrade], response_model_by_alias=True)
async def get_insider_trades(
    symbol: str,
    days: int = Query(30, ge=1, le=90),
):
    raw = await insider_service.get_insider_trades(symbol.upper(), days=days)
    result = []
    for trade in raw:
        result.append(InsiderTrade(
            name=trade["name"],
            role=trade["role"],
            filing_date=trade["filingDate"],
            transactions=[
                InsiderTransaction(
                    type=tx["type"],
                    shares=tx["shares"],
                    price=tx["price"],
                    date=tx["date"],
                )
                for tx in trade["transactions"]
            ],
        ))
    return result
