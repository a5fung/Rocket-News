'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchEarnings, fetchQuotes } from '@/lib/api';
import type { EarningsEvent, Ticker } from '@/types';

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

const EARNINGS_POLL_MS = 60 * 60 * 1000; // 1 hour — earnings dates change slowly

export function useEarningsCalendar(symbols: string[]) {
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetch_ = useCallback(async () => {
    if (symbols.length === 0) {
      setEarnings([]);
      return;
    }
    setLoading(true);
    const result = await fetchEarnings(symbols);
    setLoading(false);
    if (!result.error) {
      setEarnings(result.data);
    }
  }, [symbols]);

  useEffect(() => {
    void fetch_();
    intervalRef.current = setInterval(() => void fetch_(), EARNINGS_POLL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetch_]);

  return { earnings, loading };
}
