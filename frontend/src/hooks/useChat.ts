'use client';

import { useCallback, useState } from 'react';
import { sendChatMessage } from '@/lib/api';
import type { ChatMessage, DashboardContext } from '@/types';

export function useChat(getContext: () => DashboardContext) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (userText: string) => {
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: userText,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      setError(null);

      const context = getContext();
      const result = await sendChatMessage([...messages, userMsg], context);
      setLoading(false);

      if (result.error) {
        setError(result.error.detail);
        return;
      }

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.data.reply,
        citedHeadlines: result.data.citedHeadlines,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    },
    [messages, getContext],
  );

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, loading, error, send, clear };
}
