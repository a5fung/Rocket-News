// ─── Market ───────────────────────────────────────────────────────────────────

export interface MoveTag {
  symbol: string;
  tag: string;           // e.g. "Earnings Beat", "Contract Award"
  changePercent: number; // % at time of generation
}

export interface CandlePoint {
  t: number; // unix timestamp (seconds)
  c: number; // close price
}

export interface EarningsEvent {
  symbol: string;
  reportDate: string;       // "YYYY-MM-DD"
  fiscalQuarter: string;    // "Q1 2026"
  hour?: string;            // "amc" | "bmo" | "dmh"
  epsEstimate?: number;
}

export interface Ticker {
  symbol: string;
  name: string;
  price: number;
  change: number;       // absolute $
  changePercent: number; // percentage
  volume?: number;
  marketCap?: number;
  sentiment?: SentimentScore;
  logoUrl?: string;
}

// ─── News ─────────────────────────────────────────────────────────────────────

export type NewsTier = 1 | 2;

export type CatalystTag =
  | 'Earnings'
  | 'Regulatory'
  | 'Analyst'
  | 'Macro'
  | 'Insider'
  | 'Contract'
  | 'Product'
  | 'Other';

export interface NewsItem {
  id: string;
  tickers: string[];
  headline: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string; // ISO 8601
  tier: NewsTier;
  catalyst?: CatalystTag;
  sentimentScore?: number; // -1 (bearish) to 1 (bullish), from airlock
  relevanceScore?: number; // 1-10, from airlock
}

// ─── Sentiment ────────────────────────────────────────────────────────────────

export type SentimentTrend = 'rising' | 'falling' | 'neutral';
export type SentimentSource = 'reddit' | 'x' | 'stocktwits';

export interface SentimentScore {
  score: number;              // -1 to 1 aggregate
  bullishPct: number;         // 0-100
  bearishPct: number;         // 0-100
  trend: SentimentTrend;
  postVolume: number;         // number of posts scored in window
  windowHours: number;        // e.g. 24
  themes: string[];           // LLM-extracted trending catalysts e.g. ["#EarningsBeat"]
  newsSentiment?: number;     // avg airlock score of recent news articles (-1..1)
  whisper?: string;           // crowd expectation when earnings within 7 days
}

export interface SentimentDataPoint {
  timestamp: string; // ISO 8601
  score: number;     // -1 to 1
  volume: number;    // post count in period
}

export interface SentimentPost {
  id: string;
  ticker: string;
  content: string;
  source: SentimentSource;
  author: string;
  engagement: number; // upvotes/likes + comments
  sentimentScore: number;
  relevanceScore: number;
  catalyst?: CatalystTag;
  publishedAt: string;
  url: string;
}

export interface SentimentBundle {
  score: SentimentScore;
  history: SentimentDataPoint[];
  posts: SentimentPost[];
}

// ─── AI Chat ──────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citedHeadlines?: string[]; // headlines the AI referenced
}

export interface DashboardContext {
  watchlist: Ticker[];
  topNews: NewsItem[];          // top 3 per ticker
  sentiment: Record<string, SentimentScore>; // keyed by symbol
  earnings: EarningsEvent[];                 // upcoming events within 7 days
  portfolio: Record<string, PortfolioPosition>; // keyed by symbol
  moveTags: MoveTag[];                       // LLM attribution for ±3% movers
  generatedAt: string;          // ISO 8601
}

// ─── Portfolio ────────────────────────────────────────────────────────────────

export interface PortfolioPosition {
  shares: number;    // number of shares held
  costBasis: number; // average cost per share ($)
}

// ─── Watchlist ────────────────────────────────────────────────────────────────

export interface WatchlistEntry {
  symbol: string;
  addedAt: string; // ISO 8601
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiError {
  detail: string;
  status: number;
}

export type ApiResult<T> = { data: T; error: null } | { data: null; error: ApiError };
