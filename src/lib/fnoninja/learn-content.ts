import type { LucideIcon } from "lucide-react";
import { ArrowUpDown, BookOpen, CalendarRange, LineChart, Sparkles } from "lucide-react";

export type LearnArticleSlug = "science" | "outlook" | "oi-delta" | "atlas" | "history";

export type LearnThumbnailVariant =
  | "default"
  | "outlook-live"
  | "oi-delta-live"
  | "atlas-live"
  | "history-live";

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
  /** `outlook-live` renders a live NIFTY Outlook ladder in the card header. */
  thumbnailVariant?: LearnThumbnailVariant;
};

export const LEARN_ARTICLES: LearnArticleMeta[] = [
  {
    slug: "history",
    title: "Index History: Validate Max Pain, OI Momentum & Dominance Over Time",
    excerpt:
      "Six months of daily put walls, call walls, and max pain on every NSE index — with line thickness for OI momentum, glow for put-vs-call dominance, and links to verify every pattern yourself on the History tab.",
    readMinutes: 6,
    readLabel: "6 min · live example",
    tag: "New feature",
    icon: LineChart,
    thumbnailAccent: "linear-gradient(135deg, rgba(34,197,94,0.28), rgba(59,130,246,0.25))",
    thumbnailVariant: "history-live",
  },
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
    thumbnailVariant: "outlook-live",
  },
  {
    slug: "oi-delta",
    title: "Change in OI at the Wall: What ▲ and ▼ Mean on Your Chart",
    excerpt:
      "A plain-English guide to open-interest change at put and call clusters — with a live NIFTY chart example, where to see ▲/▼, and how to use it without over-reading the signal.",
    readMinutes: 4,
    readLabel: "4 min · live example",
    tag: "New feature",
    icon: ArrowUpDown,
    thumbnailAccent: "linear-gradient(135deg, rgba(251,191,36,0.25), rgba(239,68,68,0.2))",
    thumbnailVariant: "oi-delta-live",
  },
  {
    slug: "atlas",
    title: "Atlas AI Coach: Hedged Ideas from the Chart You're Already On",
    excerpt:
      "Atlas turns zones, OI walls, and IV into defined-risk scenarios — or answers FAQ-only questions. Live NIFTY example, the three-request menu, and why strategies stay on the chart (not in this guide).",
    readMinutes: 5,
    readLabel: "5 min · live example",
    tag: "New feature",
    icon: Sparkles,
    thumbnailAccent: "linear-gradient(135deg, rgba(59,130,246,0.35), rgba(139,92,246,0.2))",
    thumbnailVariant: "atlas-live",
  },
];

export function learnArticleBySlug(slug: string): LearnArticleMeta | undefined {
  return LEARN_ARTICLES.find((a) => a.slug === slug);
}
