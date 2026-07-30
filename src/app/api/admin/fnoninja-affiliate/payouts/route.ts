import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import {
  FNO_AFFILIATE_COMMISSIONS,
  FNO_AFFILIATE_PAYOUTS,
  type AffiliatePayoutDoc,
} from "@/lib/fnoninja/affiliate";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/fnoninja-affiliate/payouts
 * List recent affiliate payouts for RazorpayX settlement.
 *
 * PATCH body: { payoutId, status: "completed"|"failed"|"processing"|"cancelled",
 *   razorpayxPayoutId?, adminNote? }
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const db = getAdminFirestore();
  const status = new URL(request.url).searchParams.get("status");
  let query: FirebaseFirestore.Query = db.collection(FNO_AFFILIATE_PAYOUTS);
  if (status) query = query.where("status", "==", status);
  const snap = await query.limit(100).get();
  const payouts = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as AffiliatePayoutDoc) }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return NextResponse.json({ payouts });
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return NextResponse.json({ error: admin.error }, { status: admin.status });

  let body: {
    payoutId?: string;
    status?: string;
    razorpayxPayoutId?: string | null;
    adminNote?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payoutId = body.payoutId?.trim();
  const nextStatus = body.status;
  if (!payoutId || !nextStatus) {
    return NextResponse.json({ error: "payoutId and status required" }, { status: 400 });
  }
  if (!["completed", "failed", "processing", "cancelled", "pending_review"].includes(nextStatus)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const ref = db.collection(FNO_AFFILIATE_PAYOUTS).doc(payoutId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const payout = snap.data() as AffiliatePayoutDoc;

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    status: nextStatus,
    adminNote: body.adminNote ?? payout.adminNote,
    razorpayxPayoutId: body.razorpayxPayoutId ?? payout.razorpayxPayoutId,
  };
  if (nextStatus === "completed") {
    update.completedAt = now;
    update.failedAt = null;
    update.errorMessage = null;
  }
  if (nextStatus === "failed") {
    update.failedAt = now;
    update.errorMessage = body.adminNote || "Marked failed";
  }

  await db.runTransaction(async (tx) => {
    tx.update(ref, update);
    for (const cid of payout.commissionIds || []) {
      const cRef = db.collection(FNO_AFFILIATE_COMMISSIONS).doc(cid);
      if (nextStatus === "completed") {
        tx.update(cRef, { status: "paid", paidAt: now });
      } else if (nextStatus === "cancelled" || nextStatus === "failed") {
        tx.update(cRef, { status: "available", payoutId: null });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
