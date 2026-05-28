import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  FREEDOMBOT_ORGANIZATION_JSON_LD,
  FREEDOMBOT_WEBSITE_JSON_LD,
} from "@/lib/seo/constants";
import { FreedomBotNav } from "./components/FreedomBotNav";

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
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "FreedomBot.ai — Trade with full transparency and control",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FreedomBot.ai — Trade with full transparency and control",
    description:
      "Every trade recorded on-chain. Deploy on Bybit in under 5 minutes. No upfront fees.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://freedombot.ai",
  },
};

export default function FreedomBotLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <JsonLd data={[FREEDOMBOT_ORGANIZATION_JSON_LD, FREEDOMBOT_WEBSITE_JSON_LD]} />
      <FreedomBotNav />
      {children}
    </>
  );
}
