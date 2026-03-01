'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchQuotes } from '@/lib/api';
import type { Ticker } from '@/types';

const POLL_INTERVAL_MS = 15_000; // 15s polling — upgrade to WS when Polygon.io is wired up

export function useMarketData(symbols: string[]) {
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    if (symbols.length === 0) {
      setTickers([]);
      return;
    }
    setLoading(true);
    const result = await fetchQuotes(symbols);
    setLoading(false);
    if (result.error) {
      setError(result.error.detail);
    } else {
      setTickers(result.data);
      setError(null);
    }
  }, [symbols]);

  useEffect(() => {
    void fetch_();
    intervalRef.current = setInterval(() => void fetch_(), POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetch_]);

  return { tickers, loading, error, refetch: fetch_ };
}
