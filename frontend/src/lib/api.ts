import type {
  ApiResult,
  CandlePoint,
  ChatMessage,
  DashboardContext,
  EarningsEvent,
  MoveTag,
  NewsItem,
  SentimentBundle,
  SentimentDataPoint,
  SentimentPost,
  SentimentScore,
  Ticker,
} from '@/types';
import { getApiKey } from './storage';

const BASE = '/api'; // proxied to FastAPI via next.config.ts

async function request<T>(path: string, options?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }));
      return { data: null, error: { detail: body.detail ?? 'Request failed', status: res.status } };
    }
    const data = (await res.json()) as T;
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: { detail: err instanceof Error ? err.message : 'Network error', status: 0 },
    };
  }
}

// ─── Market ───────────────────────────────────────────────────────────────────

export async function fetchQuotes(symbols: string[]): Promise<ApiResult<Ticker[]>> {
  return request<Ticker[]>(`/market/quotes?symbols=${symbols.join(',')}`);
}

export async function fetchQuote(symbol: string): Promise<ApiResult<Ticker>> {
  return request<Ticker>(`/market/quote/${symbol}`);
}

export async function fetchEarnings(symbols: string[]): Promise<ApiResult<EarningsEvent[]>> {
  return request<EarningsEvent[]>(`/market/earnings?symbols=${symbols.join(',')}`);
}

export async function fetchCandles(symbols: string[]): Promise<ApiResult<Record<string, CandlePoint[]>>> {
  return request<Record<string, CandlePoint[]>>(`/market/candles?symbols=${symbols.join(',')}`);
}

export async function fetchMoveTags(
  movers: Array<{ symbol: string; changePercent: number }>,
): Promise<ApiResult<MoveTag[]>> {
  const symbols = movers.map((m) => m.symbol).join(',');
  const changes = movers.map((m) => m.changePercent.toFixed(2)).join(',');
  return request<MoveTag[]>(`/market/explain?symbols=${symbols}&changes=${changes}`);
}

// ─── News ─────────────────────────────────────────────────────────────────────

export async function fetchNews(symbols: string[], limit = 20): Promise<ApiResult<NewsItem[]>> {
  return request<NewsItem[]>(`/news/watchlist?symbols=${symbols.join(',')}&limit=${limit}`);
}

export async function fetchTickerNews(symbol: string, limit = 10): Promise<ApiResult<NewsItem[]>> {
  return request<NewsItem[]>(`/news/${symbol}?limit=${limit}`);
}

// ─── Sentiment ────────────────────────────────────────────────────────────────

/** Single combined request — score + history + posts in one round trip. */
export async function fetchSentimentAll(
  symbol: string,
  days = 7,
  limit = 20,
): Promise<ApiResult<SentimentBundle>> {
  return request<SentimentBundle>(`/sentiment/${symbol}/all?days=${days}&limit=${limit}`);
}

// Individual endpoints kept for direct use if needed
export async function fetchSentiment(symbol: string): Promise<ApiResult<SentimentScore>> {
  return request<SentimentScore>(`/sentiment/${symbol}`);
}

export async function fetchSentimentHistory(
  symbol: string,
  days = 7,
): Promise<ApiResult<SentimentDataPoint[]>> {
  return request<SentimentDataPoint[]>(`/sentiment/${symbol}/history?days=${days}`);
}

export async function fetchSentimentPosts(
  symbol: string,
  limit = 20,
): Promise<ApiResult<SentimentPost[]>> {
  return request<SentimentPost[]>(`/sentiment/${symbol}/posts?limit=${limit}`);
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export async function fetchAlertStatus(): Promise<ApiResult<{
  configured: boolean;
  symbols: string[];
  priceThresholdPct: number;
}>> {
  return request('/alerts/status');
}

export async function syncAlertWatchlist(symbols: string[]): Promise<void> {
  await request('/alerts/watchlist', {
    method: 'POST',
    body: JSON.stringify({ symbols }),
  });
}

export async function sendTestAlert(): Promise<ApiResult<{ ok: boolean; error: string | null }>> {
  return request('/alerts/test', { method: 'POST' });
}

// ─── AI Chat ──────────────────────────────────────────────────────────────────

export async function sendChatMessage(
  messages: ChatMessage[],
  context: DashboardContext,
): Promise<ApiResult<{ reply: string; citedHeadlines?: string[] }>> {
  const apiKey = getApiKey();
  return request(`/chat`, {
    method: 'POST',
    body: JSON.stringify({ messages, context, apiKey }),
  });
}
