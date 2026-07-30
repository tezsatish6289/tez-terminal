import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireUser } from "@/lib/chat/require-user";
import { resolveAffiliateByCode } from "@/lib/fnoninja/affiliate";

export const dynamic = "force-dynamic";

/**
 * POST /api/fnoninja/affiliate/track
 * Body: { referralCode }
 * Sets users/{uid}.fnoninjaReferredBy once (first-touch).
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

  const uid = auth.decoded.uid;
  const db = getAdminFirestore();
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  const existing = userSnap.data()?.fnoninjaReferredBy;
  if (typeof existing === "string" && existing) {
    return NextResponse.json({ attributed: false, reason: "already_attributed" });
  }

  const referrerId = await resolveAffiliateByCode(code);
  if (!referrerId) {
    return NextResponse.json({ attributed: false, reason: "invalid_code" });
  }
  if (referrerId === uid) {
    return NextResponse.json({ attributed: false, reason: "self_referral" });
  }

  await userRef.set(
    {
      fnoninjaReferredBy: referrerId,
      fnoninjaReferredAt: new Date().toISOString(),
      fnoninjaReferralCodeUsed: code,
    },
    { merge: true },
  );

  return NextResponse.json({ attributed: true, referrerId });
}
