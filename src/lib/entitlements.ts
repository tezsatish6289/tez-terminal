/**
 * Feature-based entitlements for FNONINJA subscriptions.
 *
 * Single source of truth for "which plan tier unlocks which feature". Used by
 * BOTH the client (feature gates / upgrade prompts) and the server (API-route
 * enforcement) so gating cannot be bypassed from the browser.
 *
 * Tiers map to Zoho Billing plans:
 *   - free    → 7-day trial (auto-activated on first login; no Zoho plan)
 *   - silver  → Zoho plan `fnoninja_silver`  (₹4500 / 6 months, auto-renew)
 *   - gold    → Zoho plan `fnoninja_gold`    (₹7200 / 1 year, auto-renew)
 *   - daypass → one-time ₹99 invoice (24h access; not a Zoho plan)
 */

export type Feature =
  | "bubble_map"
  | "trend_chart"
  | "intraday_chart"
  | "outlook_chart"
  | "history_chart"
  | "sentiment_news"
  | "favourites"
  | "community"
  | "atlas_ai"
  | "favslide"
  | "liveslide";

/** Paid/entitled tiers. `null` = logged-in but no active subscription (expired). */
export type Tier = "free" | "silver" | "gold" | "daypass";

/**
 * Features usable WITHOUT login — a preview to entice sign-up. These are always
 * allowed regardless of auth or subscription state.
 */
export const PUBLIC_FEATURES: ReadonlySet<Feature> = new Set<Feature>([
  "trend_chart",
  "intraday_chart",
  "outlook_chart",
  "history_chart",
  "sentiment_news",
]);

const ALL_FEATURES: readonly Feature[] = [
  "bubble_map",
  "trend_chart",
  "intraday_chart",
  "outlook_chart",
  "history_chart",
  "sentiment_news",
  "favourites",
  "community",
  "atlas_ai",
  "favslide",
  "liveslide",
];

/** Features Silver deliberately excludes (Gold/Free/Day Pass keep them). */
const SILVER_EXCLUDED: ReadonlySet<Feature> = new Set<Feature>([
  "atlas_ai",
  "favslide",
  "liveslide",
]);

export const PLAN_FEATURES: Record<Tier, ReadonlySet<Feature>> = {
  free: new Set(ALL_FEATURES),
  gold: new Set(ALL_FEATURES),
  daypass: new Set(ALL_FEATURES),
  silver: new Set(ALL_FEATURES.filter((f) => !SILVER_EXCLUDED.has(f))),
};

export interface EntitlementContext {
  /** Current entitled tier, or null if no active subscription. */
  tier: Tier | null;
  /** Whether the subscription (trial or paid) is currently active/unexpired. */
  isActive: boolean;
  /** Whether the visitor is signed in. */
  isAuthenticated: boolean;
}

/**
 * The single gate check. Returns true if the given feature is accessible under
 * the supplied context.
 *
 * Rules:
 *  1. Public features (charts + sentiment) are always accessible — even logged out.
 *  2. Everything else requires an authenticated user with an active subscription
 *     whose tier includes the feature.
 */
export function hasFeature(feature: Feature, ctx: EntitlementContext): boolean {
  if (PUBLIC_FEATURES.has(feature)) return true;
  if (!ctx.isAuthenticated || !ctx.isActive || !ctx.tier) return false;
  return PLAN_FEATURES[ctx.tier].has(feature);
}

/** Why a feature is locked — lets the UI show the right prompt. */
export type LockReason = "login_required" | "subscription_required" | "upgrade_required";

/**
 * Returns null if the feature is accessible, otherwise the reason it's locked so
 * the UI can render the correct call-to-action (sign in vs. subscribe vs. upgrade).
 */
export function featureLockReason(
  feature: Feature,
  ctx: EntitlementContext,
): LockReason | null {
  if (hasFeature(feature, ctx)) return null;
  if (!ctx.isAuthenticated) return "login_required";
  if (!ctx.isActive || !ctx.tier) return "subscription_required";
  // Authenticated + active tier that simply doesn't include this feature (e.g. Silver → Atlas).
  return "upgrade_required";
}
