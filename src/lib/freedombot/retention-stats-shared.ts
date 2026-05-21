/**
 * Client-safe retention stat types and constants (no firebase-admin).
 */

export const RETENTION_FALLBACK_P90_DAYS = 30;
export const RETENTION_MIN_SAMPLE_SIZE = 10;

export type RetentionStatsSource = "computed" | "fallback";

export interface RetentionExchangeStats {
  exchange: string;
  p90DaysToSustainedProfit: number;
  sampleSize: number;
  medianDays: number | null;
  computedAt: string;
  source: RetentionStatsSource;
}

export type LifetimePnlBand = "profitable" | "drawdown" | "breakeven";

export function lifetimePnlBand(lifetimeRealizedPnl: number): LifetimePnlBand {
  if (lifetimeRealizedPnl > 0) return "profitable";
  if (lifetimeRealizedPnl < 0) return "drawdown";
  return "breakeven";
}

/** Dashboard pause button — retention modal when not net positive on closed trades. */
export function showsPauseRetentionModal(
  lifetimeRealizedPnl: number | null | undefined,
): boolean {
  if (lifetimeRealizedPnl == null || !Number.isFinite(lifetimeRealizedPnl)) return true;
  return lifetimeRealizedPnl <= 0;
}

/** Delete always shows retention; pause uses {@link showsPauseRetentionModal}. */
export function showsRetentionModal(
  intent: "pause" | "delete",
  lifetimeRealizedPnl: number | null | undefined,
): boolean {
  if (intent === "delete") return true;
  return showsPauseRetentionModal(lifetimeRealizedPnl);
}
