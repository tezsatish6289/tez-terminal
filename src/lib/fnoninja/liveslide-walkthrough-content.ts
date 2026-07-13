export type LiveslideWalkthroughTourStep = {
  id: string;
  selector: string;
  title: string;
  body: string;
  placement: "top" | "bottom" | "left" | "right";
};

export const LIVESLIDE_WALKTHROUGH_INTRO = {
  title: "What is Livelist and how to use it",
  readLabel: "5 min read",
  excerpt:
    "Step through market setups that are aligned right now — filters, charts, and news in one view, with hands-free autoplay on Gold.",
  purpose: [
    "The Market Map shows hundreds of NSE F&O names at once. Livelist is the opposite focus: one aligned setup at a time, with a live chart, zone overlays, filters, and news — so you can scan the whole market without clicking every symbol.",
    "“Aligned” means price has reached a meaningful position relative to derived support / resistance and Max Pain — the same rules shown on the map. Livelist exists to make that subset effortless to watch. It is for research and monitoring, not trade signals from us.",
  ],
  advantages: [
    "Focused: qualifying setups line up for you so you never scroll a giant grid — step through one at a time.",
    "Hands-free autoplay on Gold / Day Pass: setups rotate automatically every 60 seconds; Silver steps through manually.",
    "Pre-filtered for quality: only zone-qualified setups (a 2:1 reward to Max Pain) ever enter the list.",
    "Full chart context: zones, OI peaks, and Max Pain are drawn on a live candlestick chart, not tiny map bubbles.",
    "Focus on your side: filter to support or resistance setups depending on what you are hunting.",
    "Study on demand: stay on any setup to read the chart and news for as long as you like.",
    "See long-term trends as well — open a TradingView chart by clicking the link at the bottom of the chart or pressing T on your keyboard.",
  ],
};

export const LIVESLIDE_WALKTHROUGH_TOUR_STEPS: LiveslideWalkthroughTourStep[] = [
  {
    id: "filter",
    selector: '[data-liveslide-tour="filter"]',
    title: "Zone filter",
    body: "Tap ALL to narrow to At Support, Near Support, At Resistance, or Near Resistance. Only zone-qualified setups with a healthy reward to Max Pain appear in Livelist.",
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
    body: "On Gold and the Day Pass, Livelist auto-advances every 60 seconds — pause when something catches your eye. Silver steps through manually; upgrade to unlock autoplay.",
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
    body: "Every qualifying name sits in the left rail on desktop (or the strip above the chart on mobile). Click any tile to jump — or let the rotation bring each setup to you.",
    placement: "right",
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
    body: "Open Recent news from the left toolbar for an AI summary of headlines with sentiment and citations — context to read alongside the chart, not a trade signal from us.",
    placement: "left",
  },
  {
    id: "atlas",
    selector: '[data-liveslide-tour="atlas"]',
    title: "Atlas AI",
    body: "Tap A to validate your own trade idea. Tell Atlas if you are bullish or bearish — it checks support/resistance, OI, news, and intraday trend, then tells you if your idea lines up.",
    placement: "left",
  },
  {
    id: "footer",
    selector: '[data-liveslide-tour="footer"]',
    title: "Auto-advance or pick a setup",
    body: "Dot indicators jump to any setup. With autoplay (Gold / Day Pass), Livelist advances every 60s — sit back and scan, or pause to study one name.",
    placement: "top",
  },
];
