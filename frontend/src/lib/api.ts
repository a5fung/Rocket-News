import type {
  ApiResult,
  ChatMessage,
  DashboardContext,
  NewsItem,
  SentimentDataPoint,
  SentimentPost,
  SentimentScore,
  Ticker,
} from '@/types';
import { getApiKey, getApiProvider } from './storage';

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

// ─── News ─────────────────────────────────────────────────────────────────────

export async function fetchNews(symbols: string[], limit = 20): Promise<ApiResult<NewsItem[]>> {
  return request<NewsItem[]>(`/news/watchlist?symbols=${symbols.join(',')}&limit=${limit}`);
}

export async function fetchTickerNews(symbol: string, limit = 10): Promise<ApiResult<NewsItem[]>> {
  return request<NewsItem[]>(`/news/${symbol}?limit=${limit}`);
}

// ─── Sentiment ────────────────────────────────────────────────────────────────

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

// ─── AI Chat ──────────────────────────────────────────────────────────────────

export async function sendChatMessage(
  messages: ChatMessage[],
  context: DashboardContext,
): Promise<ApiResult<{ reply: string; citedHeadlines?: string[] }>> {
  const apiKey = getApiKey();
  const provider = getApiProvider();

  return request(`/chat`, {
    method: 'POST',
    body: JSON.stringify({ messages, context, apiKey, provider }),
  });
}
