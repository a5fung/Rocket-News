'use client';

import { ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CatalystTag, NewsItem } from '@/types';

interface Props {
  news: NewsItem[];
  symbols: string[];
  selectedSymbol: string | null;
  onSelectTicker: (symbol: string) => void;
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

export default function Q2NewsFeed({ news, symbols, selectedSymbol }: Props) {
  const [filterTicker, setFilterTicker] = useState<string | null>(null);

  const activeTicker = filterTicker ?? selectedSymbol;
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
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setFilterTicker(null)}
            className={`text-xs px-2 py-0.5 rounded-full transition-colors
              ${activeTicker === null ? 'bg-accent text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            All
          </button>
          {symbols.map((s) => (
            <button
              key={s}
              onClick={() => setFilterTicker(s === filterTicker ? null : s)}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors font-mono
                ${activeTicker === s ? 'bg-accent text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {filtered.length === 0 ? (
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
