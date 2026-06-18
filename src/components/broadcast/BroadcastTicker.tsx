"use client";

import { useEffect, useState } from "react";
import { FNONINJA_FREE_TRIAL_DAYS } from "@/lib/fnoninja/pricing";

/** How long each message stays on screen (incl. fade in/out). */
const MESSAGE_MS = 5500;

const TICKER_CSS = `
@keyframes broadcast-msg-fade {
  0%   { opacity: 0; transform: translateY(0.7vh); }
  9%   { opacity: 1; transform: translateY(0); }
  88%  { opacity: 1; transform: translateY(0); }
  100% { opacity: 0; transform: translateY(-0.7vh); }
}
.broadcast-msg { animation: broadcast-msg-fade ${MESSAGE_MS}ms ease both; }
`;

/**
 * Bottom CTA messages — shown ONE AT A TIME with a fade in/out so they're easy
 * to read on a video stream. Kept policy-safe: no guaranteed-returns language,
 * a persistent "not advice" line, and an honest note that the numbers are the
 * day's closing positioning.
 */
const MESSAGES: { icon: string; text: string; accent?: boolean }[] = [
  {
    icon: "▲",
    text: "FREE 1-hour webinar — learn to read option walls & key levels",
    accent: true,
  },
  {
    icon: "✦",
    text: "Live every evening at 8 PM IST — reserve your free seat at fnoninja.com/webinar",
    accent: true,
  },
  { icon: "◆", text: "Support & resistance zones, option walls and max-pain for every F&O stock" },
  {
    icon: "★",
    text: `Want live F&O data too? Start a ${FNONINJA_FREE_TRIAL_DAYS}-day free trial at fnoninja.com`,
  },
  { icon: "●", text: "Showing today's closing positioning — live updates resume at the next market open" },
];

function FadeMessages() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setIdx((i) => (i + 1) % MESSAGES.length);
    }, MESSAGE_MS);
    return () => window.clearInterval(id);
  }, []);

  const m = MESSAGES[idx];
  return (
    <div className="relative flex-1 h-full flex items-center justify-center overflow-hidden px-[2vh]">
      <div
        key={idx}
        className="broadcast-msg flex items-center justify-center gap-[1.4vh]"
        style={{ maxWidth: "100%" }}
      >
        <span style={{ color: m.accent ? "#60a5fa" : "#3b82f6", fontSize: "2.6vh" }}>
          {m.icon}
        </span>
        <span
          className="truncate"
          style={{
            color: m.accent ? "#f0f4ff" : "#cbd5f5",
            fontSize: "2.7vh",
            fontWeight: m.accent ? 900 : 700,
            letterSpacing: "0.01em",
          }}
        >
          {m.text}
        </span>
      </div>
    </div>
  );
}

/** Bottom CTA strip — fade messages, brand label, disclaimer + webinar QR. */
export function BroadcastTicker() {
  return (
    <footer
      className="relative flex items-stretch overflow-hidden shrink-0"
      style={{
        height: "10vh",
        borderTop: "1px solid rgba(90,140,220,0.3)",
        background: "linear-gradient(90deg, #0a1426 0%, #0d1b2e 50%, #0a1426 100%)",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: TICKER_CSS }} />

      {/* Brand label */}
      <div
        className="z-10 flex items-center h-full shrink-0 font-black"
        style={{
          padding: "0 2.4vh",
          background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
          color: "#fff",
          fontSize: "2.2vh",
          letterSpacing: "0.06em",
          boxShadow: "0 0 28px rgba(59,130,246,0.5)",
        }}
      >
        FREE WEBINAR
      </div>

      {/* Rotating message + persistent disclaimer */}
      <div className="relative flex-1 h-full flex flex-col items-center justify-center min-w-0">
        <FadeMessages />
        <span
          className="shrink-0"
          style={{
            position: "absolute",
            bottom: "0.8vh",
            color: "#475569",
            fontSize: "1.3vh",
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          Educational data · not investment advice
        </span>
      </div>

      {/* Webinar QR — scan to register */}
      <div
        className="z-10 flex items-center h-full shrink-0"
        style={{
          gap: "1.2vh",
          padding: "0 2vh",
          borderLeft: "1px solid rgba(90,140,220,0.2)",
          background: "rgba(255,255,255,0.97)",
        }}
      >
        <div
          aria-hidden
          style={{
            width: "7.4vh",
            height: "7.4vh",
            backgroundImage: "url(/fnoninja/webinar-qr.svg)",
            backgroundSize: "contain",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
          }}
        />
        <div className="flex flex-col" style={{ paddingRight: "0.4vh" }}>
          <span style={{ fontSize: "1.7vh", fontWeight: 900, color: "#0a1426", lineHeight: 1.15 }}>
            Scan to join
          </span>
          <span style={{ fontSize: "1.45vh", fontWeight: 700, color: "#1d4ed8", lineHeight: 1.3 }}>
            fnoninja.com/webinar
          </span>
        </div>
      </div>
    </footer>
  );
}
