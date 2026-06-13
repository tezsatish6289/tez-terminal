export type LiveslideWalkthroughTourStep = {
  id: string;
  selector: string;
  title: string;
  body: string;
  placement: "top" | "bottom" | "left" | "right";
};

export const LIVESLIDE_WALKTHROUGH_INTRO = {
  title: "What is Liveslide and how to use it",
  readLabel: "5 min read",
  excerpt:
    "Cycle through market setups that are aligned right now — filters, auto-advance, charts, and news in one view.",
  purpose: [
    "The Market Map shows hundreds of NSE F&O names at once. Liveslide is the opposite focus: one aligned setup at a time, with a live chart, zone overlays, filters, and news — cycling automatically so you can scan the whole market without clicking every symbol.",
    "“Aligned” means price has reached a meaningful position relative to derived support / resistance and Max Pain — the same rules shown on the map. Liveslide exists to make that subset effortless to watch. It is for research and monitoring, not trade signals from us.",
  ],
  advantages: [
    "Hands-free: the market comes to you — qualifying setups rotate automatically so you never scroll a giant grid.",
    "Pre-filtered for quality: only zone-qualified setups (a 2:1 reward to Max Pain) ever enter the rotation.",
    "Full chart context: zones, OI peaks, and Max Pain are drawn on a live candlestick chart, not tiny map bubbles.",
    "Focus on your side: filter to support or resistance setups depending on what you are hunting.",
    "Study on demand: pause any slide to read the chart and news for as long as you like.",
    "See long-term trends as well — open a TradingView chart by clicking the link at the bottom of the chart or pressing T on your keyboard.",
  ],
};

export const LIVESLIDE_WALKTHROUGH_TOUR_STEPS: LiveslideWalkthroughTourStep[] = [
  {
    id: "filter",
    selector: '[data-liveslide-tour="filter"]',
    title: "Zone filter",
    body: "Tap ALL to narrow to At Support, Near Support, At Resistance, or Near Resistance. Only zone-qualified setups with a healthy reward to Max Pain appear in Liveslide.",
    placement: "bottom",
  },
  {
    id: "live",
    selector: '[data-liveslide-tour="live-count"]',
    title: "Live count",
    body: "Shows how many aligned setups match your filter right now — the same live universe as the market map, pre-scored for you.",
    placement: "bottom",
  },
  {
    id: "pause",
    selector: '[data-liveslide-tour="pause"]',
    title: "Pause or play",
    body: "Liveslide auto-advances every 60 seconds. Pause when something catches your eye — the countdown shows seconds until the next symbol.",
    placement: "bottom",
  },
  {
    id: "bubbles",
    selector: '[data-liveslide-tour="bubbles"]',
    title: "Back to map",
    body: "Return to the full bubble map anytime. Press B or click Bubbles.",
    placement: "bottom",
  },
  {
    id: "strip",
    selector: '[data-liveslide-tour="strip"]',
    title: "Symbol strip",
    body: "Every qualifying name sits here with its status badge. Click any tile to jump — or let the rotation bring each setup to you.",
    placement: "bottom",
  },
  {
    id: "chart",
    selector: '[data-liveslide-tour="chart"]',
    title: "Live chart with zones",
    body: "Support and resistance bands, Put/Call OI peaks, and Max Pain are drawn on live 15M candles — the same derived zones as the map, in full chart context.",
    placement: "top",
  },
  {
    id: "tradingview",
    selector: '[aria-label="Open full chart on TradingView in a new tab. Press T or click."]',
    title: "Long-term trends on TradingView",
    body: "See longer-term trend confluence too — click the chart footer link or press T on your keyboard to open this symbol on TradingView.",
    placement: "top",
  },
  {
    id: "news",
    selector: '[data-liveslide-tour="news"]',
    title: "Recent news",
    body: "Each slide includes an AI summary of recent headlines with sentiment and citations — context to read alongside the chart, not a trade signal from us.",
    placement: "left",
  },
  {
    id: "footer",
    selector: '[data-liveslide-tour="footer"]',
    title: "Auto-advance or pick a slide",
    body: "Dot indicators jump to any slide. When playing, Liveslide advances every 60s — sit back and scan, or pause to study one name.",
    placement: "top",
  },
];
