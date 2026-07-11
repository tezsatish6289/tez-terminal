import type { LiveslideWalkthroughTourStep } from "@/lib/fnoninja/liveslide-walkthrough-content";

export type FavslideWalkthroughTourStep = LiveslideWalkthroughTourStep;

export const FAVSLIDE_WALKTHROUGH_INTRO = {
  title: "What is Watchlist and how to use it",
  readLabel: "5 min read",
  excerpt:
    "Build a personal watchlist of your favourite indices and F&O stocks — charts, zones, and news in one view, with hands-free autoplay on Gold.",
  purpose: [
    "Livelist surfaces aligned market setups across the full universe. Watchlist is your personal shortlist: only symbols you chose, in the order you saved them — one at a time with the same chart, zone overlays, and news panel.",
    "Add names from the + button on the strip or from any symbol chart. Remove when you are done monitoring. Watchlist is for your own research rhythm — we show structure and context, never hold/exit calls.",
  ],
  advantages: [
    "Your list, your pace: step through only the indices and stocks you care about.",
    "Add in-place: tap + on the strip to search and add without leaving the page.",
    "Same chart depth: zones, OI peaks, and Max Pain on live candles — identical to Livelist.",
    "Hands-free autoplay on Gold / Day Pass: your list rotates automatically; Silver steps through manually.",
    "Quick cleanup: remove a symbol from the chart header when it drops off your list.",
    "Monitor positions: revisit symbols you are already tracking whenever you like.",
  ],
};

export const FAVSLIDE_WALKTHROUGH_TOUR_STEPS: FavslideWalkthroughTourStep[] = [
  {
    id: "fav-count",
    selector: '[data-favslide-tour="fav-count"]',
    title: "Your watchlist count",
    body: "Shows how many symbols are in your personal watchlist. The list is saved to your account — add or remove anytime.",
    placement: "bottom",
  },
  {
    id: "pause",
    selector: '[data-favslide-tour="pause"]',
    title: "Pause or play",
    body: "On Gold and the Day Pass, Watchlist auto-advances every 60 seconds through your list — pause when something needs more time. Silver steps through manually; upgrade to unlock autoplay.",
    placement: "bottom",
  },
  {
    id: "bubbles",
    selector: '[data-favslide-tour="bubbles"]',
    title: "Back to map",
    body: "Return to the full bubble map anytime. Press B or click Bubbles.",
    placement: "bottom",
  },
  {
    id: "add",
    selector: '[data-favslide-tour="add"]',
    title: "Add symbols",
    body: "Tap + to search any NSE F&O index or stock and add it to your watchlist — without leaving this page.",
    placement: "bottom",
  },
  {
    id: "strip",
    selector: '[data-favslide-tour="strip"]',
    title: "Your watchlist strip",
    body: "Every saved symbol appears in the left rail on desktop (or the strip above the chart on mobile). Click any tile to jump — or let the rotation bring each name to you.",
    placement: "right",
  },
  {
    id: "chart",
    selector: '[data-favslide-tour="chart"]',
    title: "Live chart with zones",
    body: "Support and resistance bands, Put/Call OI peaks, and Max Pain on live 15M candles — full chart context for each name on your watchlist.",
    placement: "top",
  },
  {
    id: "remove",
    selector: '[data-favslide-tour="remove"]',
    title: "Remove from watchlist",
    body: "Done monitoring a symbol? Tap Remove from watchlist in the left toolbar to drop it from your list.",
    placement: "bottom",
  },
  {
    id: "tradingview",
    selector: '[aria-label="Open full chart on TradingView in a new tab. Press T or click."]',
    title: "Long-term trends on TradingView",
    body: "Open this symbol on TradingView for longer-term context — click the chart footer link or press T.",
    placement: "top",
  },
  {
    id: "news",
    selector: '[data-favslide-tour="news"]',
    title: "Recent news",
    body: "Open Recent news from the left toolbar for an AI summary of recent headlines — read alongside the chart for your own interpretation.",
    placement: "left",
  },
  {
    id: "footer",
    selector: '[data-favslide-tour="footer"]',
    title: "Auto-advance or pick a symbol",
    body: "Dot indicators jump to any symbol in your list. With autoplay (Gold / Day Pass), Watchlist advances every 60s — or pause to stay on one name.",
    placement: "top",
  },
];
