/**
 * Cron heartbeat registry + admin Telegram alerts (server-only).
 */
import type { Firestore } from "firebase-admin/firestore";
import { notifyAdminTelegram } from "@/lib/admin-telegram";
import {
  CRON_JOBS,
  evaluateCronLevel,
  type CronHealthView,
  type CronHeartbeatDoc,
  type CronHealthLevel,
  type CronJobId,
} from "@/lib/cron-health-shared";

export {
  CRON_JOBS,
  evaluateCronLevel,
  type CronHealthView,
  type CronHeartbeatDoc,
  type CronHealthLevel,
  type CronJobConfig,
  type CronJobId,
} from "@/lib/cron-health-shared";

/** Repeat Telegram while a P0 job stays CRITICAL (even if that job’s cron stopped). */
const TELEGRAM_REMINDER_MS = 5 * 60_000;

function docRef(db: Firestore, jobId: CronJobId) {
  return db.collection("cron_health").doc(jobId);
}

/**
 * Record a cron run. Never throws — failures must not break cron handlers.
 */
export async function recordCronHeartbeat(
  db: Firestore,
  jobId: CronJobId,
  result: {
    ok: boolean;
    degraded?: boolean;
    summary?: string;
    durationMs: number;
    error?: string;
  },
): Promise<void> {
  try {
    const job = CRON_JOBS[jobId];
    const ref = docRef(db, jobId);
    const prevSnap = await ref.get();
    const prev = prevSnap.data() as CronHeartbeatDoc | undefined;
    const now = new Date().toISOString();
    const nowMs = Date.now();

    const consecutiveFailures =
      result.ok ? 0 : (prev?.consecutiveFailures ?? 0) + 1;
    const consecutiveDegraded =
      result.ok && result.degraded
        ? (prev?.consecutiveDegraded ?? 0) + 1
        : result.ok
          ? 0
          : prev?.consecutiveDegraded ?? 0;

    const next: CronHeartbeatDoc = {
      jobId,
      label: job.label,
      enabled: prev?.enabled !== false,
      lastAttemptAt: now,
      lastSuccessAt: result.ok ? now : prev?.lastSuccessAt ?? null,
      lastError: result.ok ? null : (result.error ?? "unknown error").slice(0, 500),
      consecutiveFailures,
      consecutiveDegraded,
      lastDurationMs: result.durationMs,
      lastSummary: result.summary?.slice(0, 300) ?? null,
      lastTelegramLevel: prev?.lastTelegramLevel ?? null,
      lastTelegramAt: prev?.lastTelegramAt ?? null,
    };

    await ref.set(next);

    // Re-evaluate all P0 jobs so a dead cron still gets 5-min reminders from siblings.
    await processCronTelegramAlerts(db, nowMs);
  } catch (e) {
    console.error(
      `[CronHealth] record failed for ${jobId}:`,
      e instanceof Error ? e.message : e,
    );
  }
}

/**
 * Scan all P0 cron heartbeats and send admin Telegram:
 * - CRITICAL: immediately, then every 5 minutes until recovered
 * - OK after CRITICAL: one recovery message
 */
export async function processCronTelegramAlerts(
  db: Firestore,
  nowMs = Date.now(),
): Promise<void> {
  for (const job of Object.values(CRON_JOBS)) {
    if (!job.telegram) continue;

    try {
      const ref = docRef(db, job.id);
      const snap = await ref.get();
      const doc = snap.data() as CronHeartbeatDoc | undefined;
      if (!doc || doc.enabled === false) continue;

      const { level, staleMs } = evaluateCronLevel(job, doc, nowMs);
      const prevLevel = doc.lastTelegramLevel ?? null;
      const lastAlertMs = doc.lastTelegramAt
        ? new Date(doc.lastTelegramAt).getTime()
        : 0;
      const reminderDue = nowMs - lastAlertMs >= TELEGRAM_REMINDER_MS;
      const now = new Date().toISOString();

      if (level === "critical") {
        const firstAlert = prevLevel !== "critical";
        if (firstAlert || reminderDue) {
          const minsDown = staleMs != null ? Math.round(staleMs / 60_000) : null;
          const msg = [
            firstAlert ? "TezTerminal cron alert" : "TezTerminal cron alert (still down)",
            `${job.label} (${job.id}) is CRITICAL`,
            minsDown != null ? `Last success: ${minsDown}m ago` : "Last success: never",
            doc.lastError ? `Error: ${doc.lastError}` : null,
            doc.lastSummary ? `Summary: ${doc.lastSummary}` : null,
            !firstAlert ? "Will repeat every 5 min until recovered." : null,
          ]
            .filter(Boolean)
            .join("\n");
          await notifyAdminTelegram(msg);
          await ref.update({
            lastTelegramLevel: "critical",
            lastTelegramAt: now,
          });
        }
        continue;
      }

      if (level === "ok" && prevLevel === "critical") {
        await notifyAdminTelegram(
          [
            "TezTerminal cron recovered",
            `${job.label} (${job.id}) is healthy again.`,
            doc.lastSummary ? `Last run: ${doc.lastSummary}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        );
        await ref.update({
          lastTelegramLevel: "ok",
          lastTelegramAt: now,
        });
      }
    } catch (e) {
      console.error(
        `[CronHealth] telegram check failed for ${job.id}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
}

export async function loadCronHealthViews(db: Firestore): Promise<CronHealthView[]> {
  const nowMs = Date.now();
  const views: CronHealthView[] = [];
  for (const job of Object.values(CRON_JOBS)) {
    const snap = await db.collection("cron_health").doc(job.id).get();
    const data = snap.data() as CronHeartbeatDoc | undefined;
    const doc: CronHeartbeatDoc = data ?? {
      jobId: job.id,
      label: job.label,
      enabled: true,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastError: null,
      consecutiveFailures: 0,
      consecutiveDegraded: 0,
      lastDurationMs: null,
      lastSummary: null,
      lastTelegramLevel: null,
      lastTelegramAt: null,
    };
    const { level, staleMs } = evaluateCronLevel(job, doc, nowMs);
    views.push({ ...doc, level, staleMs, config: job });
  }
  return views;
}
