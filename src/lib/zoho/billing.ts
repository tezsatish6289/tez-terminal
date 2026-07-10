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
}): Promise<ZohoCustomer> {
  const { uid, email, displayName } = args;

  if (email) {
    const found = await zohoRequest<{ customers?: ZohoCustomer[] }>(
      "GET",
      `/customers?email=${encodeURIComponent(email)}`,
    );
    if (found.customers && found.customers.length > 0) {
      return found.customers[0];
    }
  }

  const created = await zohoRequest<{ customer: ZohoCustomer }>("POST", "/customers", {
    display_name: displayName || email || uid,
    email,
    reference_id: uid,
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
 */
export async function createSubscriptionHostedPage(args: {
  planCode: string;
  customerId: string;
  uid: string;
  redirectUrl: string;
}): Promise<HostedPage> {
  const { planCode, customerId, uid, redirectUrl } = args;
  const res = await zohoRequest<{ hostedpage: HostedPage }>(
    "POST",
    "/hostedpages/newsubscription",
    {
      customer_id: customerId,
      plan: { plan_code: planCode },
      reference_id: uid,
      redirect_url: redirectUrl,
    },
  );
  return res.hostedpage;
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
}

export interface LatestCustomerPayment {
  paymentId: string;
  amountInr: number;
  /** Payment date as reported by Zoho (ISO), or null if unparseable. */
  dateIso: string | null;
}

/**
 * Returns the most recent recorded payment for a customer (or null). Used to
 * reconcile a Day Pass when the user returns to the app, since one-time payment
 * links don't reliably fire the subscription webhook.
 */
export async function getLatestCustomerPayment(
  customerId: string,
): Promise<LatestCustomerPayment | null> {
  const res = await zohoRequest<{ customerpayments?: ZohoCustomerPayment[] }>(
    "GET",
    `/customerpayments?customer_id=${encodeURIComponent(customerId)}&sort_column=date&sort_order=D`,
  );
  const p = res.customerpayments?.[0];
  if (!p) return null;
  return {
    paymentId: p.payment_id,
    amountInr: Number(p.amount) || 0,
    dateIso: p.date ? new Date(p.date).toISOString() : null,
  };
}

/**
 * Sums the actual money received from a Zoho customer (all recorded customer
 * payments — covers both subscription invoices and one-time Day Pass links).
 * Used by the admin dashboard's on-demand "Sync from Zoho" so the list stays
 * fast (we cache the result on the subscription doc rather than calling Zoho per
 * row on every load).
 */
export async function getCustomerPaymentTotals(customerId: string): Promise<CustomerPaymentTotals> {
  const res = await zohoRequest<{ customerpayments?: ZohoCustomerPayment[] }>(
    "GET",
    `/customerpayments?customer_id=${encodeURIComponent(customerId)}&sort_column=date&sort_order=D`,
  );
  const payments = res.customerpayments ?? [];
  const totalPaidInr = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const lastPaymentAt = payments[0]?.date ? new Date(payments[0].date).toISOString() : null;
  return {
    totalPaidInr: Math.round(totalPaidInr * 100) / 100,
    paymentCount: payments.length,
    lastPaymentAt,
    currency: payments[0]?.currency_code ?? "INR",
  };
}
