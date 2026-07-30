/**
 * FNO Ninja Refer & Earn — ladder commissions (INR), KYC, reverse invoices, TDS 194H.
 *
 * Collections:
 *   config/fnoninja_affiliate
 *   fnoninja_affiliate_commissions
 *   fnoninja_affiliate_payouts
 *
 * User fields:
 *   fnoninjaAffiliateCode, fnoninjaReferredBy, fnoninjaAffiliateKyc
 *
 * Client-safe constants live in `affiliate-shared.ts` — do not import this
 * module from Client Components.
 */

import "server-only";

import { getAdminFirestore } from "@/firebase/admin";
import { generateReferralCode } from "@/lib/referral";
import {
  DEFAULT_AFFILIATE_LADDER,
  FNO_PLAN_AMOUNT_INR,
  type AffiliateLadderTier,
} from "@/lib/fnoninja/affiliate-shared";

export {
  AFFILIATE_BUBBLE_ID,
  DEFAULT_AFFILIATE_LADDER,
  FNO_PLAN_AMOUNT_INR,
  isAffiliateBubbleId,
  type AffiliateLadderTier,
} from "@/lib/fnoninja/affiliate-shared";

export const FNO_AFFILIATE_COMMISSIONS = "fnoninja_affiliate_commissions";
export const FNO_AFFILIATE_PAYOUTS = "fnoninja_affiliate_payouts";
export const FNO_AFFILIATE_CONFIG_DOC = "fnoninja_affiliate";

export interface FnoAffiliateConfig {
  enabled: boolean;
  /** Section 194H rate (decimal). */
  tdsRate: number;
  /** FY aggregate below which TDS is not deducted (INR). */
  tdsThresholdInr: number;
  minPayoutInr: number;
  /** Days before a commission becomes available for payout. */
  holdDays: number;
  ladder: AffiliateLadderTier[];
  companyLegalName: string;
  companyAddress: string;
  companyGstin: string;
  companyPan: string;
  companyState: string;
  companyEmail: string;
}

const DEFAULT_CONFIG: FnoAffiliateConfig = {
  enabled: true,
  tdsRate: 0.02,
  tdsThresholdInr: 20_000,
  minPayoutInr: 500,
  holdDays: 14,
  ladder: DEFAULT_AFFILIATE_LADDER,
  companyLegalName: "FNO Ninja",
  companyAddress: "",
  companyGstin: "",
  companyPan: "",
  companyState: "Maharashtra",
  companyEmail: "support@fnoninja.com",
};

export async function fetchFnoAffiliateConfig(): Promise<FnoAffiliateConfig> {
  try {
    const db = getAdminFirestore();
    const doc = await db.collection("config").doc(FNO_AFFILIATE_CONFIG_DOC).get();
    if (!doc.exists) return DEFAULT_CONFIG;
    const d = doc.data()!;
    return {
      enabled: d.enabled ?? DEFAULT_CONFIG.enabled,
      tdsRate: typeof d.tdsRate === "number" ? d.tdsRate : DEFAULT_CONFIG.tdsRate,
      tdsThresholdInr:
        typeof d.tdsThresholdInr === "number" ? d.tdsThresholdInr : DEFAULT_CONFIG.tdsThresholdInr,
      minPayoutInr:
        typeof d.minPayoutInr === "number" ? d.minPayoutInr : DEFAULT_CONFIG.minPayoutInr,
      holdDays: typeof d.holdDays === "number" ? d.holdDays : DEFAULT_CONFIG.holdDays,
      ladder: Array.isArray(d.ladder) && d.ladder.length ? d.ladder : DEFAULT_CONFIG.ladder,
      companyLegalName: d.companyLegalName || DEFAULT_CONFIG.companyLegalName,
      companyAddress: d.companyAddress ?? DEFAULT_CONFIG.companyAddress,
      companyGstin: d.companyGstin ?? DEFAULT_CONFIG.companyGstin,
      companyPan: d.companyPan ?? DEFAULT_CONFIG.companyPan,
      companyState: d.companyState || DEFAULT_CONFIG.companyState,
      companyEmail: d.companyEmail || DEFAULT_CONFIG.companyEmail,
    };
  } catch (e) {
    console.error("[FNO Affiliate] config fetch failed:", e);
    return DEFAULT_CONFIG;
  }
}

export type AffiliateCommissionStatus =
  | "held"
  | "available"
  | "locked"
  | "paid"
  | "reversed";

export type AffiliatePlanTier = "silver" | "gold" | "daypass";

