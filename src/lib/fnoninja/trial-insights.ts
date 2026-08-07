/**
 * Aggregates trial_activity summaries with subscriptions for admin conversion views.
 */

import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { FNONINJA_FAVSLIDE_FIELD, parseFavslideEntries } from "@/lib/fnoninja/favslide";
import { isSubscriptionActive, type SubscriptionDoc } from "@/lib/subscription";
import {
  isTrialActivated,
  parseTrialActivitySummary,
  TRIAL_ACTIVATION_DEFINITION,
  TRIAL_ACTIVITY_COLLECTION,
  type TrialActivitySummary,
  type TrialMilestones,
} from "@/lib/fnoninja/trial-activity";
import type {
  MilestoneDriverRow,
  TrialCohort,
  TrialFunnelStats,
  TrialInsightUser,
  TrialInsightsPayload,
  TrialRewardsStats,
} from "@/lib/fnoninja/trial-insights-types";

export type {
  MilestoneDriverRow,
  TrialCohort,
  TrialFunnelStats,
  TrialInsightUser,
  TrialInsightsPayload,
  TrialRewardsStats,
} from "@/lib/fnoninja/trial-insights-types";
export { TRIAL_ACTIVATION_DEFINITION };

const DRIVER_KEYS: { key: keyof TrialMilestones | "activated"; label: string }[] = [
  { key: "activated", label: "Activated (aha)" },
  { key: "chart_opened", label: "Chart opened" },
  { key: "favslide_added", label: "Watchlist add" },
  { key: "alerts_enabled", label: "Alerts enabled" },
  { key: "liveslide_opened", label: "Livelist opened" },
  { key: "atlas_opened", label: "Atlas opened" },
  { key: "subscribe_viewed", label: "Subscribe viewed" },
  { key: "upgrade_prompt_open", label: "Upgrade prompt" },
  { key: "phone_verified", label: "Phone verified" },
  { key: "chat_joined", label: "Chat joined" },
];

function planLabel(sub: SubscriptionDoc | null): string {
  if (!sub) return "—";
  if (sub.status === "trial") return "Free trial";
  const code = sub.planCode;
  const tier = sub.tier;
  if (code === "fnoninja_gold" || tier === "gold") return "Gold";
  if (code === "fnoninja_silver" || tier === "silver") return "Silver";
  if (code === "daypass" || tier === "daypass") return "Day Pass";
  return "—";
}

function cohortOf(sub: SubscriptionDoc | null, active: boolean): TrialCohort {
  if (!sub) return "other";
  if (sub.status === "active" && active) return "paid";
  if (sub.status === "trial" && active) return "active_trial";
  if (sub.status === "trial" || (sub.status === "expired" && sub.trialEndDate)) {
    return "expired_trial";
  }
  if (sub.status === "active" || sub.status === "expired") return "paid";
  return "other";
}

function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.abs(b - a) / (24 * 60 * 60 * 1000);
}

function isHot(u: {
  isActive: boolean;
  cohort: TrialCohort;
  lastSeenAt: string | null;
  milestones: TrialMilestones;
  alertsEnabled: boolean;
  favslideCount: number;
}): boolean {
  if (u.cohort !== "active_trial" || !u.isActive) return false;
  if (!u.lastSeenAt) return false;
  const hours = (Date.now() - new Date(u.lastSeenAt).getTime()) / (60 * 60 * 1000);
  if (hours > 24) return false;
  return u.alertsEnabled || u.favslideCount >= 3 || Boolean(u.milestones.atlas_opened);
}

function isCold(u: {
  cohort: TrialCohort;
  joinedAt: string | null;
  sessionCount: number;
  milestones: TrialMilestones;
}): boolean {
  if (u.cohort !== "active_trial" && u.cohort !== "expired_trial") return false;
  if (!u.joinedAt) return false;
  const ageDays = (Date.now() - new Date(u.joinedAt).getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays < 2) return false;
  return u.sessionCount < 2 && !u.milestones.chart_opened;
}

