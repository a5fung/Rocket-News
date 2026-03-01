"""
Chat service — Gemini-powered, context-aware trading assistant.

Uses the Gemini REST API directly (httpx) — no extra SDK dependency.
Model is discovered dynamically via ListModels so we never hard-code names
that may not exist for a given project/region.
"""

import time

import httpx

from app.models.schemas import ChatMessage, ChatRequest, ChatResponse

GEMINI_API = "https://generativelanguage.googleapis.com"

# Preferred model substrings, in priority order
_PREFERRED = ["gemini-2.0-flash", "gemini-2.0", "gemini-1.5-flash", "gemini-1.5", "gemini"]

# Cache: api_key_prefix → (expires_at, (model_id, version))
_model_cache: dict[str, tuple[float, tuple[str, str]]] = {}
_MODEL_CACHE_TTL = 3600  # re-discover after 1 hour


async def _discover_model(api_key: str, client: httpx.AsyncClient) -> tuple[str, str]:
    """
    Call ListModels on v1beta then v1 to find the best generateContent model
    available for this API key. Returns (model_id, api_version).
    """
    cache_key = api_key[:12]
    cached = _model_cache.get(cache_key)
    if cached and time.monotonic() < cached[0]:
        return cached[1]

    candidates: list[tuple[str, str]] = []  # (model_id, version)

    for version in ("v1beta", "v1"):
        resp = await client.get(
            f"{GEMINI_API}/{version}/models",
            params={"key": api_key, "pageSize": 100},
            timeout=10,
        )
        if resp.status_code != 200:
            continue
        for m in resp.json().get("models", []):
            if "generateContent" not in m.get("supportedGenerationMethods", []):
                continue
            model_id = m["name"].removeprefix("models/")
            candidates.append((model_id, version))

    if not candidates:
        raise ValueError(
            "No generateContent models found for this API key. "
            "Make sure the key is from Google AI Studio (aistudio.google.com) "
            "and the Generative Language API is enabled for your project."
        )

    # Pick highest-priority candidate
    def priority(item: tuple[str, str]) -> int:
        model_id = item[0]
        for i, pref in enumerate(_PREFERRED):
            if pref in model_id:
                return i
        return len(_PREFERRED)

    best = min(candidates, key=priority)
    _model_cache[cache_key] = (time.monotonic() + _MODEL_CACHE_TTL, best)
    return best


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


def _build_system_prompt(request: ChatRequest) -> str:
    ctx = request.context

    prices = "\n".join(
        f"  {t.symbol} ({t.name}): ${t.price:.2f}  {t.change_percent:+.2f}%"
        for t in ctx.watchlist
    ) or "  (no tickers in watchlist)"

    news_lines = []
    for item in ctx.top_news[:15]:
        tickers = ", ".join(f"${t}" for t in item.tickers)
        news_lines.append(
            f"  [{'T1' if item.tier == 1 else 'T2'}] [{tickers}] {item.headline} — {item.source}"
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


def _to_gemini_contents(messages: list[ChatMessage]) -> list[dict]:
    """Convert our message format to Gemini's contents array.
    Gemini uses 'model' for assistant turns (not 'assistant').
    """
    contents = []
    for msg in messages:
        role = "user" if msg.role.value == "user" else "model"
        contents.append({"role": role, "parts": [{"text": msg.content}]})
    return contents


async def chat(request: ChatRequest) -> ChatResponse:
    """Send messages to Gemini with dashboard context injected."""
    system_prompt = _build_system_prompt(request)
    contents = _to_gemini_contents(request.messages)

    # System context injected as first turn — compatible with all API versions.
    system_turn = [
        {"role": "user",  "parts": [{"text": f"[SYSTEM CONTEXT]\n{system_prompt}"}]},
        {"role": "model", "parts": [{"text": "Understood. I'm your Rocket News trading assistant with access to the live dashboard data above."}]},
    ]

    payload = {
        "contents": system_turn + contents,
        "generationConfig": {"maxOutputTokens": 1024, "temperature": 0.4},
    }

    async with httpx.AsyncClient() as client:
        model_id, version = await _discover_model(request.api_key, client)

        resp = await client.post(
            f"{GEMINI_API}/{version}/models/{model_id}:generateContent",
            params={"key": request.api_key},
            json=payload,
            timeout=30,
        )

    if resp.status_code != 200:
        # Clear cached model so next request re-discovers
        _model_cache.pop(request.api_key[:12], None)
        error_msg = resp.json().get("error", {}).get("message", resp.text[:200])
        raise ValueError(f"Gemini API error {resp.status_code}: {error_msg}")

    reply_text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]

    cited = [
        item.headline
        for item in request.context.top_news
        if item.headline[:40].lower() in reply_text.lower()
    ]

    return ChatResponse(reply=reply_text, cited_headlines=cited or None)
