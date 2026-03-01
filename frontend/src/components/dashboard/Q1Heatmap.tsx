'use client';

import type { Ticker } from '@/types';

interface Props {
  tickers: Ticker[];
  loading: boolean;
  error: string | null;
  selectedSymbol: string | null;
  onSelectTicker: (symbol: string) => void;
}

// TradingView-style colour scale: intensity mapped to % change magnitude
// Deep red → red → dark → green → deep green
function getTileColor(pct: number): { bg: string; text: string } {
  const abs = Math.abs(pct);

  if (pct >= 4)   return { bg: '#14532d', text: '#4ade80' }; // deep green
  if (pct >= 2)   return { bg: '#166534', text: '#86efac' }; // green
  if (pct >= 0.5) return { bg: '#15803d', text: '#bbf7d0' }; // light green
  if (pct >= 0)   return { bg: '#1a2e1a', text: '#6ee7b7' }; // near-flat green

  if (pct <= -4)  return { bg: '#7f1d1d', text: '#f87171' }; // deep red
  if (pct <= -2)  return { bg: '#991b1b', text: '#fca5a5' }; // red
  if (pct <= -0.5) return { bg: '#b91c1c', text: '#fecaca' }; // light red
  return           { bg: '#2d1a1a', text: '#fca5a5' };         // near-flat red
}

function SkeletonTile() {
  return (
    <div className="rounded-md bg-surface-border animate-pulse min-h-[80px]" />
  );
}

function TickerTile({
  ticker,
  selected,
  onClick,
}: {
  ticker: Ticker;
  selected: boolean;
  onClick: () => void;
}) {
  const { bg, text } = getTileColor(ticker.changePercent);
  const isUp = ticker.changePercent >= 0;

  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center p-2 rounded-md
        text-center cursor-pointer transition-all min-h-[80px]
        ${selected ? 'ring-2 ring-white ring-offset-1 ring-offset-surface' : 'hover:brightness-125'}`}
      style={{ backgroundColor: bg }}
    >
      {/* Sentiment dot */}
      {ticker.sentiment && (
        <span
          className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${
            ticker.sentiment.score > 0.2 ? 'bg-green-300' :
            ticker.sentiment.score < -0.2 ? 'bg-red-300' : 'bg-gray-400'
          }`}
        />
      )}

      {/* Symbol */}
      <span className="font-bold text-sm text-white leading-none">{ticker.symbol}</span>

      {/* % Change — most prominent, TradingView style */}
      <span className="font-bold text-lg leading-tight mt-0.5" style={{ color: text }}>
        {isUp ? '+' : ''}{ticker.changePercent.toFixed(2)}%
      </span>

      {/* Price */}
      <span className="text-xs text-white/70 leading-none mt-0.5 font-mono">
        ${ticker.price.toFixed(2)}
      </span>

      {/* Company name — truncated */}
      <span className="text-xs text-white/40 leading-none mt-0.5 truncate max-w-full px-1">
        {ticker.name}
      </span>
    </button>
  );
}

export default function Q1Heatmap({ tickers, loading, error, selectedSymbol, onSelectTicker }: Props) {
  // Sort: biggest movers (abs % change) first — most interesting at the top
  const sorted = [...tickers].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

  return (
    <section className="quadrant">
      <div className="quadrant-header">
        <span className="quadrant-title">Heatmap</span>
        <div className="flex items-center gap-3 text-xs text-gray-600">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#14532d' }} />
            &gt;4%
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#15803d' }} />
            +
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#b91c1c' }} />
            −
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#7f1d1d' }} />
            &lt;-4%
          </span>
          {loading && <span className="text-gray-500 animate-pulse ml-1">updating…</span>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading && tickers.length === 0 ? (
          // Skeleton while localStorage hydrates or first fetch is in-flight
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonTile key={i} />)}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 auto-rows-min">
            {sorted.map((t) => (
              <TickerTile
                key={t.symbol}
                ticker={t}
                selected={t.symbol === selectedSymbol}
                onClick={() => onSelectTicker(t.symbol)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
