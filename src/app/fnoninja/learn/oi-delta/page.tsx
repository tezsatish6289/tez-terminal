import type { Metadata } from "next";
import { FnoNinjaOiDeltaLearnArticle } from "@/components/fnoninja/learn/FnoNinjaOiDeltaLearnArticle";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

export const metadata: Metadata = {
  title: "Change in OI at the Wall: What ▲ and ▼ Mean on Your Chart",
  description:
    "A plain-English guide to open-interest change at put and call clusters — with a live NIFTY chart example, where to see ▲/▼, and how to use it without over-reading the signal.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/learn/oi-delta` },
};

export default function OiDeltaLearnPage() {
  return <FnoNinjaOiDeltaLearnArticle />;
}
