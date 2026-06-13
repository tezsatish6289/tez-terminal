"use client";

import { useEffect, useState } from "react";
import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  FnoNinjaScienceLiveVisual,
  type ScienceVisualFocus,
} from "@/components/fnoninja/learn/FnoNinjaScienceLiveVisual";
import { FNO_ACCENT } from "@/lib/fnoninja/theme";

type Topic = {
  id: ScienceVisualFocus;
  title: string;
  paragraphs: string[];
  closingLine?: string;
};

const TOPICS: Topic[] = [
  {
    id: "put",
    title: "Put Cluster",
    paragraphs: [
      "A Put Cluster is a strike where a large number of Put options are concentrated below the current market price.",
      "As price approaches this level, option writers and market makers often adjust their hedges to manage risk. This additional buying and hedging activity can increase market participation around the zone.",
      "As a result, price may slow down, consolidate, or sometimes bounce from the area.",
      "Many traders view Put Clusters as potential support zones, but they are not guaranteed to hold.",
    ],
    closingLine:
      "Think of a Put Cluster as an area where both positioning and hedging activity are concentrated.",
  },
  {
    id: "call",
    title: "Call Cluster",
    paragraphs: [
      "A Call Cluster is a strike where a large number of Call options are concentrated above the current market price.",
      "When price approaches this zone, option writers and market makers may adjust their hedges, creating increased trading activity around the level.",
      "This can cause price to slow down, stall, consolidate, or sometimes reverse.",
      "Because of this behavior, traders often view Call Clusters as potential resistance zones.",
      "A strong move above the cluster may force participants to reposition at higher strikes.",
    ],
    closingLine:
      "Think of a Call Cluster as a zone where market attention and hedging activity become elevated.",
  },
  {
    id: "maxPain",
    title: "Max Pain",
    paragraphs: [
      "Max Pain is the strike where option buyers would collectively lose the most value at expiry.",
      "As expiry approaches, traders and market makers often rebalance hedges more aggressively, which can sometimes pull price toward heavily traded strikes.",
      "This is one reason some markets appear to spend more time near the Max Pain level close to expiry.",
      "However, Max Pain is not a target and markets can easily ignore it during strong trends or major news events.",
      "Use it as a reference point for understanding option positioning, not as a prediction.",
    ],
  },
  {
    id: "expiry",
    title: "Expiry",
    paragraphs: [
      "Every option contract has an expiry date after which it ceases to exist.",
      "As expiry approaches, hedging activity typically increases because option positions become more sensitive to small price movements.",
      "This can make Put Clusters, Call Clusters, and Max Pain levels more influential than they are earlier in the expiry cycle.",
      "Once an expiry passes, the entire option structure resets and new clusters often emerge.",
      "Always check which expiry is being analyzed before interpreting any zone.",
    ],
  },
];

function ScienceTopicSection({
  topic,
  levels,
  loading,
  candles,
  candlesLoading,
  index,
}: {
  topic: Topic;
  levels: PublicLevels | null;
  loading: boolean;
  candles: CandlestickData[] | null;
  candlesLoading: boolean;
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
        {topic.closingLine ? (
          <p className="italic" style={{ color: "#94a3b8" }}>
            {topic.closingLine}
          </p>
        ) : null}
      </div>
      <FnoNinjaScienceLiveVisual
        levels={levels}
        focus={topic.id}
        loading={loading}
        candles={candles}
        candlesLoading={candlesLoading}
      />
    </section>
  );
}

export function FnoNinjaScienceScrollGuide() {
  const [levels, setLevels] = useState<PublicLevels | null>(null);
  const [loading, setLoading] = useState(true);
  const [candles, setCandles] = useState<CandlestickData[] | null>(null);
  const [candlesLoading, setCandlesLoading] = useState(true);

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

  useEffect(() => {
    let cancelled = false;
    setCandlesLoading(true);
    void fetch("/api/freedombot/levels/candles?symbol=NIFTY&scope=index&interval=15", {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((json: { ok: boolean; candles?: { time: number; open: number; high: number; low: number; close: number }[] }) => {
        if (cancelled) return;
        if (!json.ok || !json.candles?.length) {
          setCandles(null);
          return;
        }
        setCandles(
          json.candles.map((c) => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setCandles(null);
      })
      .finally(() => {
        if (!cancelled) setCandlesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      {TOPICS.map((topic, i) => (
        <ScienceTopicSection
          key={topic.id}
          topic={topic}
          levels={levels}
          loading={loading}
          candles={candles}
          candlesLoading={candlesLoading}
          index={i}
        />
      ))}
    </div>
  );
}
