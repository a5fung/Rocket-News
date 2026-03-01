/**
 * Lightweight SWR-style localStorage cache.
 *
 * Usage:
 *   const cached = getCached<Ticker[]>('tickers', symbols);
 *   if (cached) { setData(cached.data); setLastUpdated(cached.savedAt); }
 *   // ... fetch fresh ...
 *   setCached('tickers', symbols, freshData);
 */

const VERSION = 'v1';

interface CacheEntry<T> {
  data: T;
  /** Sorted, joined symbol list — used to invalidate on watchlist change */
  symbolsKey: string;
  savedAt: number; // Date.now()
}

function storageKey(name: string) {
  return `rn_cache_${VERSION}_${name}`;
}

export function getCached<T>(name: string, symbols: string[]): CacheEntry<T> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(name));
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    // Invalidate if the watchlist changed
    const key = [...symbols].sort().join(',');
    if (entry.symbolsKey !== key) return null;
    return entry;
  } catch {
    return null;
  }
}

export function setCached<T>(name: string, symbols: string[], data: T): number {
  const savedAt = Date.now();
  if (typeof window === 'undefined') return savedAt;
  try {
    const entry: CacheEntry<T> = {
      data,
      symbolsKey: [...symbols].sort().join(','),
      savedAt,
    };
    localStorage.setItem(storageKey(name), JSON.stringify(entry));
  } catch {
    // Ignore QuotaExceededError — cache is best-effort
  }
  return savedAt;
}

/** Human-readable age label, e.g. "just now", "3m ago", "2h ago". */
export function formatAge(savedAt: number): string {
  const s = Math.floor((Date.now() - savedAt) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
