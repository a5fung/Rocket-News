'use client';

import { useEffect, useState } from 'react';
import { fetchSentimentAll } from '@/lib/api';
import type { SentimentDataPoint, SentimentPost, SentimentScore } from '@/types';

export function useSentiment(symbol: string | null) {
  const [score, setScore] = useState<SentimentScore | null>(null);
  const [history, setHistory] = useState<SentimentDataPoint[]>([]);
  const [posts, setPosts] = useState<SentimentPost[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);

    // Single combined request — 1 round trip instead of 3
    fetchSentimentAll(symbol, 7, 20).then((result) => {
      setLoading(false);
      if (!result.error) {
        setScore(result.data.score);
        setHistory(result.data.history);
        setPosts(result.data.posts);
      }
    });
  }, [symbol]);

  return { score, history, posts, loading };
}
