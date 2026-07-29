/** Shared sign-in copy — no trial/pricing language (shown to all visitors, including subscribers). */

export const FNO_LOGIN_PAGE_SUBTITLE =
  "Sign in with Google to access symbol charts, livelist, and deep-dive analytics for your account.";

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

/** /community guest page — left column headline + benefits. */
export const FNO_COMMUNITY_PAGE_HEADLINE = "Join the F&O trader community";
export const FNO_COMMUNITY_PAGE_SUBTITLE =
  "A private room for subscribers — same market data, real conversations with serious traders.";
export const FNO_COMMUNITY_PAGE_BENEFITS = [
  "Real traders discussing structure, not tips",
  "No buy/sell signals — observations only",
  "Share charts and P&L screenshots instantly",
  "General, Charts, PNL, Offers & Announcements",
  "Included with your free trial — all channels",
] as const;

/** Contextual copy when a signed-out user clicks a gated toolbar action on the public chart page. */
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
    description:
      "Sign in to save symbols to your watchlist.",
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
