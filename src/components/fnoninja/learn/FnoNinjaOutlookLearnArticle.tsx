"use client";

import { usePathname } from "next/navigation";
import { FnoNinjaLearnArticleShell } from "@/components/fnoninja/learn/FnoNinjaLearnShell";
import { FnoNinjaOutlookScrollGuide } from "@/components/fnoninja/learn/FnoNinjaOutlookScrollGuide";
import { learnArticleBySlug } from "@/lib/fnoninja/learn-content";
import { fnoLearnHref } from "@/lib/fnoninja/paths";

const DISCLAIMER = [
  "Outlook shows derived option-chain data for NSE indices — not a price forecast. FNONINJA does not recommend trades or predict where any index will go.",
];

export function FnoNinjaOutlookLearnArticle() {
  const pathname = usePathname();
  const article = learnArticleBySlug("outlook")!;

  return (
    <FnoNinjaLearnArticleShell
      article={article}
      learnHubHref={fnoLearnHref(pathname)}
      disclaimerPlacement="top"
      disclaimerParagraphs={DISCLAIMER}
    >
      <FnoNinjaOutlookScrollGuide />
    </FnoNinjaLearnArticleShell>
  );
}
