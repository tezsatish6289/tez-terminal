/**
 * Referral system types, helpers, and config fetching.
 */

import { getAdminFirestore } from "@/firebase/admin";

export interface ReferralConfig {
  commissionRate: number;
  minPayoutUsd: number;
  payoutNetwork: string;
  enabled: boolean;
}

const DEFAULT_REFERRAL_CONFIG: ReferralConfig = {
  commissionRate: 0.25,
  minPayoutUsd: 0,
  payoutNetwork: "trc20",
  enabled: true,
};

export async function fetchReferralConfig(): Promise<ReferralConfig> {
  try {
    const db = getAdminFirestore();
    const doc = await db.collection("config").doc("referral").get();
    if (doc.exists) {
      const data = doc.data()!;
      return {
        commissionRate: data.commissionRate ?? DEFAULT_REFERRAL_CONFIG.commissionRate,
        minPayoutUsd: data.minPayoutUsd ?? DEFAULT_REFERRAL_CONFIG.minPayoutUsd,
        payoutNetwork: data.payoutNetwork ?? DEFAULT_REFERRAL_CONFIG.payoutNetwork,
        enabled: data.enabled ?? DEFAULT_REFERRAL_CONFIG.enabled,
      };
    }
  } catch (e) {
    console.error("[Referral] Failed to fetch config:", e);
  }
  return DEFAULT_REFERRAL_CONFIG;
}

export type CommissionStatus = "pending" | "paid" | "failed";

export interface ReferralCommissionDoc {
  referrerId: string;
  referredUserId: string;
  paymentId: string;
  purchaseAmountUsd: number;
  commissionRate: number;
  commissionAmountUsd: number;
  status: CommissionStatus;
  payoutBatchId: string | null;
  createdAt: string;
  paidAt: string | null;
}

export type PayoutStatus = "pending" | "processing" | "completed" | "failed";

export interface ReferralPayoutDoc {
  referrerId: string;
  totalAmountUsd: number;
  walletAddress: string;
  network: string;
  status: PayoutStatus;
  nowpaymentsPayoutId: string | null;
  commissionIds: string[];
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export function generateReferralCode(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const TRC20_ADDRESS_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export function isValidTrc20Address(address: string): boolean {
  return TRC20_ADDRESS_REGEX.test(address);
}
