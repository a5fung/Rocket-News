import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Rocket News',
    short_name: 'Rocket News',
    description: 'Stock news & sentiment dashboard for your watchlist',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f1117',
    theme_color: '#0f1117',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
