import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireUser } from "@/lib/chat/require-user";
import {
  FNO_AFFILIATE_COMMISSIONS,
  FNO_AFFILIATE_PAYOUTS,
  affiliateLinkForCode,
  ensureFnoAffiliateCode,
  fetchFnoAffiliateConfig,
  getLifetimeReferredSalesInr,
  ladderRateForSales,
  maskAccountNumber,
  nextLadderTier,
  releaseHeldCommissions,
  type AffiliateCommissionDoc,
  type AffiliateKycDoc,
  type AffiliatePayoutDoc,
} from "@/lib/fnoninja/affiliate";

export const dynamic = "force-dynamic";

/**
 * GET /api/fnoninja/affiliate/dashboard
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const uid = auth.decoded.uid;
  const db = getAdminFirestore();
  const config = await fetchFnoAffiliateConfig();

  await releaseHeldCommissions(uid).catch(() => 0);

  const code = await ensureFnoAffiliateCode(uid);
  const lifetimeSalesInr = await getLifetimeReferredSalesInr(uid);
  const currentTier = ladderRateForSales(lifetimeSalesInr, config.ladder);
  const nextTier = nextLadderTier(lifetimeSalesInr, config.ladder);

  const [commSnap, payoutSnap, userSnap, referredSnap] = await Promise.all([
    db.collection(FNO_AFFILIATE_COMMISSIONS).where("referrerId", "==", uid).get(),
    db.collection(FNO_AFFILIATE_PAYOUTS).where("referrerId", "==", uid).get(),
    db.collection("users").doc(uid).get(),
    db.collection("users").where("fnoninjaReferredBy", "==", uid).limit(100).get(),
  ]);

  const commissions = commSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as AffiliateCommissionDoc) }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const payouts = payoutSnap.docs
    .map((d) => {
      const raw = d.data() as AffiliatePayoutDoc;
      return {
        id: d.id,
        invoiceNumber: raw.invoiceNumber,
        grossAmountInr: raw.grossAmountInr,
        tdsAmountInr: raw.tdsAmountInr,
        netAmountInr: raw.netAmountInr,
        tdsApplied: raw.tdsApplied,
        status: raw.status,
        createdAt: raw.createdAt,
        completedAt: raw.completedAt,
        commissionCount: raw.commissionIds?.length ?? 0,
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  let heldInr = 0;
  let availableInr = 0;
  let paidInr = 0;
  let lockedInr = 0;
  for (const c of commissions) {
    if (c.status === "reversed") continue;
    if (c.status === "held") heldInr += c.commissionAmountInr;
    else if (c.status === "available") availableInr += c.commissionAmountInr;
    else if (c.status === "locked") lockedInr += c.commissionAmountInr;
    else if (c.status === "paid") paidInr += c.commissionAmountInr;
  }

  const kyc = (userSnap.data()?.fnoninjaAffiliateKyc ?? null) as AffiliateKycDoc | null;
  const kycPublic = kyc
    ? {
        fullName: kyc.fullName,
        pan: kyc.pan,
        accountHolderName: kyc.accountHolderName,
        bankAccountNumberMasked: maskAccountNumber(kyc.bankAccountNumber),
        ifsc: kyc.ifsc,
        upiId: kyc.upiId,
        address: kyc.address,
        state: kyc.state,
        gstin: kyc.gstin,
        phone: kyc.phone,
        termsAcceptedAt: kyc.termsAcceptedAt,
        complete: true,
      }
    : { complete: false as const };

  const referred = referredSnap.docs.map((d) => {
    const u = d.data();
    return {
      uid: d.id,
      displayName: (u.displayName as string) || null,
      email: typeof u.email === "string" ? maskEmail(u.email) : null,
      joinedAt: (u.fnoninjaReferredAt as string) || (u.fnoninjaJoinedAt as string) || null,
    };
  });

  return NextResponse.json({
    enabled: config.enabled,
    referralCode: code,
    referralLink: affiliateLinkForCode(code),
    ladder: config.ladder,
    currentTier,
    nextTier,
    lifetimeSalesInr,
    salesToNextTierInr: nextTier
      ? Math.max(0, nextTier.minSalesInr - lifetimeSalesInr)
      : 0,
    minPayoutInr: config.minPayoutInr,
    holdDays: config.holdDays,
    tdsRate: config.tdsRate,
    tdsThresholdInr: config.tdsThresholdInr,
    stats: {
      totalReferred: referredSnap.size,
      heldInr: Math.round(heldInr * 100) / 100,
      availableInr: Math.round(availableInr * 100) / 100,
      lockedInr: Math.round(lockedInr * 100) / 100,
      paidInr: Math.round(paidInr * 100) / 100,
      earnedInr: Math.round((heldInr + availableInr + lockedInr + paidInr) * 100) / 100,
    },
    kyc: kycPublic,
    referred,
    commissions: commissions.slice(0, 50).map((c) => ({
      id: c.id,
      planTier: c.planTier,
      purchaseAmountInr: c.purchaseAmountInr,
      commissionRate: c.commissionRate,
      commissionAmountInr: c.commissionAmountInr,
      ladderTierId: c.ladderTierId,
      status: c.status,
      holdUntil: c.holdUntil,
      createdAt: c.createdAt,
    })),
    payouts,
  });
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "***";
  const head = user.slice(0, 2);
  return `${head}***@${domain}`;
}
