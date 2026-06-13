import type { Metadata } from "next";
import { LiveslideLearnArticle } from "@/components/fnoninja/learn/FnoNinjaLearnArticles";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

export const metadata: Metadata = {
  title: "What is Liveslide",
  description:
    "An interactive guide to Liveslide on FNONINJA — explore a live, auto-cycling slideshow of aligned NSE F&O setups with charts, zones, and filters. Informational only.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/learn/liveslide` },
};

export default function LiveslideLearnPage() {
  return <LiveslideLearnArticle />;
}
