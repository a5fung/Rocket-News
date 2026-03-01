'use client';

import { useMemo, useState } from 'react';
import type { EarningsEvent, Ticker } from '@/types';

function TickerLogo({ url, symbol }: { url?: string; symbol: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center
        text-[7px] font-bold text-white/70 shrink-0 leading-none">
        {symbol[0]}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className="w-4 h-4 rounded-full object-contain bg-white/10 shrink-0"
      onError={() => setFailed(true)}
    />
  );
}

interface Props {
  tickers: Ticker[];
  earnings: EarningsEvent[];
  moveTags: Map<string, string>;
  loading: boolean;
  error: string | null;
  selectedSymbol: string | null;
  onSelectTicker: (symbol: string) => void;
}

type SortMode = 'change' | 'alpha';

/**
 * Dynamic colour scale — intensity is normalised against the biggest mover in
 * the current watchlist, not fixed thresholds.
 *
 * Why: on a +15 % gap-up day a +2 % stock should look nearly flat compared to
 * the runner, giving instant "where is the money flowing today?" context.
 */
function getTileColor(pct: number, maxAbs: number): { bg: string; text: string } {
  const norm = maxAbs > 0 ? Math.abs(pct) / maxAbs : 0; // 0 → 1

  if (pct >= 0) {
    if (norm > 0.75) return { bg: '#14532d', text: '#4ade80' }; // deep green
    if (norm > 0.40) return { bg: '#166534', text: '#86efac' }; // green
    if (norm > 0.15) return { bg: '#15803d', text: '#bbf7d0' }; // light green
    return               { bg: '#1a2e1a', text: '#6ee7b7' };    // near-flat
  }

  if (norm > 0.75) return { bg: '#7f1d1d', text: '#f87171' };  // deep red
  if (norm > 0.40) return { bg: '#991b1b', text: '#fca5a5' };  // red
  if (norm > 0.15) return { bg: '#b91c1c', text: '#fecaca' };  // light red
  return               { bg: '#2d1a1a', text: '#fca5a5' };     // near-flat
}

/** Compute column count based on number of stocks for balanced readability. */
function gridCols(count: number): number {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

function SkeletonTile() {
  return <div className="rounded-md bg-surface-border animate-pulse" />;
}

function earningsBadgeColor(diffDays: number): string {
  if (diffDays === 0) return 'bg-red-500/90';
  if (diffDays <= 3) return 'bg-orange-500/90';
  return 'bg-amber-500/90';
}

function TickerTile({
  ticker,
  selected,
  maxAbs,
  earningsEvent,
  moveTag,
  onClick,
}: {
  ticker: Ticker;
  selected: boolean;
  maxAbs: number;
  earningsEvent?: EarningsEvent;
  moveTag?: string;
  onClick: () => void;
}) {
  const { bg, text } = getTileColor(ticker.changePercent, maxAbs);
  const isUp = ticker.changePercent >= 0;

  let earningsBadge: React.ReactNode = null;
  if (earningsEvent) {
    const today = new Date().toISOString().slice(0, 10);
    const diffDays = Math.round(
      (new Date(earningsEvent.reportDate).getTime() - new Date(today).getTime()) / 86400000,
    );
    if (diffDays >= 0 && diffDays <= 7) {
      const label = diffDays === 0 ? 'today' : diffDays === 1 ? 'tmrw' : `${diffDays}d`;
      earningsBadge = (
        <span
          className={`absolute top-1.5 left-1.5 text-[9px] font-bold px-1 py-0.5 rounded
            leading-none text-white ${earningsBadgeColor(diffDays)}`}
        >
          E·{label}
        </span>
      );
    }
  }

  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center p-2 rounded-md
        text-center cursor-pointer transition-all overflow-hidden
        ${selected ? 'ring-2 ring-white ring-offset-1 ring-offset-surface' : 'hover:brightness-125'}`}
      style={{ backgroundColor: bg }}
    >
      {/* Earnings badge — top-left */}
      {earningsBadge}

      {/* Sentiment dot — top-right */}
      {ticker.sentiment && (
        <span
          className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${
            ticker.sentiment.score > 0.2 ? 'bg-green-300' :
            ticker.sentiment.score < -0.2 ? 'bg-red-300' : 'bg-gray-400'
          }`}
        />
      )}

      {/* Logo + Symbol */}
      <div className="flex items-center gap-1">
        <TickerLogo url={ticker.logoUrl} symbol={ticker.symbol} />
        <span className="font-bold text-sm text-white leading-none">{ticker.symbol}</span>
      </div>

      {/* % Change — most prominent */}
      <span className="font-bold text-lg leading-tight mt-0.5" style={{ color: text }}>
        {isUp ? '+' : ''}{ticker.changePercent.toFixed(2)}%
      </span>

      {/* Move reason tag */}
      {moveTag && (
        <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full leading-none
          bg-white/10 text-white/80 border border-white/15 mt-0.5 max-w-full truncate">
          {moveTag}
        </span>
      )}

      {/* Price */}
      <span className="text-xs text-white/70 leading-none mt-0.5 font-mono">
        ${ticker.price.toFixed(2)}
      </span>

      {/* Company name */}
      <span className="text-xs text-white/40 leading-none mt-0.5 truncate max-w-full px-1">
        {ticker.name}
      </span>
    </button>
  );
}

