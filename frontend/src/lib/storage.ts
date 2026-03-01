import type { PortfolioPosition, WatchlistEntry } from '@/types';

const KEYS = {
  watchlist: 'rn_watchlist',
  apiKey: 'rn_api_key',
  portfolio: 'rn_portfolio',
} as const;

function safeGet<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

// ─── Watchlist ────────────────────────────────────────────────────────────────

export function getWatchlist(): WatchlistEntry[] {
  return safeGet<WatchlistEntry[]>(KEYS.watchlist, []);
}

export function getWatchlistSymbols(): string[] {
  return getWatchlist().map((e) => e.symbol);
}

export function addToWatchlist(symbol: string): void {
  const list = getWatchlist();
  if (list.some((e) => e.symbol === symbol.toUpperCase())) return;
  list.push({ symbol: symbol.toUpperCase(), addedAt: new Date().toISOString() });
  safeSet(KEYS.watchlist, list);
}

export function removeFromWatchlist(symbol: string): void {
  const list = getWatchlist().filter((e) => e.symbol !== symbol.toUpperCase());
  safeSet(KEYS.watchlist, list);
}

// ─── Portfolio positions ───────────────────────────────────────────────────────

export function getPortfolio(): Record<string, PortfolioPosition> {
  return safeGet<Record<string, PortfolioPosition>>(KEYS.portfolio, {});
}

export function setPosition(symbol: string, pos: PortfolioPosition): void {
  const portfolio = getPortfolio();
  portfolio[symbol.toUpperCase()] = pos;
  safeSet(KEYS.portfolio, portfolio);
}

export function clearPosition(symbol: string): void {
  const portfolio = getPortfolio();
  delete portfolio[symbol.toUpperCase()];
  safeSet(KEYS.portfolio, portfolio);
}

// ─── Gemini API Key (stored in browser only, never sent to our servers at rest) ──

export function getApiKey(): string {
  return safeGet<string>(KEYS.apiKey, '');
}

export function setApiKey(key: string): void {
  safeSet(KEYS.apiKey, key);
}
