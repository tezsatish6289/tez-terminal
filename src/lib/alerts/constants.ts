import type {
  ScoreAlertDirection,
  ScoreAlertMinScore,
  ScoreAlertPreferences,
  ScoreAlertSegment,
} from "@/lib/alerts/types";

export const SCORE_ALERT_PREFS_COLLECTION = "score_alert_preferences";
export const SCORE_ALERT_EVENTS_COLLECTION = "score_alert_events";
export const SCORE_ALERT_STATE_COLLECTION = "score_alert_state";

export const LIVE_SCORE_ALERTS_RTDB_PATH = "live_alerts/score";

export const SCORE_ALERT_MIN_SCORES: readonly ScoreAlertMinScore[] = [60, 70, 80];

/** Highest floor — Gold / Day Pass only (see `score_alerts_80` entitlement). */
export const SCORE_ALERT_GOLD_MIN_SCORE: ScoreAlertMinScore = 80;

/** Max floor for free trial + Silver when ≥80 is locked. */
export const SCORE_ALERT_STANDARD_MAX_MIN_SCORE: ScoreAlertMinScore = 70;

export const SCORE_ALERT_DIRECTIONS: readonly ScoreAlertDirection[] = [
  "bullish",
  "bearish",
  "both",
];

export const SCORE_ALERT_SEGMENTS: readonly ScoreAlertSegment[] = [
  "favslide",
  "liveslide",
  "both",
];

export const DEFAULT_SCORE_ALERT_PREFERENCES: ScoreAlertPreferences = {
  enabled: false,
  minScore: 70,
  direction: "both",
  segment: "favslide",
  chime: true,
  browserNotifications: false,
  updatedAt: null,
};

/** Keep recent events for the drawer. */
export const SCORE_ALERT_EVENTS_LIMIT = 40;

/** RTDB / toast freshness window. */
export const SCORE_ALERT_FRESH_MS = 60 * 60 * 1000;

export const SCORE_ALERT_READ_KEY_PREFIX = "fno_score_alerts_seen_v1:";
