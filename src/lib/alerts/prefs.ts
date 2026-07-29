import {
  DEFAULT_SCORE_ALERT_PREFERENCES,
  SCORE_ALERT_DIRECTIONS,
  SCORE_ALERT_MIN_SCORES,
  SCORE_ALERT_SEGMENTS,
} from "@/lib/alerts/constants";
import type {
  ScoreAlertDirection,
  ScoreAlertMinScore,
  ScoreAlertPreferences,
  ScoreAlertSegment,
} from "@/lib/alerts/types";

export function isScoreAlertMinScore(v: unknown): v is ScoreAlertMinScore {
  return (
    typeof v === "number" &&
    (SCORE_ALERT_MIN_SCORES as readonly number[]).includes(v)
  );
}

export function isScoreAlertDirection(v: unknown): v is ScoreAlertDirection {
  return (
    typeof v === "string" &&
    (SCORE_ALERT_DIRECTIONS as readonly string[]).includes(v)
  );
}

export function isScoreAlertSegment(v: unknown): v is ScoreAlertSegment {
  return (
    typeof v === "string" &&
    (SCORE_ALERT_SEGMENTS as readonly string[]).includes(v)
  );
}

export function parseScoreAlertPreferences(raw: unknown): ScoreAlertPreferences {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const minScore = isScoreAlertMinScore(o.minScore)
    ? o.minScore
    : DEFAULT_SCORE_ALERT_PREFERENCES.minScore;
  const direction = isScoreAlertDirection(o.direction)
    ? o.direction
    : DEFAULT_SCORE_ALERT_PREFERENCES.direction;
  const segment = isScoreAlertSegment(o.segment)
    ? o.segment
    : DEFAULT_SCORE_ALERT_PREFERENCES.segment;
  return {
    enabled: o.enabled === true,
    minScore,
    direction,
    segment,
    chime: o.chime !== false,
    browserNotifications: o.browserNotifications === true,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : null,
  };
}

export function normalizeScoreAlertPreferencesPatch(
  body: Record<string, unknown>,
  current: ScoreAlertPreferences,
): ScoreAlertPreferences | { error: string } {
  const next: ScoreAlertPreferences = { ...current };

  if ("enabled" in body) {
    if (typeof body.enabled !== "boolean") return { error: "enabled must be a boolean" };
    next.enabled = body.enabled;
  }
  if ("minScore" in body) {
    const n = typeof body.minScore === "string" ? Number(body.minScore) : body.minScore;
    if (!isScoreAlertMinScore(n)) return { error: "minScore must be 60, 70, or 80" };
    next.minScore = n;
  }
  if ("direction" in body) {
    if (!isScoreAlertDirection(body.direction)) {
      return { error: "direction must be bullish, bearish, or both" };
    }
    next.direction = body.direction;
  }
  if ("segment" in body) {
    if (!isScoreAlertSegment(body.segment)) {
      return { error: "segment must be favslide, liveslide, or both" };
    }
    next.segment = body.segment;
  }
  if ("chime" in body) {
    if (typeof body.chime !== "boolean") return { error: "chime must be a boolean" };
    next.chime = body.chime;
  }
  if ("browserNotifications" in body) {
    if (typeof body.browserNotifications !== "boolean") {
      return { error: "browserNotifications must be a boolean" };
    }
    next.browserNotifications = body.browserNotifications;
  }

  next.updatedAt = new Date().toISOString();
  return next;
}

/** support ↑ = bullish, resistance ↓ = bearish. */
export function sideMatchesDirection(
  side: "support" | "resistance",
  direction: ScoreAlertDirection,
): boolean {
  if (direction === "both") return true;
  if (direction === "bullish") return side === "support";
  return side === "resistance";
}
