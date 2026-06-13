import type { Metadata } from "next";
import { ScienceLearnArticle } from "@/components/fnoninja/learn/FnoNinjaLearnArticles";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

export const metadata: Metadata = {
  title: "Mastering Option Zones: The Science Behind Put/Call Clusters, Max Pain & Expiry",
  description:
    "Understand how Put Clusters act as support, Call Clusters as resistance, Max Pain influences price near expiry, and how hedging activity shapes NIFTY price action — with live charts and practical verification steps.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/learn/science` },
};

export default function ScienceLearnPage() {
  return <ScienceLearnArticle />;
}
