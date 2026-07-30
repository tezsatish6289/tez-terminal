/**
 * Client-safe FNO affiliate constants/types (no server-only imports).
 */

export {
  FNONINJA_FREE_TRIAL_DAYS,
  FNONINJA_REFERRAL_BONUS_TRIAL_DAYS,
  FNONINJA_TRIAL_WITH_REFERRAL_DAYS,
} from "@/lib/fnoninja/pricing";

export const AFFILIATE_BUBBLE_ID = "affiliate_refer_earn";

/** localStorage key for ?ref= capture (shared by tracker + referral prompt). */
export const FNO_REFERRAL_STORAGE_KEY = "fno_referral_code";

export function isAffiliateBubbleId(id: string): boolean {
  return id === AFFILIATE_BUBBLE_ID;
}

export interface AffiliateLadderTier {
  id: string;
  label: string;
  /** Inclusive min lifetime referred net sales (INR). */
  minSalesInr: number;
  /** Exclusive max; null = no upper bound. */
  maxSalesInr: number | null;
  rate: number;
}

export const DEFAULT_AFFILIATE_LADDER: AffiliateLadderTier[] = [
  { id: "starter", label: "Starter", minSalesInr: 0, maxSalesInr: 50_000, rate: 0.2 },
  { id: "growth", label: "Growth", minSalesInr: 50_000, maxSalesInr: 200_000, rate: 0.22 },
  { id: "pro", label: "Pro", minSalesInr: 200_000, maxSalesInr: 500_000, rate: 0.25 },
  { id: "elite", label: "Elite", minSalesInr: 500_000, maxSalesInr: 1_000_000, rate: 0.27 },
  { id: "partner", label: "Partner", minSalesInr: 1_000_000, maxSalesInr: null, rate: 0.3 },
];

/** Plan list price (net paid basis for commission when Zoho amount missing). */
export const FNO_PLAN_AMOUNT_INR: Record<"silver" | "gold" | "daypass", number> = {
  silver: 4500,
  gold: 7200,
  daypass: 99,
};
