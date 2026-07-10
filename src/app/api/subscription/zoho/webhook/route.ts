import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import type { SubscriptionStatus, SubscriptionDoc } from "@/lib/subscription";
import type { Tier } from "@/lib/entitlements";
import { syncChatAccess } from "@/lib/chat/access";
import { DAY_PASS_INR } from "@/lib/zoho/billing";

export const dynamic = "force-dynamic";

/**
 * POST /api/subscription/zoho/webhook?secret=...
 *
 * Receives Zoho Billing workflow webhooks (subscription created / renewed /
 * cancelled / expired, and one-time Day Pass payments) and writes the resulting
 * tier + expiry into Firestore `subscriptions/{uid}`. The app reads entitlements
 * from Firestore, so Zoho is never on the hot path.
 *
 * NOTE: Zoho workflow webhook payload shapes vary by configuration. This handler
 * is intentionally defensive and logs every raw payload to `logs` so we can
 * confirm/refine field mapping against the first real event.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function planCodeToTier(planCode?: string): Tier | null {
  if (planCode === "fnoninja_gold") return "gold";
  if (planCode === "fnoninja_silver") return "silver";
  return null;
}

/** Zoho subscription statuses that still grant access (access is ultimately gated by endDate). */
const ACTIVE_ZOHO_STATUSES = new Set([
  "live",
  "active",
  "non_renewing", // cancelled but paid through end of term
  "unpaid", // in dunning — keep access while Zoho retries
  "dunning",
]);

function toIso(value?: string | null): string | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

async function resolveUid(
  db: FirebaseFirestore.Firestore,
  opts: { referenceId?: string; customerId?: string },
): Promise<string | null> {
  if (opts.referenceId) return opts.referenceId;
  if (opts.customerId) {
    const snap = await db
      .collection("users")
      .where("zohoCustomerId", "==", opts.customerId)
      .limit(1)
      .get();
    if (!snap.empty) return snap.docs[0].id;
  }
  return null;
}

async function applyEntitlement(
  db: FirebaseFirestore.Firestore,
  args: {
    uid: string;
    tier: Tier;
    endDateIso: string;
    planCode: string;
    autoRenew: boolean;
    zohoSubscriptionId?: string;
    lastDayPassPaymentId?: string;
  },
): Promise<void> {
  const { uid, tier, endDateIso, planCode, autoRenew, zohoSubscriptionId, lastDayPassPaymentId } =
    args;
  const active = new Date(endDateIso).getTime() > Date.now();
  const status: SubscriptionStatus = active ? "active" : "expired";

  const update: Partial<SubscriptionDoc> = {
    status,
    tier: active ? tier : null,
    subscriptionEndDate: endDateIso,
    planCode,
    autoRenew,
  };
  if (zohoSubscriptionId) update.zohoSubscriptionId = zohoSubscriptionId;
  if (lastDayPassPaymentId) update.lastDayPassPaymentId = lastDayPassPaymentId;

  await db.collection("subscriptions").doc(uid).set(update, { merge: true });
  void syncChatAccess(uid, active).catch((e) =>
    console.error("[Zoho Webhook] chat access sync failed", e),
  );
}

export async function POST(request: NextRequest) {
  const db = getAdminFirestore();
  let raw = "";
  try {
    raw = await request.text();

    // Verify shared secret (query param or header) when configured.
    const configuredSecret = process.env.ZOHO_BILLING_WEBHOOK_SECRET?.trim();
    if (configuredSecret) {
      const provided =
        new URL(request.url).searchParams.get("secret") ||
        request.headers.get("x-zoho-webhook-secret") ||
        "";
      if (provided !== configuredSecret) {
        return NextResponse.json({ error: "Invalid secret" }, { status: 403 });
      }
    }

    const body = raw ? JSON.parse(raw) : {};

    // Log raw payload for verification/debugging (best-effort).
    void db
      .collection("logs")
      .add({
        timestamp: new Date().toISOString(),
        level: "INFO",
        message: "Zoho Billing webhook received",
        details: raw.slice(0, 8000),
        webhookId: "ZOHO_BILLING",
      })
      .catch(() => {});

    // Zoho may nest the record under `data` or send it top-level, and one-time
    // payments arrive as either `payment` or `customerpayment`.
    const payload = body.data ?? body;
    const subscription = payload.subscription ?? body.subscription;
    const payment =
      payload.payment ?? body.payment ?? payload.customerpayment ?? body.customerpayment;

    // ── Subscription events (Silver / Gold) ──────────────────────────────────
    if (subscription) {
      const planCode: string | undefined =
        subscription.plan?.plan_code ?? subscription.plan_code;
      const tier = planCodeToTier(planCode);
      const uid = await resolveUid(db, {
        referenceId: subscription.reference_id,
        customerId: subscription.customer_id,
      });

      if (!uid || !tier) {
        return NextResponse.json({ ok: true, skipped: "unmapped subscription" });
      }

      const zStatus = String(subscription.status ?? "").toLowerCase();
      const endIso =
        toIso(subscription.current_term_ends_at) ??
        toIso(subscription.next_billing_at) ??
        toIso(subscription.expires_at);

      // Cancelled/expired with no future term → expire now.
      const endDateIso =
        endIso ??
        (ACTIVE_ZOHO_STATUSES.has(zStatus) ? new Date().toISOString() : new Date(0).toISOString());

      await applyEntitlement(db, {
        uid,
        tier,
        endDateIso,
        planCode: planCode!,
        autoRenew: zStatus === "live" || zStatus === "active",
        zohoSubscriptionId: subscription.subscription_id,
      });

      return NextResponse.json({ ok: true, tier, uid });
    }

    // ── One-time Day Pass (payment link) ─────────────────────────────────────
    // The Customer Payment webhook fires for EVERY payment (incl. Silver/Gold
    // subscription invoices). Only treat a payment as a Day Pass when it isn't
    // tied to a subscription AND matches the Day Pass price — otherwise a plan
    // payment could wrongly downgrade the user to a 24h pass. Subscription
    // payments are handled by the subscription workflow above.
    if (payment && !payment.subscription_id) {
      const amountInr = Number(payment.amount) || 0;
      if (Math.abs(amountInr - DAY_PASS_INR) >= 1) {
        return NextResponse.json({ ok: true, skipped: "non-daypass payment" });
      }

      const uid = await resolveUid(db, {
        referenceId: payment.reference_id,
        customerId: payment.customer_id,
      });
      if (!uid) {
        return NextResponse.json({ ok: true, skipped: "unmapped payment" });
      }

      const endDateIso = new Date(Date.now() + DAY_MS).toISOString();
      await applyEntitlement(db, {
        uid,
        tier: "daypass",
        endDateIso,
        planCode: "daypass",
        autoRenew: false,
        lastDayPassPaymentId: payment.payment_id,
      });

      return NextResponse.json({ ok: true, tier: "daypass", uid });
    }

    return NextResponse.json({ ok: true, skipped: "no actionable object" });
  } catch (error: any) {
    console.error("[Zoho Webhook]", error.message);
    void db
      .collection("logs")
      .add({
        timestamp: new Date().toISOString(),
        level: "ERROR",
        message: `Zoho Billing webhook error: ${error.message}`,
        details: raw.slice(0, 8000),
        webhookId: "ZOHO_BILLING",
      })
      .catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
