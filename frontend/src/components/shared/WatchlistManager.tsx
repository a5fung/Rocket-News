'use client';

import { Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';

interface Props {
  symbols: string[];
  onAdd: (symbol: string) => void;
  onRemove: (symbol: string) => void;
}

export default function WatchlistManager({ symbols, onAdd, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function handleAdd() {
    const sym = input.trim().toUpperCase();
    if (!sym) return;
    onAdd(sym);
    setInput('');
    inputRef.current?.focus();
  }

  return (
    <div className="relative flex items-center gap-2">
      {/* Chip list */}
      <div className="hidden sm:flex items-center gap-1 flex-wrap max-w-xs">
        {symbols.map((s) => (
          <span
            key={s}
            className="flex items-center gap-1 pill bg-surface-border text-gray-300 font-mono"
          >
            {s}
            <button
              onClick={() => onRemove(s)}
              className="text-gray-500 hover:text-bear transition-colors"
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>

      {/* Add button */}
      <button
        onClick={() => { setOpen((o) => !o); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="btn-ghost"
      >
        <Plus size={14} />
        <span className="text-xs">Add</span>
      </button>

      {/* Dropdown input */}
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-surface-raised border border-surface-border
          rounded-lg p-3 flex flex-col gap-2 shadow-xl min-w-[220px]">
          <p className="text-xs text-gray-500">Add ticker to watchlist</p>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              placeholder="AAPL"
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') setOpen(false);
              }}
              maxLength={10}
              className="flex-1 bg-surface border border-surface-border rounded px-2 py-1.5 text-sm
                font-mono focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-gray-600"
            />
            <button onClick={handleAdd} className="btn-primary">Add</button>
          </div>
          {/* Mobile chips */}
          <div className="sm:hidden flex flex-wrap gap-1 mt-1">
            {symbols.map((s) => (
              <span key={s} className="flex items-center gap-1 pill bg-surface-border text-gray-300 font-mono">
                {s}
                <button onClick={() => onRemove(s)} className="text-gray-500 hover:text-bear">
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
