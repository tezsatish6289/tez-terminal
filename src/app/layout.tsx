
import type {Metadata, Viewport} from 'next';
import './globals.css';
import { FirebaseClientProvider } from '@/firebase';
import { Toaster } from "@/components/ui/toaster";
import { ReferralTracker } from "@/components/ReferralTracker";
import { NOINDEX_ROBOTS } from '@/lib/seo/constants';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'TezTerminal',
  description: 'Internal trading operations tool.',
  robots: NOINDEX_ROBOTS,
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
  metadataBase: new URL('https://tezterminal.com'),
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
          <ReferralTracker />
          {children}
          <Toaster />
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
