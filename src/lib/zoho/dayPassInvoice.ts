import "server-only";

import type { SubscriptionDoc } from "@/lib/subscription";
import { createPaidDayPassInvoice } from "@/lib/zoho/billing";

/**
 * Idempotently generates the Paid Day Pass invoice for a confirmed payment and
 * records the resulting invoice id on the subscription doc.
 *
 * Safe to call from BOTH the Zoho webhook and the on-return reconciliation —
 * only the first call for a given `paymentId` creates an invoice; subsequent
 * calls short-circuit. Best-effort: any failure is logged and swallowed so it
 * never blocks granting the buyer access.
 */
export async function ensureDayPassInvoice(args: {
  db: FirebaseFirestore.Firestore;
  uid: string;
  customerId: string;
  paymentId: string;
  amountInr?: number;
}): Promise<void> {
  const { db, uid, customerId, paymentId, amountInr } = args;
  if (!customerId || !paymentId) return;

  const subRef = db.collection("subscriptions").doc(uid);
  try {
    const snap = await subRef.get();
    const sub = snap.exists ? (snap.data() as SubscriptionDoc) : null;
    // Already invoiced this exact payment → nothing to do.
    if (sub?.dayPassInvoiceId && sub.lastDayPassPaymentId === paymentId) return;

    const invoiceId = await createPaidDayPassInvoice({ customerId, uid, paymentId, amountInr });
    await subRef.set({ dayPassInvoiceId: invoiceId, lastDayPassPaymentId: paymentId }, { merge: true });
  } catch (e) {
    console.error("[Day Pass invoice] generation failed:", (e as Error).message);
  }
}
