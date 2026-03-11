import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { computeNewEndDate, type SubscriptionDoc } from "@/lib/subscription";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/seed-plans?key=...
 * Seeds config/plans doc. Also supports &action=activate-payment&paymentId=... to manually activate a payment.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminFirestore();
  const action = searchParams.get("action");

  try {
    if (action === "activate-payment") {
      const paymentId = searchParams.get("paymentId");
      if (!paymentId) return NextResponse.json({ error: "Missing paymentId" }, { status: 400 });

      const paymentSnap = await db.collection("payments").doc(paymentId).get();
      if (!paymentSnap.exists) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

      const payment = paymentSnap.data()!;
      const subRef = db.collection("subscriptions").doc(payment.userId);
      const subSnap = await subRef.get();

      if (!subSnap.exists) return NextResponse.json({ error: "Subscription doc not found" }, { status: 404 });

      const subData = subSnap.data() as SubscriptionDoc;
      const newEndDate = computeNewEndDate(subData.subscriptionEndDate, payment.days);

      await subRef.update({ status: "active", subscriptionEndDate: newEndDate });
      await db.collection("payments").doc(paymentId).update({ status: "finished", updatedAt: new Date().toISOString() });

      return NextResponse.json({ success: true, message: `Activated ${payment.days} days for ${payment.userId}, ends ${newEndDate}` });
    }

    await db.collection("config").doc("plans").set({
      plans: [
        { days: 30, price: 15, label: "30 days" },
        { days: 90, price: 20, label: "90 days", badge: "Most Popular" },
        { days: 365, price: 25, label: "365 days", badge: "Best Value" },
      ],
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, message: "Plans seeded" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
