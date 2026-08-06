/**
 * Day-based FNONINJA trial lifecycle emails (transactional via Resend).
 * Days: 0 setup, 2 unused nudge, 5 value proof, 6 offer.
 */

import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { isEmailUpdatesEnabled } from "@/lib/email/fnoninja-audience";
import { resendConfig, resendSendEmail } from "@/lib/email/resend";
import { isSubscriptionActive, type SubscriptionDoc } from "@/lib/subscription";
import {
  parseTrialActivitySummary,
  TRIAL_ACTIVITY_COLLECTION,
} from "@/lib/fnoninja/trial-activity";

export type TrialLifecycleDay = "day0" | "day2" | "day5" | "day6";

const SITE = "https://fnoninja.com";
const LIFECYCLE_FIELD = "lifecycleEmails";

function startOfUtcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function trialDayIndex(trialStartIso: string, now = new Date()): number | null {
  const start = new Date(trialStartIso);
  if (Number.isNaN(start.getTime())) return null;
  const diff = startOfUtcDay(now) - startOfUtcDay(start);
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function dayKey(index: number): TrialLifecycleDay | null {
  if (index === 0) return "day0";
  if (index === 2) return "day2";
  if (index === 5) return "day5";
  if (index === 6) return "day6";
  return null;
}

function emailCopy(
  day: TrialLifecycleDay,
  firstName: string | null,
): { subject: string; html: string } {
  const name = firstName ? `${firstName}, ` : "";
  const cta = `${SITE}/levels`;
  const subscribe = `${SITE}/subscribe`;
  const today = `${SITE}/today`;

  switch (day) {
    case "day0":
      return {
        subject: "Your FNONINJA trial — open the map in 2 minutes",
        html: `<p>${name}welcome to FNONINJA.</p>
<p>Your free trial is live. Fastest path to value:</p>
<ol>
<li>Open the <a href="${cta}">market map</a></li>
<li>Tap one symbol → open the chart</li>
<li>Add 3 names to Watchlist (optional: turn on Setup alerts)</li>
</ol>
<p><a href="${cta}">Start on the map →</a></p>`,
      };
    case "day2":
      return {
        subject: "Still exploring? One chart unlocks the trial",
        html: `<p>${name}quick nudge — trials that open a chart convert far more often.</p>
<p>Pick NIFTY or a stock you trade, open the chart, and glance at support / resistance.</p>
<p><a href="${cta}">Open levels →</a></p>`,
      };
    case "day5":
      return {
        subject: "See today’s setups before the week ends",
        html: `<p>${name}your trial has a couple of days left.</p>
<p>Catch up on <a href="${today}">Today’s board</a> and replay wins — then set alerts so the next A-setup finds you.</p>
<p><a href="${today}">View today →</a> · <a href="${cta}">Open map →</a></p>`,
      };
    case "day6":
      return {
        subject: "Trial ends tomorrow — keep your levels",
        html: `<p>${name}your free trial ends tomorrow.</p>
<p>Stay on Silver for the full map &amp; charts, or Gold for Atlas + A+ alerts. Day Pass if you only need tomorrow.</p>
<p><a href="${subscribe}">Choose a plan →</a></p>`,
      };
  }
}

export interface TrialLifecycleRunResult {
  scanned: number;
  sent: number;
  skipped: number;
  errors: string[];
  byDay: Record<TrialLifecycleDay, number>;
}

export async function runTrialLifecycleEmails(db: Firestore): Promise<TrialLifecycleRunResult> {
  const cfg = resendConfig();
  const result: TrialLifecycleRunResult = {
    scanned: 0,
    sent: 0,
    skipped: 0,
    errors: [],
    byDay: { day0: 0, day2: 0, day5: 0, day6: 0 },
  };

  if (!cfg.apiKey || !cfg.from) {
    result.errors.push("RESEND_API_KEY / RESEND_FROM not configured");
    return result;
  }

  const [subsSnap, usersSnap, activitySnap] = await Promise.all([
    db.collection("subscriptions").get(),
    db.collection("users").get(),
    db.collection(TRIAL_ACTIVITY_COLLECTION).get(),
  ]);

  const users = new Map(usersSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>]));
  const activity = new Map(
    activitySnap.docs.map((d) => [
      d.id,
      parseTrialActivitySummary(d.id, d.data() as Record<string, unknown>),
    ]),
  );

  const now = new Date();

  for (const doc of subsSnap.docs) {
    const sub = doc.data() as SubscriptionDoc;
    if (sub.status !== "trial") continue;
    if (!isSubscriptionActive(sub)) continue;
    result.scanned += 1;

    const u = users.get(doc.id);
    if (!u) {
      result.skipped += 1;
      continue;
    }
    const products = Array.isArray(u.products) ? (u.products as string[]) : [];
    if (!products.includes("fnoninja")) {
      result.skipped += 1;
      continue;
    }
    if (!isEmailUpdatesEnabled(u)) {
      result.skipped += 1;
      continue;
    }
    const email = typeof u.email === "string" ? u.email.trim().toLowerCase() : "";
    if (!email.includes("@")) {
      result.skipped += 1;
      continue;
    }

    const dayIndex = trialDayIndex(sub.trialStartDate, now);
    if (dayIndex === null) {
      result.skipped += 1;
      continue;
    }
    const key = dayKey(dayIndex);
    if (!key) {
      result.skipped += 1;
      continue;
    }

    const act = activity.get(doc.id);
    const summarySnap = await db.collection(TRIAL_ACTIVITY_COLLECTION).doc(doc.id).get();
    const lifecycle =
      (summarySnap.data()?.[LIFECYCLE_FIELD] as Record<string, string> | undefined) ?? {};
    if (lifecycle[key]) {
      result.skipped += 1;
      continue;
    }

    // Day 2: skip if already activated / chart opened (not "unused").
    if (key === "day2") {
      const milestones = act?.milestones ?? {};
      if (milestones.chart_opened || act?.activatedAt) {
        result.skipped += 1;
        continue;
      }
    }

    const firstName =
      typeof u.displayName === "string" && u.displayName.trim()
        ? u.displayName.trim().split(/\s+/)[0] ?? null
        : null;
    const { subject, html } = emailCopy(key, firstName);
    const send = await resendSendEmail({
      apiKey: cfg.apiKey,
      from: cfg.from,
      to: email,
      subject,
      html,
    });

    if (send.error) {
      result.errors.push(`${doc.id}:${key}:${send.error}`);
      continue;
    }

    await db
      .collection(TRIAL_ACTIVITY_COLLECTION)
      .doc(doc.id)
      .set(
        {
          uid: doc.id,
          [LIFECYCLE_FIELD]: { ...lifecycle, [key]: now.toISOString() },
          updatedAt: now.toISOString(),
        },
        { merge: true },
      );

    result.sent += 1;
    result.byDay[key] += 1;
  }

  return result;
}
