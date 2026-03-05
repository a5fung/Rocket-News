'use client';

import { ChevronDown, ExternalLink } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchInsiderTrades, fetchNewsBrief } from '@/lib/api';
import type { CatalystTag, InsiderTrade, NewsBrief, NewsItem } from '@/types';

interface Props {
  news: NewsItem[];
  symbols: string[];
  selectedSymbol: string | null;
  loading?: boolean;
  onSelectTicker: (symbol: string) => void;
}

function SkeletonCard({ wide }: { wide?: boolean }) {
  return (
    <div className="flex flex-col gap-2 p-3 rounded-md border border-surface-border animate-pulse">
      <div className="flex items-center gap-2">
        <div className="h-4 w-5 rounded bg-surface-border" />
        <div className={`h-4 rounded bg-surface-border ${wide ? 'w-24' : 'w-16'}`} />
        <div className="ml-auto h-4 w-10 rounded bg-surface-border" />
      </div>
      <div className="h-4 rounded bg-surface-border w-full" />
      <div className="h-4 rounded bg-surface-border w-3/4" />
      <div className="h-3 rounded bg-surface-border w-20 mt-1" />
    </div>
  );
}

const CATALYST_COLORS: Record<CatalystTag, string> = {
  Earnings: 'bg-purple-900 text-purple-300',
  Regulatory: 'bg-orange-900 text-orange-300',
  Analyst: 'bg-blue-900 text-blue-300',
  Macro: 'bg-gray-700 text-gray-300',
  Insider: 'bg-yellow-900 text-yellow-300',
  Contract: 'bg-teal-900 text-teal-300',
  Product: 'bg-indigo-900 text-indigo-300',
  Other: 'bg-gray-700 text-gray-400',
};

/**
 * Classify which upstream API a news item came from based on its source label.
 * SEC EDGAR and Yahoo Finance set their own names; everything else came via Finnhub.
 */
type ApiOrigin = 'SEC EDGAR' | 'Yahoo Finance' | 'Finnhub';

function getApiOrigin(source: string): ApiOrigin {
  if (source === 'SEC EDGAR') return 'SEC EDGAR';
  if (source.toLowerCase().includes('yahoo')) return 'Yahoo Finance';
  return 'Finnhub';
}

const ORIGIN_STYLE: Record<ApiOrigin, string> = {
  'SEC EDGAR':     'bg-amber-900/50 text-amber-300',
  'Yahoo Finance': 'bg-purple-900/50 text-purple-300',
  'Finnhub':       'bg-blue-900/40 text-blue-300',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function NewsCard({ item }: { item: NewsItem }) {
  const sentimentColor =
    (item.sentimentScore ?? 0) > 0.2
      ? 'border-l-bull'
      : (item.sentimentScore ?? 0) < -0.2
      ? 'border-l-bear'
      : 'border-l-surface-border';

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex flex-col gap-1 p-3 rounded-md border border-surface-border border-l-2 ${sentimentColor}
        hover:bg-surface-border transition-colors group`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {/* Tier badge */}
        <span className="text-xs text-gray-500">T{item.tier}</span>
        {item.catalyst && (
          <span className={`pill text-xs ${CATALYST_COLORS[item.catalyst]}`}>
            {item.catalyst}
          </span>
        )}
        {item.tickers.map((t) => (
          <span key={t} className="pill bg-surface-border text-gray-300 text-xs">
            ${t}
          </span>
        ))}
        <span className="ml-auto text-xs text-gray-500">{timeAgo(item.publishedAt)}</span>
      </div>
      <p className="text-sm font-medium leading-snug group-hover:text-gray-100 text-gray-200">
        {item.headline}
      </p>
      <div className="flex items-center gap-1.5 mt-0.5">
        {/* API origin badge — tells you which feed this came from */}
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ORIGIN_STYLE[getApiOrigin(item.source)]}`}>
          {getApiOrigin(item.source)}
        </span>
        {/* Outlet name — the actual publisher within that feed */}
        {item.source !== 'SEC EDGAR' && item.source !== 'Yahoo Finance' && (
          <span className="text-xs text-gray-500 truncate">{item.source}</span>
        )}
        <ExternalLink size={10} className="text-gray-600 ml-auto shrink-0" />
      </div>
    </a>
  );
}

