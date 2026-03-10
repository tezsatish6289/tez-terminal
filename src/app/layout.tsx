
import type {Metadata, Viewport} from 'next';
import './globals.css';
import { FirebaseClientProvider } from '@/firebase';
import { Toaster } from "@/components/ui/toaster";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'TezTerminal — Super Advanced AI Crypto Trading Terminal',
  description:
    'TezTerminal is a super advanced AI-powered crypto trading terminal that scans the global market 24/7 across 4 timeframes, filters noise with proprietary algorithms, and delivers high-probability trade setups with built-in risk management. Free to use.',
  keywords: [
    'crypto trading signals',
    'AI trading terminal',
    'crypto scanner',
    'advanced trading terminal',
    'TradingView signals',
    'Binance trading',
    'MEXC trading',
    'Pionex trading',
    'crypto scalping',
    'swing trading crypto',
    'AI crypto signals',
    'automated trading signals',
  ],
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
  openGraph: {
    title: 'TezTerminal — Super Advanced AI Crypto Trading Terminal',
    description:
      'A super advanced AI-powered terminal that scans the global crypto market 24/7, filters noise, and delivers high-probability trade setups — so you can focus on stacking gains.',
    url: 'https://tezterminal.com',
    siteName: 'TezTerminal',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TezTerminal — Super Advanced AI Crypto Trading Terminal',
    description:
      'A super advanced AI-powered terminal that scans the global crypto market 24/7, filters noise, and delivers high-probability trade setups.',
  },
  metadataBase: new URL('https://tezterminal.com'),
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased selection:bg-accent/30 selection:text-accent">
        <FirebaseClientProvider>
          {children}
          <Toaster />
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