export async function buildTrialInsights(db: Firestore): Promise<TrialInsightsPayload> {
  const [usersSnap, subsSnap, activitySnap, alertsSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("subscriptions").get(),
    db.collection(TRIAL_ACTIVITY_COLLECTION).get(),
    db.collection("score_alert_preferences").where("enabled", "==", true).get(),
  ]);

  const subs = new Map<string, SubscriptionDoc>();
  for (const d of subsSnap.docs) subs.set(d.id, d.data() as SubscriptionDoc);

  const activity = new Map<string, TrialActivitySummary>();
  for (const d of activitySnap.docs) {
    activity.set(d.id, parseTrialActivitySummary(d.id, d.data() as Record<string, unknown>));
  }

  const alertsOn = new Set(alertsSnap.docs.map((d) => d.id));

  const users: TrialInsightUser[] = [];

  for (const doc of usersSnap.docs) {
    const u = doc.data() as Record<string, unknown>;
    const products = Array.isArray(u.products) ? (u.products as string[]) : [];
    if (!products.includes("fnoninja")) continue;

    const sub = subs.get(doc.id) ?? null;
    const active = isSubscriptionActive(sub);
    const act = activity.get(doc.id);
    const milestones = act?.milestones ?? {};
    const activated = Boolean(act?.activatedAt) || isTrialActivated(milestones);
    const favslideCount = parseFavslideEntries(u[FNONINJA_FAVSLIDE_FIELD]).length;
    const diamonds = typeof u.diamonds === "number" ? u.diamonds : 0;
    const diamondsLifetimeEarned =
      typeof u.diamondsLifetimeEarned === "number" ? u.diamondsLifetimeEarned : 0;
    const rewardsDaysExtended =
      typeof u.rewardsDaysExtended === "number" ? u.rewardsDaysExtended : 0;
    const fnoExperience = typeof u.fnoExperience === "string" ? u.fnoExperience : null;

    const row: TrialInsightUser = {
      uid: doc.id,
      displayName: typeof u.displayName === "string" ? u.displayName : null,
      email: typeof u.email === "string" ? u.email : null,
      joinedAt:
        (typeof u.fnoninjaJoinedAt === "string" ? u.fnoninjaJoinedAt : null) ??
        sub?.createdAt ??
        null,
      lastSeenAt:
        (typeof u.fnoninjaLastSeenAt === "string" ? u.fnoninjaLastSeenAt : null) ??
        (typeof u.lastSeenAt === "string" ? u.lastSeenAt : null),
      status: sub?.status ?? "none",
      tier: sub?.tier ?? (sub?.status === "trial" ? "free" : null),
      planName: planLabel(sub),
      isActive: active,
      cohort: cohortOf(sub, active),
      milestones,
      activatedAt: act?.activatedAt ?? null,
      activated,
      sessionCount: act?.sessionCount ?? 0,
      eventCount: act?.eventCount ?? 0,
      alertsEnabled: alertsOn.has(doc.id),
      favslideCount,
      diamonds,
      diamondsLifetimeEarned,
      rewardsDaysExtended,
      fnoExperience,
      hot: false,
      cold: false,
    };
    row.hot = isHot(row);
    row.cold = isCold(row);
    users.push(row);
  }

  const trialish = users.filter(
    (u) => u.cohort === "active_trial" || u.cohort === "expired_trial" || u.milestones.trial_started,
  );
  const started = trialish.length || users.filter((u) => u.milestones.trial_started || u.joinedAt).length;

  const withStarted = users.filter(
    (u) => u.milestones.trial_started || u.status === "trial" || u.cohort === "expired_trial",
  );
  const activated = withStarted.filter((u) => u.activated).length;
  const returnedD2 = withStarted.filter((u) => {
    if (!u.joinedAt || !u.lastSeenAt) return false;
    return daysBetween(u.joinedAt, u.lastSeenAt) >= 1 && u.sessionCount >= 2;
  }).length;
  const subscribeViewed = withStarted.filter((u) => u.milestones.subscribe_viewed).length;
  const paymentInitiated = withStarted.filter((u) => u.milestones.payment_initiated).length;
  const paid = users.filter((u) => u.cohort === "paid" || u.milestones.payment_completed).length;

  const funnel: TrialFunnelStats = {
    started: withStarted.length || started,
    activated,
    returnedD2,
    subscribeViewed,
    paymentInitiated,
    paid,
    activationRatePct:
      withStarted.length > 0 ? Math.round((activated / withStarted.length) * 100) : 0,
    paidFromTrialPct:
      withStarted.length > 0 ? Math.round((paid / withStarted.length) * 100) : 0,
  };

  const drivers: MilestoneDriverRow[] = DRIVER_KEYS.map(({ key, label }) => {
    const pool = withStarted.length ? withStarted : users;
    const withM =
      key === "activated"
        ? pool.filter((u) => u.activated)
        : pool.filter((u) => Boolean(u.milestones[key]));
    const converted = withM.filter(
      (u) => u.cohort === "paid" || Boolean(u.milestones.payment_completed),
    ).length;
    return {
      milestone: key,
      label,
      withMilestone: withM.length,
      converted,
      convertRatePct: withM.length > 0 ? Math.round((converted / withM.length) * 100) : 0,
    };
  });

  const hotTrials = users.filter((u) => u.hot).slice(0, 40);
  const coldTrials = users.filter((u) => u.cold).slice(0, 40);

  const trialPool = withStarted.length ? withStarted : users;
  const earnedAnyUsers = trialPool.filter((u) => u.diamondsLifetimeEarned > 0);
  const earnedThenPaid = earnedAnyUsers.filter(
    (u) => u.cohort === "paid" || Boolean(u.milestones.payment_completed),
  ).length;
  const rewards: TrialRewardsStats = {
    personaAnswered: trialPool.filter((u) => Boolean(u.fnoExperience)).length,
    earnedAny: earnedAnyUsers.length,
    totalLifetimeDiamonds: trialPool.reduce((s, u) => s + u.diamondsLifetimeEarned, 0),
    totalDaysExtended: trialPool.reduce((s, u) => s + u.rewardsDaysExtended, 0),
    earnedThenPaid,
    earnedThenPaidRatePct:
      earnedAnyUsers.length > 0
        ? Math.round((earnedThenPaid / earnedAnyUsers.length) * 100)
        : 0,
  };

  users.sort((a, b) => {
    const at = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
    const bt = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
    return bt - at;
  });

  return {
    activationDefinition: TRIAL_ACTIVATION_DEFINITION,
    generatedAt: new Date().toISOString(),
    funnel,
    rewards,
    drivers,
    hotTrials,
    coldTrials,
    users,
  };
}
