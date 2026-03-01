'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCandles, fetchEarnings, fetchQuotes } from '@/lib/api';
import { getCached, setCached } from '@/lib/cache';
import type { CandlePoint, EarningsEvent, Ticker } from '@/types';

const POLL_INTERVAL_MS = 30_000; // 30s — halved from 15s to reduce API load

export function useMarketData(symbols: string[]) {
  const symbolsKey = symbols.join(',');
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refetchRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (symbols.length === 0) {
      setTickers([]);
      setLoading(false);
      return;
    }

    // Seed from cache immediately — user sees data before the first fetch completes
    const cached = getCached<Ticker[]>('tickers', symbols);
    if (cached) {
      setTickers(cached.data);
      setLastUpdated(cached.savedAt);
    }

    let cancelled = false;

    const doFetch = async () => {
      if (!cached) setLoading(true);
      const result = await fetchQuotes(symbols);
      if (cancelled) return;
      setLoading(false);
      if (result.error) {
        setError(result.error.detail);
      } else {
        setTickers(result.data);
        setError(null);
        setLastUpdated(setCached('tickers', symbols, result.data));
      }
    };

    refetchRef.current = doFetch;
    void doFetch();
    const interval = setInterval(doFetch, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  const refetch = useCallback(() => void refetchRef.current(), []);
  return { tickers, loading, error, refetch, lastUpdated };
}

const EARNINGS_POLL_MS = 60 * 60 * 1000; // 1 hour — earnings dates change slowly

export function useEarningsCalendar(symbols: string[]) {
  const symbolsKey = symbols.join(',');
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (symbols.length === 0) {
      setEarnings([]);
      return;
    }

    const cached = getCached<EarningsEvent[]>('earnings', symbols);
    if (cached) setEarnings(cached.data);

    let cancelled = false;

    const doFetch = async () => {
      if (!cached) setLoading(true);
      const result = await fetchEarnings(symbols);
      if (cancelled) return;
      setLoading(false);
      if (!result.error) {
        setEarnings(result.data);
        setCached('earnings', symbols, result.data);
      }
    };

    void doFetch();
    const interval = setInterval(doFetch, EARNINGS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  return { earnings, loading };
}

const SPARKLINE_POLL_MS = 5 * 60 * 1000; // 5 minutes — matches Finnhub candle resolution

export function useSparklines(symbols: string[]) {
  const symbolsKey = symbols.join(',');
  const [sparklines, setSparklines] = useState<Record<string, CandlePoint[]>>({});

  useEffect(() => {
    if (symbols.length === 0) return;

    let cancelled = false;

    const doFetch = async () => {
      const result = await fetchCandles(symbols);
      if (!cancelled && !result.error) setSparklines(result.data);
    };

    void doFetch();
    const interval = setInterval(doFetch, SPARKLINE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  return { sparklines };
}
