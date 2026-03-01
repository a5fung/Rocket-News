'use client';

import { Newspaper, TrendingUp } from 'lucide-react';
import type { MobileTab } from '@/components/dashboard/Dashboard';

interface Props {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
}

const TABS: { id: MobileTab; label: string; Icon: React.ElementType }[] = [
  { id: 'market',   label: 'Market',   Icon: TrendingUp },
  { id: 'research', label: 'Research', Icon: Newspaper  },
];

export default function MobileNav({ activeTab, onTabChange }: Props) {
  return (
    <nav className="shrink-0 flex border-t border-surface-border bg-surface-raised">
      {TABS.map(({ id, label, Icon }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 text-xs
              transition-colors ${active ? 'text-accent' : 'text-gray-500'}`}
          >
            <Icon size={20} strokeWidth={active ? 2.5 : 1.5} />
            <span className="font-medium">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
