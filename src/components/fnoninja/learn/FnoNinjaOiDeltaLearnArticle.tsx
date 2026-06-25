"use client";

import { usePathname } from "next/navigation";
import { FnoNinjaLearnArticleShell } from "@/components/fnoninja/learn/FnoNinjaLearnShell";
import { FnoNinjaOiDeltaScrollGuide } from "@/components/fnoninja/learn/FnoNinjaOiDeltaScrollGuide";
import { learnArticleBySlug } from "@/lib/fnoninja/learn-content";
import { fnoLearnHref } from "@/lib/fnoninja/paths";

const DISCLAIMER = [
  "Change in OI is positioning context from NSE option-chain data — not a buy or sell signal. FNONINJA does not recommend trades.",
];

export function FnoNinjaOiDeltaLearnArticle() {
  const pathname = usePathname();
  const article = learnArticleBySlug("oi-delta")!;

  return (
    <FnoNinjaLearnArticleShell
      article={article}
      learnHubHref={fnoLearnHref(pathname)}
      disclaimerPlacement="top"
      disclaimerParagraphs={DISCLAIMER}
    >
      <FnoNinjaOiDeltaScrollGuide />
    </FnoNinjaLearnArticleShell>
  );
}
