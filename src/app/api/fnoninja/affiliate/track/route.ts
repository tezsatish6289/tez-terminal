import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/chat/require-user";
import { attributeFnoReferral } from "@/lib/fnoninja/affiliate";

export const dynamic = "force-dynamic";

/**
 * POST /api/fnoninja/affiliate/track
 * Body: { referralCode }
 * Sets users/{uid}.fnoninjaReferredBy once (first-touch) and grants +3 trial days.
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

  const code = typeof body.referralCode === "string" ? body.referralCode.trim().toLowerCase() : "";
  if (!code) return NextResponse.json({ error: "referralCode required" }, { status: 400 });

  const result = await attributeFnoReferral({
    uid: auth.decoded.uid,
    referralCode: code,
    grantBonus: true,
  });

  return NextResponse.json({
    attributed: result.attributed,
    reason: result.reason,
    referrerId: result.referrerId,
    bonusApplied: result.bonus?.applied ?? false,
    bonusDays: result.bonus?.bonusDays ?? 0,
    trialEndDate: result.bonus?.trialEndDate ?? null,
  });
}
