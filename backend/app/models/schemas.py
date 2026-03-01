from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class _CamelModel(BaseModel):
    """Base model that serialises to camelCase JSON for the frontend."""
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,  # still accept snake_case on input
    )


# ─── Market ───────────────────────────────────────────────────────────────────

class Ticker(_CamelModel):
    symbol: str
    name: str
    price: float
    change: float
    change_percent: float
    volume: int | None = None
    market_cap: float | None = None
    sentiment: SentimentScore | None = None


# ─── Earnings ─────────────────────────────────────────────────────────────────

class EarningsEvent(_CamelModel):
    symbol: str
    report_date: str          # "YYYY-MM-DD"
    fiscal_quarter: str       # "Q1 2026"
    hour: str | None = None   # "amc" | "bmo" | "dmh"
    eps_estimate: float | None = None


class MoveTag(_CamelModel):
    symbol: str
    tag: str                  # e.g. "Earnings Beat", "Contract Award"
    change_percent: float     # % change at time of generation


# ─── News ─────────────────────────────────────────────────────────────────────

class NewsTier(int, Enum):
    tier1 = 1
    tier2 = 2


class CatalystTag(str, Enum):
    earnings = "Earnings"
    regulatory = "Regulatory"
    analyst = "Analyst"
    macro = "Macro"
    insider = "Insider"
    contract = "Contract"
    product = "Product"
    other = "Other"


class NewsItem(_CamelModel):
    id: str
    tickers: list[str]
    headline: str
    summary: str
    source: str
    url: str
    published_at: str  # ISO 8601
    tier: int = Field(ge=1, le=2)
    catalyst: CatalystTag | None = None
    sentiment_score: float | None = Field(None, ge=-1, le=1)
    relevance_score: float | None = Field(None, ge=1, le=10)


# ─── Sentiment ────────────────────────────────────────────────────────────────

class SentimentScore(_CamelModel):
    score: float = Field(ge=-1, le=1)
    bullish_pct: float = Field(ge=0, le=100)
    bearish_pct: float = Field(ge=0, le=100)
    trend: Literal["rising", "falling", "neutral"]
    post_volume: int
    window_hours: int
    themes: list[str] = []  # LLM-extracted trending catalysts e.g. ["#EarningsBeat"]


class SentimentDataPoint(_CamelModel):
    timestamp: str
    score: float
    volume: int


class SentimentPost(_CamelModel):
    id: str
    ticker: str
    content: str
    source: Literal["reddit", "x", "stocktwits"]
    author: str
    engagement: int
    sentiment_score: float
    relevance_score: float
    catalyst: CatalystTag | None = None
    published_at: str
    url: str


class SentimentBundle(_CamelModel):
    """Combined response for /sentiment/{symbol}/all — one round trip instead of three."""
    score: SentimentScore
    history: list[SentimentDataPoint]
    posts: list[SentimentPost]


# ─── Chat ─────────────────────────────────────────────────────────────────────

class ChatRole(str, Enum):
    user = "user"
    assistant = "assistant"


class ChatMessage(_CamelModel):
    id: str
    role: ChatRole
    content: str
    timestamp: str
    cited_headlines: list[str] | None = None


class DashboardContext(_CamelModel):
    watchlist: list[Ticker]
    top_news: list[NewsItem]
    sentiment: dict[str, SentimentScore]
    generated_at: str


class ChatRequest(_CamelModel):
    messages: list[ChatMessage]
    context: DashboardContext
    api_key: str


class ChatResponse(_CamelModel):
    reply: str
    cited_headlines: list[str] | None = None


# ─── Airlock ──────────────────────────────────────────────────────────────────

class AirlockResult(BaseModel):
    relevance_score: float  # 1-10
    sentiment_score: float  # -1 to 1
    catalyst: CatalystTag | None = None
    passes: bool            # True if relevance_score >= 7
