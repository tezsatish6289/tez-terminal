/** FNONINJA pricing — INR display tiers for marketing and future billing. */

export const FNONINJA_FREE_TRIAL_DAYS = 30;

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
    periodLabel: "1 month",
    badge: "Start here",
    highlight: true,
    features: [
      "Full access to charts & symbol analytics",
      "No credit card required",
      "Cancel anytime",
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
      "All analytics features",
      "Live session data refresh",
      "Slideshow & filters",
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
      "All analytics features",
      "Live session data refresh",
      "Slideshow & filters",
      "Full-year market structure access",
    ],
  },
];

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}
