/** FNONINJA pricing — INR display tiers for marketing and future billing. */

export const FNONINJA_FREE_TRIAL_DAYS = 7;
/** Extra trial days when a valid referral is applied (link or typed code). */
export const FNONINJA_REFERRAL_BONUS_TRIAL_DAYS = 3;
export const FNONINJA_TRIAL_WITH_REFERRAL_DAYS =
  FNONINJA_FREE_TRIAL_DAYS + FNONINJA_REFERRAL_BONUS_TRIAL_DAYS;

export interface FnoNinjaPricingTier {
  id: string;
  label: string;
  priceInr: number | null;
  pricePerDayInr: number | null;
  periodLabel: string;
  badge?: string;
  highlight?: boolean;
  features: string[];
}

export const FNONINJA_PRICING_TIERS: FnoNinjaPricingTier[] = [
  {
    id: "trial",
    label: "Free trial",
    priceInr: null,
    pricePerDayInr: null,
    periodLabel: "7 days",
    badge: "Start here",
    highlight: true,
    features: [
      "Full access to charts & symbol analytics",
      "Atlas ↑/↓ probabilities on charts",
      "Setup alerts",
      "No credit card required",
    ],
  },
  {
    id: "half-yearly",
    label: "Half yearly",
    priceInr: 4500,
    pricePerDayInr: 25,
    periodLabel: "6 months",
    badge: "Popular",
    features: [
      "Bubble map + charts + probabilities",
      "Setup alerts",
      "Watchlist & Livelist (manual)",
      "Best for active swing traders",
    ],
  },
  {
    id: "yearly",
    label: "Yearly",
    priceInr: 7200,
    pricePerDayInr: 20,
    periodLabel: "12 months",
    badge: "Best value",
    features: [
      "Everything in Silver, plus A+ setup alerts",
      "Watchlist & Livelist Autoplay + Atlas AI",
      "A+ setup alerts (highest confidence)",
      "Full-year market structure access",
    ],
  },
];

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}
