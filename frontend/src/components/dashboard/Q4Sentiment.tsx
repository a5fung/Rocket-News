'use client';

import {
  Area,
  AreaChart,
  Bar,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useSentiment } from '@/hooks/useSentiment';
import type { SentimentDataPoint } from '@/types';

interface Props {
  selectedSymbol: string | null;
  symbols: string[];
}

function SentimentGauge({ bullish, bearish, volume }: { bullish: number; bearish: number; volume: number }) {
  const neutral = Math.max(0, 100 - bullish - bearish);
  return (
    <div className="px-4 py-3 shrink-0">
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-bull font-semibold">{bullish.toFixed(0)}% Bullish</span>
        {neutral > 5 && <span className="text-gray-400">{neutral.toFixed(0)}% Neutral</span>}
        <span className="text-bear font-semibold">{bearish.toFixed(0)}% Bearish</span>
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-surface-border gap-px">
        <div className="bg-bull transition-all duration-700 rounded-l-full" style={{ width: `${bullish}%` }} />
        <div className="bg-gray-600 transition-all duration-700" style={{ width: `${neutral}%` }} />
        <div className="bg-bear transition-all duration-700 rounded-r-full" style={{ width: `${bearish}%` }} />
      </div>
      <p className="text-xs text-gray-500 mt-1">{volume} posts scored · 24h window</p>
    </div>
  );
}

// Custom tooltip for the chart
function ChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ value: number; dataKey: string }> }) {
  if (!active || !payload?.length) return null;
  const score = payload.find(p => p.dataKey === 'score')?.value;
  const volume = payload.find(p => p.dataKey === 'volume')?.value;
  return (
    <div className="bg-surface-raised border border-surface-border rounded-md px-2.5 py-1.5 text-xs">
      {score !== undefined && (
        <p className={score > 0 ? 'text-bull' : score < 0 ? 'text-bear' : 'text-gray-400'}>
          Sentiment: {score > 0 ? '+' : ''}{score.toFixed(2)}
        </p>
      )}
      {volume !== undefined && <p className="text-gray-400">Volume: {volume} posts</p>}
    </div>
  );
}

function SentimentChart({ history }: { history: SentimentDataPoint[] }) {
  // Colour the area green above 0, red below — using two overlapping areas with clip
  const allPositive = history.map(d => ({ ...d, pos: Math.max(0, d.score), neg: Math.min(0, d.score) }));

  return (
    <div className="px-2 pb-1 shrink-0">
      <div className="flex items-center justify-between px-1 mb-1">
        <p className="text-xs text-gray-500">7-day sentiment trend</p>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-bull/60 inline-block" />Bull</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-bear/60 inline-block" />Bear</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-gray-600 inline-block" />Volume</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={110}>
        <ComposedChart data={allPositive} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <XAxis dataKey="timestamp" hide />
          <YAxis
            yAxisId="score"
            domain={[-1, 1]}
            tickCount={3}
            tickFormatter={v => v === 0 ? '0' : v > 0 ? '+' : '−'}
            tick={{ fontSize: 9, fill: '#6b7280' }}
            width={18}
          />
          <YAxis yAxisId="vol" orientation="right" hide domain={[0, 'dataMax']} />

          {/* Volume bars in background */}
          <Bar yAxisId="vol" dataKey="volume" fill="#374151" opacity={0.4} radius={[1, 1, 0, 0]} />

          {/* Bullish area (above 0) */}
          <Area
            yAxisId="score"
            type="monotone"
            dataKey="pos"
            stroke="#22c55e"
            strokeWidth={1.5}
            fill="#22c55e"
            fillOpacity={0.25}
            dot={false}
            activeDot={false}
          />
          {/* Bearish area (below 0, shown as positive magnitude going down) */}
          <Area
            yAxisId="score"
            type="monotone"
            dataKey="neg"
            stroke="#ef4444"
            strokeWidth={1.5}
            fill="#ef4444"
            fillOpacity={0.25}
            dot={false}
            activeDot={false}
          />

          <ReferenceLine yAxisId="score" y={0} stroke="#374151" strokeDasharray="3 3" />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#374151', strokeWidth: 1 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function Q4Sentiment({ selectedSymbol, symbols }: Props) {
  const symbol = selectedSymbol ?? symbols[0] ?? null;
  const { score, history, posts, loading } = useSentiment(symbol);

  const trendColor =
    score?.trend === 'rising' ? 'text-bull' :
    score?.trend === 'falling' ? 'text-bear' : 'text-gray-400';

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
      <div className="quadrant-header">
        <div className="flex flex-col gap-0.5">
          <span className="quadrant-title">
            Sentiment · <span className="text-accent">${symbol}</span>
          </span>
          {/* Source breakdown — shows which feeds contributed posts */}
          {posts.length > 0 && (
            <div className="flex items-center gap-1">
              {(() => {
                const st = posts.filter(p => p.source === 'stocktwits').length;
                const rd = posts.filter(p => p.source === 'reddit').length;
                return (
                  <>
                    {st > 0 && (
                      <span className="text-xs px-1.5 py-px rounded bg-blue-900/50 text-blue-300">
                        StockTwits · {st}
                      </span>
                    )}
                    {rd > 0 && (
                      <span className="text-xs px-1.5 py-px rounded bg-orange-900/40 text-orange-300">
                        Reddit · {rd}
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {score && <span className={`text-xs font-medium capitalize ${trendColor}`}>{score.trend} ↑</span>}
          {loading && <span className="text-xs text-gray-500 animate-pulse">loading…</span>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
        {score && (
          <SentimentGauge
            bullish={score.bullishPct}
            bearish={score.bearishPct}
            volume={score.postVolume}
          />
        )}

        {history.length > 0 && <SentimentChart history={history} />}

        {/* Posts list */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-1.5 min-h-0">
          <p className="text-xs text-gray-500 px-1 pt-1 shrink-0">
            Top posts · {posts.length} relevant
          </p>
          {posts.length === 0 && !loading && (
            <p className="text-xs text-gray-600 px-1">No finance posts found for ${symbol} in last 24h</p>
          )}
          {posts.map((post) => {
            const isPos = post.sentimentScore > 0.2;
            const isNeg = post.sentimentScore < -0.2;
            const borderColor = isPos ? 'border-l-bull' : isNeg ? 'border-l-bear' : 'border-l-surface-border';
            return (
              <a
                key={post.id}
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex flex-col gap-0.5 p-2 rounded border border-surface-border border-l-2 ${borderColor}
                  hover:bg-surface-border transition-colors`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className={`shrink-0 text-xs px-1.5 py-px rounded font-medium ${
                      post.source === 'stocktwits'
                        ? 'bg-blue-900/50 text-blue-300'
                        : 'bg-orange-900/40 text-orange-300'
                    }`}>
                      {post.source === 'stocktwits' ? 'StockTwits' : 'Reddit'}
                    </span>
                    <span className="text-xs text-gray-500 truncate">{post.author}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-600">{post.engagement}pts</span>
                    {post.sentimentScore !== 0 && (
                      <span className={`text-xs font-mono font-medium ${isPos ? 'text-bull' : isNeg ? 'text-bear' : 'text-gray-400'}`}>
                        {isPos ? '+' : ''}{post.sentimentScore.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-300 line-clamp-2 leading-snug">{post.content}</p>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
