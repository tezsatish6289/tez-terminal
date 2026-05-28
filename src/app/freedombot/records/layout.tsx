import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";

export const metadata: Metadata = {
  title: "On-Chain Trade Records — FreedomBot.ai",
  description:
    "Verify every FreedomBot trade on-chain. Public ledger of entries, exits, and realized PnL — auditable by anyone, anytime.",
  alternates: { canonical: "https://freedombot.ai/records" },
  openGraph: {
    title: "On-Chain Trade Records — FreedomBot.ai",
    description:
      "Public, immutable trade history recorded on Solana. Independent verification for algorithmic crypto bots.",
    url: "https://freedombot.ai/records",
  },
};

const RECORDS_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "FreedomBot On-Chain Trade Records",
  url: "https://freedombot.ai/records",
  description:
    "Public verifiable trade ledger for FreedomBot algorithmic strategies, with on-chain proof of entries and exits.",
  isPartOf: { "@type": "WebSite", name: "FreedomBot.ai", url: "https://freedombot.ai" },
};

export default function RecordsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={RECORDS_JSON_LD} />
      <p className="sr-only">
        FreedomBot publishes algorithmic crypto trades to an on-chain ledger so results can be verified
        independently. This page shows live and historical trades with Solana transaction links.
      </p>
      {children}
    </>
  );
}
