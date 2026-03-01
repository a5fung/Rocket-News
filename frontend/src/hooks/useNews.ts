'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchNews, fetchTickerNews } from '@/lib/api';
import type { NewsItem } from '@/types';

export function useNews(symbols: string[], limit = 20) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (symbols.length === 0) {
      setNews([]);
      return;
    }
    setLoading(true);
    const result = await fetchNews(symbols, limit);
    setLoading(false);
    if (result.error) {
      setError(result.error.detail);
    } else {
      setNews(result.data);
      setError(null);
    }
  }, [symbols, limit]);

  useEffect(() => {
    void fetch_();
    const interval = setInterval(() => void fetch_(), 60_000); // refresh every 60s
    return () => clearInterval(interval);
  }, [fetch_]);

  return { news, loading, error, refetch: fetch_ };
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
