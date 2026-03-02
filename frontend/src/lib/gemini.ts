'use client';

/**
 * Gemini API client — called directly from the browser.
 *
 * Bypasses the Next.js / Vercel proxy entirely so there is no 10-second
 * serverless timeout. The user's API key is already stored client-side, so
 * there is no additional security exposure vs the previous backend-proxy path.
 *
 * Replicates the logic previously in backend/app/services/chat_service.py.
 */

import type { ChatMessage, DashboardContext } from '@/types';

const GEMINI_API = 'https://generativelanguage.googleapis.com';

// Preferred model substrings, in priority order (mirrors backend)
const PREFERRED = ['gemini-2.0-flash', 'gemini-2.0', 'gemini-1.5-flash', 'gemini-1.5', 'gemini'];

// In-memory model cache — avoids repeated ListModels calls
const _modelCache = new Map<string, { expires: number; models: Array<[string, string]> }>();

async function listModels(apiKey: string): Promise<Array<[string, string]>> {
  const cacheKey = apiKey.slice(0, 12);
  const cached = _modelCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) return cached.models;

  const candidates: Array<[string, string]> = [];

  for (const version of ['v1beta', 'v1']) {
    try {
      const resp = await fetch(
        `${GEMINI_API}/${version}/models?key=${encodeURIComponent(apiKey)}&pageSize=100`,
      );
      if (!resp.ok) continue;
      const data = await resp.json() as {
        models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
      };
      for (const m of data.models ?? []) {
        if (!(m.supportedGenerationMethods ?? []).includes('generateContent')) continue;
        const modelId = m.name.replace('models/', '');
        if (!candidates.some(([mid]) => mid === modelId)) candidates.push([modelId, version]);
      }
    } catch {
      // network error — skip this API version
    }
  }

  if (!candidates.length) {
    throw new Error(
      'No Gemini models found. Make sure your key is from Google AI Studio (aistudio.google.com) ' +
      'and the Generative Language API is enabled for your project.',
    );
  }

  candidates.sort(([a], [b]) => {
    const rank = (id: string) => {
      const i = PREFERRED.findIndex((p) => id.includes(p));
      return i === -1 ? PREFERRED.length : i;
    };
    return rank(a) - rank(b);
  });

  _modelCache.set(cacheKey, { expires: Date.now() + 3_600_000, models: candidates });
  return candidates;
}

