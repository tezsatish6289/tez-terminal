import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireUser } from "@/lib/chat/require-user";
import {
  isValidIfsc,
  isValidPan,
  normalizePan,
  type AffiliateKycDoc,
} from "@/lib/fnoninja/affiliate";

export const dynamic = "force-dynamic";

/**
 * PUT /api/fnoninja/affiliate/kyc
 * Save PAN + bank details and accept self-billing terms.
 */
export async function PUT(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fullName = str(body.fullName);
  const pan = normalizePan(str(body.pan));
  const accountHolderName = str(body.accountHolderName) || fullName;
  const bankAccountNumber = str(body.bankAccountNumber).replace(/\s/g, "");
  const ifsc = str(body.ifsc).toUpperCase();
  const upiId = str(body.upiId) || null;
  const address = str(body.address);
  const state = str(body.state);
  const gstin = str(body.gstin).toUpperCase() || null;
  const phone = str(body.phone) || null;
  const acceptTerms = body.acceptTerms === true;

  if (!fullName || fullName.length < 2) {
    return NextResponse.json({ error: "Full name is required" }, { status: 400 });
  }
  if (!isValidPan(pan)) {
    return NextResponse.json({ error: "Invalid PAN format" }, { status: 400 });
  }
  if (!bankAccountNumber || bankAccountNumber.length < 6) {
    return NextResponse.json({ error: "Bank account number is required" }, { status: 400 });
  }
  if (!isValidIfsc(ifsc)) {
    return NextResponse.json({ error: "Invalid IFSC" }, { status: 400 });
  }
  if (!address || address.length < 8) {
    return NextResponse.json({ error: "Address is required" }, { status: 400 });
  }
  if (!state) {
    return NextResponse.json({ error: "State is required" }, { status: 400 });
  }
  if (!acceptTerms) {
    return NextResponse.json(
      { error: "You must accept the self-billing / payout terms" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const kyc: AffiliateKycDoc = {
    fullName,
    pan,
    accountHolderName,
    bankAccountNumber,
    ifsc,
    upiId,
    address,
    state,
    gstin,
    phone,
    termsAcceptedAt: now,
    updatedAt: now,
  };

  const db = getAdminFirestore();
  await db.collection("users").doc(auth.decoded.uid).set({ fnoninjaAffiliateKyc: kyc }, { merge: true });

  return NextResponse.json({ ok: true });
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