export default function Q1Heatmap({ tickers, earnings, moveTags, loading, error, selectedSymbol, onSelectTicker }: Props) {
  const [sortMode, setSortMode] = useState<SortMode>('change');
  const earningsMap = new Map(earnings.map((e) => [e.symbol, e]));

  const sorted = useMemo(
    () =>
      [...tickers].sort((a, b) =>
        sortMode === 'alpha'
          ? a.symbol.localeCompare(b.symbol)
          : b.changePercent - a.changePercent,
      ),
    [tickers, sortMode],
  );

  // Normalisation baseline — biggest |% change| in today's watchlist
  const maxAbs = sorted.reduce((m, t) => Math.max(m, Math.abs(t.changePercent)), 0.01);

  const count = sorted.length;
  const cols = gridCols(count);
  const rows = Math.ceil(count / cols);

  return (
    <section className="quadrant">
      <div className="quadrant-header">
        <span className="quadrant-title">Heatmap</span>

        <div className="flex items-center gap-3">
          {/* Sort toggle */}
          <div className="flex items-center gap-0.5 text-xs">
            <button
              className={`px-2 py-0.5 rounded transition-colors ${sortMode === 'change' ? 'bg-surface-border text-gray-200' : 'text-gray-600 hover:text-gray-400'}`}
              onClick={() => setSortMode('change')}
            >
              % Change
            </button>
            <button
              className={`px-2 py-0.5 rounded transition-colors ${sortMode === 'alpha' ? 'bg-surface-border text-gray-200' : 'text-gray-600 hover:text-gray-400'}`}
              onClick={() => setSortMode('alpha')}
            >
              A–Z
            </button>
          </div>

          {loading && <span className="text-gray-500 animate-pulse text-xs">updating…</span>}
        </div>
      </div>

      {/* Content area — fills remaining quadrant height */}
      <div className="flex-1 min-h-0 overflow-hidden p-2">
        {loading && tickers.length === 0 ? (
          // Skeleton grid fills the full quadrant (3×2 assumed for typical watchlist)
          <div className="h-full grid grid-cols-3 gap-2" style={{ gridTemplateRows: 'repeat(2, 1fr)' }}>
            {Array.from({ length: 6 }).map((_, i) => <SkeletonTile key={i} />)}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-1 text-sm">
            <span className="text-bear">Failed to load market data</span>
            <span className="text-xs text-gray-500">{error}</span>
          </div>
        ) : tickers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-500 text-sm">
            <span>No stocks in watchlist</span>
            <span className="text-xs">Use the + button in the header to add tickers</span>
          </div>
        ) : (
          /*
           * The grid fills the full available height by using explicit
           * grid-template-rows. Each tile gets an equal share of the space.
           * column count adapts to stock count for optimal readability.
           */
          <div
            className="h-full gap-2"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gridTemplateRows: `repeat(${rows}, 1fr)`,
            }}
          >
            {sorted.map((t) => (
              <TickerTile
                key={t.symbol}
                ticker={t}
                selected={t.symbol === selectedSymbol}
                maxAbs={maxAbs}
                earningsEvent={earningsMap.get(t.symbol)}
                moveTag={moveTags.get(t.symbol)}
                onClick={() => onSelectTicker(t.symbol)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
