'use client';

import { useMemo } from 'react';
import {
  Area,
  Bar,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useSentiment } from '@/hooks/useSentiment';
import type { CandlePoint, SentimentDataPoint, SentimentSource } from '@/types';

interface Props {
  selectedSymbol: string | null;
  symbols: string[];
  onSelectTicker: (symbol: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Convert -1…1 score to 0…100 composite (50 = neutral). */
function toComposite(score: number) {
  return Math.round((score + 1) * 50);
}

function compositeLabel(c: number) {
  if (c >= 62) return 'Bullish';
  if (c <= 38) return 'Bearish';
  return 'Neutral';
}

function compositeColors(c: number): { bar: string; text: string; bg: string } {
  if (c >= 62) return { bar: '#166534', text: '#4ade80', bg: 'bg-green-950/40' };
  if (c <= 38) return { bar: '#991b1b', text: '#f87171', bg: 'bg-red-950/40'   };
  return         { bar: '#374151', text: '#9ca3af', bg: 'bg-surface-border/40' };
}

// ── Platform icons ─────────────────────────────────────────────────────────────

/**
 * Minimal 16 × 16 platform icons.
 * Reddit  → orange circle with "r"
 * StockTwits → blue circle with "ST"
 * X       → black circle with "X"
 */
function PlatformIcon({ source }: { source: SentimentSource }) {
  if (source === 'reddit') {
    return (
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white shrink-0"
        style={{ backgroundColor: '#FF4500', fontSize: 9, fontWeight: 700 }}
        title="Reddit"
      >r</span>
    );
  }
  if (source === 'stocktwits') {
    return (
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white shrink-0"
        style={{ backgroundColor: '#3b82f6', fontSize: 7, fontWeight: 700 }}
        title="StockTwits"
      >ST</span>
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white shrink-0"
      style={{ backgroundColor: '#000', fontSize: 9, fontWeight: 700 }}
      title="X"
    >𝕏</span>
  );
}

// ── Cashtag renderer ───────────────────────────────────────────────────────────

/**
 * Splits post text on $TICKER cashtags. Tickers in the watchlist become
 * clickable chips that switch the dashboard's active symbol. Others get a
 * subtle highlight so they're still visually distinct without being interactive.
 */
function PostContent({
  content,
  symbolSet,
  onSelectTicker,
}: {
  content: string;
  symbolSet: Set<string>;
  onSelectTicker: (symbol: string) => void;
}) {
  const parts = content.split(/(\$[A-Z]{1,5}\b)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (/^\$[A-Z]{1,5}$/.test(part)) {
          const ticker = part.slice(1);
          if (symbolSet.has(ticker)) {
            return (
              <button
                key={i}
                className="text-accent font-semibold hover:underline focus:outline-none"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelectTicker(ticker); }}
              >
                {part}
              </button>
            );
          }
          return <span key={i} className="text-blue-400/60 font-medium">{part}</span>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ── Score bar (The Header) ─────────────────────────────────────────────────────

function MiniBar({ label, composite, color }: { label: string; composite: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-gray-500 w-10 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-surface-border overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${composite}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] font-mono text-gray-400 w-5 text-right shrink-0">{composite}</span>
    </div>
  );
}

function ScoreBar({ score, bullish, bearish, newsSentiment }: {
  score: number; bullish: number; bearish: number; newsSentiment?: number | null;
}) {
  const composite = toComposite(score);
  const label = compositeLabel(composite);
  const { bar, text } = compositeColors(composite);
  const neutral = Math.max(0, Math.round(100 - bullish - bearish));

  const newsComposite = newsSentiment != null ? toComposite(newsSentiment) : null;
  const newsColor = newsComposite != null ? compositeColors(newsComposite).bar : '#374151';

  return (
    <div className="px-4 pt-3 pb-2 shrink-0">
      <div className="flex items-end justify-between mb-2">
        <div>
          <span className="text-4xl font-bold font-mono leading-none" style={{ color: text }}>
            {composite}
          </span>
          <span className="text-sm font-semibold ml-2" style={{ color: text }}>{label}</span>
        </div>
        <div className="text-right text-xs leading-tight">
          <div className="text-green-400">{bullish.toFixed(0)}% bull</div>
          <div className="text-red-400">{bearish.toFixed(0)}% bear</div>
          <div className="text-gray-500">{neutral}% neutral</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-3 rounded-full bg-surface-border overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${composite}%`, backgroundColor: bar }}
        />
      </div>

      {/* Tick marks */}
      <div className="relative mt-0.5 h-2">
        <span className="absolute left-0 text-[10px] text-gray-600">0</span>
        <span className="absolute left-1/2 -translate-x-1/2 text-[10px] text-gray-600">50</span>
        <span className="absolute right-0 text-[10px] text-gray-600">100</span>
      </div>

      {/* News vs Social mini-bars */}
      {newsComposite != null && (
        <div className="mt-2.5 pt-2 border-t border-surface-border/60 flex flex-col gap-1">
          <MiniBar label="Social" composite={composite} color={bar} />
          <MiniBar label="News" composite={newsComposite} color={newsColor} />
        </div>
      )}
    </div>
  );
}

// ── Trending themes ────────────────────────────────────────────────────────────

function TrendingThemes({ themes }: { themes: string[] }) {
  if (!themes.length) return null;
  return (
    <div className="px-4 py-2 shrink-0 border-t border-surface-border">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-gray-500 shrink-0">Trending</span>
        {themes.map((t) => (
          <span key={t} className="text-xs bg-accent/15 text-accent px-1.5 py-0.5 rounded font-medium">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Chart ──────────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; dataKey: string }> }) {
  if (!active || !payload?.length) return null;
  const composite = payload.find(p => p.dataKey === 'composite')?.value;
  const price = payload.find(p => p.dataKey === 'price')?.value;
  const volume = payload.find(p => p.dataKey === 'volume')?.value;
  return (
    <div className="bg-surface-raised border border-surface-border rounded px-2 py-1 text-xs">
      {composite !== undefined && (
        <p className={composite > 50 ? 'text-bull' : composite < 50 ? 'text-bear' : 'text-gray-400'}>
          Sentiment: {composite}
        </p>
      )}
      {price !== undefined && <p className="text-amber-400">${(price as number).toFixed(2)}</p>}
      {volume !== undefined && <p className="text-gray-400">{volume} posts</p>}
    </div>
  );
}

function SentimentChart({ history, priceHistory }: { history: SentimentDataPoint[]; priceHistory: CandlePoint[] }) {
  // Build date → close price lookup from daily candles
  const priceByDate = new Map(
    priceHistory.map(p => [new Date(p.t * 1000).toISOString().slice(0, 10), p.c])
  );

  // Aggregate sentiment history by calendar date (avg composite + total volume per day)
  const dateMap = new Map<string, { compositeSum: number; count: number; vol: number }>();
  for (const d of history) {
    const date = d.timestamp.slice(0, 10);
    const prev = dateMap.get(date) ?? { compositeSum: 0, count: 0, vol: 0 };
    dateMap.set(date, { compositeSum: prev.compositeSum + toComposite(d.score), count: prev.count + 1, vol: prev.vol + d.volume });
  }

  const data = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      composite: Math.round(v.compositeSum / v.count),
      volume: v.vol,
      price: priceByDate.get(date),
    }));

  const hasPrices = data.some(d => d.price !== undefined);
  const avg = data.reduce((s, d) => s + d.composite, 0) / (data.length || 1);
  const sentColor = avg >= 62 ? '#22c55e' : avg <= 38 ? '#ef4444' : '#9ca3af';

  const prices = data.map(d => d.price).filter((p): p is number => p !== undefined);
  const pMin = prices.length ? Math.min(...prices) * 0.995 : 0;
  const pMax = prices.length ? Math.max(...prices) * 1.005 : 1;

  return (
    <div className="px-2 pb-1 border-t border-surface-border shrink-0">
      <div className="flex items-baseline justify-between px-1 pt-1.5 pb-0.5">
        <p className="text-xs text-gray-500">7-day trend</p>
        <p className="text-[9px] text-gray-600">bars = post vol</p>
      </div>
      <ResponsiveContainer width="100%" height={90}>
        <ComposedChart data={data} margin={{ top: 2, right: hasPrices ? 30 : 4, left: 0, bottom: 0 }}>
          <XAxis dataKey="date" hide />
          <YAxis yAxisId="score" domain={[0, 100]} ticks={[0, 50, 100]}
            tickFormatter={v => String(v)}
            tick={{ fontSize: 9, fill: '#6b7280' }} width={22} />
          {hasPrices && (
            <YAxis yAxisId="price" orientation="right" domain={[pMin, pMax]}
              tickFormatter={v => `$${(v as number).toFixed(0)}`}
              tick={{ fontSize: 9, fill: '#f59e0b' }} width={30} />
          )}
          <YAxis yAxisId="vol" orientation="right" hide domain={[0, 'dataMax']} />
          <Bar yAxisId="vol" dataKey="volume" fill="#374151" opacity={0.35} radius={[1, 1, 0, 0]} />
          <Area yAxisId="score" type="monotone" dataKey="composite"
            stroke={sentColor} strokeWidth={1.5} fill={sentColor} fillOpacity={0.15} dot={false} activeDot={false} />
          {hasPrices && (
            <Line yAxisId="price" type="monotone" dataKey="price"
              stroke="#f59e0b" strokeWidth={1.5} dot={false} activeDot={false} strokeDasharray="4 2" connectNulls />
          )}
          <ReferenceLine yAxisId="score" y={50} stroke="#374151" strokeDasharray="3 3" />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#374151', strokeWidth: 1 }} />
        </ComposedChart>
      </ResponsiveContainer>
      {hasPrices && (
        <div className="flex items-center gap-3 px-1 pb-0.5">
          <span className="flex items-center gap-1 text-[9px] text-gray-500">
            <span className="inline-block w-3 h-px" style={{ backgroundColor: sentColor }} />
            Sentiment
          </span>
          <span className="flex items-center gap-1 text-[9px] text-gray-500">
            <span className="inline-block w-4 border-t-2 border-dashed border-amber-400" />
            Price
          </span>
        </div>
      )}
    </div>
  );
}

// ── Skeleton loaders ───────────────────────────────────────────────────────────

function ScoreBarSkeleton() {
  return (
    <div className="px-4 pt-3 pb-2 shrink-0 animate-pulse">
      <div className="flex items-end justify-between mb-2">
        <div className="flex items-baseline gap-2">
          <div className="h-10 w-14 rounded bg-surface-border" />
          <div className="h-4 w-12 rounded bg-surface-border" />
        </div>
        <div className="flex flex-col gap-1 items-end">
          <div className="h-3 w-14 rounded bg-surface-border" />
          <div className="h-3 w-14 rounded bg-surface-border" />
        </div>
      </div>
      <div className="h-3 rounded-full bg-surface-border" />
    </div>
  );
}

function PostSkeleton() {
  return (
    <div className="flex flex-col gap-1.5 p-2 rounded border border-surface-border animate-pulse">
      <div className="flex items-center gap-1.5 justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-surface-border shrink-0" />
          <div className="h-3 w-20 rounded bg-surface-border" />
        </div>
        <div className="h-3 w-10 rounded bg-surface-border" />
      </div>
      <div className="h-3 w-full rounded bg-surface-border ml-5" />
      <div className="h-3 w-2/3 rounded bg-surface-border ml-5" />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Q4Sentiment({ selectedSymbol, symbols, onSelectTicker }: Props) {
  const symbol = selectedSymbol ?? symbols[0] ?? null;
  const { score, history, posts, priceHistory, loading } = useSentiment(symbol);
  const symbolSet = useMemo(() => new Set(symbols), [symbols]);

  const trendColor =
    score?.trend === 'rising'  ? 'text-bull' :
    score?.trend === 'falling' ? 'text-bear' : 'text-gray-400';

  const stCount = posts.filter(p => p.source === 'stocktwits').length;
  const rdCount = posts.filter(p => p.source === 'reddit').length;

  if (!symbol) {
    return (
      <section className="quadrant">
        <div className="quadrant-header"><span className="quadrant-title">Sentiment</span></div>
        <div className="flex items-center justify-center h-full text-gray-500 text-sm">
          Select a stock from the heatmap
        </div>
      </section>
    );
  }

  return (
    <section className="quadrant">
      {/* ── Header ── */}
      <div className="quadrant-header">
        <div className="flex flex-col gap-0.5">
          <span className="quadrant-title">
            Sentiment · <span className="text-accent">${symbol}</span>
          </span>
          {/* Source breakdown */}
          {posts.length > 0 && (
            <div className="flex items-center gap-1">
              {stCount > 0 && (
                <span className="text-xs px-1.5 py-px rounded bg-blue-900/50 text-blue-300">
                  StockTwits · {stCount}
                </span>
              )}
              {rdCount > 0 && (
                <span className="text-xs px-1.5 py-px rounded bg-orange-900/40 text-orange-300">
                  Reddit · {rdCount}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {score && (
            <span className={`text-xs font-medium capitalize ${trendColor}`}>
              {score.trend}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
        {/* ── Skeleton while loading ── */}
        {loading && !score && (
          <>
            <ScoreBarSkeleton />
            <div className="flex-1 px-2 pb-2 pt-1 flex flex-col gap-1.5 border-t border-surface-border">
              <div className="h-3 w-24 rounded bg-surface-border animate-pulse mb-1" />
              <PostSkeleton />
              <PostSkeleton />
              <PostSkeleton />
              <PostSkeleton />
            </div>
          </>
        )}

        {/* ── Score bar (includes News vs Social mini-bars) ── */}
        {score && (
          <ScoreBar score={score.score} bullish={score.bullishPct} bearish={score.bearishPct} newsSentiment={score.newsSentiment} />
        )}

        {/* ── Whisper number (earnings catalyst only) ── */}
        {score?.whisper && (
          <div className="mx-4 mb-1 px-3 py-2 rounded border border-amber-500/30 bg-amber-500/8 shrink-0">
            <div className="flex items-start gap-2">
              <span className="text-[10px] font-bold text-amber-400 tracking-wider shrink-0 mt-px">WHISPER</span>
              <span className="text-xs text-gray-300 leading-snug">{score.whisper}</span>
            </div>
          </div>
        )}

        {/* ── Trending themes (LLM-extracted) ── */}
        {score && <TrendingThemes themes={score.themes ?? []} />}

        {/* ── 7-day chart (sentiment + price overlay) ── */}
        {history.length > 0 && <SentimentChart history={history} priceHistory={priceHistory} />}

        {/* ── Post feed ── */}
        {!loading && (
        <div className="flex-1 overflow-y-auto px-2 pb-2 pt-1 flex flex-col gap-1.5 min-h-0 border-t border-surface-border">
          <p className="text-xs text-gray-500 px-1 shrink-0">
            Top posts · {posts.length} relevant
          </p>

          {posts.length === 0 && (
            <p className="text-xs text-gray-600 px-1">
              No finance posts found for ${symbol} in the last week
            </p>
          )}

          {posts.map((post) => {
            const isPos = post.sentimentScore > 0.2;
            const isNeg = post.sentimentScore < -0.2;
            const border = isPos ? 'border-l-bull' : isNeg ? 'border-l-bear' : 'border-l-surface-border';

            return (
              <a
                key={post.id}
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex flex-col gap-0.5 p-2 rounded border border-surface-border border-l-2 ${border}
                  hover:bg-surface-border transition-colors`}
              >
                <div className="flex items-center gap-1.5 justify-between">
                  <div className="flex items-center gap-1.5 truncate">
                    <PlatformIcon source={post.source} />
                    <span className="text-xs text-gray-500 truncate">{post.author}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-600">↑{post.engagement.toLocaleString()}</span>
                    {post.sentimentScore !== 0 && (
                      <span className={`text-xs font-mono font-semibold ${isPos ? 'text-bull' : isNeg ? 'text-bear' : 'text-gray-400'}`}>
                        {isPos ? '+' : ''}{post.sentimentScore.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-300 line-clamp-2 leading-snug pl-5">
                  <PostContent content={post.content} symbolSet={symbolSet} onSelectTicker={onSelectTicker} />
                </p>
              </a>
            );
          })}
        </div>
        )}
      </div>
    </section>
  );
}
