import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/referral/dashboard?uid=...
 * Returns the referrer's dashboard data: referred users, commissions, payouts, and wallet.
 */
export async function GET(request: NextRequest) {
  try {
    const uid = request.nextUrl.searchParams.get("uid");
    if (!uid) {
      return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    }

    const db = getAdminFirestore();

    const userDoc = await db.collection("users").doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const walletAddress = userData?.referralWalletAddress || null;

    // Get all users referred by this user
    const referredUsersSnap = await db
      .collection("users")
      .where("referredBy", "==", uid)
      .get();

    const referredUsers = referredUsersSnap.docs.map((doc) => ({
      uid: doc.id,
      displayName: doc.data().displayName || null,
      email: doc.data().email || null,
      photoURL: doc.data().photoURL || null,
      joinedAt: doc.data().createdAt || doc.data().lastSeenAt || null,
    }));

    // Get all commissions for this referrer (sorted in JS to avoid composite index)
    const commissionsSnap = await db
      .collection("referral_commissions")
      .where("referrerId", "==", uid)
      .get();

    const commissions = commissionsSnap.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    // Get all payouts for this referrer (sorted in JS to avoid composite index)
    const payoutsSnap = await db
      .collection("referral_payouts")
      .where("referrerId", "==", uid)
      .get();

    const payouts = payoutsSnap.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .sort((a: any, b: any) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    // Calculate summary stats
    const totalEarned = commissions.reduce(
      (sum: number, c: any) => sum + (c.commissionAmountUsd || 0),
      0
    );
    const pendingAmount = commissions
      .filter((c: any) => c.status === "pending")
      .reduce((sum: number, c: any) => sum + (c.commissionAmountUsd || 0), 0);
    const paidAmount = commissions
      .filter((c: any) => c.status === "paid")
      .reduce((sum: number, c: any) => sum + (c.commissionAmountUsd || 0), 0);

    return NextResponse.json({
      walletAddress,
      referredUsers,
      commissions,
      payouts,
      stats: {
        totalReferred: referredUsers.length,
        totalEarned: Math.round(totalEarned * 100) / 100,
        pendingAmount: Math.round(pendingAmount * 100) / 100,
        paidAmount: Math.round(paidAmount * 100) / 100,
      },
    });
  } catch (error: any) {
    console.error("[Referral Dashboard]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
