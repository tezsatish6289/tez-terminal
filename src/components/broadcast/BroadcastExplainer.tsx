"use client";

import { useEffect, useState } from "react";

const EXPLAIN_CSS = `
@keyframes broadcast-explain-in {
  0% { opacity: 0; transform: translate3d(0, 18px, 0); }
  100% { opacity: 1; transform: translate3d(0, 0, 0); }
}
.broadcast-explain-in { animation: broadcast-explain-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both; }
`;

/**
 * Big-font "what is FNONINJA / how it works" cards that rotate in the right
 * pane. Deliberately plain-language and policy-safe: describes the product
 * (a live map of option data), never trade calls. Copy mirrors the site hero.
 */
interface ExplainCard {
  kicker: string;
  headline: React.ReactNode;
  sub: string;
  accent: string;
}

const CARDS: ExplainCard[] = [
  {
    kicker: "WHAT IS FNONINJA",
    headline: (
      <>
        The entire NSE F&amp;O market on <span style={{ color: "#60a5fa" }}>one live map</span>.
      </>
    ),
    sub: "Every bubble is one F&O stock or index.",
    accent: "#60a5fa",
  },
  {
    kicker: "HOW IT WORKS",
    headline: (
      <>
        We read live option data and map each stock&apos;s{" "}
        <span style={{ color: "#34d399" }}>support &amp; resistance</span>.
      </>
    ),
    sub: "Built from open interest. Updated through the session.",
    accent: "#34d399",
  },
  {
    kicker: "OPTION WALLS",
    headline: (
      <>
        See where the <span style={{ color: "#fbbf24" }}>big money</span> is parked.
      </>
    ),
    sub: "Put & call walls and max-pain for every F&O name.",
    accent: "#fbbf24",
  },
  {
    kicker: "FREE FOR 30 DAYS",
    headline: (
      <>
        Get the live map free at <span style={{ color: "#60a5fa" }}>fnoninja.com</span>
      </>
    ),
    sub: "No credit card. Cancel anytime.",
    accent: "#60a5fa",
  },
];

const CARD_MS = 7000;

export function BroadcastExplainer() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setIdx((i) => (i + 1) % CARDS.length), CARD_MS);
    return () => window.clearInterval(id);
  }, []);

  const card = CARDS[idx];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <style dangerouslySetInnerHTML={{ __html: EXPLAIN_CSS }} />

      <div key={idx} className="broadcast-explain-in flex flex-col flex-1 justify-center min-h-0">
        <span
          className="font-black"
          style={{
            fontSize: "1.7vh",
            letterSpacing: "0.22em",
            color: card.accent,
            marginBottom: "2.2vh",
          }}
        >
          {card.kicker}
        </span>
        <h2
          className="font-black"
          style={{ fontSize: "4.4vh", lineHeight: 1.12, color: "#f0f4ff", letterSpacing: "-0.01em" }}
        >
          {card.headline}
        </h2>
        <p style={{ fontSize: "2.2vh", color: "#94a3b8", marginTop: "2.4vh", lineHeight: 1.35 }}>
          {card.sub}
        </p>
      </div>

      {/* progress dots */}
      <div className="flex items-center" style={{ gap: "0.8vh", marginTop: "1.6vh" }}>
        {CARDS.map((_, i) => (
          <span
            key={i}
            style={{
              width: i === idx ? "3vh" : "1vh",
              height: "1vh",
              borderRadius: "999px",
              background: i === idx ? card.accent : "rgba(148,163,184,0.25)",
              transition: "width 0.35s ease, background 0.35s ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}
