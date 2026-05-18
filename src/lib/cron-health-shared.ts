/**
 * Client-safe cron health types and evaluation (no firebase-admin).
 */

export type CronJobId = "sync-prices" | "sync-simulator" | "sync-live-trades";

export type CronHealthLevel = "ok" | "warn" | "critical" | "unknown";

export interface CronJobConfig {
  id: CronJobId;
  label: string;
  intervalMs: number;
  warnAfterMs: number;
  alertAfterMs: number;
  telegram: boolean;
}

/** P0 trading chain — 1 min cadence on cron-job.org */
export const CRON_JOBS: Record<CronJobId, CronJobConfig> = {
  "sync-prices": {
    id: "sync-prices",
    label: "Price sync",
    intervalMs: 60_000,
    warnAfterMs: 3 * 60_000,
    alertAfterMs: 5 * 60_000,
    telegram: true,
  },
  "sync-simulator": {
    id: "sync-simulator",
    label: "Simulator sync",
    intervalMs: 60_000,
    warnAfterMs: 3 * 60_000,
    alertAfterMs: 5 * 60_000,
    telegram: true,
  },
  "sync-live-trades": {
    id: "sync-live-trades",
    label: "Live trade sync",
    intervalMs: 60_000,
    warnAfterMs: 3 * 60_000,
    alertAfterMs: 5 * 60_000,
    telegram: true,
  },
};

export interface CronHeartbeatDoc {
  jobId: CronJobId;
  label: string;
  enabled: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  consecutiveDegraded: number;
  lastDurationMs: number | null;
  lastSummary: string | null;
  lastTelegramLevel: CronHealthLevel | null;
  lastTelegramAt: string | null;
}

export interface CronHealthView extends CronHeartbeatDoc {
  level: CronHealthLevel;
  staleMs: number | null;
  config: CronJobConfig;
}

export function evaluateCronLevel(
  job: CronJobConfig,
  doc: Pick<
    CronHeartbeatDoc,
    "enabled" | "lastSuccessAt" | "consecutiveFailures" | "consecutiveDegraded"
  >,
  nowMs = Date.now(),
): { level: CronHealthLevel; staleMs: number | null } {
  if (doc.enabled === false) {
    return { level: "ok", staleMs: null };
  }
  if (!doc.lastSuccessAt) {
    return { level: "unknown", staleMs: null };
  }
  const staleMs = nowMs - new Date(doc.lastSuccessAt).getTime();
  if (doc.consecutiveFailures >= 3) {
    return { level: "critical", staleMs };
  }
  if (staleMs >= job.alertAfterMs) {
    return { level: "critical", staleMs };
  }
  if (staleMs >= job.warnAfterMs || doc.consecutiveDegraded >= 3) {
    return { level: "warn", staleMs };
  }
  return { level: "ok", staleMs };
}
