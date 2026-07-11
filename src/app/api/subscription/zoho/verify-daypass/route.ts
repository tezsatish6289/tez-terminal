import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/firebase/admin";
import { isSubscriptionActive, type SubscriptionDoc } from "@/lib/subscription";
import { syncChatAccess } from "@/lib/chat/access";
import { DAY_PASS_INR, getLatestCustomerPayment, getZohoBillingConfig } from "@/lib/zoho/billing";
import { ensureDayPassInvoice } from "@/lib/zoho/dayPassInvoice";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
// One-time payment `date` from Zoho is often date-only, so allow a couple of days
// of slack; the payment_id dedupe prevents re-granting.
const RECENT_WINDOW_MS = 2 * DAY_MS;

/**
 * POST /api/subscription/zoho/verify-daypass
 * Header: Authorization: Bearer <Firebase ID token>
 *
 * Self-healing reconciliation for the one-time Day Pass. Because payment links
 * don't reliably fire the subscription webhook (and don't redirect back), we
 * check Zoho for the customer's latest payment when they return to the app and
 * grant a 24-hour Day Pass if a matching ₹99 payment exists that we haven't
 * already applied. Idempotent via `lastDayPassPaymentId`.
 */
export async function POST(request: NextRequest) {
  try {
    if (!getZohoBillingConfig()) {
      return NextResponse.json({ applied: false, reason: "not_configured" });
    }

    const authHeader = request.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) return NextResponse.json({ error: "Missing auth token" }, { status: 401 });

    let uid: string;
    try {
      uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
    } catch {
      return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
    }

    const db = getAdminFirestore();

    const userSnap = await db.collection("users").doc(uid).get();
    const customerId = userSnap.get("zohoCustomerId") as string | undefined;
    if (!customerId) return NextResponse.json({ applied: false, reason: "no_customer" });

    const subRef = db.collection("subscriptions").doc(uid);
    const subSnap = await subRef.get();
    const sub = subSnap.exists ? (subSnap.data() as SubscriptionDoc) : null;

    // Don't override someone who already has access (trial or an active plan).
    if (isSubscriptionActive(sub)) {
      return NextResponse.json({ applied: false, reason: "already_active" });
    }

    const payment = await getLatestCustomerPayment(customerId);
    if (!payment) return NextResponse.json({ applied: false, reason: "no_payment" });

    // Must look like a Day Pass (₹99), be recent, and not already applied.
    const isDayPassAmount = Math.abs(payment.amountInr - DAY_PASS_INR) < 1;
    const paidAt = payment.dateIso ? new Date(payment.dateIso).getTime() : 0;
    const isRecent = paidAt > 0 && Date.now() - paidAt <= RECENT_WINDOW_MS;
    const alreadyApplied = sub?.lastDayPassPaymentId === payment.paymentId;

    if (!isDayPassAmount || !isRecent || alreadyApplied) {
      return NextResponse.json({
        applied: false,
        reason: alreadyApplied ? "already_applied" : !isDayPassAmount ? "amount_mismatch" : "stale",
      });
    }

    const nowIso = new Date().toISOString();
    const endDateIso = new Date(Date.now() + DAY_MS).toISOString();
    const update: Partial<SubscriptionDoc> = {
      status: "active",
      tier: "daypass",
      subscriptionEndDate: endDateIso,
      subscriptionStartDate: nowIso,
      planCode: "daypass",
      autoRenew: false,
      lastDayPassPaymentId: payment.paymentId,
    };
    await subRef.set(update, { merge: true });
    void syncChatAccess(uid, true).catch((e) =>
      console.error("[Verify Day Pass] chat access sync failed", e),
    );

    // Now that the payment is confirmed, generate the Paid tax invoice (never
    // before payment — that would inflate revenue on drop-offs). Idempotent.
    await ensureDayPassInvoice({
      db,
      uid,
      customerId,
      paymentId: payment.paymentId,
      amountInr: payment.amountInr,
    });

    return NextResponse.json({ applied: true, tier: "daypass", endDate: endDateIso });
  } catch (error: any) {
    console.error("[Verify Day Pass]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
