import type { LucideIcon } from "lucide-react";
import { BookOpen, Layers, PlayCircle, Star } from "lucide-react";

export type LearnArticleSlug = "science" | "liveslide" | "favslide";

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
    slug: "liveslide",
    title: "What is Liveslide and how to use it",
    excerpt:
      "Open Liveslide on the market map and tap the help icon next to Learn for an in-app intro and guided tour.",
    readMinutes: 5,
    tag: "Product guide",
    icon: PlayCircle,
    thumbnailSrc: "/fnoninja/learn/liveslide-thumb.png",
    thumbnailAccent: "linear-gradient(135deg, rgba(37,99,235,0.45), rgba(96,165,250,0.15))",
  },
  {
    slug: "favslide",
    title: "What is Favslide and how to use it",
    excerpt:
      "Build a personal watchlist from any symbol chart, cycle your favourites, and use it to monitor positions you are already running.",
    readMinutes: 6,
    tag: "Product guide",
    icon: Star,
    thumbnailSrc: "/fnoninja/learn/favslide-thumb.png",
    thumbnailAccent: "linear-gradient(135deg, rgba(251,191,36,0.35), rgba(37,99,235,0.2))",
  },
];

export function learnArticleBySlug(slug: string): LearnArticleMeta | undefined {
  return LEARN_ARTICLES.find((a) => a.slug === slug);
}
