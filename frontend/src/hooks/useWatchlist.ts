'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  addToWatchlist,
  getWatchlistSymbols,
  removeFromWatchlist,
} from '@/lib/storage';

export function useWatchlist() {
  const [symbols, setSymbols] = useState<string[]>([]);
  // false until localStorage has been read — prevents EmptyState flash on refresh
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setSymbols(getWatchlistSymbols());
    setIsLoaded(true);
  }, []);

  const add = useCallback((symbol: string) => {
    addToWatchlist(symbol);
    setSymbols(getWatchlistSymbols());
  }, []);

  const remove = useCallback((symbol: string) => {
    removeFromWatchlist(symbol);
    setSymbols(getWatchlistSymbols());
  }, []);

  return { symbols, isLoaded, add, remove };
}
