'use client';

import { useCallback, useState } from 'react';
import {
  clearPosition as storageClear,
  getPortfolio,
  setPosition as storageSet,
} from '@/lib/storage';
import type { PortfolioPosition } from '@/types';

export function usePortfolio() {
  const [positions, setPositions] = useState<Record<string, PortfolioPosition>>(
    () => getPortfolio(),
  );

  const setPosition = useCallback((symbol: string, pos: PortfolioPosition) => {
    storageSet(symbol, pos);
    setPositions(getPortfolio());
  }, []);

  const clearPosition = useCallback((symbol: string) => {
    storageClear(symbol);
    setPositions(getPortfolio());
  }, []);

  return { positions, setPosition, clearPosition };
}
