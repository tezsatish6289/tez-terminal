"use client";

import { useEffect, useState } from "react";
import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import { Loader2 } from "lucide-react";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { NativeCandlesChart } from "@/components/levels/NativeCandlesChart";
import type { LevelVisualFocus } from "@/components/levels/native-chart-level-overlays";
import { BLACKBOARD_FIELD_BORDER } from "@/lib/levels/cta-blackboard";
import { formatLevelsChartMeta, levelsTradingViewParams } from "@/lib/levels/tradingview-symbol";
import { FNO_ACCENT, FNO_CARD_BORDER } from "@/lib/fnoninja/theme";

export type ScienceVisualFocus = LevelVisualFocus;

const NIFTY_TV = levelsTradingViewParams("index", "NIFTY");

export function FnoNinjaScienceLiveVisual({
  levels,
  focus,
  loading,
  candles,
  candlesLoading,
}: {
  levels: PublicLevels | null;
  focus: ScienceVisualFocus;
  loading?: boolean;
  candles?: CandlestickData[] | null;
  candlesLoading?: boolean;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const expiry = levels?.zonesExpiry;
  const meta = NIFTY_TV ? formatLevelsChartMeta(NIFTY_TV) : "15M · NSE:NIFTY";

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: FNO_CARD_BORDER, backgroundColor: "rgba(8,15,30,0.55)" }}
    >
      <div
        className="px-3 py-2.5 border-b flex flex-wrap items-center gap-x-3 gap-y-1"
        style={{ borderColor: "rgba(90,140,220,0.12)", color: "#94a3b8" }}
      >
        <span className="font-black text-white text-sm">NIFTY</span>
        <span className="text-[11px] font-medium">Nifty 50</span>
        <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: "#64748b" }}>
          {meta}
        </span>
        {expiry ? (
          <span
            className="ml-auto font-semibold rounded px-2 py-0.5 text-[10px] sm:text-[11px] transition-all duration-300"
            style={{
              color: focus === "expiry" ? "#93c5fd" : "#94a3b8",
              backgroundColor: focus === "expiry" ? "rgba(37,99,235,0.28)" : "rgba(90,140,220,0.08)",
              border: focus === "expiry" ? "1px solid rgba(96,165,250,0.55)" : "1px solid transparent",
              boxShadow: focus === "expiry" ? "0 0 20px rgba(37,99,235,0.35)" : "none",
            }}
          >
            Expiry {expiry}
          </span>
        ) : null}
      </div>

      <div
        className="relative w-full"
        style={{
          height: 440,
          borderTop: BLACKBOARD_FIELD_BORDER,
          backgroundColor: "rgba(0,0,0,0.35)",
        }}
      >
        {!mounted || !NIFTY_TV ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: FNO_ACCENT }} />
            <span className="text-sm" style={{ color: "#64748b" }}>
              Loading live NIFTY chart…
            </span>
          </div>
        ) : (
          <NativeCandlesChart
            symbol="NIFTY"
            candlesScope="index"
            interval="15"
            levels={levels}
            loading={loading}
            webChartUrl={NIFTY_TV.webChartUrl}
            hideShortcuts
            visualFocus={focus}
            externalCandles={candles ?? null}
            externalCandlesLoading={candlesLoading}
          />
        )}
      </div>
    </div>
  );
}
