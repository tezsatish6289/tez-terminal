import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/subscription/history?uid=...
 * Returns subscription status + all payment history for a user.
 */
export async function GET(request: NextRequest) {
  try {
    const uid = new URL(request.url).searchParams.get("uid");
    if (!uid) {
      return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    }

    const db = getAdminFirestore();

    let subscription = null;
    try {
      const subSnap = await db.collection("subscriptions").doc(uid).get();
      subscription = subSnap.exists ? subSnap.data() : null;
    } catch (e: any) {
      console.error("[Billing History] subscription fetch failed:", e.message);
    }

    let payments: any[] = [];
    try {
      const paymentsSnap = await db
        .collection("payments")
        .where("userId", "==", uid)
        .get();
      payments = paymentsSnap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a: any, b: any) => {
          const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return bTime - aTime;
        });
    } catch (e: any) {
      console.error("[Billing History] payments fetch failed:", e.message);
    }

    return NextResponse.json({ subscription, payments });
  } catch (error: any) {
    console.error("[Billing History]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
