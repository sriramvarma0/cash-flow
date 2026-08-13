import type { Metadata, Viewport } from 'next';
import { Manrope, Space_Grotesk } from 'next/font/google';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display'
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-body'
});

export const metadata: Metadata = {
  title: 'CashFlow',
  description: 'Personal finance dashboard for tracking expenses and cash flow.',
  manifest: '/manifest.webmanifest',
  applicationName: 'CashFlow'
};

export const viewport: Viewport = {
  themeColor: '#0d533c',
  colorScheme: 'light'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${spaceGrotesk.variable} ${manrope.variable} bg-ink-50 text-ink-900 antialiased`}>
        {children}
      </body>
    </html>
  );
}
