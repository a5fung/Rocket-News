'use client';

import { useMemo, useState } from 'react';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useMarketData } from '@/hooks/useMarketData';
import { useNews } from '@/hooks/useNews';
import type { DashboardContext } from '@/types';

import Q1Heatmap from './Q1Heatmap';
import Q2NewsFeed from './Q2NewsFeed';
import Q3AIChat from './Q3AIChat';
import Q4Sentiment from './Q4Sentiment';
import MobileNav from '@/components/mobile/MobileNav';
import WatchlistManager from '@/components/shared/WatchlistManager';

export type MobileTab = 'heatmap' | 'news' | 'ai' | 'sentiment';

export default function Dashboard() {
  const { symbols, isLoaded, add, remove } = useWatchlist();
  const { tickers, loading: marketLoading, error: marketError } = useMarketData(isLoaded ? symbols : []);
  const { news } = useNews(isLoaded ? symbols : []);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('heatmap');

  // Build dashboard context for AI injection
  const getDashboardContext = useMemo(
    () => (): DashboardContext => ({
      watchlist: tickers,
      topNews: news.slice(0, 15),
      sentiment: {},
      generatedAt: new Date().toISOString(),
    }),
    [tickers, news],
  );

  const sharedProps = { selectedSymbol, onSelectTicker: setSelectedSymbol };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-surface-border bg-surface-raised shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-accent font-bold text-lg tracking-tight">Rocket News</span>
          <span className="text-gray-500 text-xs">· {symbols.length} stocks</span>
        </div>
        <WatchlistManager symbols={symbols} onAdd={add} onRemove={remove} />
      </header>

      {/* ── Desktop layout: 2×2 grid ──────────────────────────────────── */}
      <main className="hidden md:grid grid-cols-2 grid-rows-2 flex-1 gap-2 p-2 overflow-hidden">
        <Q1Heatmap tickers={tickers} loading={!isLoaded || marketLoading || (symbols.length > 0 && tickers.length === 0 && !marketError)} error={marketError} {...sharedProps} />
        <Q2NewsFeed news={news} symbols={symbols} {...sharedProps} />
        <Q3AIChat getContext={getDashboardContext} selectedSymbol={selectedSymbol} />
        <Q4Sentiment selectedSymbol={selectedSymbol} symbols={symbols} />
      </main>

      {/* ── Mobile layout: full-screen tab ────────────────────────────── */}
      <main className="flex flex-col flex-1 md:hidden overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {mobileTab === 'heatmap' && (
            <Q1Heatmap tickers={tickers} loading={!isLoaded || marketLoading || (symbols.length > 0 && tickers.length === 0 && !marketError)} error={marketError} {...sharedProps} />
          )}
          {mobileTab === 'news' && (
            <Q2NewsFeed news={news} symbols={symbols} {...sharedProps} />
          )}
          {mobileTab === 'ai' && (
            <Q3AIChat getContext={getDashboardContext} selectedSymbol={selectedSymbol} />
          )}
          {mobileTab === 'sentiment' && (
            <Q4Sentiment selectedSymbol={selectedSymbol} symbols={symbols} />
          )}
        </div>
        <MobileNav activeTab={mobileTab} onTabChange={setMobileTab} />
      </main>
    </div>
  );
}
