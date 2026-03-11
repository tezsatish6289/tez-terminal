/**
 * Subscription system constants, types, and helpers.
 */

export const BASE_PRICE_PER_DAY_USD = 3;
export const MIN_SUBSCRIPTION_DAYS = 14;
export const FREE_TRIAL_DAYS = 7;

/** @deprecated Use getEffectiveRate() instead */
export const PRICE_PER_DAY_USD = BASE_PRICE_PER_DAY_USD;

export interface DiscountTier {
  minDays: number;
  label: string;
  pricePerDay: number;
  discountPercent: number;
}

export const DISCOUNT_TIERS: DiscountTier[] = [
  { minDays: 365, label: "365 days", pricePerDay: 1.80, discountPercent: 40 },
  { minDays: 180, label: "180 days", pricePerDay: 2.10, discountPercent: 30 },
  { minDays: 90,  label: "90 days",  pricePerDay: 2.40, discountPercent: 20 },
  { minDays: 30,  label: "30 days",  pricePerDay: 2.70, discountPercent: 10 },
  { minDays: 14,  label: "14 days",  pricePerDay: 3.00, discountPercent: 0 },
];

export const PLAN_PRESETS = [14, 30, 90, 180, 365] as const;

export function getEffectiveRate(days: number): DiscountTier {
  for (const tier of DISCOUNT_TIERS) {
    if (days >= tier.minDays) return tier;
  }
  return DISCOUNT_TIERS[DISCOUNT_TIERS.length - 1];
}

export const POPULAR_CURRENCIES = [
  "usdttrc20", "btc", "eth", "usdterc20", "ltc", "sol",
];

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

export function calculatePrice(days: number): number {
  const tier = getEffectiveRate(days);
  return Math.round(days * tier.pricePerDay * 100) / 100;
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
