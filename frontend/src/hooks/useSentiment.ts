'use client';

import { useEffect, useState } from 'react';
import { fetchDailyCandles, fetchSentimentAll } from '@/lib/api';
import type { CandlePoint, SentimentDataPoint, SentimentPost, SentimentScore } from '@/types';

export function useSentiment(symbol: string | null) {
  const [score, setScore] = useState<SentimentScore | null>(null);
  const [history, setHistory] = useState<SentimentDataPoint[]>([]);
  const [posts, setPosts] = useState<SentimentPost[]>([]);
  const [priceHistory, setPriceHistory] = useState<CandlePoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);

    Promise.all([
      fetchSentimentAll(symbol, 7, 20),
      fetchDailyCandles(symbol),
    ]).then(([sentResult, priceResult]) => {
      setLoading(false);
      if (!sentResult.error) {
        setScore(sentResult.data.score);
        setHistory(sentResult.data.history);
        setPosts(sentResult.data.posts);
      }
      if (!priceResult.error) {
        setPriceHistory(priceResult.data);
      }
    });
  }, [symbol]);

  return { score, history, posts, priceHistory, loading };
}
