'use client';

import { BriefcaseBusiness } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PortfolioPosition, Ticker } from '@/types';

interface Props {
  symbols: string[];
  tickers: Ticker[];
  positions: Record<string, PortfolioPosition>;
  onSet: (symbol: string, pos: PortfolioPosition) => void;
  onClear: (symbol: string) => void;
}

function formatPnl(pnl: number): string {
  const sign = pnl >= 0 ? '+' : '-';
  const abs = Math.abs(pnl);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(2)}`;
}

export default function PortfolioManager({ symbols, tickers, positions, onSet, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const priceMap = new Map(tickers.map((t) => [t.symbol, t.price]));

  // Editable draft state per symbol — reset when panel opens
  const [drafts, setDrafts] = useState<Record<string, { shares: string; cost: string }>>({});

  useEffect(() => {
    if (!open) return;
    const init: Record<string, { shares: string; cost: string }> = {};
    for (const sym of symbols) {
      const pos = positions[sym];
      init[sym] = pos
        ? { shares: String(pos.shares), cost: String(pos.costBasis) }
        : { shares: '', cost: '' };
    }
    setDrafts(init);
  }, [open, symbols, positions]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function commit(sym: string) {
    const d = drafts[sym];
    if (!d) return;
    const shares = parseFloat(d.shares);
    const cost = parseFloat(d.cost);
    if (!isNaN(shares) && shares > 0 && !isNaN(cost) && cost > 0) {
      onSet(sym, { shares, costBasis: cost });
    } else if (d.shares === '' && d.cost === '') {
      onClear(sym);
    }
  }

  const hasPositions = Object.keys(positions).length > 0;

  const totalPnl = symbols.reduce((sum, sym) => {
    const pos = positions[sym];
    const price = priceMap.get(sym) ?? 0;
    return pos && price ? sum + (price - pos.costBasis) * pos.shares : sum;
  }, 0);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost p-1.5 relative"
        title="Portfolio P&L"
      >
        <BriefcaseBusiness size={16} className={hasPositions ? 'text-gray-400' : 'text-gray-600'} />
        {hasPositions && (
          <span
            className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
              totalPnl >= 0 ? 'bg-bull' : 'bg-bear'
            }`}
          />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[22rem] bg-surface-raised border border-surface-border
          rounded-lg shadow-xl z-50 text-sm">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
            <span className="font-semibold text-white flex items-center gap-2">
              <BriefcaseBusiness size={14} />
              Portfolio P&L
            </span>
            {hasPositions && (
              <span className={`text-xs font-mono font-bold ${totalPnl >= 0 ? 'text-bull' : 'text-bear'}`}>
                {formatPnl(totalPnl)} total
              </span>
            )}
          </div>

          <div className="p-3 flex flex-col gap-2">
            {/* Column headers */}
            <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 px-1
              text-[10px] uppercase tracking-wider text-gray-600">
              <span>Symbol</span>
              <span>Shares</span>
              <span>Avg Cost</span>
              <span className="text-right">P&L</span>
            </div>

            {symbols.map((sym) => {
              const draft = drafts[sym] ?? { shares: '', cost: '' };
              const price = priceMap.get(sym) ?? 0;
              const pos = positions[sym];
              const pnl = pos && price ? (price - pos.costBasis) * pos.shares : null;

              return (
                <div key={sym} className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 items-center">
                  <span className="font-mono font-bold text-white text-xs">{sym}</span>

                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={draft.shares}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [sym]: { ...d[sym], shares: e.target.value } }))
                    }
                    onBlur={() => commit(sym)}
                    className="bg-surface border border-surface-border rounded px-1.5 py-1 text-xs
                      font-mono focus:outline-none focus:ring-1 focus:ring-accent w-full"
                  />

                  <div className="relative">
                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-500 text-[10px] pointer-events-none">
                      $
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={draft.cost}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [sym]: { ...d[sym], cost: e.target.value } }))
                      }
                      onBlur={() => commit(sym)}
                      className="bg-surface border border-surface-border rounded pl-4 pr-1 py-1 text-xs
                        font-mono focus:outline-none focus:ring-1 focus:ring-accent w-full"
                    />
                  </div>

                  <span
                    className={`text-xs font-mono text-right ${
                      pnl === null
                        ? 'text-gray-600'
                        : pnl >= 0
                          ? 'text-bull'
                          : 'text-bear'
                    }`}
                  >
                    {pnl === null ? '—' : formatPnl(pnl)}
                  </span>
                </div>
              );
            })}

            <p className="text-[10px] text-gray-600 mt-1 text-center leading-relaxed">
              Tab or click away to save · Clear both fields to remove position
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
