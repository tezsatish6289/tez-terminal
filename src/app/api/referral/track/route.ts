import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/referral/track
 * Called when a user logs in with a stored referral code.
 * Links the referred user to the referrer (idempotent — skips if already attributed).
 */
export async function POST(request: NextRequest) {
  try {
    const { referralCode, userId } = await request.json();

    if (!referralCode || !userId) {
      return NextResponse.json(
        { error: "Missing referralCode or userId" },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();

    const userDoc = await db.collection("users").doc(userId).get();
    if (userDoc.exists && userDoc.data()?.referredBy) {
      return NextResponse.json({ attributed: true, alreadySet: true });
    }

    const referrerQuery = await db
      .collection("users")
      .where("referralCode", "==", referralCode)
      .limit(1)
      .get();

    if (referrerQuery.empty) {
      return NextResponse.json({ attributed: false, error: "Invalid referral code" });
    }

    const referrerDoc = referrerQuery.docs[0];
    const referrerId = referrerDoc.id;

    if (referrerId === userId) {
      return NextResponse.json({ attributed: false, error: "Cannot refer yourself" });
    }

    await db.collection("users").doc(userId).set(
      { referredBy: referrerId },
      { merge: true }
    );

    return NextResponse.json({ attributed: true });
  } catch (error: any) {
    console.error("[Referral Track]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
