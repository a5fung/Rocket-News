"""
Chat service — context-aware AI responses.

Injects dashboard state (prices, news, sentiment) as system context
so the model answers grounded in real-time data, not hallucinations.
"""

import json

import anthropic

from app.models.schemas import ChatMessage, ChatRequest, ChatResponse, DashboardContext

SYSTEM_TEMPLATE = """\
You are a professional trading assistant embedded in a live stock dashboard called Rocket News.
The user is viewing their watchlist in real time. Answer questions concisely and specifically,
citing the data below when relevant. Do not speculate beyond what the data shows.

─── LIVE DASHBOARD CONTEXT ─────────────────────────────────────────────────────
Generated at: {generated_at}

WATCHLIST PRICES:
{prices}

TOP NEWS (last 24h, airlock-filtered):
{news}

SENTIMENT SCORES:
{sentiment}
────────────────────────────────────────────────────────────────────────────────

Rules:
- Be direct and concise (3-5 sentences unless a longer answer is clearly needed)
- Cite specific headlines or prices when making claims
- Flag uncertainty — say "the data doesn't show" rather than guessing
- Do not recommend specific trades or give investment advice
"""


def _build_context_block(ctx: DashboardContext) -> str:
    prices = "\n".join(
        f"  {t.symbol} ({t.name}): ${t.price:.2f}  {t.change_percent:+.2f}%"
        for t in ctx.watchlist
    ) or "  (no tickers in watchlist)"

    news_lines = []
    for item in ctx.top_news[:15]:
        tickers = ", ".join(f"${t}" for t in item.tickers)
        news_lines.append(
            f"  [{item.tier == 1 and 'T1' or 'T2'}] [{tickers}] {item.headline} — {item.source}"
        )
    news_block = "\n".join(news_lines) or "  (no news available)"

    sentiment_lines = []
    for sym, score in ctx.sentiment.items():
        sentiment_lines.append(
            f"  ${sym}: {score.bullish_pct:.0f}% bull / {score.bearish_pct:.0f}% bear "
            f"(trend: {score.trend}, n={score.post_volume})"
        )
    sentiment_block = "\n".join(sentiment_lines) or "  (no sentiment data)"

    return SYSTEM_TEMPLATE.format(
        generated_at=ctx.generated_at,
        prices=prices,
        news=news_block,
        sentiment=sentiment_block,
    )


async def chat(request: ChatRequest) -> ChatResponse:
    """Send messages to Claude with dashboard context injected."""
    client = anthropic.AsyncAnthropic(api_key=request.api_key)
    system_prompt = _build_context_block(request.context)

    messages = [
        {"role": msg.role.value, "content": msg.content}
        for msg in request.messages
        if msg.role.value in ("user", "assistant")
    ]

    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",  # fast + cheap for chat; user can upgrade
        max_tokens=1024,
        system=system_prompt,
        messages=messages,
    )

    reply_text = response.content[0].text

    # Extract cited headlines (simple: scan for headlines mentioned in reply)
    cited = [
        item.headline
        for item in request.context.top_news
        if item.headline[:40].lower() in reply_text.lower()
    ]

    return ChatResponse(reply=reply_text, cited_headlines=cited or None)