function buildSystemPrompt(context: DashboardContext): string {
  const prices = context.watchlist.length
    ? context.watchlist
        .map(
          (t) =>
            `  ${t.symbol} (${t.name}): $${t.price.toFixed(2)}  ${t.changePercent >= 0 ? '+' : ''}${t.changePercent.toFixed(2)}%`,
        )
        .join('\n')
    : '  (no tickers in watchlist)';

  const newsLines = context.topNews.slice(0, 15).map((item) => {
    const tickers = item.tickers.map((t) => `$${t}`).join(', ');
    return `  [${item.tier === 1 ? 'T1' : 'T2'}] [${tickers}] ${item.headline} — ${item.source}`;
  });
  const news = newsLines.length ? newsLines.join('\n') : '  (no news available)';

  const sentimentLines = Object.entries(context.sentiment).map(
    ([sym, score]) => {
      const base =
        `  $${sym}: ${score.bullishPct.toFixed(0)}% bull / ${score.bearishPct.toFixed(0)}% bear ` +
        `(trend: ${score.trend}, n=${score.postVolume})`;
      const extras: string[] = [];
      if (score.themes?.length) extras.push(`themes: ${score.themes.join(' ')}`);
      if (score.newsSentiment != null) extras.push(`newsSentiment: ${score.newsSentiment.toFixed(2)}`);
      if (score.whisper) extras.push(`whisper: "${score.whisper}"`);
      return extras.length ? `${base} — ${extras.join(', ')}` : base;
    },
  );
  const sentiment = sentimentLines.length ? sentimentLines.join('\n') : '  (no sentiment data)';

  // Earnings calendar section
  const earningsLines = (context.earnings ?? []).map((e) => {
    const timing = e.hour === 'amc' ? 'after-hours' : e.hour === 'bmo' ? 'before-market' : '';
    const eps = e.epsEstimate != null ? ` · est. EPS $${e.epsEstimate.toFixed(2)}` : '';
    return `  ${e.symbol} — ${e.fiscalQuarter} · ${e.reportDate}${timing ? ` (${timing})` : ''}${eps}`;
  });
  const earningsSection = earningsLines.length
    ? ['', 'UPCOMING EARNINGS:', ...earningsLines]
    : [];

  // Portfolio positions section
  const portfolioEntries = Object.entries(context.portfolio ?? {});
  const portfolioLines = portfolioEntries.flatMap(([sym, pos]) => {
    const ticker = context.watchlist.find((t) => t.symbol === sym);
    if (!ticker) return [];
    const currentValue = ticker.price * pos.shares;
    const costValue = pos.costBasis * pos.shares;
    const pnl = currentValue - costValue;
    const pnlPct = costValue > 0 ? (pnl / costValue) * 100 : 0;
    return [
      `  ${sym} — ${pos.shares} shares @ $${pos.costBasis.toFixed(2)} cost · ` +
      `current $${ticker.price.toFixed(2)} · P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(0)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`,
    ];
  });
  const portfolioSection = portfolioLines.length
    ? ['', 'PORTFOLIO POSITIONS:', ...portfolioLines]
    : [];

  // Move attribution section
  const moveLines = (context.moveTags ?? []).map((m) =>
    `  ${m.symbol} ${m.changePercent >= 0 ? '+' : ''}${m.changePercent.toFixed(1)}% — ${m.tag}`,
  );
  const moveSection = moveLines.length
    ? ['', "TODAY'S MOVE ATTRIBUTION:", ...moveLines]
    : [];

  return [
    'You are a professional trading assistant embedded in a live stock dashboard called Rocket News.',
    'The user is viewing their watchlist in real time. Answer questions concisely and specifically,',
    'citing the data below when relevant. Do not speculate beyond what the data shows.',
    '',
    '─── LIVE DASHBOARD CONTEXT ─────────────────────────────────────────────────────',
    `Generated at: ${context.generatedAt}`,
    '',
    'WATCHLIST PRICES:',
    prices,
    '',
    'TOP NEWS (last 24h, airlock-filtered):',
    news,
    '',
    'SENTIMENT SCORES:',
    sentiment,
    ...earningsSection,
    ...portfolioSection,
    ...moveSection,
    '────────────────────────────────────────────────────────────────────────────────',
    '',
    'Rules:',
    '- Be direct and concise (3-5 sentences unless a longer answer is clearly needed)',
    '- Cite specific headlines or prices when making claims',
    '- Flag uncertainty — say "the data doesn\'t show" rather than guessing',
    '- Do not recommend specific trades or give investment advice',
  ].join('\n');
}

function toContents(
  messages: ChatMessage[],
): Array<{ role: string; parts: Array<{ text: string }> }> {
  return messages.map((msg) => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }],
  }));
}

export async function geminiChat(
  messages: ChatMessage[],
  context: DashboardContext,
  apiKey: string,
): Promise<{ reply: string; citedHeadlines?: string[] }> {
  const systemPrompt = buildSystemPrompt(context);

  const systemTurn = [
    { role: 'user', parts: [{ text: `[SYSTEM CONTEXT]\n${systemPrompt}` }] },
    {
      role: 'model',
      parts: [
        {
          text: "Understood. I'm your Rocket News trading assistant with access to the live dashboard data above.",
        },
      ],
    },
  ];

  const payload = {
    contents: [...systemTurn, ...toContents(messages)],
    generationConfig: { maxOutputTokens: 1024, temperature: 0.4 },
  };

  const models = await listModels(apiKey);
  let lastError = 'No Gemini models available for this API key';

  for (const [modelId, version] of models) {
    const resp = await fetch(
      `${GEMINI_API}/${version}/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );

    if (resp.ok) {
      const data = await resp.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      const cited = context.topNews
        .filter((item) => replyText.toLowerCase().includes(item.headline.slice(0, 40).toLowerCase()))
        .map((item) => item.headline);

      return { reply: replyText, citedHeadlines: cited.length ? cited : undefined };
    }

    const errData = await resp.json().catch(() => ({})) as { error?: { message?: string } };
    lastError = `Gemini API error ${resp.status}: ${errData.error?.message ?? resp.statusText}`;

    // Retry on quota / not-found / overload; bail on auth errors
    if (![404, 429, 503].includes(resp.status)) throw new Error(lastError);
  }

  throw new Error(lastError);
}
