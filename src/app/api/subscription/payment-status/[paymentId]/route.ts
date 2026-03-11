import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { getPaymentStatus } from "@/lib/nowpayments";

export const dynamic = "force-dynamic";

/**
 * GET /api/subscription/payment-status/[paymentId]
 * Returns the current payment status, polling NOWPayments for fresh data.
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

      if (freshStatus.payment_status !== paymentData.status) {
        await paymentRef.update({
          status: freshStatus.payment_status,
          updatedAt: new Date().toISOString(),
        });
      }

      return NextResponse.json({
        paymentId,
        status: freshStatus.payment_status,
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
