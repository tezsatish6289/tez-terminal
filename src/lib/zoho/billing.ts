/**
 * Zoho Billing (formerly Zoho Subscriptions) API client for FNONINJA billing.
 *
 * Server-only. Uses a long-lived refresh token to mint short-lived access
 * tokens (cached in-memory), mirroring the Google OAuth pattern in
 * `src/lib/google/oauth.ts`.
 *
 * Data center is India (`.in`) — API base `https://www.zohoapis.in/billing/v1`,
 * accounts host `https://accounts.zoho.in`.
 */

import "server-only";

export type PaidTier = "silver" | "gold" | "daypass";

/** Day Pass price (INR). Used to identify a Day Pass payment during reconciliation. */
export const DAY_PASS_INR = 99;

/** Maps our recurring tiers to their Zoho plan codes. */
export const ZOHO_PLAN_CODES: Record<"silver" | "gold", string> = {
  silver: "fnoninja_silver",
  gold: "fnoninja_gold",
};

export interface ZohoBillingConfig {
  dc: string;
  orgId: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  dayPassItemId: string;
}

export function getZohoBillingConfig(): ZohoBillingConfig | null {
  const dc = process.env.ZOHO_BILLING_DC?.trim() || "in";
  const orgId = process.env.ZOHO_BILLING_ORG_ID?.trim();
  const clientId = process.env.ZOHO_BILLING_CLIENT_ID?.trim();
  const clientSecret = process.env.ZOHO_BILLING_CLIENT_SECRET?.trim();
  const refreshToken = process.env.ZOHO_BILLING_REFRESH_TOKEN?.trim();
  const dayPassItemId = process.env.ZOHO_BILLING_DAYPASS_ITEM_ID?.trim() || "";
  if (!orgId || !clientId || !clientSecret || !refreshToken) return null;
  return { dc, orgId, clientId, clientSecret, refreshToken, dayPassItemId };
}

function requireConfig(): ZohoBillingConfig {
  const cfg = getZohoBillingConfig();
  if (!cfg) {
    throw new Error(
      "Missing Zoho Billing env (ZOHO_BILLING_ORG_ID / CLIENT_ID / CLIENT_SECRET / REFRESH_TOKEN)",
    );
  }
  return cfg;
}

function apiBase(dc: string): string {
  return `https://www.zohoapis.${dc}/billing/v1`;
}

function accountsBase(dc: string): string {
  return `https://accounts.zoho.${dc}`;
}

// ── Access token (refresh-token flow, cached in-memory) ──────────────────────

