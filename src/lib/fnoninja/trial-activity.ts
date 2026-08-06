/**
 * Append-only trial activity log + milestone summary for FNONINJA conversion.
 *
 * Activation (aha): chart opened AND (watchlist add OR alerts enabled).
 */

import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import {
  isTrialActivated,
  TRIAL_ACTIVATION_DEFINITION,
  TRIAL_ACTIVITY_TYPES,
  type TrialActivityType,
  type TrialMilestones,
} from "@/lib/fnoninja/trial-activity-types";

export {
  isTrialActivated,
  TRIAL_ACTIVATION_DEFINITION,
  TRIAL_ACTIVITY_TYPES,
  type TrialActivityType,
  type TrialMilestones,
};

export const TRIAL_ACTIVITY_COLLECTION = "trial_activity";
export const TRIAL_ACTIVITY_EVENTS_SUB = "events";

export interface TrialActivitySummary {
  uid: string;
  milestones: TrialMilestones;
  /** When {@link TRIAL_ACTIVATION_DEFINITION} was first met. */
  activatedAt: string | null;
  eventCount: number;
  sessionCount: number;
  lastEventAt: string | null;
  lastEventType: TrialActivityType | null;
  lastSessionAt: string | null;
  updatedAt: string;
}

const MILESTONE_ONCE = new Set<TrialActivityType>([
  "trial_started",
  "map_opened",
  "chart_opened",
  "favslide_added",
  "liveslide_opened",
  "alerts_enabled",
  "atlas_opened",
  "chat_joined",
  "phone_verified",
  "subscribe_viewed",
  "plan_selected",
  "payment_initiated",
  "payment_completed",
  "payment_failed",
  "upgrade_prompt_open",
  "upgrade_prompt_cta",
]);

/** Client may only emit these (server routes own the rest). */
export const CLIENT_TRIAL_ACTIVITY_TYPES = [
  "map_opened",
  "chart_opened",
  "liveslide_opened",
  "atlas_opened",
  "subscribe_viewed",
  "plan_selected",
  "payment_initiated",
  "payment_failed",
  "upgrade_prompt_open",
  "upgrade_prompt_cta",
  "upgrade_prompt_dismiss",
] as const satisfies readonly TrialActivityType[];

export function isTrialActivityType(v: unknown): v is TrialActivityType {
  return typeof v === "string" && (TRIAL_ACTIVITY_TYPES as readonly string[]).includes(v);
}

export function isClientTrialActivityType(
  v: unknown,
): v is (typeof CLIENT_TRIAL_ACTIVITY_TYPES)[number] {
  return typeof v === "string" && (CLIENT_TRIAL_ACTIVITY_TYPES as readonly string[]).includes(v);
}

export function parseTrialActivitySummary(
  uid: string,
  raw: Record<string, unknown> | undefined,
): TrialActivitySummary {
  const milestones =
    raw?.milestones && typeof raw.milestones === "object"
      ? ({ ...(raw.milestones as TrialMilestones) })
      : {};
  return {
    uid,
    milestones,
    activatedAt: typeof raw?.activatedAt === "string" ? raw.activatedAt : null,
    eventCount: typeof raw?.eventCount === "number" ? raw.eventCount : 0,
    sessionCount: typeof raw?.sessionCount === "number" ? raw.sessionCount : 0,
    lastEventAt: typeof raw?.lastEventAt === "string" ? raw.lastEventAt : null,
    lastEventType: isTrialActivityType(raw?.lastEventType) ? raw.lastEventType : null,
    lastSessionAt: typeof raw?.lastSessionAt === "string" ? raw.lastSessionAt : null,
    updatedAt: typeof raw?.updatedAt === "string" ? raw.updatedAt : "",
  };
}

const SESSION_GAP_MS = 4 * 60 * 60 * 1000;

export async function recordTrialActivity(
  db: Firestore,
  uid: string,
  type: TrialActivityType,
  meta: Record<string, unknown> = {},
): Promise<{ recorded: boolean; activatedNow: boolean }> {
  const now = new Date().toISOString();
  const nowMs = Date.now();
  const summaryRef = db.collection(TRIAL_ACTIVITY_COLLECTION).doc(uid);
  const eventRef = summaryRef.collection(TRIAL_ACTIVITY_EVENTS_SUB).doc();

  let activatedNow = false;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(summaryRef);
    const prev = parseTrialActivitySummary(
      uid,
      snap.exists ? (snap.data() as Record<string, unknown>) : undefined,
    );

    const milestones: TrialMilestones = { ...prev.milestones };
    if (MILESTONE_ONCE.has(type) && !milestones[type]) {
      milestones[type] = now;
    }

    let sessionCount = prev.sessionCount;
    let lastSessionAt = prev.lastSessionAt;
    if (type === "session_seen" || type === "trial_started") {
      const last = lastSessionAt ? new Date(lastSessionAt).getTime() : 0;
      if (!last || nowMs - last >= SESSION_GAP_MS) {
        sessionCount += 1;
        lastSessionAt = now;
      }
    }

    let activatedAt = prev.activatedAt;
    if (!activatedAt && isTrialActivated(milestones)) {
      activatedAt = now;
      activatedNow = true;
    }

    tx.set(
      summaryRef,
      {
        uid,
        milestones,
        activatedAt,
        eventCount: FieldValue.increment(1),
        sessionCount,
        lastEventAt: now,
        lastEventType: type,
        lastSessionAt,
        updatedAt: now,
      },
      { merge: true },
    );

    tx.set(eventRef, {
      type,
      at: now,
      meta: Object.keys(meta).length ? meta : null,
    });
  });

  return { recorded: true, activatedNow };
}

/** Fire-and-forget wrapper — never throws to callers. */
export function trackTrialActivity(
  db: Firestore,
  uid: string,
  type: TrialActivityType,
  meta: Record<string, unknown> = {},
): void {
  void recordTrialActivity(db, uid, type, meta).catch((err) => {
    console.error("[trial-activity]", type, uid, (err as Error)?.message ?? err);
  });
}
