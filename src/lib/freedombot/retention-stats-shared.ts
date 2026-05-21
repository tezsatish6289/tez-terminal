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
