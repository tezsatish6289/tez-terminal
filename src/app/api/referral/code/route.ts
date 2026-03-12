import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { generateReferralCode } from "@/lib/referral";

export const dynamic = "force-dynamic";

/**
 * GET /api/referral/code?uid=...
 * Returns the user's referral code and link. Generates one if it doesn't exist.
 */
export async function GET(request: NextRequest) {
  try {
    const uid = request.nextUrl.searchParams.get("uid");
    if (!uid) {
      return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();

    let referralCode: string;

    if (userDoc.exists && userDoc.data()?.referralCode) {
      referralCode = userDoc.data()!.referralCode;
    } else {
      // Generate a unique code, retry on collision
      let attempts = 0;
      do {
        referralCode = generateReferralCode();
        const existing = await db
          .collection("users")
          .where("referralCode", "==", referralCode)
          .limit(1)
          .get();
        if (existing.empty) break;
        attempts++;
      } while (attempts < 5);

      await userRef.set({ referralCode }, { merge: true });
    }

    const referralLink = `https://tezterminal.com?ref=${referralCode}`;

    return NextResponse.json({ referralCode, referralLink });
  } catch (error: any) {
    console.error("[Referral Code]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
