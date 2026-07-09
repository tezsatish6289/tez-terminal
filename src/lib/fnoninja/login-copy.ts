/** Shared sign-in copy — no trial/pricing language (shown to all visitors, including subscribers). */

export const FNO_LOGIN_PAGE_SUBTITLE =
  "Sign in with Google to access symbol charts, liveslide, and deep-dive analytics for your account.";

export const FNO_LOGIN_GATE_DESCRIPTION =
  "Sign in with Google to access option-chain zones, charts, and symbol analytics. Market Map is open to all.";

export const FNO_LOGIN_PAGE_META_DESCRIPTION =
  "Sign in to FNONINJA with Google — access NSE F&O analytics, charts, and option-chain zones.";

export const FNO_LOGIN_NAV_HINT =
  "Sign in with Google to access symbol charts and deep-dive analytics.";

export const FNO_LOGIN_DISCLAIMER =
  "Informational market data only · Not investment advice";

/** Signed-out market map preview — map visible; compact sign-in card floats over bubbles. */
export const FNO_MARKET_MAP_GUEST_HEADLINE = "See full market map";
export const FNO_MARKET_MAP_GUEST_DESCRIPTION =
  "Sign in with Google to explore 200+ NSE F&O symbols — filter by support, resistance, and OI clusters.";

/** Contextual copy when a signed-out user clicks a gated toolbar action on the public chart page. */
export const FNO_TOOLBAR_SIGN_IN_COPY = {
  chat: {
    title: "Chat with community",
    description:
      "Sign in to join F&O trader discussions, ask questions, and follow community chat on live symbols.",
  },
  favorite: {
    title: "Add to favourite",
    description:
      "Sign in to save symbols to your favourites and build a personalised watchlist.",
  },
  bubbles: {
    title: "View Bubble Chart",
    description:
      "Sign in to open the full NSE F&O market map with option-chain zones across the universe.",
  },
  favslide: {
    title: "Favourite Slideshow",
    description:
      "Sign in to cycle through your favourited symbols in a hands-free slideshow with live charts.",
  },
  liveslide: {
    title: "Live Slideshow",
    description:
      "Sign in to browse aligned market setups in liveslide — auto-rotating symbols near support or resistance.",
  },
} as const;

export type FnoToolbarSignInAction = keyof typeof FNO_TOOLBAR_SIGN_IN_COPY;
