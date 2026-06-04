/**
 * Shared types for levels news API responses (safe for client components).
 */

export type LevelsNewsScope = "stock" | "index";

/** Default lookback: 4 weeks of news. */
export const LEVELS_NEWS_WINDOW_DAYS = 28;
export const NEWS_WINDOWS = [LEVELS_NEWS_WINDOW_DAYS] as const;
export type NewsWindow = (typeof NEWS_WINDOWS)[number];

/** AI-assessed tone from grounded headlines (not a trading signal). */
export type NewsSentimentLabel = "bullish" | "neutral" | "bearish";

export interface NewsSentiment {
  label: NewsSentimentLabel;
  /** 0 = very bearish, 50 = mixed, 100 = very bullish. */
  score: number;
  /** One-line rationale shown beside the badge. */
  note: string;
}

/** Label thresholds paired with the prompt rubric. */
export const SENTIMENT_LABEL_THRESHOLDS = {
  bullishMin: 65,
  bearishMax: 40,
} as const;

export function clampSentimentScore(raw: number): number {
  if (!Number.isFinite(raw)) return 50;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

export function sentimentLabelFromScore(score: number): NewsSentimentLabel {
  if (score >= SENTIMENT_LABEL_THRESHOLDS.bullishMin) return "bullish";
  if (score <= SENTIMENT_LABEL_THRESHOLDS.bearishMax) return "bearish";
  return "neutral";
}

export interface NewsCitation {
  title: string;
  url: string;
}

export interface LevelsNews {
  scope: LevelsNewsScope;
  symbol: string;
  /** Company / index display name used in the query. */
  name: string;
  window: NewsWindow;
  summary: string;
  highlights: string[];
  citations: NewsCitation[];
  sentiment?: NewsSentiment;
  generatedAt: string;
  /** True when served from cache past the soft-fresh window. */
  stale?: boolean;
}
