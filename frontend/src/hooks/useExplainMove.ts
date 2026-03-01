'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchMoveTags } from '@/lib/api';
import type { Ticker } from '@/types';

const MOVE_THRESHOLD = 3.0;   // % — only tag stocks moving ±3%+
const POLL_MS = 5 * 60 * 1000; // re-check every 5 min (backend cache is 30 min)

export function useExplainMove(tickers: Ticker[]) {
  const [moveTags, setMoveTags] = useState<Map<string, string>>(new Map());

  const movers = useMemo(
    () => tickers.filter((t) => Math.abs(t.changePercent) >= MOVE_THRESHOLD),
    [tickers],
  );

  // Stable string key — effect re-runs only when mover set or their moves change
  const moverKey = useMemo(
    () => movers.map((t) => `${t.symbol}:${t.changePercent.toFixed(1)}`).join(','),
    [movers],
  );

  useEffect(() => {
    if (movers.length === 0) {
      setMoveTags(new Map());
      return;
    }

    const run = async () => {
      const result = await fetchMoveTags(
        movers.map((t) => ({ symbol: t.symbol, changePercent: t.changePercent })),
      );
      if (!result.error) {
        setMoveTags(new Map(result.data.map((t) => [t.symbol, t.tag])));
      }
    };

    void run();
    const id = setInterval(() => void run(), POLL_MS);
    return () => clearInterval(id);
  }, [moverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return { moveTags };
}
