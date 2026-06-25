"use client";

import { usePathname } from "next/navigation";
import { FnoNinjaLearnArticleShell } from "@/components/fnoninja/learn/FnoNinjaLearnShell";
import { FnoNinjaAtlasScrollGuide } from "@/components/fnoninja/learn/FnoNinjaAtlasScrollGuide";
import { learnArticleBySlug } from "@/lib/fnoninja/learn-content";
import { fnoLearnHref } from "@/lib/fnoninja/paths";

const DISCLAIMER = [
  "Atlas is an educational research assistant — not investment advice. FNONINJA does not recommend trades. Hedged strategy scenarios are generated on demand on the chart; this guide shows layout and live levels only.",
];

export function FnoNinjaAtlasLearnArticle() {
  const pathname = usePathname();
  const article = learnArticleBySlug("atlas")!;

  return (
    <FnoNinjaLearnArticleShell
      article={article}
      learnHubHref={fnoLearnHref(pathname)}
      disclaimerPlacement="top"
      disclaimerParagraphs={DISCLAIMER}
    >
      <FnoNinjaAtlasScrollGuide />
    </FnoNinjaLearnArticleShell>
  );
}
