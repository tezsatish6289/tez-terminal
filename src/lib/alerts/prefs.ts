import {
  DEFAULT_SCORE_ALERT_PREFERENCES,
  SCORE_ALERT_MIN_SCORES,
} from "@/lib/alerts/constants";
import type { ScoreAlertMinScore, ScoreAlertPreferences } from "@/lib/alerts/types";

export function isScoreAlertMinScore(v: unknown): v is ScoreAlertMinScore {
  return (
    typeof v === "number" &&
    (SCORE_ALERT_MIN_SCORES as readonly number[]).includes(v)
  );
}

export function parseScoreAlertPreferences(raw: unknown): ScoreAlertPreferences {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const minScore = isScoreAlertMinScore(o.minScore)
    ? o.minScore
    : DEFAULT_SCORE_ALERT_PREFERENCES.minScore;
  return {
    enabled: o.enabled === true,
    minScore,
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
