'use client';

import { useEffect, useState } from 'react';
import { fetchShortInterest } from '@/lib/api';
import type { ShortInterest } from '@/types';

export function useShortInterest(symbols: string[]) {
  const [data, setData] = useState<Record<string, ShortInterest>>({});

  const key = symbols.slice().sort().join(',');

  useEffect(() => {
    if (!symbols.length) return;
    fetchShortInterest(symbols).then((res) => {
      if (!res.error) {
        const map: Record<string, ShortInterest> = {};
        res.data.forEach((si) => { map[si.symbol] = si; });
        setData(map);
      }
    });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  return { shortInterest: data };
}
