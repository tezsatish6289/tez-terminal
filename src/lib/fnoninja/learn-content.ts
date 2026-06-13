import type { LucideIcon } from "lucide-react";
import { BookOpen } from "lucide-react";

export type LearnArticleSlug = "science";

export type LearnArticleMeta = {
  slug: LearnArticleSlug;
  title: string;
  excerpt: string;
  readMinutes: number;
  /** Shown beside clock in article header (defaults to “{n} min read”). */
  readLabel?: string;
  tag: string;
  icon: LucideIcon;
  /** Optional hero/thumbnail under public/fnoninja/learn/ */
  thumbnailSrc?: string;
  thumbnailAccent: string;
};

export const LEARN_ARTICLES: LearnArticleMeta[] = [
  {
    slug: "science",
    title: "Mastering Option Zones: The Science Behind Put/Call Clusters, Max Pain & Expiry",
    excerpt:
      "Understand how Put Clusters act as support, Call Clusters as resistance, Max Pain influences price near expiry, and how hedging activity shapes NIFTY price action — with live charts and practical verification steps.",
    readMinutes: 5,
    readLabel: "5 min · scroll to explore",
    tag: "Foundations",
    icon: BookOpen,
    thumbnailSrc: "/fnoninja/learn/science-thumb.png",
    thumbnailAccent: "linear-gradient(135deg, rgba(34,197,94,0.35), rgba(251,191,36,0.2))",
  },
];

export function learnArticleBySlug(slug: string): LearnArticleMeta | undefined {
  return LEARN_ARTICLES.find((a) => a.slug === slug);
}
