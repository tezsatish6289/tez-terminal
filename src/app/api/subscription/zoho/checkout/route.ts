import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminFirestore } from "@/firebase/admin";
import { isSubscriptionActive, type SubscriptionDoc } from "@/lib/subscription";
import { encryptPhone, normalizeIndianMobile, readStoredPhone } from "@/lib/phone";
import {
  ZOHO_PLAN_CODES,
  createDayPassPaymentLink,
  createSubscriptionHostedPage,
  findOrCreateCustomer,
  getZohoBillingConfig,
} from "@/lib/zoho/billing";
import {
  ensureFlashSaleCoupons,
  getActiveFlashSaleCouponCode,
} from "@/lib/fnoninja/flash-sale-server";

export const dynamic = "force-dynamic";

type CheckoutTier = "silver" | "gold" | "daypass";

/**
 * POST /api/subscription/zoho/checkout
 * Body: { tier: "silver" | "gold" | "daypass", flashSale?: boolean }
 * Header: Authorization: Bearer <Firebase ID token>
 *
 * Returns { url } — a Zoho hosted checkout (Silver/Gold) or one-time payment
 * link (Day Pass) to redirect the user to.
 *
 * When `flashSale: true` and a flash window is live, Silver/Gold checkouts apply
 * the active Zoho coupon (invoice discount only). Day Pass never gets a coupon.
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

    const body = (await request.json().catch(() => ({}))) as {
      tier?: string;
      phone?: string;
      flashSale?: boolean;
    };
    const tier = body.tier as CheckoutTier | undefined;
    if (tier !== "silver" && tier !== "gold" && tier !== "daypass") {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const userRef = db.collection("users").doc(uid);

    // A Day Pass only makes sense for users WITHOUT current access. Someone on a
    // trial or an active plan already has full access, so block the redundant
    // purchase (client hides it too, but this is the authoritative guard).
    if (tier === "daypass") {
      const subSnap = await db.collection("subscriptions").doc(uid).get();
      const sub = subSnap.exists ? (subSnap.data() as SubscriptionDoc) : null;
      if (isSubscriptionActive(sub)) {
        return NextResponse.json(
          { error: "You already have active access — a Day Pass isn't needed right now." },
          { status: 409 },
        );
      }
    }

    // Razorpay won't process a payment without a contact number. Use the mobile
    // just entered, else the one saved on the profile; if we have neither, ask
    // the client to collect it (422 phone_required).
    const bodyPhone = normalizeIndianMobile(body.phone);
    if (body.phone && !bodyPhone) {
      return NextResponse.json({ error: "Enter a valid 10-digit mobile number." }, { status: 400 });
    }
    let phone = bodyPhone;
    if (!phone) {
      const userSnap = await userRef.get();
      phone = readStoredPhone(userSnap.data());
    }
    if (!phone) {
      return NextResponse.json(
        { error: "Mobile number required", code: "phone_required" },
        { status: 422 },
      );
    }
    // Store the number encrypted at rest (PII); drop any legacy plaintext field.
    if (bodyPhone) {
      await userRef.set(
        { phoneEnc: encryptPhone(bodyPhone), phone: FieldValue.delete() },
        { merge: true },
      );
    }

    // Find or create the Zoho customer (with mobile for Razorpay) and persist the
    // uid ↔ customer mapping so the webhook can resolve the buyer later.
    const customer = await findOrCreateCustomer({ uid, email, displayName, phone });
    await userRef.set({ zohoCustomerId: customer.customer_id }, { merge: true });

    const host = request.headers.get("host") || "fnoninja.com";
    const protocol = host.includes("localhost") ? "http" : "https";
    // fnoninja.com serves the page at /subscribe (rewritten to /fnoninja/subscribe);
    // localhost/other hosts use the internal path directly.
    const subscribePath = host.includes("fnoninja.com") ? "/subscribe" : "/fnoninja/subscribe";
    const redirectUrl = `${protocol}://${host}${subscribePath}?status=success`;

    if (tier === "daypass") {
      // One-time payment link only — NO invoice up front. Creating an Open
      // invoice before payment would recognise revenue immediately and every
      // drop-off would inflate sales + future GST liability. The Paid invoice is
      // generated post-payment (webhook / on-return verify-daypass).
      const link = await createDayPassPaymentLink({
        customerId: customer.customer_id,
        uid,
      });
      return NextResponse.json({ url: link.url, kind: "paymentlink" });
    }

    // Flash coupon: only when client opts in AND a window is currently live.
    // Silver/Gold get pro-rated coupons. Day Pass is never eligible.
    // Never trust a client-supplied coupon code — always resolve server-side.
    let couponCode: string | null = null;
    if (body.flashSale === true) {
      void ensureFlashSaleCoupons().catch(() => {});
      couponCode = await getActiveFlashSaleCouponCode(tier);
    }

    const hostedPage = await createSubscriptionHostedPage({
      planCode: ZOHO_PLAN_CODES[tier],
      customerId: customer.customer_id,
      uid,
      redirectUrl,
      couponCode,
    });
    const discountMatch = couponCode?.match(/_(\d+)$/);
    return NextResponse.json({
      url: hostedPage.url,
      kind: "subscription",
      flashSaleApplied: Boolean(couponCode),
      discountInr: discountMatch ? Number(discountMatch[1]) || null : null,
    });
  } catch (error: any) {
    console.error("[Zoho Checkout]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
