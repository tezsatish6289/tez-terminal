import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/chat/require-user";
import { attributeFnoReferral } from "@/lib/fnoninja/affiliate";
import { FNONINJA_REFERRAL_BONUS_TRIAL_DAYS } from "@/lib/fnoninja/pricing";

export const dynamic = "force-dynamic";

/**
 * POST /api/fnoninja/affiliate/apply-code
 * Body: { referralCode }
 * First-touch attribution + +3 trial days (once).
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { referralCode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const code = typeof body.referralCode === "string" ? body.referralCode.trim() : "";
  if (!code) {
    return NextResponse.json({ error: "Enter a referral code" }, { status: 400 });
  }

  const result = await attributeFnoReferral({
    uid: auth.decoded.uid,
    referralCode: code,
    grantBonus: true,
  });

  if (!result.attributed) {
    if (result.reason === "invalid_code") {
      return NextResponse.json({ error: "That code isn’t valid. Check and try again." }, { status: 400 });
    }
    if (result.reason === "self_referral") {
      return NextResponse.json({ error: "You can’t use your own referral code." }, { status: 400 });
    }
    if (result.reason === "already_attributed") {
      return NextResponse.json({
        ok: true,
        attributed: false,
        alreadyAttributed: true,
        bonusApplied: result.bonus?.applied ?? false,
        bonusDays: result.bonus?.bonusDays ?? 0,
        trialEndDate: result.bonus?.trialEndDate ?? null,
      });
    }
    return NextResponse.json({ error: "Could not apply code" }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    attributed: true,
    bonusApplied: result.bonus?.applied ?? false,
    bonusDays: result.bonus?.applied
      ? result.bonus.bonusDays
      : FNONINJA_REFERRAL_BONUS_TRIAL_DAYS,
    trialEndDate: result.bonus?.trialEndDate ?? null,
  });
}
