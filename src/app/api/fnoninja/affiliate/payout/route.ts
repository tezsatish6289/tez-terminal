import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireUser } from "@/lib/chat/require-user";
import {
  FNO_AFFILIATE_COMMISSIONS,
  FNO_AFFILIATE_PAYOUTS,
  computeTds,
  fetchFnoAffiliateConfig,
  getFyGrossCommissionInr,
  nextInvoiceNumber,
  releaseHeldCommissions,
  roundInr,
  type AffiliateCommissionDoc,
  type AffiliateKycDoc,
  type AffiliateKycSnapshot,
  type AffiliatePayoutDoc,
} from "@/lib/fnoninja/affiliate";

export const dynamic = "force-dynamic";

/**
 * POST /api/fnoninja/affiliate/payout
 * Request cash settlement for all currently available commissions.
 * Creates reverse invoice + locks commissions (RazorpayX transfer is manual/admin).
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const uid = auth.decoded.uid;
  const db = getAdminFirestore();
  const config = await fetchFnoAffiliateConfig();
  if (!config.enabled) {
    return NextResponse.json({ error: "Affiliate program is disabled" }, { status: 403 });
  }

  await releaseHeldCommissions(uid);

  const userSnap = await db.collection("users").doc(uid).get();
  const kyc = userSnap.data()?.fnoninjaAffiliateKyc as AffiliateKycDoc | undefined;
  if (!kyc?.pan || !kyc.bankAccountNumber || !kyc.ifsc || !kyc.termsAcceptedAt) {
    return NextResponse.json(
      { error: "Complete PAN and bank details before requesting payout" },
      { status: 400 },
    );
  }

  const availSnap = await db
    .collection(FNO_AFFILIATE_COMMISSIONS)
    .where("referrerId", "==", uid)
    .get();

  const commissions = availSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as AffiliateCommissionDoc) }))
    .filter((c) => c.status === "available");

  if (commissions.length === 0) {
    return NextResponse.json({ error: "No available commission to settle" }, { status: 400 });
  }
  const grossAmountInr = roundInr(
    commissions.reduce((s, c) => s + (Number(c.commissionAmountInr) || 0), 0),
  );

  if (grossAmountInr < config.minPayoutInr) {
    return NextResponse.json(
      {
        error: `Minimum payout is ₹${config.minPayoutInr}. Available: ₹${grossAmountInr}`,
      },
      { status: 400 },
    );
  }

  const fyGrossBefore = await getFyGrossCommissionInr(uid);
  const { tdsApplied, tdsAmountInr, netAmountInr } = computeTds({
    grossInr: grossAmountInr,
    fyGrossBeforeInr: fyGrossBefore,
    tdsRate: config.tdsRate,
    tdsThresholdInr: config.tdsThresholdInr,
  });

  const counterRef = db.collection("config").doc("fnoninja_affiliate_invoice_seq");
  const payoutRef = db.collection(FNO_AFFILIATE_PAYOUTS).doc();

  const kycSnapshot: AffiliateKycSnapshot = {
    fullName: kyc.fullName,
    pan: kyc.pan,
    accountHolderName: kyc.accountHolderName,
    bankAccountNumber: kyc.bankAccountNumber,
    ifsc: kyc.ifsc,
    upiId: kyc.upiId,
    address: kyc.address,
    state: kyc.state,
    gstin: kyc.gstin,
    email:
      (typeof userSnap.data()?.email === "string" && userSnap.data()!.email) ||
      auth.decoded.email ||
      "",
    phone: kyc.phone,
    termsAcceptedAt: kyc.termsAcceptedAt,
  };

  let invoiceNumber = "";
  try {
    await db.runTransaction(async (tx) => {
      for (const c of commissions) {
        const fresh = await tx.get(db.collection(FNO_AFFILIATE_COMMISSIONS).doc(c.id));
        if (!fresh.exists || fresh.data()?.status !== "available") {
          throw new Error("Commission no longer available — refresh and try again");
        }
      }

      const counterSnap = await tx.get(counterRef);
      const seq = (Number(counterSnap.data()?.seq) || 0) + 1;
      tx.set(counterRef, { seq, updatedAt: new Date().toISOString() }, { merge: true });

      const now = new Date().toISOString();
      invoiceNumber = nextInvoiceNumber(seq);
      const payout: AffiliatePayoutDoc = {
        referrerId: uid,
        commissionIds: commissions.map((c) => c.id),
        grossAmountInr,
        tdsRate: config.tdsRate,
        tdsAmountInr,
        netAmountInr,
        tdsApplied,
        status: "pending_review",
        invoiceNumber,
        kyc: kycSnapshot,
        createdAt: now,
        completedAt: null,
        failedAt: null,
        errorMessage: null,
        razorpayxPayoutId: null,
        adminNote: null,
      };
      tx.set(payoutRef, payout);

      for (const c of commissions) {
        tx.update(db.collection(FNO_AFFILIATE_COMMISSIONS).doc(c.id), {
          status: "locked",
          payoutId: payoutRef.id,
        });
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Payout failed";
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    payoutId: payoutRef.id,
    invoiceNumber,
    grossAmountInr,
    tdsAmountInr,
    netAmountInr,
    tdsApplied,
  });
}
