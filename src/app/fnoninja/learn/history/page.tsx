import type { Metadata } from "next";
import { FnoNinjaHistoryLearnArticle } from "@/components/fnoninja/learn/FnoNinjaHistoryLearnArticle";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

export const metadata: Metadata = {
  title: "Index History: Validate Max Pain, OI Momentum & Dominance Over Time",
  description:
    "Six months of daily put walls, call walls, and max pain on every NSE index — line thickness for OI momentum, glow for put-vs-call dominance, and links to verify patterns on the History tab.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/learn/history` },
};

export default function HistoryLearnPage() {
  return <FnoNinjaHistoryLearnArticle />;
}
