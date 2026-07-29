import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";

/** User-selectable Atlas score floors for alerts. */
export type ScoreAlertMinScore = 60 | 70 | 80;

/** Atlas geo side on a fired alert. */
export type ScoreAlertSide = "support" | "resistance";

/** User filter: bullish = support ↑, bearish = resistance ↓. */
export type ScoreAlertDirection = "bullish" | "bearish" | "both";

/** Which symbol universe to watch. */
export type ScoreAlertSegment = "favslide" | "liveslide" | "both";

export interface ScoreAlertPreferences {
  enabled: boolean;
  minScore: ScoreAlertMinScore;
  direction: ScoreAlertDirection;
  segment: ScoreAlertSegment;
  /** Soft chime when the app tab is open. */
  chime: boolean;
  /** OS browser notifications — requires Notification permission. */
  browserNotifications: boolean;
  updatedAt: string | null;
}

export interface ScoreAlertEvent {
  id: string;
  symbol: string;
  label: string;
  scope: LevelsTvScope;
  side: ScoreAlertSide;
  score: number;
  minScore: ScoreAlertMinScore;
  probabilityPct: number;
  segment?: ScoreAlertSegment | "favslide" | "liveslide";
  at: string;
  readAt: string | null;
}

/** RTDB payload under `live_alerts/score/{uid}/{id}`. */
export interface LiveScoreAlert {
  id: string;
  symbol: string;
  label: string;
  scope: LevelsTvScope;
  side: ScoreAlertSide;
  score: number;
  minScore: ScoreAlertMinScore;
  probabilityPct: number;
  at: string;
}

export interface ScoreAlertSymbolState {
  score: number;
  side: ScoreAlertSide;
  /**
   * True when last eval matched the user's filters (score ≥ floor and
   * direction). Used for threshold-cross detection.
   */
  aboveThreshold: boolean;
  updatedAt: string;
}
