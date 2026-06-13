import type { LiveslideWalkthroughTourStep } from "@/lib/fnoninja/liveslide-walkthrough-content";

export type FavslideWalkthroughTourStep = LiveslideWalkthroughTourStep;

export const FAVSLIDE_WALKTHROUGH_INTRO = {
  title: "What is Favslide and how to use it",
  readLabel: "5 min read",
  excerpt:
    "Build a personal watchlist and cycle through your favourite indices and F&O stocks — charts, zones, and news in one view.",
  purpose: [
    "Liveslide rotates aligned market setups across the full universe. Favslide is your personal shortlist: only symbols you chose, in the order you saved them — one at a time with the same chart, zone overlays, and news panel.",
    "Add names from the + button on the strip or from any symbol chart. Remove when you are done monitoring. Favslide is for your own research rhythm — we show structure and context, never hold/exit calls.",
  ],
  advantages: [
    "Your list, your pace: cycle only the indices and stocks you care about.",
    "Add in-place: tap + on the strip to search and add without leaving the page.",
    "Same chart depth: zones, OI peaks, and Max Pain on live candles — identical to Liveslide.",
    "Quick cleanup: remove a symbol from the chart header when it drops off your list.",
    "Pause to study: stop auto-advance when a name needs a longer look.",
    "Monitor positions: revisit symbols you are already tracking on a schedule you define.",
  ],
};

export const FAVSLIDE_WALKTHROUGH_TOUR_STEPS: FavslideWalkthroughTourStep[] = [
  {
    id: "fav-count",
    selector: '[data-favslide-tour="fav-count"]',
    title: "Your favslide count",
    body: "Shows how many symbols are in your personal watchlist. The list is saved to your account — add or remove anytime.",
    placement: "bottom",
  },
  {
    id: "pause",
    selector: '[data-favslide-tour="pause"]',
    title: "Pause or play",
    body: "Favslide auto-advances every 60 seconds through your list. Pause when something needs more time — the countdown shows seconds until the next symbol.",
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
    body: "Tap + to search any NSE F&O index or stock and add it to favslide — without leaving this page.",
    placement: "bottom",
  },
  {
    id: "strip",
    selector: '[data-favslide-tour="strip"]',
    title: "Your watchlist strip",
    body: "Every saved symbol appears here with its status badge. Click any tile to jump — or let the rotation bring each name to you.",
    placement: "bottom",
  },
  {
    id: "chart",
    selector: '[data-favslide-tour="chart"]',
    title: "Live chart with zones",
    body: "Support and resistance bands, Put/Call OI peaks, and Max Pain on live 15M candles — full chart context for each favourite.",
    placement: "top",
  },
  {
    id: "remove",
    selector: '[data-favslide-tour="remove"]',
    title: "Remove from favslide",
    body: "Done monitoring a symbol? Tap Remove from favslide on the chart header to drop it from your list.",
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
    body: "Each slide includes an AI summary of recent headlines — read alongside the chart for your own interpretation.",
    placement: "left",
  },
  {
    id: "footer",
    selector: '[data-favslide-tour="footer"]',
    title: "Auto-advance or pick a slide",
    body: "Dot indicators jump to any symbol in your list. When playing, favslide advances every 60s — or pause to stay on one name.",
    placement: "top",
  },
];
