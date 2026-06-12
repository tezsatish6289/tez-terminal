import type { Metadata } from "next";
import { LiveslideLearnArticle } from "@/components/fnoninja/learn/FnoNinjaLearnArticles";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

export const metadata: Metadata = {
  title: "What is Liveslide",
  description:
    "Step-by-step guide to Liveslide on FNONINJA — cycle aligned market setups with charts and news. Informational only.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/learn/liveslide` },
};

export default function LiveslideLearnPage() {
  return <LiveslideLearnArticle />;
}
