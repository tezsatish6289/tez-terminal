import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  FREEDOMBOT_ORGANIZATION_JSON_LD,
  FREEDOMBOT_WEBSITE_JSON_LD,
} from "@/lib/seo/constants";
import { FreedomBotNav } from "./components/FreedomBotNav";
import { FB_PAGE_ROOT, FB_VIEWPORT_MAIN } from "@/lib/freedombot/responsive";

export const metadata: Metadata = {
  metadataBase: new URL("https://freedombot.ai"),
  title: "FreedomBot.ai — Trade with full transparency and control",
  description:
    "FreedomBot is an algorithmic trading system where every trade is recorded on-chain. Deploy on Bybit in under 5 minutes. No upfront fees.",
  icons: {
    icon: "/freedombot/icon.png",
    apple: "/freedombot/icon.png",
  },
  openGraph: {
    title: "FreedomBot.ai — Trade with full transparency and control",
    description:
      "Every trade recorded on-chain. Deploy on Bybit in under 5 minutes. No upfront fees.",
    url: "https://freedombot.ai",
    siteName: "FreedomBot.ai",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "https://freedombot.ai/og.png",
        width: 1200,
        height: 630,
        alt: "FreedomBot.ai — Trade with full transparency and control",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FreedomBot.ai — Trade with full transparency and control",
    description:
      "Every trade recorded on-chain. Deploy on Bybit in under 5 minutes. No upfront fees.",
    images: ["https://freedombot.ai/og.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  keywords: [
    "FreedomBot",
    "crypto trading bot",
    "on-chain trading",
    "Bybit bot",
    "algorithmic trading",
    "verifiable trades",
    "Solana trade records",
  ],
  alternates: {
    canonical: "https://freedombot.ai",
  },
  other: {
    "og:image:secure_url": "https://freedombot.ai/og.png",
  },
};

export default function FreedomBotLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={FB_PAGE_ROOT} style={{ backgroundColor: "#080f1e", color: "#f0f4ff" }}>
      <JsonLd data={[FREEDOMBOT_ORGANIZATION_JSON_LD, FREEDOMBOT_WEBSITE_JSON_LD]} />
      <FreedomBotNav />
      <div className={FB_VIEWPORT_MAIN}>{children}</div>
    </div>
  );
}
