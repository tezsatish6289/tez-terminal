import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { getPaymentStatus } from "@/lib/nowpayments";
import { computeNewEndDate, type SubscriptionDoc } from "@/lib/subscription";

export const dynamic = "force-dynamic";

async function activateSubscription(
  db: FirebaseFirestore.Firestore,
  userId: string,
  days: number,
  paymentId: string
) {
  const subRef = db.collection("subscriptions").doc(userId);
  const subSnap = await subRef.get();
  if (!subSnap.exists) return;

  const subData = subSnap.data() as SubscriptionDoc;
  if (subData.status === "active" && subData.subscriptionEndDate) {
    const remaining = new Date(subData.subscriptionEndDate).getTime() - Date.now();
    if (remaining > days * 24 * 60 * 60 * 1000) return;
  }

  const newEndDate = computeNewEndDate(subData.subscriptionEndDate, days);
  await subRef.update({
    status: "active",
    subscriptionEndDate: newEndDate,
  });

  console.log(`[Payment Status] Activated subscription for ${userId}: +${days} days (payment ${paymentId})`);
}

/**
 * GET /api/subscription/payment-status/[paymentId]
 * Returns the current payment status, polling NOWPayments for fresh data.
 * Also activates the subscription as a fallback if the webhook didn't fire.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const { paymentId } = await params;

    if (!paymentId) {
      return NextResponse.json({ error: "Missing paymentId" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const paymentRef = db.collection("payments").doc(paymentId);
    const paymentSnap = await paymentRef.get();

    if (!paymentSnap.exists) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const paymentData = paymentSnap.data()!;

    const terminalStatuses = ["finished", "failed", "refunded", "expired"];
    if (terminalStatuses.includes(paymentData.status)) {
      return NextResponse.json({
        paymentId,
        status: paymentData.status,
        payAddress: paymentData.payAddress,
        payAmount: paymentData.payAmount,
        payCurrency: paymentData.payCurrency,
        priceAmountUsd: paymentData.priceAmountUsd,
        orderId: paymentData.orderId,
        days: paymentData.days,
      });
    }

    try {
      const freshStatus = await getPaymentStatus(Number(paymentId));
      const newStatus = freshStatus.payment_status;

      if (newStatus !== paymentData.status) {
        await paymentRef.update({
          status: newStatus,
          updatedAt: new Date().toISOString(),
        });
      }

      if (newStatus === "sending" || newStatus === "finished") {
        await activateSubscription(db, paymentData.userId, paymentData.days, paymentId);
      }

      return NextResponse.json({
        paymentId,
        status: newStatus,
        actuallyPaid: freshStatus.actually_paid,
        payAddress: paymentData.payAddress,
        payAmount: paymentData.payAmount,
        payCurrency: paymentData.payCurrency,
        priceAmountUsd: paymentData.priceAmountUsd,
        orderId: paymentData.orderId,
        days: paymentData.days,
      });
    } catch {
      return NextResponse.json({
        paymentId,
        status: paymentData.status,
        payAddress: paymentData.payAddress,
        payAmount: paymentData.payAmount,
        payCurrency: paymentData.payCurrency,
        priceAmountUsd: paymentData.priceAmountUsd,
        orderId: paymentData.orderId,
        days: paymentData.days,
      });
    }
  } catch (error: any) {
    console.error("[Payment Status]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
