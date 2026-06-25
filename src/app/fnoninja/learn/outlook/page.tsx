import type { Metadata } from "next";
import { FnoNinjaOutlookLearnArticle } from "@/components/fnoninja/learn/FnoNinjaOutlookLearnArticle";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

export const metadata: Metadata = {
  title: "Index Outlook: A Beginner's Guide to the Forward Levels Ladder",
  description:
    "Outlook maps support, resistance, and max pain across upcoming expiries for every NSE index — with a live NIFTY example, how to read the ladder, and what it does not predict.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/learn/outlook` },
};

export default function OutlookLearnPage() {
  return <FnoNinjaOutlookLearnArticle />;
}
