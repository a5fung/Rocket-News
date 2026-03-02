import asyncio

from fastapi import APIRouter, Query

from app.models.schemas import (
    SentimentBundle,
    SentimentDataPoint,
    SentimentPost,
    SentimentScore,
)
from app.services import sentiment_service

router = APIRouter(prefix="/sentiment", tags=["sentiment"])


@router.get("/{symbol}/all", response_model=SentimentBundle, response_model_by_alias=True)
async def get_sentiment_all(
    symbol: str,
    days: int = Query(7, ge=1, le=30),
    limit: int = Query(20, ge=1, le=50),
):
    """
    Combined endpoint: score + history + posts in one round trip.
    Fetches posts first to warm the cache, then score (which re-uses the cache)
    and history run concurrently — eliminating the double Reddit fetch.
    """
    sym = symbol.upper()
    # Warm the posts cache first so get_sentiment() is fast (dict lookup + math)
    posts = await sentiment_service.get_posts(sym, limit=limit)
    score = await sentiment_service.get_sentiment(sym)
    # Pass the real score so the history walk ends exactly where the gauge reads
    history = await sentiment_service.get_sentiment_history(sym, days=days, current_score=score.score)
    return SentimentBundle(score=score, history=history, posts=posts)


@router.get("/{symbol}", response_model=SentimentScore, response_model_by_alias=True)
async def get_sentiment(symbol: str):
    return await sentiment_service.get_sentiment(symbol.upper())


@router.get("/{symbol}/history", response_model=list[SentimentDataPoint], response_model_by_alias=True)
async def get_sentiment_history(symbol: str, days: int = Query(7, ge=1, le=30)):
    return await sentiment_service.get_sentiment_history(symbol.upper(), days=days)


@router.get("/{symbol}/posts", response_model=list[SentimentPost], response_model_by_alias=True)
async def get_sentiment_posts(symbol: str, limit: int = Query(20, ge=1, le=50)):
    return await sentiment_service.get_posts(symbol.upper(), limit=limit)
