'use client';

import { Bell, BellOff, CheckCircle, XCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAlertStatus, sendTestAlert } from '@/lib/api';

interface AlertStatus {
  configured: boolean;
  symbols: string[];
  priceThresholdPct: number;
}

interface Props {
  symbols: string[]; // current watchlist — shown in panel
}

export default function AlertsButton({ symbols }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<AlertStatus | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch status when panel opens
  useEffect(() => {
    if (!open) return;
    setTestResult(null);
    fetchAlertStatus().then((r) => {
      if (!r.error) setStatus(r.data);
    });
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    const result = await sendTestAlert();
    setTesting(false);
    if (result.error) {
      setTestResult('error:' + result.error.detail);
    } else {
      setTestResult(result.data.ok ? 'ok' : 'error:' + (result.data.error ?? 'Unknown error'));
    }
  }, []);

  const isConfigured = status?.configured ?? false;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost p-1.5 relative"
        title="Telegram Alerts"
      >
        {isConfigured
          ? <Bell size={16} className="text-gray-400" />
          : <BellOff size={16} className="text-gray-600" />
        }
        {/* Active indicator dot */}
        {isConfigured && (
          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-green-400" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-surface-raised border border-surface-border
          rounded-lg shadow-xl z-50 text-sm">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
            <span className="font-semibold text-white flex items-center gap-2">
              <Bell size={14} />
              Telegram Alerts
            </span>
            {status && (
              <span className={`flex items-center gap-1 text-xs ${isConfigured ? 'text-green-400' : 'text-gray-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isConfigured ? 'bg-green-400' : 'bg-gray-500'}`} />
                {isConfigured ? 'Active' : 'Not configured'}
              </span>
            )}
          </div>

          <div className="p-4 flex flex-col gap-4">
            {!isConfigured ? (
              /* ── Setup instructions ── */
              <div className="flex flex-col gap-3">
                <p className="text-gray-400 text-xs leading-relaxed">
                  Get instant price, news, and earnings alerts on Telegram. Set up in 3 steps:
                </p>

                <ol className="flex flex-col gap-2 text-xs text-gray-400">
                  <li className="flex gap-2">
                    <span className="text-accent font-bold shrink-0">1.</span>
                    <span>Message <span className="text-white font-mono">@BotFather</span> on Telegram → send <span className="text-white font-mono">/newbot</span> → copy the token</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-accent font-bold shrink-0">2.</span>
                    <span>Message your new bot once, then visit <span className="text-white font-mono">api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</span> to find your <span className="text-white font-mono">chat_id</span></span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-accent font-bold shrink-0">3.</span>
                    <span>Add to <span className="text-white font-mono">backend/.env</span> and restart:</span>
                  </li>
                </ol>

                <pre className="bg-surface text-xs text-green-400 font-mono rounded p-2 leading-relaxed overflow-x-auto">
{`TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id
ALERT_PRICE_PCT=5.0`}
                </pre>
              </div>
            ) : (
              /* ── Active status ── */
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1 text-xs text-gray-400">
                  <div className="flex justify-between">
                    <span>Watching</span>
                    <span className="text-white">{symbols.length} stocks</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Price alert threshold</span>
                    <span className="text-white">±{status?.priceThresholdPct ?? 5}%</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Alert types</p>
                  {[
                    `Price move ±${status?.priceThresholdPct ?? 5}%+`,
                    'Tier 1 news (SEC, wire services)',
                    'Earnings today or tomorrow',
                  ].map((t) => (
                    <div key={t} className="flex items-center gap-1.5 text-xs text-gray-400">
                      <span className="w-1 h-1 rounded-full bg-accent shrink-0" />
                      {t}
                    </div>
                  ))}
                </div>

                {/* Test button */}
                <button
                  onClick={() => void handleTest()}
                  disabled={testing}
                  className="btn-primary text-xs py-1.5 disabled:opacity-50"
                >
                  {testing ? 'Sending…' : 'Send Test Message'}
                </button>

                {testResult && (
                  <div className={`flex items-center gap-1.5 text-xs ${testResult === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                    {testResult === 'ok'
                      ? <><CheckCircle size={12} /> Message sent!</>
                      : <><XCircle size={12} /> {testResult.replace('error:', '')}</>
                    }
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
