import type { Metadata } from "next";
import { FnoNinjaAtlasLearnArticle } from "@/components/fnoninja/learn/FnoNinjaAtlasLearnArticle";
import { FNONINJA_SITE_URL } from "@/lib/fnoninja/metadata";

export const metadata: Metadata = {
  title: "Atlas AI Coach: Hedged Strategy Ideas from Your Chart",
  description:
    "A plain-English guide to Atlas AI coach — the three requests (options, futures, FAQ), how it uses live zones and OI walls, with a live NIFTY chart example. Educational only, not investment advice.",
  alternates: { canonical: `${FNONINJA_SITE_URL}/learn/atlas` },
};

export default function AtlasLearnPage() {
  return <FnoNinjaAtlasLearnArticle />;
}
