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
    title: "The Science Behind the Zones",
    excerpt:
      "Put Clusters, Call Clusters, Max Pain, and Expiry — scroll through each concept with a live NIFTY zone ladder you can cross-check on NSE.",
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
      "Cycle through market setups that are aligned right now — filters, auto-advance, charts, and news in one view.",
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
