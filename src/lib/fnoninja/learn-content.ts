import type { LucideIcon } from "lucide-react";
import { ArrowUpDown, BookOpen, CalendarRange } from "lucide-react";

export type LearnArticleSlug = "science" | "outlook" | "oi-delta";

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
  {
    slug: "outlook",
    title: "Index Outlook: A Beginner's Guide to the Forward Levels Ladder",
    excerpt:
      "Outlook maps support, resistance, and max pain across upcoming expiries for every NSE index — with a live NIFTY example, how to read the ladder, and what it does not predict.",
    readMinutes: 5,
    readLabel: "5 min · live example",
    tag: "New feature",
    icon: CalendarRange,
    thumbnailAccent: "linear-gradient(135deg, rgba(59,130,246,0.35), rgba(34,197,94,0.2))",
  },
  {
    slug: "oi-delta",
    title: "Change in OI at the Wall: What ▲ and ▼ Mean on Your Chart",
    excerpt:
      "A plain-English guide to open-interest change at put and call clusters — building vs unwinding, where to see it, and how to use it without over-reading the signal.",
    readMinutes: 4,
    tag: "New feature",
    icon: ArrowUpDown,
    thumbnailAccent: "linear-gradient(135deg, rgba(251,191,36,0.25), rgba(239,68,68,0.2))",
  },
];

export function learnArticleBySlug(slug: string): LearnArticleMeta | undefined {
  return LEARN_ARTICLES.find((a) => a.slug === slug);
}
