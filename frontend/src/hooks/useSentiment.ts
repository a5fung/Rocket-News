'use client';

import { useEffect, useState } from 'react';
import { fetchSentiment, fetchSentimentHistory, fetchSentimentPosts } from '@/lib/api';
import type { SentimentDataPoint, SentimentPost, SentimentScore } from '@/types';

export function useSentiment(symbol: string | null) {
  const [score, setScore] = useState<SentimentScore | null>(null);
  const [history, setHistory] = useState<SentimentDataPoint[]>([]);
  const [posts, setPosts] = useState<SentimentPost[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    setLoading(true);

    Promise.all([
      fetchSentiment(symbol),
      fetchSentimentHistory(symbol, 7),
      fetchSentimentPosts(symbol, 20),
    ]).then(([scoreRes, histRes, postsRes]) => {
      setLoading(false);
      if (!scoreRes.error) setScore(scoreRes.data);
      if (!histRes.error) setHistory(histRes.data);
      if (!postsRes.error) setPosts(postsRes.data);
    });
  }, [symbol]);

  return { score, history, posts, loading };
}
