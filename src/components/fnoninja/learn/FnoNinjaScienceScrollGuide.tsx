"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  FnoNinjaScienceLiveVisual,
  type ScienceVisualFocus,
} from "@/components/fnoninja/learn/FnoNinjaScienceLiveVisual";
import { formatClusterPeakLabel } from "@/lib/levels/format-cluster-size";
import { FNO_ACCENT, FNO_CARD_BG, FNO_CARD_BORDER } from "@/lib/fnoninja/theme";

type Topic = {
  id: ScienceVisualFocus;
  title: string;
  paragraphs: string[];
};

const TOPICS: Topic[] = [
  {
    id: "put",
    title: "What is a put cluster?",
    paragraphs: [
      "Puts gain value when price falls. When many puts pile up at one strike below the current price, that strike becomes a put cluster — heavy open interest that we shade as a support zone.",
      "Market makers who sold those puts often buy the underlying as price dips toward the strike. That hedging can slow a fall — like a cushion. It is an observation from data, not a guarantee of a bounce.",
    ],
  },
  {
    id: "call",
    title: "What is a call cluster?",
    paragraphs: [
      "Calls gain value when price rises. A call cluster is where lots of call contracts stack at a strike above spot — we draw a resistance zone around it.",
      "Hedging those calls can mean selling into rallies, which may act like a ceiling. Context for your chart only — not a sell signal from us.",
    ],
  },
  {
    id: "maxPain",
    title: "What is max pain?",
    paragraphs: [
      "At expiry, options settle at the closing price. Max pain is the strike where option writers would pay out the least in total — where the most options would expire worthless.",
      "We show it as a yellow line. Some researchers watch it as a magnet near expiry. Price does not have to go there — it is one reference point for your own analysis.",
    ],
  },
  {
    id: "expiry",
    title: "What is expiry?",
    paragraphs: [
      "Every option chain is tied to an expiry date. FNONINJA uses the nearest liquid expiry when drawing zones, max pain, and cluster labels.",
      "When the calendar rolls forward, clusters and max pain can shift. Always match this expiry when you verify strikes on NSE.",
    ],
  },
];

function ScienceTopicSection({
  topic,
  levels,
  loading,
  index,
}: {
  topic: Topic;
  levels: PublicLevels | null;
  loading: boolean;
  index: number;
}) {
  return (
    <section
      id={`science-${topic.id}`}
      className="scroll-mt-20 py-10 sm:py-12 border-b last:border-b-0"
      style={{ borderColor: "rgba(90,140,220,0.12)" }}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-[0.2em] mb-3"
        style={{ color: FNO_ACCENT }}
      >
        Topic {index + 1} of {TOPICS.length}
      </p>
      <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mb-4">
        {topic.title}
      </h2>
      <div className="space-y-3 text-sm sm:text-[15px] leading-relaxed mb-6" style={{ color: "#cbd5e1" }}>
        {topic.paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      <FnoNinjaScienceLiveVisual levels={levels} focus={topic.id} loading={loading} />
    </section>
  );
}

export function FnoNinjaScienceScrollGuide() {
  const [levels, setLevels] = useState<PublicLevels | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch("/api/freedombot/levels", { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { indices?: { symbol?: string; label: string; data: PublicLevels | null }[] }) => {
        if (cancelled) return;
        const hit = json.indices?.find(
          (it) => (it.symbol ?? it.label).toUpperCase() === "NIFTY",
        );
        setLevels(hit?.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setLevels(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const verifyHint = useMemo(() => {
    const put = formatClusterPeakLabel("Put", levels?.putClusterSize, levels?.putClusterStrike);
    const call = formatClusterPeakLabel("Call", levels?.callClusterSize, levels?.callClusterStrike);
    const exp = levels?.zonesExpiry ?? "the chart expiry";
    return { put, call, exp };
  }, [levels]);

  return (
    <div>
      <div
        className="rounded-2xl p-5 sm:p-6 mb-2"
        style={{ backgroundColor: FNO_CARD_BG, border: FNO_CARD_BORDER }}
      >
        <p className="text-sm sm:text-base leading-relaxed" style={{ color: "#94a3b8" }}>
          Scroll through four short topics. Each one explains a concept, then shows it on a{" "}
          <strong className="text-slate-200">live NIFTY zone ladder</strong> — real levels from
          FNONINJA, positioned by price (HTML/CSS, not a screenshot).
        </p>
        <nav className="flex flex-wrap gap-2 mt-4">
          {TOPICS.map((t) => (
            <a
              key={t.id}
              href={`#science-${t.id}`}
              className="rounded-full px-3 py-1.5 text-xs font-bold transition-colors hover:text-white"
              style={{
                color: "#94a3b8",
                border: "1px solid rgba(90,140,220,0.2)",
                backgroundColor: "rgba(8,15,30,0.4)",
              }}
            >
              {t.title.replace("What is ", "").replace("?", "")}
            </a>
          ))}
        </nav>
      </div>

      {TOPICS.map((topic, i) => (
        <ScienceTopicSection
          key={topic.id}
          topic={topic}
          levels={levels}
          loading={loading}
          index={i}
        />
      ))}

      {verifyHint.put && verifyHint.call ? (
        <p className="text-xs pt-4" style={{ color: "#64748b" }}>
          When you verify on NSE, look for {verifyHint.put} and {verifyHint.call} on expiry{" "}
          {verifyHint.exp}.
        </p>
      ) : null}
    </div>
  );
}