let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getZohoAccessToken(cfg: ZohoBillingConfig = requireConfig()): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const res = await fetch(`${accountsBase(cfg.dc)}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
    }),
  });

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error ?? `Zoho token refresh failed (${res.status})`);
  }

  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

// ── Generic request helper ───────────────────────────────────────────────────

async function zohoRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const cfg = requireConfig();
  const token = await getZohoAccessToken(cfg);
  const res = await fetch(`${apiBase(cfg.dc)}${path}`, {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "X-com-zoho-subscriptions-organizationid": cfg.orgId,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  // Zoho returns `code: 0` on success even with HTTP 200/201.
  if (!res.ok || (typeof data.code === "number" && data.code !== 0)) {
    const msg = (data as { message?: string }).message ?? `Zoho API error (${res.status})`;
    throw new Error(`${msg} [${method} ${path}]`);
  }
  return data as T;
}

// ── Customers ────────────────────────────────────────────────────────────────

export interface ZohoCustomer {
  customer_id: string;
  display_name: string;
  email: string;
}

/**
 * Finds an existing Zoho customer by email, or creates one. `reference_id` is
 * set to the Firebase uid so we can always cross-reference.
 */
export async function findOrCreateCustomer(args: {
  uid: string;
  email: string;
  displayName: string;
  /** 10-digit Indian mobile — required by Razorpay to process payments. */
  phone?: string;
}): Promise<ZohoCustomer> {
  const { uid, email, displayName, phone } = args;

  if (email) {
    const found = await zohoRequest<{ customers?: ZohoCustomer[] }>(
      "GET",
      `/customers?email=${encodeURIComponent(email)}`,
    );
    if (found.customers && found.customers.length > 0) {
      const existing = found.customers[0];
      // Backfill the mobile on an existing customer so Razorpay can charge them.
      if (phone) {
        await zohoRequest("PUT", `/customers/${existing.customer_id}`, {
          mobile: phone,
          phone,
        }).catch((e) => console.warn("[Zoho] customer mobile update failed:", (e as Error).message));
      }
      return existing;
    }
  }

  const created = await zohoRequest<{ customer: ZohoCustomer }>("POST", "/customers", {
    display_name: displayName || email || uid,
    email,
    reference_id: uid,
    ...(phone ? { mobile: phone, phone } : {}),
  });
  return created.customer;
}

// ── Hosted checkout (Silver / Gold subscriptions) ────────────────────────────

export interface HostedPage {
  hostedpage_id: string;
  url: string;
}

/**
 * Creates a Zoho hosted payment page for a NEW subscription (Silver/Gold).
 * `reference_id` on the subscription is the Firebase uid for webhook mapping.
 * Optional `couponCode` applies a one-time invoice discount (plan term unchanged).
 */
export async function createSubscriptionHostedPage(args: {
  planCode: string;
  customerId: string;
  uid: string;
  redirectUrl: string;
  couponCode?: string | null;
}): Promise<HostedPage> {
  const { planCode, customerId, uid, redirectUrl, couponCode } = args;
  const res = await zohoRequest<{ hostedpage: HostedPage }>(
    "POST",
    "/hostedpages/newsubscription",
    {
      customer_id: customerId,
      plan: { plan_code: planCode },
      reference_id: uid,
      redirect_url: redirectUrl,
      ...(couponCode ? { coupon_code: couponCode } : {}),
    },
  );
  return res.hostedpage;
}

// ── Coupons (flash sale) ─────────────────────────────────────────────────────

export interface ZohoCoupon {
  coupon_code: string;
  status?: string;
  discount_by?: string;
  discount_value?: number;
}

/** Resolve the Zoho product_id that owns Silver/Gold plans (needed to create coupons). */
export async function resolveZohoProductId(): Promise<string | null> {
  const fromEnv = process.env.ZOHO_BILLING_PRODUCT_ID?.trim();
  if (fromEnv) return fromEnv;

  try {
    const res = await zohoRequest<{
      plans?: { plan_code?: string; product_id?: string }[];
    }>("GET", `/plans?plan_code=${encodeURIComponent(ZOHO_PLAN_CODES.silver)}`);
    const plan =
      res.plans?.find((p) => p.plan_code === ZOHO_PLAN_CODES.silver) ?? res.plans?.[0];
    return plan?.product_id?.trim() || null;
  } catch (e) {
    console.warn("[Zoho] resolveZohoProductId failed:", (e as Error).message);
    return null;
  }
}

/**
 * Ensures a flat one-time coupon exists for Silver + Gold.
 * Idempotent: GET first; create if missing; reactivate if inactive.
 */
export async function ensureFlashSaleCoupon(args: {
  couponCode: string;
  discountInr: number;
  productId: string;
  planCodes: string[];
}): Promise<void> {
  const { couponCode, discountInr, productId, planCodes } = args;

  try {
    const existing = await zohoRequest<{ coupon?: ZohoCoupon }>(
      "GET",
      `/coupons/${encodeURIComponent(couponCode)}`,
    );
    if (existing.coupon) {
      if ((existing.coupon.status ?? "").toLowerCase() === "inactive") {
        await zohoRequest("POST", `/coupons/${encodeURIComponent(couponCode)}/markasactive`);
      }
      return;
    }
  } catch {
    // 404 / missing → create below
  }

  await zohoRequest("POST", "/coupons", {
    coupon_code: couponCode,
    name: `Flash Sale ₹${discountInr} off`,
    description: `FNONINJA flash sale — ₹${discountInr} off first invoice (Silver/Gold)`,
    type: "one_time",
    discount_by: "flat",
    discount_value: discountInr,
    product_id: productId,
    apply_to_plans: "select",
    plans: planCodes.map((plan_code) => ({ plan_code })),
    apply_to_addons: "none",
  });
}

// ── One-time Day Pass (payment link) ─────────────────────────────────────────

export interface PaymentLink {
  payment_link_id: string;
  url: string;
}

/**
 * Creates a one-time payment link (₹99 Day Pass) for a customer. No mandate,
 * no recurring charge. Requires the Payment Links module to be enabled in Zoho.
 */
export async function createDayPassPaymentLink(args: {
  customerId: string;
  uid: string;
  amount?: number;
}): Promise<PaymentLink> {
  const { customerId, uid, amount = DAY_PASS_INR } = args;
  const res = await zohoRequest<{ payment_link: PaymentLink }>("POST", "/paymentlinks", {
    customer_id: customerId,
    payment_amount: amount,
    description: "FnoNinja Day Pass — 24-hour full access",
    reference_id: uid,
  });
  return res.payment_link;
}

interface ZohoInvoice {
  invoice_id: string;
  status?: string;
}

/**
 * Generates a PAID Day Pass invoice AFTER the buyer has actually paid (via the
 * one-time payment link). We deliberately do NOT create an invoice up front —
 * an Open invoice recognises revenue/receivables in Zoho immediately, so every
 * checkout drop-off would inflate sales and future GST liability. Instead:
 *
 *   1. buyer pays the payment link  → Zoho records a ₹99 customer payment
 *   2. THIS runs (webhook / on-return reconciliation) → create the invoice and
 *      apply that existing payment to it, so the invoice is born `Paid`.
 *
 * Result: an invoice exists only for real payers, already settled — no phantom
 * revenue. If applying the payment fails, the fresh invoice is voided so we
 * never leave an unpaid Open invoice behind.
 *
 * Returns the created invoice id.
 */
export async function createPaidDayPassInvoice(args: {
  customerId: string;
  uid: string;
  /** Zoho customer payment id recorded when the payment link was paid. */
  paymentId: string;
  amountInr?: number;
}): Promise<string> {
  const cfg = requireConfig();
  const { customerId, uid, paymentId, amountInr = DAY_PASS_INR } = args;

  // Create the invoice for the Day Pass.
  //   Zoho Billing's create-invoice API keys the line item on `product_id`
  //   (NOT `item_id`, which only appears in GET/response shapes — sending
  //   `item_id` fails with "Invalid Element item_id"). name/rate make the
  //   invoice self-describing and pin the amount. If the configured product id
  //   is missing/invalid we fall back to a pure ad-hoc line item so a mis-set
  //   env can never block invoicing.
  const baseLineItem = {
    name: "FnoNinja Day Pass",
    description: "24 hours of full access to FnoNinja",
    rate: amountInr,
    quantity: 1,
  };
  const createInvoice = (withProduct: boolean) =>
    zohoRequest<{ invoice: ZohoInvoice }>("POST", "/invoices", {
      customer_id: customerId,
      reference_id: uid,
      invoice_items: [
        withProduct && cfg.dayPassItemId
          ? { product_id: cfg.dayPassItemId, ...baseLineItem }
          : baseLineItem,
      ],
    });

  let created: { invoice: ZohoInvoice };
  try {
    created = await createInvoice(true);
  } catch (e) {
    console.warn("[Zoho Day Pass] product-linked invoice failed, retrying ad-hoc:", (e as Error).message);
    created = await createInvoice(false);
  }
  const invoice = created.invoice;

  // New invoices can be created as Draft; convert to Open so a payment applies.
  if ((invoice.status ?? "").toLowerCase() === "draft") {
    await zohoRequest("POST", `/invoices/${invoice.invoice_id}/converttoopen`).catch(() => {});
  }

  // Apply the already-recorded payment-link payment to this invoice → `Paid`.
  // Zoho Billing v1 uses `/payments` (NOT `/customerpayments`). PUT updates the
  // payment to allocate its amount against the invoice.
  try {
    await zohoRequest("PUT", `/payments/${paymentId}`, {
      customer_id: customerId,
      invoices: [{ invoice_id: invoice.invoice_id, amount_applied: amountInr }],
    });
  } catch (e) {
    // Never leave an unpaid Open invoice (that's the phantom-revenue we're
    // avoiding). Void the invoice, then surface the error to the caller.
    await zohoRequest("POST", `/invoices/${invoice.invoice_id}/void`).catch(() => {});
    throw e;
  }

  // Email the paid invoice to the buyer (best-effort — don't fail the sale if
  // delivery hiccups). Zoho's default send relies on customer contact-person
  // emails, which our API-created customers don't have, so we pass the recipient
  // explicitly via `to_mail_ids`.
  try {
    const cust = await zohoRequest<{ customer?: { email?: string } }>("GET", `/customers/${customerId}`);
    const email = cust.customer?.email;
    if (email) {
      await zohoRequest("POST", `/invoices/${invoice.invoice_id}/email`, { to_mail_ids: [email] });
    }
  } catch (e) {
    console.warn("[Zoho Day Pass] invoice email failed:", (e as Error).message);
  }

  return invoice.invoice_id;
}

// ── Reads (webhook enrichment / admin) ───────────────────────────────────────

export interface ZohoSubscription {
  subscription_id: string;
  status: string;
  customer_id: string;
  reference_id?: string;
  current_term_ends_at?: string;
  next_billing_at?: string;
  plan?: { plan_code: string };
}

export async function getSubscription(subscriptionId: string): Promise<ZohoSubscription> {
  const res = await zohoRequest<{ subscription: ZohoSubscription }>(
    "GET",
    `/subscriptions/${subscriptionId}`,
  );
  return res.subscription;
}

export interface CustomerPaymentTotals {
  totalPaidInr: number;
  paymentCount: number;
  lastPaymentAt: string | null;
  currency: string;
}

interface ZohoCustomerPayment {
  payment_id: string;
  amount?: number;
  date?: string;
  currency_code?: string;
  amount_refunded?: number;
  unused_amount?: number;
}

export interface LatestCustomerPayment {
  paymentId: string;
  amountInr: number;
  /** Payment date as reported by Zoho (ISO), or null if unparseable. */
  dateIso: string | null;
  /** Amount refunded so far (used to ignore refunded/reversed payments). */
  refundedInr: number;
  /** Amount not yet applied to an invoice (advance/excess). */
  unusedInr: number;
}

function sortByDateDesc(payments: ZohoCustomerPayment[]): ZohoCustomerPayment[] {
  return [...payments].sort(
    (a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime(),
  );
}

/**
 * Returns the most recent recorded payment for a customer (or null). Used to
 * reconcile a Day Pass when the user returns to the app, since one-time payment
 * links don't reliably fire the subscription webhook.
 *
 * NOTE: Zoho *Billing* v1 exposes payments at `/payments` (the `/customerpayments`
 * path is Zoho Books naming and 404s here). Fetches the top payment's detail to
 * surface refunded/unused amounts for reconciliation.
 */
export async function getLatestCustomerPayment(
  customerId: string,
): Promise<LatestCustomerPayment | null> {
  const res = await zohoRequest<{ payments?: ZohoCustomerPayment[] }>(
    "GET",
    `/payments?customer_id=${encodeURIComponent(customerId)}`,
  );
  const p = sortByDateDesc(res.payments ?? [])[0];
  if (!p) return null;

  // The list view omits refund/unused fields — fetch the detail to get them.
  let detail: ZohoCustomerPayment = p;
  try {
    const d = await zohoRequest<{ payment?: ZohoCustomerPayment }>("GET", `/payments/${p.payment_id}`);
    if (d.payment) detail = d.payment;
  } catch {
    /* best-effort — fall back to list fields */
  }

  const amountInr = Number(detail.amount) || 0;
  return {
    paymentId: p.payment_id,
    amountInr,
    dateIso: detail.date ? new Date(detail.date).toISOString() : null,
    refundedInr: Number(detail.amount_refunded) || 0,
    unusedInr: detail.unused_amount == null ? amountInr : Number(detail.unused_amount) || 0,
  };
}

/**
 * Sums the actual money received from a Zoho customer (all recorded payments —
 * covers both subscription invoices and one-time Day Pass links). Used by the
 * admin dashboard's on-demand "Sync from Zoho" so the list stays fast (we cache
 * the result on the subscription doc rather than calling Zoho per row on load).
 */
export async function getCustomerPaymentTotals(customerId: string): Promise<CustomerPaymentTotals> {
  const res = await zohoRequest<{ payments?: ZohoCustomerPayment[] }>(
    "GET",
    `/payments?customer_id=${encodeURIComponent(customerId)}`,
  );
  const payments = sortByDateDesc(res.payments ?? []);
  // Net of refunds so the admin total reflects money actually retained.
  const totalPaidInr = payments.reduce(
    (sum, p) => sum + (Number(p.amount) || 0) - (Number(p.amount_refunded) || 0),
    0,
  );
  const lastPaymentAt = payments[0]?.date ? new Date(payments[0].date).toISOString() : null;
  return {
    totalPaidInr: Math.round(totalPaidInr * 100) / 100,
    paymentCount: payments.length,
    lastPaymentAt,
    currency: payments[0]?.currency_code ?? "INR",
  };
}
