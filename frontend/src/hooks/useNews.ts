'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchNews, fetchTickerNews } from '@/lib/api';
import { getCached, setCached } from '@/lib/cache';
import type { NewsItem } from '@/types';

export function useNews(symbols: string[], limit = 20) {
  const symbolsKey = symbols.join(',');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refetchRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (symbols.length === 0) {
      setNews([]);
      setLoading(false);
      return;
    }

    // Show stale news immediately while fetching fresh
    const cached = getCached<NewsItem[]>('news', symbols);
    if (cached) setNews(cached.data);

    let cancelled = false;

    const doFetch = async () => {
      if (!cached) setLoading(true);
      const result = await fetchNews(symbols, limit);
      if (cancelled) return;
      setLoading(false);
      if (result.error) {
        setError(result.error.detail);
      } else {
        setNews(result.data);
        setError(null);
        setCached('news', symbols, result.data);
      }
    };

    refetchRef.current = doFetch;
    void doFetch();
    const interval = setInterval(doFetch, 60_000); // refresh every 60s
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey, limit]);

  const refetch = useCallback(() => void refetchRef.current(), []);
  return { news, loading, error, refetch };
}

export function useTickerNews(symbol: string | null, limit = 10) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);
    fetchTickerNews(symbol, limit).then((result) => {
      setLoading(false);
      if (!result.error) setNews(result.data);
    });
  }, [symbol, limit]);

  return { news, loading };
}
