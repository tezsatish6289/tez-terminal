"use client";

import { usePathname } from "next/navigation";
import { SCIENCE_LEARN_DISCLAIMER } from "@/components/fnoninja/learn/FnoNinjaLearnDisclaimer";
import { FnoNinjaScienceScrollGuide } from "@/components/fnoninja/learn/FnoNinjaScienceScrollGuide";
import { FnoNinjaLearnArticleShell } from "@/components/fnoninja/learn/FnoNinjaLearnShell";
import { learnArticleBySlug } from "@/lib/fnoninja/learn-content";
import { fnoLearnHref } from "@/lib/fnoninja/paths";

function useLearnShell() {
  const pathname = usePathname();
  const article = learnArticleBySlug("science")!;
  const learnHubHref = fnoLearnHref(pathname);
  return { article, learnHubHref };
}

export function ScienceLearnArticle() {
  const { article, learnHubHref } = useLearnShell();

  return (
    <FnoNinjaLearnArticleShell
      article={article}
      learnHubHref={learnHubHref}
      disclaimerPlacement="bottom"
      disclaimerParagraphs={SCIENCE_LEARN_DISCLAIMER}
    >
      <FnoNinjaScienceScrollGuide />
    </FnoNinjaLearnArticleShell>
  );
}
