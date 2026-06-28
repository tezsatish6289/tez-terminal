"use client";

import { usePathname } from "next/navigation";
import { FnoNinjaLearnArticleShell } from "@/components/fnoninja/learn/FnoNinjaLearnShell";
import { FnoNinjaHistoryScrollGuide } from "@/components/fnoninja/learn/FnoNinjaHistoryScrollGuide";
import { learnArticleBySlug } from "@/lib/fnoninja/learn-content";
import { fnoLearnHref } from "@/lib/fnoninja/paths";

export function FnoNinjaHistoryLearnArticle() {
  const pathname = usePathname();
  const article = learnArticleBySlug("history")!;

  return (
    <FnoNinjaLearnArticleShell
      article={article}
      learnHubHref={fnoLearnHref(pathname)}
      shell="wide"
      disclaimerPlacement="top"
    >
      <FnoNinjaHistoryScrollGuide />
    </FnoNinjaLearnArticleShell>
  );
}
