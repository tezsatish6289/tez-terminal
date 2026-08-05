import { FNONINJA_FREE_TRIAL_DAYS } from "@/lib/fnoninja/pricing";

/**
 * Shared sign-in copy for FNONINJA.
 *
 * High-intent surfaces (login page, hard gates, landing CTAs) mention the free
 * trial. Tiny toolbar / account utilities stay feature-focused and can reuse
 * {@link FNO_LOGIN_TRIAL_NOTE} as a one-line footnote under the Google button.
 */

/** Soft line safe for returners + first-timers. */
export const FNO_LOGIN_TRIAL_NOTE = `New here? ${FNONINJA_FREE_TRIAL_DAYS}-day free trial · no credit card`;

export const FNO_LOGIN_PAGE_SUBTITLE =
  "Sign in with Google for charts, livelist, and deep-dive analytics.";

export const FNO_LOGIN_GATE_DESCRIPTION = `Sign in with Google to unlock option-chain zones, charts, and symbol analytics. New here? Start with a ${FNONINJA_FREE_TRIAL_DAYS}-day free trial — no credit card.`;

export const FNO_LOGIN_PAGE_META_DESCRIPTION = `Sign in to FNONINJA — ${FNONINJA_FREE_TRIAL_DAYS}-day free trial, then NSE F&O charts and option-chain zones.`;

export const FNO_LOGIN_NAV_HINT = `Sign in with Google for charts and analytics. New here? ${FNONINJA_FREE_TRIAL_DAYS}-day free trial.`;

export const FNO_LOGIN_DISCLAIMER =
  "Informational market data only · Not investment advice";

/** Signed-out market map preview — map visible; compact sign-in card floats over bubbles. */
export const FNO_MARKET_MAP_GUEST_HEADLINE = "See full market map";
export const FNO_MARKET_MAP_GUEST_DESCRIPTION = `Sign in to explore 200+ NSE F&O symbols — support, resistance, and OI clusters. Includes a ${FNONINJA_FREE_TRIAL_DAYS}-day free trial.`;

/** /community guest page — left column. */
export const FNO_COMMUNITY_PAGE_HEADLINE = "Join the F&O trader community";
export const FNO_COMMUNITY_PAGE_SUBTITLE = `A private room for members — same market data, real conversations. Included with your ${FNONINJA_FREE_TRIAL_DAYS}-day free trial.`;
export const FNO_COMMUNITY_PAGE_BENEFITS = [
  "Real traders discussing structure, not tips",
  "No buy/sell signals — observations only",
  "Share charts and P&L screenshots instantly",
  "General, Charts, PNL, Offers & Announcements",
  `Included with your ${FNONINJA_FREE_TRIAL_DAYS}-day free trial — all channels`,
] as const;

/** Landing / funnel soft CTAs. */
export const FNO_LANDING_NAV_TRIAL_LABEL = "Free Trial";
export const FNO_LANDING_NAV_LOGIN_LABEL = "Log in";
export const FNO_LANDING_HERO_TRIAL_HINT = `${FNONINJA_FREE_TRIAL_DAYS}-day free trial · no credit card`;
export const FNO_LANDING_ATLAS_HINT = `Sign in for Atlas — ${FNONINJA_FREE_TRIAL_DAYS}-day free trial`;
export const FNO_LANDING_ALERTS_CTA = `Try ${FNONINJA_FREE_TRIAL_DAYS} days free`;
export const FNO_TODAY_TRIAL_CTA = `Start ${FNONINJA_FREE_TRIAL_DAYS}-day free trial`;
export const FNO_REPLAY_TRIAL_CTA = `Start ${FNONINJA_FREE_TRIAL_DAYS}-day free trial`;

/** Feature-lock / paywall login branch. */
export const FNO_FEATURE_LOGIN_BODY = `Sign in with Google to unlock this feature. New here? ${FNONINJA_FREE_TRIAL_DAYS}-day free trial — no credit card.`;

/** Contextual copy when a signed-out user clicks a gated toolbar action. Feature-first. */
export const FNO_TOOLBAR_SIGN_IN_COPY = {
  news: {
    title: "News & sentiment",
    description:
      "Sign in to read recent news and option-chain sentiment for this symbol.",
  },
  atlas: {
    title: "Atlas AI",
    description:
      "Sign in to ask Atlas about levels and validate your trade idea on any symbol.",
  },
  chat: {
    title: "Chat with community",
    description:
      "Sign in to join F&O trader discussions, ask questions, and follow community chat on live symbols.",
  },
  alerts: {
    title: "Score alerts",
    description:
      "Sign in to get Atlas score alerts on your favslide symbols — chip, chime, and optional browser notifications.",
  },
  favorite: {
    title: "Add to watchlist",
    description: "Sign in to save symbols to your watchlist.",
  },
  bubbles: {
    title: "View Bubble Chart",
    description:
      "Sign in to open the full NSE F&O market map with option-chain zones across the universe.",
  },
  favslide: {
    title: "Watchlist",
    description:
      "Sign in to build your watchlist and browse your favourited symbols with live charts.",
  },
  liveslide: {
    title: "Livelist",
    description:
      "Sign in to browse aligned market setups — symbols sitting near support or resistance, with live charts.",
  },
} as const;

export type FnoToolbarSignInAction = keyof typeof FNO_TOOLBAR_SIGN_IN_COPY;