export default function Q2NewsFeed({ news, symbols, selectedSymbol, loading }: Props) {
  const [filterTicker, setFilterTicker] = useState<string | null>(null);
  const [brief, setBrief] = useState<NewsBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const briefAbort = useRef<AbortController | null>(null);
  const [insiderTrades, setInsiderTrades] = useState<InsiderTrade[]>([]);
  const [insiderExpanded, setInsiderExpanded] = useState(false);

  const activeTicker = filterTicker ?? selectedSymbol;

  // Fetch AI brief whenever the active ticker changes
  useEffect(() => {
    if (!activeTicker) { setBrief(null); return; }
    // Don't re-fetch if we already have a fresh brief for this symbol
    if (brief?.symbol === activeTicker) return;

    briefAbort.current?.abort();
    briefAbort.current = new AbortController();
    setBriefLoading(true);
    setBrief(null);

    fetchNewsBrief(activeTicker).then((res) => {
      if (!briefAbort.current?.signal.aborted && !res.error) {
        setBrief(res.data);
      }
      setBriefLoading(false);
    });

    return () => briefAbort.current?.abort();
  }, [activeTicker]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch insider trades when active ticker changes
  useEffect(() => {
    if (!activeTicker) { setInsiderTrades([]); return; }
    setInsiderExpanded(false);
    fetchInsiderTrades(activeTicker).then((res) => {
      if (!res.error) setInsiderTrades(res.data);
    });
  }, [activeTicker]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = activeTicker
    ? news.filter((n) => n.tickers.includes(activeTicker))
    : news;

  // Derive which upstream API sources contributed to the current view
  const activeOrigins = useMemo(() => {
    const origins = new Set<ApiOrigin>();
    filtered.forEach((n) => origins.add(getApiOrigin(n.source)));
    return origins;
  }, [filtered]);

  return (
    <section className="quadrant">
      <div className="quadrant-header">
        <div className="flex flex-col gap-0.5">
          <span className="quadrant-title">News</span>
          {/* Live source legend — updates as ticker filter changes */}
          {filtered.length > 0 && (
            <div className="flex items-center gap-1">
              {(['Finnhub', 'Yahoo Finance', 'SEC EDGAR'] as ApiOrigin[])
                .filter((o) => activeOrigins.has(o))
                .map((o) => (
                  <span key={o} className={`text-xs px-1.5 py-px rounded ${ORIGIN_STYLE[o]}`}>
                    {o}
                  </span>
                ))}
            </div>
          )}
        </div>
        <div className="flex gap-1 overflow-x-auto scrollbar-none flex-nowrap">
          <button
            onClick={() => setFilterTicker(null)}
            className={`shrink-0 text-xs px-2 py-0.5 rounded-full transition-colors
              ${activeTicker === null ? 'bg-accent text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            All
          </button>
          {symbols.map((s) => (
            <button
              key={s}
              onClick={() => setFilterTicker(s === filterTicker ? null : s)}
              className={`shrink-0 text-xs px-2 py-0.5 rounded-full transition-colors font-mono
                ${activeTicker === s ? 'bg-accent text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      {/* AI brief — shown when a ticker is selected */}
      {activeTicker && (briefLoading || brief) && (
        <div className="shrink-0 mx-2 mt-2 px-3 py-2.5 rounded-md border border-accent/25 bg-accent/8">
          {briefLoading ? (
            <div className="flex items-center gap-2 animate-pulse">
              <div className="h-3 w-3 rounded-full bg-accent/40 shrink-0" />
              <div className="h-3 w-48 rounded bg-accent/20" />
            </div>
          ) : brief ? (
            <p className="text-xs text-gray-300 leading-relaxed">{brief.brief}</p>
          ) : null}
        </div>
      )}

      {/* Insider trades — collapsible panel */}
      {activeTicker && insiderTrades.length > 0 && (
        <div className="shrink-0 mx-2 mt-1 rounded-md border border-yellow-500/20 bg-yellow-500/5">
          <button
            onClick={() => setInsiderExpanded((e) => !e)}
            className="w-full flex items-center justify-between px-3 py-2"
          >
            <span className="text-[10px] font-semibold text-yellow-500/70 uppercase tracking-wider">
              Insider Activity · last 30 days
              <span className="ml-1.5 font-normal text-yellow-500/50 normal-case">({insiderTrades.length})</span>
            </span>
            <ChevronDown
              size={11}
              className={`text-yellow-500/50 shrink-0 transition-transform ${insiderExpanded ? 'rotate-180' : ''}`}
            />
          </button>
          {insiderExpanded && (
            <div className="px-3 pb-2 flex flex-col gap-1">
              {insiderTrades.slice(0, 4).map((trade, i) => {
                const buys  = trade.transactions.filter((t) => t.type === 'buy');
                const sells = trade.transactions.filter((t) => t.type === 'sell');
                const totalBuy  = buys.reduce((s, t) => s + t.shares, 0);
                const totalSell = sells.reduce((s, t) => s + t.shares, 0);
                const isBuy = totalBuy > 0 && totalSell === 0;
                const isSell = totalSell > 0 && totalBuy === 0;
                const shares = isBuy ? totalBuy : totalSell;
                const price = (isBuy ? buys : sells)[0]?.price;
                return (
                  <div key={i} className="flex items-start gap-1.5 text-xs">
                    <span className={`shrink-0 font-bold ${isBuy ? 'text-green-400' : isSell ? 'text-red-400' : 'text-gray-400'}`}>
                      {isBuy ? '▲' : isSell ? '▼' : '●'}
                    </span>
                    <span className="text-gray-300 leading-snug">
                      <span className="font-medium">{trade.name}</span>
                      <span className="text-gray-500"> ({trade.role})</span>
                      {' — '}
                      <span className={isBuy ? 'text-green-400' : isSell ? 'text-red-400' : 'text-gray-400'}>
                        {isBuy ? 'Bought' : isSell ? 'Sold' : 'Mixed'} {shares.toLocaleString()} shares
                      </span>
                      {price ? <span className="text-gray-500"> @ ${price.toFixed(2)}</span> : null}
                      <span className="text-gray-600"> · {trade.filingDate}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {loading && news.length === 0 ? (
          // Prominent skeleton while first fetch is in flight
          <>
            <SkeletonCard wide />
            <SkeletonCard />
            <SkeletonCard wide />
            <SkeletonCard />
            <SkeletonCard wide />
          </>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            No news available
          </div>
        ) : (
          filtered.map((item) => <NewsCard key={item.id} item={item} />)
        )}
      </div>
    </section>
  );
}
