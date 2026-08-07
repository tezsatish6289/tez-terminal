/**
 * FNONINJA Rewards Hub — server-only diamond earns + auto-redeem.
 */

import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/firebase/admin";
import {
  computeNewEndDate,
  isSubscriptionActive,
  type SubscriptionDoc,
} from "@/lib/subscription";

/** Calendar day key in Asia/Kolkata (YYYY-MM-DD). */
function istDayKey(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export const DIAMONDS_PER_QUEST = 10;
export const DIAMONDS_PER_DAY = 50;

export const FNO_EXPERIENCE_VALUES = [
  "never",
  "lt_1y",
  "1_3y",
  "3_5y",
  "gt_5y",
] as const;

export type FnoExperience = (typeof FNO_EXPERIENCE_VALUES)[number];

export function isFnoExperience(v: unknown): v is FnoExperience {
  return typeof v === "string" && (FNO_EXPERIENCE_VALUES as readonly string[]).includes(v);
}

export type DiamondQuestKind =
  | "fno_experience"
  | "chat_message"
  | "pnl_share"
  | "welcome";

export interface EarnDiamondsResult {
  awarded: boolean;
  amount: number;
  balance: number;
  lifetimeEarned: number;
  daysExtendedThisEarn: number;
  totalDaysExtended: number;
  reason?: "already_claimed" | "invalid_quest" | "self_welcome";
  questKey: string;
}

export interface RewardsSummary {
  diamonds: number;
  diamondsLifetimeEarned: number;
  rewardsDaysExtended: number;
  fnoExperience: FnoExperience | null;
  quests: {
    fnoExperience: { done: boolean; available: boolean };
    chatMessage: { doneToday: boolean; available: boolean };
    pnlShare: { doneToday: boolean; available: boolean };
    welcome: { label: string; available: boolean };
  };
  ledger: RewardsLedgerEntry[];
}

export interface RewardsLedgerEntry {
  id: string;
  type: "earn" | "redeem";
  quest: string;
  amount: number;
  at: string;
  meta?: Record<string, unknown>;
}

function questDocRef(db: Firestore, uid: string) {
  return db.collection("diamond_quests").doc(uid);
}

function ledgerCol(db: Firestore, uid: string) {
  return db.collection("diamond_ledger").doc(uid).collection("entries");
}

export function chatMessageQuestKey(day = istDayKey()): string {
  return `chat_message_${day}`;
}

export function pnlShareQuestKey(day = istDayKey()): string {
  return `pnl_share_${day}`;
}

export function welcomeQuestKey(targetUid: string): string {
  return `welcome_${targetUid}`;
}

export const FNO_EXPERIENCE_QUEST_KEY = "fno_experience";

async function extendAccessByDays(
  db: Firestore,
  uid: string,
  days: number,
): Promise<{ days: number; endDate: string | null }> {
  if (days <= 0) return { days: 0, endDate: null };

  const subRef = db.collection("subscriptions").doc(uid);
  const snap = await subRef.get();
  if (!snap.exists) {
    const trialEndDate = computeNewEndDate(null, days);
    const now = new Date().toISOString();
    await subRef.set(
      {
        userId: uid,
        status: "trial",
        trialStartDate: now,
        trialEndDate,
        subscriptionEndDate: null,
        createdAt: now,
      },
      { merge: true },
    );
    return { days, endDate: trialEndDate };
  }

  const sub = snap.data() as SubscriptionDoc;

  if (sub.status === "active" && isSubscriptionActive(sub)) {
    const end = computeNewEndDate(sub.subscriptionEndDate, days);
    await subRef.set({ subscriptionEndDate: end }, { merge: true });
    return { days, endDate: end };
  }

  if (sub.status === "trial") {
    const end = computeNewEndDate(sub.trialEndDate, days);
    await subRef.set({ trialEndDate: end }, { merge: true });
    return { days, endDate: end };
  }

  // Expired (or inactive) — grant a trial window from now.
  const end = computeNewEndDate(null, days);
  const patch: Record<string, unknown> = {
    status: "trial",
    trialEndDate: end,
  };
  if (!sub.trialStartDate) patch.trialStartDate = new Date().toISOString();
  await subRef.set(patch, { merge: true });
  return { days, endDate: end };
}

/**
 * Idempotent diamond award. Quest key must already be fully formed
 * (e.g. chat_message_2026-04-07, welcome_{uid}, fno_experience).
 */
export async function earnDiamonds(
  uid: string,
  questKey: string,
  amount: number = DIAMONDS_PER_QUEST,
  meta: Record<string, unknown> = {},
): Promise<EarnDiamondsResult> {
  const db = getAdminFirestore();
  const key = questKey.trim();
  if (!key || amount <= 0) {
    return {
      awarded: false,
      amount: 0,
      balance: 0,
      lifetimeEarned: 0,
      daysExtendedThisEarn: 0,
      totalDaysExtended: 0,
      reason: "invalid_quest",
      questKey: key,
    };
  }

  const userRef = db.collection("users").doc(uid);
  const qRef = questDocRef(db, uid);
  const now = new Date().toISOString();

  const claim = await db.runTransaction(async (tx) => {
    const [userSnap, questSnap] = await Promise.all([tx.get(userRef), tx.get(qRef)]);
    const userData = (userSnap.data() ?? {}) as Record<string, unknown>;
    const questData = (questSnap.data() ?? {}) as Record<string, unknown>;

    const balance = typeof userData.diamonds === "number" ? userData.diamonds : 0;
    const lifetime =
      typeof userData.diamondsLifetimeEarned === "number" ? userData.diamondsLifetimeEarned : 0;
    const totalDays =
      typeof userData.rewardsDaysExtended === "number" ? userData.rewardsDaysExtended : 0;

    if (typeof questData[key] === "string") {
      return {
        awarded: false as const,
        amount: 0,
        balance,
        lifetimeEarned: lifetime,
        daysExtendedThisEarn: 0,
        totalDaysExtended: totalDays,
        reason: "already_claimed" as const,
        questKey: key,
      };
    }

    const nextBalance = balance + amount;
    const nextLifetime = lifetime + amount;

    tx.set(qRef, { [key]: now, updatedAt: now }, { merge: true });
    tx.set(
      userRef,
      {
        diamonds: nextBalance,
        diamondsLifetimeEarned: nextLifetime,
        updatedAt: now,
      },
      { merge: true },
    );

    const ledgerRef = ledgerCol(db, uid).doc();
    tx.set(ledgerRef, {
      type: "earn",
      quest: key,
      amount,
      at: now,
      meta,
    });

    return {
      awarded: true as const,
      amount,
      balance: nextBalance,
      lifetimeEarned: nextLifetime,
      daysExtendedThisEarn: 0,
      totalDaysExtended: totalDays,
      questKey: key,
    };
  });

  if (!claim.awarded) return claim;

  // Auto-redeem outside the claim txn so subscription updates stay simple.
  let balance = claim.balance;
  let daysExtendedThisEarn = 0;
  let totalDaysExtended = claim.totalDaysExtended;

  while (balance >= DIAMONDS_PER_DAY) {
    const redeemNow = new Date().toISOString();
    const redeemed = await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      const userData = (userSnap.data() ?? {}) as Record<string, unknown>;
      const cur = typeof userData.diamonds === "number" ? userData.diamonds : 0;
      if (cur < DIAMONDS_PER_DAY) {
        return { ok: false as const, balance: cur, totalDays: typeof userData.rewardsDaysExtended === "number" ? userData.rewardsDaysExtended : 0 };
      }
      const nextBal = cur - DIAMONDS_PER_DAY;
      const nextDays =
        (typeof userData.rewardsDaysExtended === "number" ? userData.rewardsDaysExtended : 0) + 1;
      tx.set(
        userRef,
        {
          diamonds: nextBal,
          rewardsDaysExtended: nextDays,
          updatedAt: redeemNow,
        },
        { merge: true },
      );
      const ledgerRef = ledgerCol(db, uid).doc();
      tx.set(ledgerRef, {
        type: "redeem",
        quest: "auto_redeem",
        amount: -DIAMONDS_PER_DAY,
        at: redeemNow,
        meta: { days: 1 },
      });
      return { ok: true as const, balance: nextBal, totalDays: nextDays };
    });

    if (!redeemed.ok) {
      balance = redeemed.balance;
      totalDaysExtended = redeemed.totalDays;
      break;
    }

    await extendAccessByDays(db, uid, 1);
    balance = redeemed.balance;
    totalDaysExtended = redeemed.totalDays;
    daysExtendedThisEarn += 1;
  }

  return {
    awarded: true,
    amount: claim.amount,
    balance,
    lifetimeEarned: claim.lifetimeEarned,
    daysExtendedThisEarn,
    totalDaysExtended,
    questKey: key,
  };
}

