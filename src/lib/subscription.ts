/**
 * Subscription system constants, types, and helpers.
 */

export const PRICE_PER_DAY_USD = 3;
export const MIN_SUBSCRIPTION_DAYS = 14;
export const FREE_TRIAL_DAYS = 7;

export const SUPPORTED_CURRENCIES = [
  { id: "usdttrc20", label: "USDT (TRC20)", network: "TRC20", icon: "💲" },
  { id: "usdterc20", label: "USDT (ERC20)", network: "ERC20", icon: "💲" },
  { id: "btc", label: "Bitcoin", network: "Bitcoin", icon: "₿" },
  { id: "eth", label: "Ethereum", network: "ERC20", icon: "Ξ" },
  { id: "ltc", label: "Litecoin", network: "Litecoin", icon: "Ł" },
] as const;

export type SupportedCurrencyId = (typeof SUPPORTED_CURRENCIES)[number]["id"];

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
  return days * PRICE_PER_DAY_USD;
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

export function getNetworkWarning(currencyId: string): string | null {
  const currency = SUPPORTED_CURRENCIES.find((c) => c.id === currencyId);
  if (!currency) return null;

  if (currencyId === "usdttrc20") {
    return "Send only USDT on the TRC20 (Tron) network. Sending on other networks will result in permanent loss.";
  }
  if (currencyId === "usdterc20") {
    return "Send only USDT on the ERC20 (Ethereum) network. Sending on other networks will result in permanent loss.";
  }
  if (currencyId === "btc") {
    return "Send only BTC on the Bitcoin network.";
  }
  if (currencyId === "eth") {
    return "Send only ETH on the Ethereum network.";
  }
  if (currencyId === "ltc") {
    return "Send only LTC on the Litecoin network.";
  }
  return null;
}
