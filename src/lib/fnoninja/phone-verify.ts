/**
 * FNONINJA phone verification policy:
 * - Soft ask in the first 24h after join (existing users get 24h from rollout).
 * - Trial access hard-blocks after grace until OTP-verified.
 * - Paid users get a dismissible prompt (never hard-blocked for phone alone).
 * - One verified phone → one free trial ever (indexed by phone hash).
 */

/** When phone collection shipped — existing users' grace starts from this instant. */
export const PHONE_VERIFY_ROLLOUT_AT = "2026-07-16T12:00:00.000Z";

export const PHONE_VERIFY_GRACE_MS = 24 * 60 * 60 * 1000;

/** Firestore collection: phoneHash → { uid, claimedAt } — one trial per number. */
export const PHONE_TRIAL_CLAIMS_COLLECTION = "phone_trial_claims";

/** Firestore collection: phoneHash → { uid, verifiedAt } — one owner per number. */
export const PHONE_OWNERS_COLLECTION = "phone_owners";

export const PHONE_PROMPT_DISMISS_KEY = "fnoninja-phone-prompt-dismissed";
/** Re-show soft prompt after this long if dismissed. */
export const PHONE_PROMPT_DISMISS_MS = 12 * 60 * 60 * 1000;

export function phoneGraceEndsAt(fnoninjaJoinedAt?: string | null, nowMs = Date.now()): Date {
  const launchMs = new Date(PHONE_VERIFY_ROLLOUT_AT).getTime();
  const joinedMs = fnoninjaJoinedAt ? new Date(fnoninjaJoinedAt).getTime() : nowMs;
  const startMs = Math.max(
    Number.isFinite(joinedMs) ? joinedMs : nowMs,
    Number.isFinite(launchMs) ? launchMs : nowMs,
  );
  return new Date(startMs + PHONE_VERIFY_GRACE_MS);
}

export function isPhoneGraceElapsed(
  fnoninjaJoinedAt?: string | null,
  nowMs = Date.now(),
): boolean {
  return nowMs >= phoneGraceEndsAt(fnoninjaJoinedAt, nowMs).getTime();
}

/** Trial (not paid) past grace without verification → block product access. */
export function shouldBlockTrialForPhone(args: {
  phoneVerified: boolean;
  subscriptionStatus: "trial" | "active" | "expired" | string;
  fnoninjaJoinedAt?: string | null;
  nowMs?: number;
}): boolean {
  if (args.phoneVerified) return false;
  if (args.subscriptionStatus !== "trial") return false;
  return isPhoneGraceElapsed(args.fnoninjaJoinedAt, args.nowMs ?? Date.now());
}

/** Soft prompt: missing verification, and either in grace or paid/active. */
export function shouldSoftPromptPhone(args: {
  phoneVerified: boolean;
  subscriptionStatus: "trial" | "active" | "expired" | string;
  fnoninjaJoinedAt?: string | null;
  nowMs?: number;
}): boolean {
  if (args.phoneVerified) return false;
  if (args.subscriptionStatus === "expired") return false;
  if (args.subscriptionStatus === "active") return true;
  if (args.subscriptionStatus === "trial") {
    return !isPhoneGraceElapsed(args.fnoninjaJoinedAt, args.nowMs ?? Date.now());
  }
  return false;
}

/** Skip phone UI on auth/legal surfaces. */
export function shouldShowPhonePromptOnPath(pathname: string): boolean {
  const p = pathname.toLowerCase();
  if (p.includes("/login")) return false;
  if (p.includes("/privacy") || p.includes("/terms") || p.includes("/disclaimer")) return false;
  return true;
}
