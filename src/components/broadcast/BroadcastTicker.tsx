"use client";

import { FNONINJA_FREE_TRIAL_DAYS } from "@/lib/fnoninja/pricing";

const TICKER_CSS = `
@keyframes broadcast-ticker-scroll {
  0% { transform: translate3d(0, 0, 0); }
  100% { transform: translate3d(-50%, 0, 0); }
}
.broadcast-ticker-track {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  will-change: transform;
  animation: broadcast-ticker-scroll 38s linear infinite;
}
`;

/**
 * The CTA messages that scroll along the bottom. Kept policy-safe: no
 * guaranteed-returns language, an explicit "not advice" line, and an honest
 * note that the on-screen numbers are the day's closing positioning.
 */
const MESSAGES: { icon: string; text: string; accent?: boolean }[] = [
  {
    icon: "▲",
    text: "FREE 1-hour webinar — learn to read option walls & key levels → fnoninja.com/webinar",
    accent: true,
  },
  { icon: "✦", text: "Live every evening at 8 PM IST · reserve your free seat at fnoninja.com/webinar" },
  { icon: "◆", text: "Support & resistance zones, option walls and max-pain for every F&O stock" },
  {
    icon: "★",
    text: `Want live F&O data too? Start a ${FNONINJA_FREE_TRIAL_DAYS}-day free trial at fnoninja.com`,
  },
  { icon: "●", text: "Showing today's closing positioning — live updates resume at the next market open" },
];

function TickerRun() {
  return (
    <span className="broadcast-ticker-run inline-flex items-center" aria-hidden>
      {MESSAGES.map((m, i) => (
        <span key={i} className="inline-flex items-center">
          <span
            style={{
              color: m.accent ? "#60a5fa" : "#3b82f6",
              fontSize: "1.9vh",
              margin: "0 1.1vh 0 2.4vh",
            }}
          >
            {m.icon}
          </span>
          <span
            style={{
              color: m.accent ? "#f0f4ff" : "#cbd5f5",
              fontSize: "1.95vh",
              fontWeight: m.accent ? 800 : 600,
              letterSpacing: "0.01em",
            }}
          >
            {m.text}
          </span>
        </span>
      ))}
    </span>
  );
}

/** Bottom CTA marquee + persistent disclaimer pill. */
export function BroadcastTicker() {
  return (
    <footer
      className="relative flex items-center overflow-hidden shrink-0"
      style={{
        height: "6.4vh",
        borderTop: "1px solid rgba(90,140,220,0.25)",
        background: "linear-gradient(90deg, #0a1426 0%, #0d1b2e 50%, #0a1426 100%)",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: TICKER_CSS }} />

      <div
        className="z-10 flex items-center h-full shrink-0 font-black"
        style={{
          padding: "0 1.8vh",
          background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
          color: "#fff",
          fontSize: "1.85vh",
          letterSpacing: "0.06em",
          boxShadow: "0 0 24px rgba(59,130,246,0.45)",
        }}
      >
        FREE WEBINAR
      </div>

      <div className="relative flex-1 h-full overflow-hidden flex items-center">
        <div className="broadcast-ticker-track">
          <TickerRun />
          <TickerRun />
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 left-0"
          style={{ width: "4vh", background: "linear-gradient(90deg, #0a1426, transparent)" }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0"
          style={{ width: "4vh", background: "linear-gradient(270deg, #0a1426, transparent)" }}
        />
      </div>

      <div
        className="z-10 flex items-center h-full shrink-0"
        style={{
          padding: "0 1.8vh",
          borderLeft: "1px solid rgba(90,140,220,0.2)",
          color: "#64748b",
          fontSize: "1.35vh",
          fontWeight: 600,
          letterSpacing: "0.02em",
        }}
      >
        Educational data · not investment advice
      </div>
    </footer>
  );
}