/** Resolve welcomee uid from Atlas welcome message id (chat_members.welcomeMessageId). */
export async function findWelcomeeByMessageId(
  welcomeMessageId: string,
): Promise<string | null> {
  if (!welcomeMessageId) return null;
  const db = getAdminFirestore();
  const snap = await db
    .collection("chat_members")
    .where("welcomeMessageId", "==", welcomeMessageId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0]!.id;
}

export async function getRewardsSummary(uid: string): Promise<RewardsSummary> {
  const db = getAdminFirestore();
  const day = istDayKey();
  const chatKey = chatMessageQuestKey(day);
  const pnlKey = pnlShareQuestKey(day);

  const [userSnap, questSnap, ledgerSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    questDocRef(db, uid).get(),
    ledgerCol(db, uid).orderBy("at", "desc").limit(40).get(),
  ]);

  const userData = (userSnap.data() ?? {}) as Record<string, unknown>;
  const questData = (questSnap.data() ?? {}) as Record<string, unknown>;

  const fnoExperience = isFnoExperience(userData.fnoExperience)
    ? userData.fnoExperience
    : null;

  const ledger: RewardsLedgerEntry[] = ledgerSnap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      type: data.type === "redeem" ? "redeem" : "earn",
      quest: typeof data.quest === "string" ? data.quest : "",
      amount: typeof data.amount === "number" ? data.amount : 0,
      at: typeof data.at === "string" ? data.at : "",
      meta:
        data.meta && typeof data.meta === "object" && !Array.isArray(data.meta)
          ? (data.meta as Record<string, unknown>)
          : undefined,
    };
  });

  return {
    diamonds: typeof userData.diamonds === "number" ? userData.diamonds : 0,
    diamondsLifetimeEarned:
      typeof userData.diamondsLifetimeEarned === "number" ? userData.diamondsLifetimeEarned : 0,
    rewardsDaysExtended:
      typeof userData.rewardsDaysExtended === "number" ? userData.rewardsDaysExtended : 0,
    fnoExperience,
    quests: {
      fnoExperience: {
        done: Boolean(questData[FNO_EXPERIENCE_QUEST_KEY]) || Boolean(fnoExperience),
        available: !(questData[FNO_EXPERIENCE_QUEST_KEY] || fnoExperience),
      },
      chatMessage: {
        doneToday: Boolean(questData[chatKey]),
        available: !questData[chatKey],
      },
      pnlShare: {
        doneToday: Boolean(questData[pnlKey]),
        available: !questData[pnlKey],
      },
      welcome: {
        label: "Welcome a new member (reply to Atlas welcome)",
        available: true,
      },
    },
    ledger,
  };
}

/** Persist F&O experience + award diamonds once. */
export async function submitFnoExperience(
  uid: string,
  experience: FnoExperience,
): Promise<EarnDiamondsResult & { experience: FnoExperience }> {
  const db = getAdminFirestore();
  const userRef = db.collection("users").doc(uid);
  const now = new Date().toISOString();

  const existing = await userRef.get();
  const data = existing.data() as Record<string, unknown> | undefined;
  if (isFnoExperience(data?.fnoExperience)) {
    const summary = await getRewardsSummary(uid);
    return {
      awarded: false,
      amount: 0,
      balance: summary.diamonds,
      lifetimeEarned: summary.diamondsLifetimeEarned,
      daysExtendedThisEarn: 0,
      totalDaysExtended: summary.rewardsDaysExtended,
      reason: "already_claimed",
      questKey: FNO_EXPERIENCE_QUEST_KEY,
      experience: data.fnoExperience,
    };
  }

  await userRef.set(
    {
      fnoExperience: experience,
      fnoExperienceAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  const earn = await earnDiamonds(uid, FNO_EXPERIENCE_QUEST_KEY, DIAMONDS_PER_QUEST, {
    experience,
  });

  return { ...earn, experience };
}
