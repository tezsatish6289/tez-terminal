/**
 * Subscription system constants, types, and helpers.
 */

export const FREE_TRIAL_DAYS = 7;

export interface Plan {
  days: number;
  price: number;
  label: string;
  badge?: string;
}

export const DEFAULT_PLANS: Plan[] = [
  { days: 30,  price: 15,  label: "30 days" },
  { days: 90,  price: 20, label: "90 days",  badge: "Most Popular" },
  { days: 365, price: 25, label: "365 days", badge: "Best Value" },
];

/** @deprecated Use fetchPlans() for server-side or /api/subscription/plans for client-side */
export const PLANS = DEFAULT_PLANS;

/** @deprecated Kept for backward compat in gating overlay */
export const PRICE_PER_DAY_USD = 3;

export type SubscriptionStatus = "trial" | "active" | "expired";

export interface SubscriptionDoc {
  userId: string;
  status: SubscriptionStatus;
  trialStartDate: string;
  trialEndDate: string;
  subscriptionEndDate: string | null;
  createdAt: string;
}

export type PaymentStatus =
  | "waiting"
  | "confirming"
  | "confirmed"
  | "sending"
  | "partially_paid"
  | "finished"
  | "failed"
  | "refunded"
  | "expired";

export interface PaymentDoc {
  userId: string;
  orderId: string;
  nowPaymentId: number;
  days: number;
  priceAmountUsd: number;
  payCurrency: string;
  payAmount: number;
  payAddress: string;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
}

export function calculatePrice(days: number, plans: Plan[] = DEFAULT_PLANS): number {
  const plan = plans.find((p) => p.days === days);
  if (plan) return plan.price;
  return days * 3;
}

export function isSubscriptionActive(sub: SubscriptionDoc | null): boolean {
  if (!sub) return false;
  const now = Date.now();

  if (sub.status === "trial") {
    return new Date(sub.trialEndDate).getTime() > now;
  }

  if (sub.status === "active" && sub.subscriptionEndDate) {
    return new Date(sub.subscriptionEndDate).getTime() > now;
  }

  return false;
}

export function getSubscriptionDaysRemaining(sub: SubscriptionDoc | null): number {
  if (!sub) return 0;
  const now = Date.now();

  let endDate: number;
  if (sub.status === "trial") {
    endDate = new Date(sub.trialEndDate).getTime();
  } else if (sub.subscriptionEndDate) {
    endDate = new Date(sub.subscriptionEndDate).getTime();
  } else {
    return 0;
  }

  const remaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
  return Math.max(0, remaining);
}

export function computeNewEndDate(currentEndDate: string | null, daysToAdd: number): string {
  const base = currentEndDate && new Date(currentEndDate).getTime() > Date.now()
    ? new Date(currentEndDate)
    : new Date();
  base.setDate(base.getDate() + daysToAdd);
  return base.toISOString();
}

export function generateOrderId(uid: string): string {
  const short = uid.slice(0, 6).toUpperCase();
  const ts = Date.now().toString(36).toUpperCase();
  return `TEZ-${short}-${ts}`;
}

const NETWORK_WARNINGS: Record<string, string> = {
  usdttrc20: "Send only USDT on the TRC20 (Tron) network. Sending on other networks will result in permanent loss.",
  usdterc20: "Send only USDT on the ERC20 (Ethereum) network. Sending on other networks will result in permanent loss.",
  usdtbsc: "Send only USDT on the BSC (BNB Smart Chain) network. Sending on other networks will result in permanent loss.",
  btc: "Send only BTC on the Bitcoin network.",
  eth: "Send only ETH on the Ethereum network.",
  ltc: "Send only LTC on the Litecoin network.",
  sol: "Send only SOL on the Solana network.",
  trx: "Send only TRX on the Tron network.",
  xrp: "Send only XRP on the XRP Ledger. Ensure you include the correct destination tag.",
  bnbbsc: "Send only BNB on the BSC (BNB Smart Chain) network.",
  doge: "Send only DOGE on the Dogecoin network.",
  matic: "Send only MATIC on the Polygon network.",
};

export function getNetworkWarning(currencyId: string): string | null {
  return NETWORK_WARNINGS[currencyId] ?? null;
}
