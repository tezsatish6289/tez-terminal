import type { Metadata } from "next";
import { FnoNinjaNav } from "@/components/fnoninja/FnoNinjaNav";
import { FB_PAGE_ROOT, FB_VIEWPORT_MAIN } from "@/lib/freedombot/responsive";
import { FNO_BG, FNO_TEXT } from "@/lib/fnoninja/theme";

export const metadata: Metadata = {
  metadataBase: new URL("https://fnoninja.com"),
  title: "FNONINJA — Option-chain analytics for NSE F&O",
  description:
    "View option-interest concentrations, derived support and resistance observations, and price positioning across NSE F&O stocks and indices. Informational market data visualization only.",
  icons: {
    icon: "/fnoninja/icon.svg",
    apple: "/fnoninja/icon.svg",
  },
  robots: { index: true, follow: true },
  alternates: { canonical: "https://fnoninja.com" },
  openGraph: {
    title: "FNONINJA — Option-chain analytics for NSE F&O",
    description:
      "Option-chain derived market structure across NSE F&O — maps, zone views, and symbol analytics for independent research.",
    url: "https://fnoninja.com",
    siteName: "FNONINJA",
    type: "website",
    locale: "en_IN",
    images: [
      {
        url: "https://freedombot.ai/og.png",
        width: 1200,
        height: 630,
        alt: "FNONINJA — Option-chain analytics for NSE F&O",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FNONINJA — Option-chain analytics for NSE F&O",
    description:
      "Option-chain derived market structure across NSE F&O — maps, zone views, and symbol analytics.",
    images: ["https://freedombot.ai/og.png"],
  },
};

export default function FnoNinjaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={FB_PAGE_ROOT} style={{ backgroundColor: FNO_BG, color: FNO_TEXT }}>
      <FnoNinjaNav />
      <div className={FB_VIEWPORT_MAIN}>{children}</div>
    </div>
  );
}
