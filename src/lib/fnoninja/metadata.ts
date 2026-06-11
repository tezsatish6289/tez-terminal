import type { Metadata } from "next";

export const FNONINJA_SITE_URL = "https://fnoninja.com";

export const FNONINJA_ICONS = {
  icon: "/fnoninja/icon.svg",
  apple: "/fnoninja/icon.svg",
} as const;

const DEFAULT_TITLE = "FNONINJA — Option-chain analytics for NSE F&O";
const DEFAULT_DESCRIPTION =
  "View option-interest concentrations, derived support and resistance observations, and price positioning across NSE F&O stocks and indices. Informational market data visualization only.";

/** Shared site metadata for all fnoninja.com pages (nav shell, favicon, OG). */
export const FNONINJA_SITE_METADATA: Metadata = {
  metadataBase: new URL(FNONINJA_SITE_URL),
  title: {
    template: "%s — FNONINJA",
    default: DEFAULT_TITLE,
  },
  description: DEFAULT_DESCRIPTION,
  icons: FNONINJA_ICONS,
  robots: { index: true, follow: true },
  openGraph: {
    siteName: "FNONINJA",
    type: "website",
    locale: "en_IN",
    images: [
      {
        url: "https://freedombot.ai/og.png",
        width: 1200,
        height: 630,
        alt: DEFAULT_TITLE,
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["https://freedombot.ai/og.png"],
  },
};
