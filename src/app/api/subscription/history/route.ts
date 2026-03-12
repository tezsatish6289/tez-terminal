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

    const [subSnap, paymentsSnap] = await Promise.all([
      db.collection("subscriptions").doc(uid).get(),
      db.collection("payments").where("userId", "==", uid).orderBy("createdAt", "desc").get(),
    ]);

    const subscription = subSnap.exists ? subSnap.data() : null;

    const payments = paymentsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json({ subscription, payments });
  } catch (error: any) {
    console.error("[Billing History]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
