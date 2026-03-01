'use client';

import { Send, Trash2, Key } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@/hooks/useChat';
import { getApiKey, setApiKey } from '@/lib/storage';
import type { DashboardContext, Ticker } from '@/types';

interface Props {
  getContext: () => DashboardContext;
  selectedSymbol: string | null;
  tickers: Ticker[];
}

function buildSuggestions(tickers: Ticker[], selectedSymbol: string | null): string[] {
  if (tickers.length === 0) {
    return [
      'What is moving my watchlist today?',
      'Summarize the latest news for my stocks.',
      'Which stock has the most bullish sentiment?',
      'Are there any earnings catalysts this week?',
    ];
  }

  const sorted = [...tickers].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
  const focus = selectedSymbol ?? sorted[0]?.symbol;
  const secondMover = sorted.find((t) => t.symbol !== focus)?.symbol;
  const symbols = tickers.map((t) => t.symbol);

  const suggestions: string[] = [];

  if (focus) {
    const dir = (tickers.find((t) => t.symbol === focus)?.changePercent ?? 0) >= 0 ? 'up' : 'down';
    suggestions.push(`Why is ${focus} ${dir} today?`);
    suggestions.push(`What are the key risks for ${focus} right now?`);
  }

  if (focus && secondMover) {
    suggestions.push(`Compare ${focus} vs ${secondMover} — which is the better trade?`);
  }

  if (symbols.length >= 2) {
    suggestions.push(`Which of my stocks has the strongest momentum right now?`);
  }

  suggestions.push(`Summarize today's news across my watchlist.`);
  suggestions.push(`Any earnings catalysts this week for ${symbols.slice(0, 3).join(', ')}?`);
  suggestions.push(`Which of my stocks has the most bullish sentiment?`);

  return suggestions.slice(0, 5);
}

function ApiKeySetup({ onSave }: { onSave: (key: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
      <Key size={32} className="text-accent" />
      <div>
        <p className="text-sm font-medium">Connect Gemini AI</p>
        <p className="text-xs text-gray-500 mt-1">
          Enter your Google AI Studio key. Free tier · stays in your browser only.
        </p>
      </div>
      <div className="flex gap-2 w-full max-w-sm">
        <input
          type="password"
          placeholder="AIzaSy..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 bg-surface border border-surface-border rounded-md px-3 py-2 text-sm
            focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-gray-600"
        />
        <button
          onClick={() => value && onSave(value)}
          disabled={!value}
          className="btn-primary"
        >
          Save
        </button>
      </div>
    </div>
  );
}

export default function Q3AIChat({ getContext, selectedSymbol, tickers }: Props) {
  const [apiKey, setKey] = useState('');
  const [inputText, setInputText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setKey(getApiKey());
  }, []);

  const { messages, loading, error, send, clear } = useChat(getContext);

  const suggestions = useMemo(
    () => buildSuggestions(tickers, selectedSymbol),
    [tickers, selectedSymbol],
  );

  const handleSave = useCallback((key: string) => {
    setApiKey(key);
    setKey(key);
  }, []);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || loading) return;
    setInputText('');
    await send(text);
  }, [inputText, loading, send]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!apiKey) {
    return (
      <section className="quadrant">
        <div className="quadrant-header">
          <span className="quadrant-title">AI Chat</span>
        </div>
        <ApiKeySetup onSave={handleSave} />
      </section>
    );
  }

  return (
    <section className="quadrant">
      <div className="quadrant-header">
        <span className="quadrant-title">
          AI Chat {selectedSymbol && <span className="text-accent">· ${selectedSymbol}</span>}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { clear(); setApiKey(''); setKey(''); }}
            className="btn-ghost p-1"
            title="Change API key"
          >
            <Key size={14} />
          </button>
          <button onClick={clear} className="btn-ghost p-1" title="Clear chat">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2 mt-2">
            <p className="text-xs text-gray-500 text-center">Suggested questions</p>
            {suggestions.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="text-left text-xs px-3 py-2 rounded-md border border-surface-border
                  text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col gap-1 max-w-[85%] ${
              msg.role === 'user' ? 'self-end items-end' : 'self-start items-start'
            }`}
          >
            <div
              className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-accent text-white'
                  : 'bg-surface border border-surface-border text-gray-200'
              }`}
            >
              {msg.content}
            </div>
            {msg.citedHeadlines && msg.citedHeadlines.length > 0 && (
              <div className="text-xs text-gray-600 px-1">
                Sources: {msg.citedHeadlines.slice(0, 2).join(' · ')}
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="self-start flex gap-1 px-3 py-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-500 animate-bounce" />
          </div>
        )}

        {error && (
          <p className="text-xs text-bear text-center">{error}</p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Bottom bar: chips (when chat active) + input */}
      <div className="shrink-0 border-t border-surface-border">
        {messages.length > 0 && (
          <div className="px-2 pt-1.5 pb-0 flex gap-1.5 overflow-x-auto scrollbar-none">
            {suggestions.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                disabled={loading}
                className="shrink-0 text-[10px] px-2 py-1 rounded-full border border-surface-border
                  text-gray-500 hover:text-gray-200 hover:border-gray-500 transition-colors
                  whitespace-nowrap disabled:opacity-40"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <div className="p-2 flex gap-2">
          <input
            type="text"
            placeholder="Ask about your watchlist…"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && void handleSend()}
            className="flex-1 bg-surface border border-surface-border rounded-md px-3 py-2 text-sm
              focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-gray-600"
          />
          <button
            onClick={() => void handleSend()}
            disabled={!inputText.trim() || loading}
            className="btn-primary"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}
