import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/firebase/admin";
import {
  ZOHO_PLAN_CODES,
  createDayPassPaymentLink,
  createSubscriptionHostedPage,
  findOrCreateCustomer,
  getZohoBillingConfig,
} from "@/lib/zoho/billing";

export const dynamic = "force-dynamic";

type CheckoutTier = "silver" | "gold" | "daypass";

/**
 * POST /api/subscription/zoho/checkout
 * Body: { tier: "silver" | "gold" | "daypass" }
 * Header: Authorization: Bearer <Firebase ID token>
 *
 * Returns { url } — a Zoho hosted checkout (Silver/Gold) or one-time payment
 * link (Day Pass) to redirect the user to.
 */
export async function POST(request: NextRequest) {
  try {
    if (!getZohoBillingConfig()) {
      return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
    }

    // Authenticate via Firebase ID token — the uid/email come from the token,
    // never from the client body (prevents buying on someone else's behalf).
    const authHeader = request.headers.get("authorization") || "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await getAdminAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
    }

    const uid = decoded.uid;
    const email = decoded.email ?? "";
    const displayName = decoded.name ?? email ?? uid;

    const body = (await request.json().catch(() => ({}))) as { tier?: string };
    const tier = body.tier as CheckoutTier | undefined;
    if (tier !== "silver" && tier !== "gold" && tier !== "daypass") {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    const db = getAdminFirestore();

    // Find or create the Zoho customer and persist the uid ↔ customer mapping so
    // the webhook can resolve the buyer later.
    const customer = await findOrCreateCustomer({ uid, email, displayName });
    await db
      .collection("users")
      .doc(uid)
      .set({ zohoCustomerId: customer.customer_id }, { merge: true });

    const host = request.headers.get("host") || "fnoninja.com";
    const protocol = host.includes("localhost") ? "http" : "https";
    // fnoninja.com serves the page at /subscribe (rewritten to /fnoninja/subscribe);
    // localhost/other hosts use the internal path directly.
    const subscribePath = host.includes("fnoninja.com") ? "/subscribe" : "/fnoninja/subscribe";
    const redirectUrl = `${protocol}://${host}${subscribePath}?status=success`;

    if (tier === "daypass") {
      const link = await createDayPassPaymentLink({ customerId: customer.customer_id, uid });
      return NextResponse.json({ url: link.url, kind: "payment_link" });
    }

    const hostedPage = await createSubscriptionHostedPage({
      planCode: ZOHO_PLAN_CODES[tier],
      customerId: customer.customer_id,
      uid,
      redirectUrl,
    });
    return NextResponse.json({ url: hostedPage.url, kind: "subscription" });
  } catch (error: any) {
    console.error("[Zoho Checkout]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
