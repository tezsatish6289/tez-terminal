"use client";

import { useEffect, useState } from "react";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { NativeCandlesChart } from "@/components/levels/NativeCandlesChart";
import type { LevelsActionableItem } from "@/lib/zones/levels-actionable-list";
import { BroadcastSlide } from "./BroadcastSlide";
import { cachedLevels, fetchLevels } from "./broadcast-data";

/**
 * Single-stock focus page — the "actual Liveslide": one symbol at a time, a
 * large live candlestick chart with derived support/resistance bands +
 * option-wall lines (reusing the app's NativeCandlesChart), beside a compact
 * descriptive levels rail. Purely informational; no calls.
 */
export function BroadcastLiveslide({ item }: { item: LevelsActionableItem }) {
  const [levels, setLevels] = useState<PublicLevels | null>(
    () => cachedLevels(item.scope, item.symbol) ?? item.data,
  );

  // Stocks in the in-zone list only carry compact aggregate fields — fetch the
  // per-symbol ladder (clusters + strikes). Served instantly from cache when
  // the prefetcher already warmed this symbol.
  useEffect(() => {
    setLevels(cachedLevels(item.scope, item.symbol) ?? item.data);
    if (item.scope !== "stock") return;

    let cancelled = false;
    void fetchLevels(item.scope, item.symbol).then((data) => {
      if (!cancelled && data) setLevels(data);
    });
    return () => {
      cancelled = true;
    };
  }, [item.scope, item.symbol, item.data]);

  const enriched: LevelsActionableItem = { ...item, data: levels ?? item.data };

  return (
    <>
      {/* Live chart — left 60%, levels + news rail right 40%. */}
      <section className="relative flex flex-col min-h-0 self-stretch" style={{ flex: "3 1 0%" }}>
        <div
          className="flex-1 min-h-0 rounded-xl overflow-hidden pointer-events-none select-none"
          style={{ border: "1px solid rgba(90,140,220,0.18)", background: "#070d1a" }}
        >
          <NativeCandlesChart
            key={`${enriched.scope}-${enriched.symbol}`}
            symbol={enriched.symbol}
            candlesScope={enriched.scope}
            interval="15"
            levels={enriched.data}
            webChartUrl=""
            hideShortcuts
            defaultFullHistory
          />
        </div>
        <div
          className="absolute z-10 flex items-center rounded-lg"
          style={{
            top: "1.4vh",
            left: "1.4vh",
            gap: "0.9vh",
            padding: "0.7vh 1.3vh",
            background: "rgba(8,15,30,0.72)",
            border: "1px solid rgba(90,140,220,0.22)",
            backdropFilter: "blur(4px)",
          }}
        >
          <span style={{ width: "0.5vh", height: "2vh", borderRadius: "999px", background: "#60a5fa" }} />
          <span className="font-black" style={{ fontSize: "1.8vh", color: "#f0f4ff" }}>
            {enriched.symbol}
          </span>
          <span style={{ fontSize: "1.45vh", color: "#64748b" }}>
            · live levels · support &amp; resistance · option walls
          </span>
        </div>
      </section>

      {/* Descriptive levels + news rail — 40% width, matched height. */}
      <aside
        className="flex flex-col min-h-0 self-stretch rounded-xl"
        style={{
          flex: "2 1 0%",
          padding: "2vh",
          background: "linear-gradient(180deg, rgba(13,27,46,0.85), rgba(8,15,30,0.85))",
          border: "1px solid rgba(90,140,220,0.2)",
        }}
      >
        <BroadcastSlide item={enriched} />
      </aside>
    </>
  );
}
