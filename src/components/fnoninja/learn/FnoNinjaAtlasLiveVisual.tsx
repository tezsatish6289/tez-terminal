"use client";

import { Loader2, Sparkles } from "lucide-react";
import { NativeCandlesChart } from "@/components/levels/NativeCandlesChart";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { AtlasLearnMenuMock } from "@/components/fnoninja/learn/AtlasLearnMenuMock";
import { AtlasLearnPlanMock } from "@/components/fnoninja/learn/AtlasLearnPlanMock";
import { formatLevelsChartMeta, levelsTradingViewParams } from "@/lib/levels/tradingview-symbol";
import { INDEX_SPECS } from "@/lib/index-specs";
import { FNO_ACCENT, FNO_CARD_BORDER } from "@/lib/fnoninja/theme";
import type { CandlestickData } from "lightweight-charts";

const NIFTY_TV = levelsTradingViewParams("index", "NIFTY");

/** Live NIFTY chart + Atlas menu / sample output for the Learn guide. */
export function FnoNinjaAtlasLiveVisual({
  levels,
  loading,
  candles,
  candlesLoading,
  compact = false,
  showPlanMock = true,
}: {
  levels: PublicLevels | null;
  loading?: boolean;
  candles?: CandlestickData[] | null;
  candlesLoading?: boolean;
  compact?: boolean;
  /** Full article shows sample plan layout; hub thumbnail hides it. */
  showPlanMock?: boolean;
}) {
  const meta = NIFTY_TV ? formatLevelsChartMeta(NIFTY_TV) : "15M · NSE:NIFTY";

  return (
    <div
      className="rounded-xl overflow-hidden h-full flex flex-col"
      style={{ border: compact ? "none" : FNO_CARD_BORDER, backgroundColor: "rgba(8,15,30,0.55)" }}
    >
      {!compact ? (
        <div
          className="px-3 py-2.5 border-b flex flex-wrap items-center gap-x-3 gap-y-1"
          style={{ borderColor: "rgba(90,140,220,0.12)", color: "#94a3b8" }}
        >
          <span className="font-black text-white text-sm">NIFTY</span>
          <span className="text-[11px] font-medium">{INDEX_SPECS.NIFTY.label}</span>
          <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: "#64748b" }}>
            {meta}
          </span>
          <span
            className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold rounded px-2 py-0.5"
            style={{ backgroundColor: "rgba(59,130,246,0.12)", color: "#93c5fd" }}
          >
            <Sparkles className="h-3 w-3" />
            Live example
          </span>
        </div>
      ) : null}

      <div className={compact ? "flex flex-col flex-1 min-h-0" : "grid lg:grid-cols-[1fr,min(100%,320px)] gap-0"}>
        <div
          className="relative w-full min-h-0"
          style={{
            height: compact ? undefined : 400,
            minHeight: compact ? 80 : undefined,
            backgroundColor: "rgba(0,0,0,0.35)",
          }}
        >
          {loading || !NIFTY_TV ? (
            <div className="absolute inset-0 flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: FNO_ACCENT }} />
              {!compact ? (
                <span className="text-sm" style={{ color: "#64748b" }}>
                  Loading live NIFTY chart…
                </span>
              ) : null}
            </div>
          ) : (
            <>
              <NativeCandlesChart
                symbol="NIFTY"
                candlesScope="index"
                interval="15"
                levels={levels}
                loading={loading}
                webChartUrl={NIFTY_TV.webChartUrl}
                hideShortcuts
                externalCandles={candles ?? null}
                externalCandlesLoading={candlesLoading}
              />
              {!compact ? (
                <div
                  className="absolute top-3 right-3 z-10 pointer-events-none inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                  style={{
                    color: FNO_ACCENT,
                    backgroundColor: "rgba(8,15,30,0.85)",
                    border: "1px solid rgba(96,165,250,0.45)",
                    boxShadow: "0 0 12px rgba(59,130,246,0.25)",
                  }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Atlas AI coach
                </div>
              ) : null}
            </>
          )}
        </div>

        {!compact ? (
          <div
            className="border-t lg:border-t-0 lg:border-l p-3 sm:p-4 space-y-4 overflow-y-auto"
            style={{ borderColor: "rgba(90,140,220,0.12)" }}
          >
            <AtlasLearnMenuMock symbol="NIFTY" symbolLabel={INDEX_SPECS.NIFTY.label} />
            {showPlanMock ? <AtlasLearnPlanMock levels={levels} /> : null}
          </div>
        ) : null}
      </div>

      {!compact && !loading ? (
        <div className="px-3 py-3 sm:px-4 border-t" style={{ borderColor: "rgba(90,140,220,0.12)" }}>
          <p className="text-xs sm:text-sm leading-relaxed" style={{ color: "#94a3b8" }}>
            <strong className="text-slate-200">Tap Atlas AI coach</strong> on any index or stock chart
            (top-right on the chart page). Pick a request — Atlas only calls the model after you choose.
            The levels grid above uses <strong className="text-slate-200">live NIFTY data</strong>; strategy
            legs are generated on the chart, not in this guide.
          </p>
        </div>
      ) : null}
    </div>
  );
}
