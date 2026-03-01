import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rocket News',
  description: 'Stock news & sentiment dashboard for your watchlist',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-surface text-gray-100">{children}</body>
    </html>
  );
}
