import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";

/** User-selectable Atlas score floors for alerts. */
export type ScoreAlertMinScore = 60 | 70 | 80;

export type ScoreAlertSide = "support" | "resistance";

export interface ScoreAlertPreferences {
  enabled: boolean;
  minScore: ScoreAlertMinScore;
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
  /** True when last evaluated score was at/above the user's minScore. */
  aboveThreshold: boolean;
  updatedAt: string;
}