export interface AffiliateCommissionDoc {
  referrerId: string;
  referredUserId: string;
  /** Idempotency key: zoho payment id or sub_{id}_{termStart}. */
  sourceId: string;
  sourceType: "subscription" | "daypass";
  planTier: AffiliatePlanTier;
  purchaseAmountInr: number;
  commissionRate: number;
  ladderTierId: string;
  commissionAmountInr: number;
  status: AffiliateCommissionStatus;
  holdUntil: string;
  payoutId: string | null;
  createdAt: string;
  availableAt: string | null;
  paidAt: string | null;
  reversedAt: string | null;
}

export type AffiliatePayoutStatus =
  | "pending_review"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface AffiliateKycSnapshot {
  fullName: string;
  pan: string;
  accountHolderName: string;
  bankAccountNumber: string;
  ifsc: string;
  upiId: string | null;
  address: string;
  state: string;
  gstin: string | null;
  email: string;
  phone: string | null;
  termsAcceptedAt: string;
}

export interface AffiliatePayoutDoc {
  referrerId: string;
  commissionIds: string[];
  grossAmountInr: number;
  tdsRate: number;
  tdsAmountInr: number;
  netAmountInr: number;
  tdsApplied: boolean;
  status: AffiliatePayoutStatus;
  invoiceNumber: string;
  kyc: AffiliateKycSnapshot;
  createdAt: string;
  completedAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  /** Set when ops marks paid after RazorpayX transfer. */
  razorpayxPayoutId: string | null;
  adminNote: string | null;
}

export interface AffiliateKycDoc {
  fullName: string;
  pan: string;
  accountHolderName: string;
  bankAccountNumber: string;
  ifsc: string;
  upiId: string | null;
  address: string;
  state: string;
  gstin: string | null;
  phone: string | null;
  termsAcceptedAt: string;
  updatedAt: string;
}

export function roundInr(n: number): number {
  return Math.round(n * 100) / 100;
}

export function normalizePan(pan: string): string {
  return pan.trim().toUpperCase();
}

/** Indian PAN: 5 letters + 4 digits + 1 letter. */
export function isValidPan(pan: string): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalizePan(pan));
}

export function isValidIfsc(ifsc: string): boolean {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.trim().toUpperCase());
}

export function ladderRateForSales(
  lifetimeSalesInr: number,
  ladder: AffiliateLadderTier[] = DEFAULT_AFFILIATE_LADDER,
): AffiliateLadderTier {
  const sorted = [...ladder].sort((a, b) => a.minSalesInr - b.minSalesInr);
  for (let i = sorted.length - 1; i >= 0; i--) {
    const t = sorted[i]!;
    if (lifetimeSalesInr >= t.minSalesInr) return t;
  }
  return sorted[0]!;
}

export function nextLadderTier(
  lifetimeSalesInr: number,
  ladder: AffiliateLadderTier[] = DEFAULT_AFFILIATE_LADDER,
): AffiliateLadderTier | null {
  const sorted = [...ladder].sort((a, b) => a.minSalesInr - b.minSalesInr);
  const current = ladderRateForSales(lifetimeSalesInr, sorted);
  const idx = sorted.findIndex((t) => t.id === current.id);
  return idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1]! : null;
}

export function affiliateLinkForCode(code: string): string {
  const base =
    process.env.NEXT_PUBLIC_FNONINJA_URL?.replace(/\/$/, "") || "https://fnoninja.com";
  return `${base}?ref=${encodeURIComponent(code)}`;
}

/** Ensure user has an FNO affiliate code; returns code. */
export async function ensureFnoAffiliateCode(uid: string): Promise<string> {
  const db = getAdminFirestore();
  const ref = db.collection("users").doc(uid);
  const snap = await ref.get();
  const existing = snap.data()?.fnoninjaAffiliateCode;
  if (typeof existing === "string" && existing.length >= 6) return existing;

  // Prefer reusing TezTerminal referralCode if present for one shared code.
  const shared = snap.data()?.referralCode;
  if (typeof shared === "string" && shared.length >= 6) {
    const code = shared.trim().toLowerCase();
    await ref.set({ fnoninjaAffiliateCode: code, referralCode: code }, { merge: true });
    return code;
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateReferralCode();
    const clash = await db
      .collection("users")
      .where("fnoninjaAffiliateCode", "==", code)
      .limit(1)
      .get();
    if (!clash.empty) continue;
    const tezClash = await db.collection("users").where("referralCode", "==", code).limit(1).get();
    if (!tezClash.empty) continue;
    await ref.set({ fnoninjaAffiliateCode: code, referralCode: code }, { merge: true });
    return code;
  }
  throw new Error("Could not allocate affiliate code");
}

export async function resolveAffiliateByCode(code: string): Promise<string | null> {
  const db = getAdminFirestore();
  const normalized = code.trim().toLowerCase();
  if (!normalized) return null;

  let snap = await db
    .collection("users")
    .where("fnoninjaAffiliateCode", "==", normalized)
    .limit(1)
    .get();
  if (snap.empty) {
    snap = await db.collection("users").where("referralCode", "==", normalized).limit(1).get();
  }
  if (snap.empty) return null;
  return snap.docs[0]!.id;
}

