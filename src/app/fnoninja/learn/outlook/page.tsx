import type { Metadata } from "next";
import { FnoNinjaOutlookLearnArticle } from "@/components/fnoninja/learn/FnoNinjaOutlookLearnArticle";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

export const metadata: Metadata = {
  title: "Nifty Outlook: A Beginner's Guide to the Forward Levels Ladder",
  description:
    "Learn how Outlook maps support, resistance, and max pain across upcoming expiries — what the ladder shows, how to read it, and what it does not predict.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/learn/outlook` },
};

export default function OutlookLearnPage() {
  return <FnoNinjaOutlookLearnArticle />;
}
