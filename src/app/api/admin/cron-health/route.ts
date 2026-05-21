import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import {
  CRON_JOB_ORDER,
  CRON_JOBS,
  evaluateCronLevel,
  type CronHeartbeatDoc,
  type CronJobId,
} from "@/lib/cron-health-shared";

export const dynamic = "force-dynamic";

function toIsoString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const d = (value as { toDate: () => Date }).toDate();
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function normalizeDoc(id: string, raw: Record<string, unknown>): CronHeartbeatDoc {
  const job = CRON_JOBS[id as CronJobId];
  return {
    jobId: (raw.jobId as CronJobId) ?? (id as CronJobId),
    label: typeof raw.label === "string" ? raw.label : (job?.label ?? id),
    enabled: raw.enabled !== false,
    lastAttemptAt: toIsoString(raw.lastAttemptAt),
    lastSuccessAt: toIsoString(raw.lastSuccessAt),
    lastError: typeof raw.lastError === "string" ? raw.lastError : null,
    consecutiveFailures:
      typeof raw.consecutiveFailures === "number" ? raw.consecutiveFailures : 0,
    consecutiveDegraded:
      typeof raw.consecutiveDegraded === "number" ? raw.consecutiveDegraded : 0,
    lastDurationMs: typeof raw.lastDurationMs === "number" ? raw.lastDurationMs : null,
    lastSummary: typeof raw.lastSummary === "string" ? raw.lastSummary : null,
    lastTelegramLevel:
      raw.lastTelegramLevel === "ok" ||
      raw.lastTelegramLevel === "warn" ||
      raw.lastTelegramLevel === "critical" ||
      raw.lastTelegramLevel === "unknown"
        ? raw.lastTelegramLevel
        : null,
    lastTelegramAt: toIsoString(raw.lastTelegramAt),
  };
}

/**
 * GET /api/admin/cron-health
 * Admin-only cron heartbeat status (bypasses client Firestore rules).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const db = getAdminFirestore();
    const snap = await db.collection("cron_health").get();
    const byId = new Map<string, CronHeartbeatDoc>();
    for (const doc of snap.docs) {
      byId.set(doc.id, normalizeDoc(doc.id, doc.data() as Record<string, unknown>));
    }

    const nowMs = Date.now();
    const jobs = CRON_JOB_ORDER.map((id) => {
      const job = CRON_JOBS[id];
      const doc =
        byId.get(id) ??
        ({
          jobId: id,
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
        } satisfies CronHeartbeatDoc);
      const { level, staleMs } = evaluateCronLevel(job, doc, nowMs);
      return { job, doc, level, staleMs };
    });

    return NextResponse.json({ jobs });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin cron-health]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