/** Lifetime referred net sales that still count toward the ladder (excludes reversed). */
export async function getLifetimeReferredSalesInr(referrerId: string): Promise<number> {
  const db = getAdminFirestore();
  const snap = await db
    .collection(FNO_AFFILIATE_COMMISSIONS)
    .where("referrerId", "==", referrerId)
    .get();
  let total = 0;
  for (const doc of snap.docs) {
    const d = doc.data() as AffiliateCommissionDoc;
    if (d.status === "reversed") continue;
    total += Number(d.purchaseAmountInr) || 0;
  }
  return roundInr(total);
}

/** Promote held → available when hold window has passed. */
export async function releaseHeldCommissions(referrerId?: string): Promise<number> {
  const db = getAdminFirestore();
  const now = new Date().toISOString();
  // Single-field queries only (avoid composite index); filter status in memory.
  const snap = referrerId
    ? await db.collection(FNO_AFFILIATE_COMMISSIONS).where("referrerId", "==", referrerId).get()
    : await db.collection(FNO_AFFILIATE_COMMISSIONS).where("status", "==", "held").get();
  const due = snap.docs.filter((doc) => {
    const d = doc.data() as AffiliateCommissionDoc;
    return d.status === "held" && Boolean(d.holdUntil && d.holdUntil <= now);
  });
  for (let i = 0; i < due.length; i += 400) {
    const batch = db.batch();
    for (const doc of due.slice(i, i + 400)) {
      batch.update(doc.ref, { status: "available", availableAt: now });
    }
    await batch.commit();
  }
  return due.length;
}

export async function createAffiliateCommission(args: {
  referredUserId: string;
  sourceId: string;
  sourceType: "subscription" | "daypass";
  planTier: AffiliatePlanTier;
  purchaseAmountInr: number;
}): Promise<{ created: boolean; commissionId?: string; reason?: string }> {
  const config = await fetchFnoAffiliateConfig();
  if (!config.enabled) return { created: false, reason: "disabled" };

  const amount = roundInr(args.purchaseAmountInr);
  if (amount <= 0) return { created: false, reason: "zero_amount" };

  const db = getAdminFirestore();

  const dup = await db
    .collection(FNO_AFFILIATE_COMMISSIONS)
    .where("sourceId", "==", args.sourceId)
    .limit(1)
    .get();
  if (!dup.empty) return { created: false, reason: "duplicate" };

  const userSnap = await db.collection("users").doc(args.referredUserId).get();
  const referrerId = userSnap.data()?.fnoninjaReferredBy;
  if (typeof referrerId !== "string" || !referrerId) {
    return { created: false, reason: "no_referrer" };
  }
  if (referrerId === args.referredUserId) {
    return { created: false, reason: "self_referral" };
  }

  const lifetimeBefore = await getLifetimeReferredSalesInr(referrerId);
  const tier = ladderRateForSales(lifetimeBefore, config.ladder);
  const commissionAmountInr = roundInr(amount * tier.rate);
  const now = new Date();
  const holdUntil = new Date(now.getTime() + config.holdDays * 24 * 60 * 60 * 1000).toISOString();

  const doc: AffiliateCommissionDoc = {
    referrerId,
    referredUserId: args.referredUserId,
    sourceId: args.sourceId,
    sourceType: args.sourceType,
    planTier: args.planTier,
    purchaseAmountInr: amount,
    commissionRate: tier.rate,
    ladderTierId: tier.id,
    commissionAmountInr,
    status: "held",
    holdUntil,
    payoutId: null,
    createdAt: now.toISOString(),
    availableAt: null,
    paidAt: null,
    reversedAt: null,
  };

  const ref = await db.collection(FNO_AFFILIATE_COMMISSIONS).add(doc);
  return { created: true, commissionId: ref.id };
}

/** FY start (Apr 1) ISO for India tax year containing `at`. */
export function indiaFyStartIso(at = new Date()): string {
  const y = at.getUTCFullYear();
  const month = at.getUTCMonth(); // 0-based
  const fyStartYear = month >= 3 ? y : y - 1; // Apr = 3
  return new Date(Date.UTC(fyStartYear, 3, 1, 0, 0, 0)).toISOString();
}

/** Gross commission paid/locked/pending_review in current FY (for TDS threshold). */
export async function getFyGrossCommissionInr(referrerId: string): Promise<number> {
  const db = getAdminFirestore();
  const fyStart = indiaFyStartIso();
  const snap = await db
    .collection(FNO_AFFILIATE_PAYOUTS)
    .where("referrerId", "==", referrerId)
    .get();
  let total = 0;
  for (const doc of snap.docs) {
    const d = doc.data() as AffiliatePayoutDoc;
    if (d.status === "cancelled" || d.status === "failed") continue;
    if (d.createdAt < fyStart) continue;
    total += Number(d.grossAmountInr) || 0;
  }
  return roundInr(total);
}

