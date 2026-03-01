'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useWatchlist } from '@/hooks/useWatchlist';
import { useEarningsCalendar, useMarketData, useSparklines } from '@/hooks/useMarketData';
import { useExplainMove } from '@/hooks/useExplainMove';
import { useNews } from '@/hooks/useNews';
import { syncAlertWatchlist } from '@/lib/api';
import type { DashboardContext } from '@/types';

import Q1Heatmap from './Q1Heatmap';
import Q2NewsFeed from './Q2NewsFeed';
import Q3AIChat from './Q3AIChat';
import Q4Sentiment from './Q4Sentiment';
import MobileNav from '@/components/mobile/MobileNav';
import AlertsButton from '@/components/shared/AlertsButton';
import PortfolioManager from '@/components/shared/PortfolioManager';
import WatchlistManager from '@/components/shared/WatchlistManager';
import RocketLogo from '@/components/shared/RocketLogo';

export type MobileTab = 'market' | 'research';

export default function Dashboard() {
  const { symbols, isLoaded, add, remove } = useWatchlist();
  const { tickers, loading: marketLoading, error: marketError } = useMarketData(isLoaded ? symbols : []);
  const { news, loading: newsLoading } = useNews(isLoaded ? symbols : []);
  const { earnings } = useEarningsCalendar(isLoaded ? symbols : []);
  const { moveTags } = useExplainMove(tickers);
  const { sparklines } = useSparklines(isLoaded ? symbols : []);
  const { positions, setPosition, clearPosition } = usePortfolio();
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('market');
  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);

  // Sync watchlist to the backend alert scout whenever it changes
  useEffect(() => {
    if (isLoaded && symbols.length > 0) {
      void syncAlertWatchlist(symbols);
    }
  }, [isLoaded, symbols]);

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
        <div className="flex items-center gap-2.5">
          <RocketLogo size={32} showText={false} />
          <span className="font-bold text-lg tracking-tight text-white">
            Rocket <span className="text-accent">News</span>
          </span>
          <span className="text-gray-500 text-xs">· {symbols.length} stocks</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertsButton symbols={symbols} />
          <PortfolioManager symbols={symbols} tickers={tickers} positions={positions} onSet={setPosition} onClear={clearPosition} />
          <WatchlistManager symbols={symbols} onAdd={add} onRemove={remove} />
        </div>
      </header>

      {/* ── Desktop layout: 2×2 grid ──────────────────────────────────── */}
      <main className="hidden md:grid grid-cols-2 grid-rows-2 flex-1 gap-2 p-2 overflow-hidden">
        <Q1Heatmap tickers={tickers} earnings={earnings} moveTags={moveTags} sparklines={sparklines} positions={positions} loading={!isLoaded || marketLoading || (symbols.length > 0 && tickers.length === 0 && !marketError)} error={marketError} {...sharedProps} />
        <Q2NewsFeed news={news} symbols={symbols} loading={newsLoading} {...sharedProps} />
        <Q3AIChat getContext={getDashboardContext} selectedSymbol={selectedSymbol} tickers={tickers} />
        <Q4Sentiment selectedSymbol={selectedSymbol} symbols={symbols} />
      </main>

      {/* ── Mobile layout: 2-tab split-pane ────────────────────────────── */}
      <main className="flex flex-col flex-1 md:hidden overflow-hidden">
        <div
          className="flex-1 min-h-0 overflow-hidden"
          onTouchStart={(e) => {
            swipeStartX.current = e.touches[0].clientX;
            swipeStartY.current = e.touches[0].clientY;
          }}
          onTouchEnd={(e) => {
            const dx = e.changedTouches[0].clientX - swipeStartX.current;
            const dy = Math.abs(e.changedTouches[0].clientY - swipeStartY.current);
            if (Math.abs(dx) > 60 && dy < 80) {
              if (dx < 0 && mobileTab === 'market')   setMobileTab('research');
              if (dx > 0 && mobileTab === 'research') setMobileTab('market');
            }
          }}
        >

          {/* Market tab: Heatmap (top 45%) + Sentiment (bottom 55%) */}
          {mobileTab === 'market' && (
            <div className="flex flex-col h-full">
              <div className="h-[45%] min-h-0 border-b border-surface-border grid">
                <Q1Heatmap tickers={tickers} earnings={earnings} moveTags={moveTags} sparklines={sparklines} positions={positions} loading={!isLoaded || marketLoading || (symbols.length > 0 && tickers.length === 0 && !marketError)} error={marketError} {...sharedProps} />
              </div>
              <div className="flex-1 min-h-0 grid">
                <Q4Sentiment selectedSymbol={selectedSymbol} symbols={symbols} />
              </div>
            </div>
          )}

          {/* Research tab: News (top 55%) + AI Chat (bottom 45%) */}
          {mobileTab === 'research' && (
            <div className="flex flex-col h-full">
              <div className="h-[55%] min-h-0 border-b border-surface-border grid">
                <Q2NewsFeed news={news} symbols={symbols} loading={newsLoading} {...sharedProps} />
              </div>
              <div className="flex-1 min-h-0 grid">
                <Q3AIChat getContext={getDashboardContext} selectedSymbol={selectedSymbol} tickers={tickers} />
              </div>
            </div>
          )}

        </div>
        <MobileNav activeTab={mobileTab} onTabChange={setMobileTab} />
      </main>
    </div>
  );
}
