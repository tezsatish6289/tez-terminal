"use client";

import { NativeCandlesChart } from "@/components/levels/NativeCandlesChart";
import type { LevelsActionableItem } from "@/lib/zones/levels-actionable-list";
import { BroadcastSlide } from "./BroadcastSlide";

/**
 * Single-stock focus page — the "actual Liveslide": one symbol at a time, a
 * large live candlestick chart with derived support/resistance bands +
 * option-wall lines (reusing the app's NativeCandlesChart), beside a compact
 * descriptive levels rail. Purely informational; no calls.
 */
export function BroadcastLiveslide({ item }: { item: LevelsActionableItem }) {
  return (
    <>
      {/* Live chart with zones — the focus of the page. */}
      <section className="flex flex-col min-h-0" style={{ flex: "2 1 0%" }}>
        <div className="flex items-center" style={{ gap: "0.9vh", marginBottom: "1.1vh" }}>
          <span style={{ width: "0.5vh", height: "2.2vh", borderRadius: "999px", background: "#60a5fa" }} />
          <span className="font-black" style={{ fontSize: "1.9vh", color: "#f0f4ff" }}>
            {item.symbol}
          </span>
          <span style={{ fontSize: "1.5vh", color: "#64748b" }}>
            · live levels · support &amp; resistance · option walls
          </span>
        </div>
        <div
          className="flex-1 min-h-0 rounded-xl overflow-hidden pointer-events-none select-none"
          style={{ border: "1px solid rgba(90,140,220,0.18)", background: "#070d1a" }}
        >
          {/* key forces a clean remount per symbol so candles/zoom reset cleanly */}
          <NativeCandlesChart
            key={`${item.scope}-${item.symbol}`}
            symbol={item.symbol}
            candlesScope={item.scope}
            interval="15"
            levels={item.data}
            webChartUrl=""
            hideShortcuts
            defaultFullHistory
          />
        </div>
      </section>

      {/* Descriptive levels rail. */}
      <aside
        className="flex flex-col min-h-0 rounded-xl"
        style={{
          flex: "1 1 0%",
          padding: "2vh",
          background: "linear-gradient(180deg, rgba(13,27,46,0.85), rgba(8,15,30,0.85))",
          border: "1px solid rgba(90,140,220,0.2)",
        }}
      >
        <BroadcastSlide item={item} />
      </aside>
    </>
  );
}