export function computeTds(args: {
  grossInr: number;
  fyGrossBeforeInr: number;
  tdsRate: number;
  tdsThresholdInr: number;
}): { tdsApplied: boolean; tdsAmountInr: number; netAmountInr: number } {
  const after = args.fyGrossBeforeInr + args.grossInr;
  const tdsApplied = after > args.tdsThresholdInr;
  const tdsAmountInr = tdsApplied ? roundInr(args.grossInr * args.tdsRate) : 0;
  return {
    tdsApplied,
    tdsAmountInr,
    netAmountInr: roundInr(args.grossInr - tdsAmountInr),
  };
}

export function nextInvoiceNumber(seq: number): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `FNO-AFF-${y}${m}-${String(seq).padStart(5, "0")}`;
}

export function buildReverseInvoiceHtml(args: {
  payout: AffiliatePayoutDoc;
  config: FnoAffiliateConfig;
}): string {
  const { payout, config } = args;
  const k = payout.kyc;
  const issued = new Date(payout.createdAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Self-Billing Invoice ${esc(payout.invoiceNumber)}</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; color: #0f172a; max-width: 720px; margin: 32px auto; padding: 0 16px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .muted { color: #64748b; font-size: 12px; }
  .box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
  th { color: #64748b; font-weight: 600; }
  .right { text-align: right; }
  .totals td { border: none; padding-top: 6px; }
  .badge { display: inline-block; background: #eff6ff; color: #1d4ed8; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 999px; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <div class="badge">SELF-BILLING / REVERSE INVOICE</div>
  <h1>Invoice ${esc(payout.invoiceNumber)}</h1>
  <p class="muted">Issued ${esc(issued)} · Status: ${esc(payout.status)}</p>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div class="box">
      <div class="muted">Service recipient (payer)</div>
      <strong>${esc(config.companyLegalName)}</strong><br/>
      ${config.companyAddress ? esc(config.companyAddress) + "<br/>" : ""}
      ${config.companyGstin ? "GSTIN: " + esc(config.companyGstin) + "<br/>" : ""}
      ${config.companyPan ? "PAN: " + esc(config.companyPan) + "<br/>" : ""}
      ${esc(config.companyEmail)}
    </div>
    <div class="box">
      <div class="muted">Service provider (affiliate)</div>
      <strong>${esc(k.fullName)}</strong><br/>
      PAN: ${esc(k.pan)}<br/>
      ${k.gstin ? "GSTIN: " + esc(k.gstin) + "<br/>" : ""}
      ${esc(k.address)}<br/>
      ${esc(k.state)}
      ${k.email ? "<br/>" + esc(k.email) : ""}
    </div>
  </div>

  <p class="muted">
    This self-billing invoice is raised by ${esc(config.companyLegalName)} on behalf of the affiliate
    for referral commission under the FNO Ninja Refer &amp; Earn program, with the affiliate&rsquo;s prior consent.
  </p>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="right">Amount (INR)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Referral commission (${payout.commissionIds.length} sale${payout.commissionIds.length === 1 ? "" : "s"})</td>
        <td class="right">₹${payout.grossAmountInr.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
      </tr>
    </tbody>
  </table>

  <table class="totals">
    <tr>
      <td class="right muted">Taxable value</td>
      <td class="right" style="width:140px">₹${payout.grossAmountInr.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
    </tr>
    <tr>
      <td class="right muted">TDS u/s 194H${payout.tdsApplied ? ` @ ${(payout.tdsRate * 100).toFixed(0)}%` : " (not applicable)"}</td>
      <td class="right">₹${payout.tdsAmountInr.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
    </tr>
    <tr>
      <td class="right"><strong>Net payable</strong></td>
      <td class="right"><strong>₹${payout.netAmountInr.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong></td>
    </tr>
  </table>

  <div class="box">
    <div class="muted">Payout bank details</div>
    ${esc(k.accountHolderName)} · A/c ${esc(k.bankAccountNumber)} · IFSC ${esc(k.ifsc)}
    ${k.upiId ? `<br/>UPI: ${esc(k.upiId)}` : ""}
  </div>

  <p class="muted">
    This document is system-generated for settlement and bookkeeping. Form 16A (TDS certificate)
    will be issued as per applicable timelines when TDS has been deducted.
  </p>
</body>
</html>`;
}

export function maskAccountNumber(n: string): string {
  const s = n.replace(/\s/g, "");
  if (s.length <= 4) return "****";
  return `${"*".repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
}
