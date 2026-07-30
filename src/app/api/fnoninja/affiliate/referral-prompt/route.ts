import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireUser } from "@/lib/chat/require-user";
import {
  FNONINJA_FREE_TRIAL_DAYS,
  FNONINJA_REFERRAL_BONUS_TRIAL_DAYS,
  FNONINJA_TRIAL_WITH_REFERRAL_DAYS,
} from "@/lib/fnoninja/pricing";
import type { SubscriptionDoc } from "@/lib/subscription";

export const dynamic = "force-dynamic";

const PROMPT_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * GET /api/fnoninja/affiliate/referral-prompt
 * Whether to show the post-login “Got a referral code?” modal.
 *
 * POST body: { action: "dismiss" } — mark prompt dismissed (skip).
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getAdminFirestore();
  const uid = auth.decoded.uid;
  const [userSnap, subSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("subscriptions").doc(uid).get(),
  ]);

  const user = userSnap.data() ?? {};
  const sub = subSnap.exists ? (subSnap.data() as SubscriptionDoc) : null;
  const referredBy =
    typeof user.fnoninjaReferredBy === "string" && user.fnoninjaReferredBy
      ? user.fnoninjaReferredBy
      : null;
  const dismissed = typeof user.fnoninjaReferralPromptDismissedAt === "string";
  const bonusApplied = typeof user.fnoninjaReferralBonusAppliedAt === "string";
  const onTrial = sub?.status === "trial";

  const joinedMs = user.fnoninjaJoinedAt
    ? new Date(user.fnoninjaJoinedAt as string).getTime()
    : 0;
  const trialStartMs = sub?.trialStartDate ? new Date(sub.trialStartDate).getTime() : 0;
  const fresh =
    (joinedMs > 0 && Date.now() - joinedMs < PROMPT_WINDOW_MS) ||
    (trialStartMs > 0 && Date.now() - trialStartMs < PROMPT_WINDOW_MS);

  const showPrompt = Boolean(onTrial && !referredBy && !dismissed && fresh);

  return NextResponse.json({
    showPrompt,
    alreadyReferred: Boolean(referredBy),
    bonusApplied,
    onTrial,
    baseTrialDays: FNONINJA_FREE_TRIAL_DAYS,
    bonusTrialDays: FNONINJA_REFERRAL_BONUS_TRIAL_DAYS,
    trialWithReferralDays: FNONINJA_TRIAL_WITH_REFERRAL_DAYS,
    trialEndDate: sub?.trialEndDate ?? null,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action !== "dismiss") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  await getAdminFirestore()
    .collection("users")
    .doc(auth.decoded.uid)
    .set({ fnoninjaReferralPromptDismissedAt: new Date().toISOString() }, { merge: true });

  return NextResponse.json({ ok: true });
}
