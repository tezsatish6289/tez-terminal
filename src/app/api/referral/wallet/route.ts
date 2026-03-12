import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { isValidTrc20Address } from "@/lib/referral";

export const dynamic = "force-dynamic";

/**
 * POST /api/referral/wallet
 * Sets or updates the user's TRC-20 USDT payout wallet address.
 */
export async function POST(request: NextRequest) {
  try {
    const { uid, walletAddress } = await request.json();

    if (!uid || !walletAddress) {
      return NextResponse.json(
        { error: "Missing uid or walletAddress" },
        { status: 400 }
      );
    }

    const trimmed = walletAddress.trim();

    if (!isValidTrc20Address(trimmed)) {
      return NextResponse.json(
        { error: "Invalid TRC-20 wallet address. Must start with 'T' and be 34 characters." },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    await db.collection("users").doc(uid).set(
      { referralWalletAddress: trimmed },
      { merge: true }
    );

    return NextResponse.json({ success: true, walletAddress: trimmed });
  } catch (error: any) {
    console.error("[Referral Wallet]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
