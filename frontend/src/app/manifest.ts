import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CashFlow',
    short_name: 'CashFlow',
    description: 'Finance tracking app for expenses, budgets, and dashboards.',
    start_url: '/expenses?mode=pwa',
    display: 'standalone',
    background_color: '#f4f7f7',
    theme_color: '#0d533c',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml'
      }
    ]
  };
}
