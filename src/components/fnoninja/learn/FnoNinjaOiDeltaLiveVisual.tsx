"use client";

import { Loader2 } from "lucide-react";
import { NativeCandlesChart } from "@/components/levels/NativeCandlesChart";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  formatClusterDelta,
  formatClusterPeakLabel,
} from "@/lib/levels/format-cluster-size";
import { formatLevelsChartMeta, levelsTradingViewParams } from "@/lib/levels/tradingview-symbol";
import { INDEX_SPECS } from "@/lib/index-specs";
import { FNO_ACCENT, FNO_CARD_BORDER } from "@/lib/fnoninja/theme";
import type { CandlestickData } from "lightweight-charts";

const NIFTY_TV = levelsTradingViewParams("index", "NIFTY");

function DeltaRow({
  side,
  label,
  change,
}: {
  side: "Put" | "Call";
  label: string | null;
  change: number | null | undefined;
}) {
  const delta = formatClusterDelta(change);
  const building = (change ?? 0) >= 0;
  return (
    <div
      className="rounded-lg px-3 py-2.5 text-xs sm:text-[13px]"
      style={{ backgroundColor: "rgba(8,15,30,0.45)", border: "1px solid rgba(90,140,220,0.12)" }}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-wide mb-1"
        style={{ color: side === "Put" ? "#86efac" : "#fca5a5" }}
      >
        {side} cluster (live)
      </p>
      <p className="font-mono text-slate-200 leading-snug">{label ?? "—"}</p>
      {delta ? (
        <p
          className="mt-1 font-semibold"
          style={{ color: building ? "#86efac" : "#fca5a5" }}
        >
          {building ? "▲" : "▼"} {delta.replace(/^[+−]/, "")} OI today
        </p>
      ) : (
        <p className="mt-1 text-[11px]" style={{ color: "#64748b" }}>
          No meaningful change vs yesterday&apos;s close
        </p>
      )}
    </div>
  );
}

/** Live NIFTY chart highlighting ▲/▼ OI on cluster band labels. */
export function FnoNinjaOiDeltaLiveVisual({
  levels,
  loading,
  candles,
  candlesLoading,
  compact = false,
}: {
  levels: PublicLevels | null;
  loading?: boolean;
  candles?: CandlestickData[] | null;
  candlesLoading?: boolean;
  /** Tighter layout for Learn hub card thumbnail. */
  compact?: boolean;
}) {
  const meta = NIFTY_TV ? formatLevelsChartMeta(NIFTY_TV) : "15M · NSE:NIFTY";
  const putLabel = formatClusterPeakLabel(
    "Put",
    levels?.putClusterSize,
    levels?.putClusterStrike,
    levels?.putClusterChange,
  );
  const callLabel = formatClusterPeakLabel(
    "Call",
    levels?.callClusterSize,
    levels?.callClusterStrike,
    levels?.callClusterChange,
  );
  const updatedAt = levels?.computedAt
    ? new Date(levels.computedAt).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

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
            className="ml-auto text-[10px] font-semibold rounded px-2 py-0.5"
            style={{ backgroundColor: "rgba(37,99,235,0.12)", color: "#93c5fd" }}
          >
            Live example
          </span>
        </div>
      ) : null}

      <div
        className="relative w-full flex-1 min-h-0"
        style={{
          height: compact ? undefined : 440,
          minHeight: compact ? 80 : undefined,
          backgroundColor: "rgba(0,0,0,0.35)",
        }}
      >
        {loading || !NIFTY_TV ? (
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
            externalCandles={candles ?? null}
            externalCandlesLoading={candlesLoading}
          />
        )}
      </div>

      {!compact && !loading ? (
        <div className="px-3 py-3 sm:px-4 sm:py-4 border-t space-y-3" style={{ borderColor: "rgba(90,140,220,0.12)" }}>
          <p className="text-xs sm:text-sm leading-relaxed" style={{ color: "#94a3b8" }}>
            <strong className="text-slate-200">Look at the left-side band labels</strong> on the chart — the{" "}
            <strong className="text-slate-200">▲</strong> or <strong className="text-slate-200">▼</strong> at the
            end is today&apos;s change in OI at that put or call cluster.
            {levels?.spot != null ? (
              <>
                {" "}
                Spot:{" "}
                <span className="font-mono text-amber-200/90">
                  {Math.round(levels.spot).toLocaleString()}
                </span>
                .
              </>
            ) : null}
            {updatedAt ? ` Updated ${updatedAt}.` : ""}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <DeltaRow side="Put" label={putLabel} change={levels?.putClusterChange} />
            <DeltaRow side="Call" label={callLabel} change={levels?.callClusterChange} />
          </div>
          <p className="text-[11px] leading-relaxed" style={{ color: "#64748b" }}>
            The same ▲/▼ read appears on <strong className="text-slate-400">indices and NSE stocks</strong> when
            levels come from the option chain. Stocks on a fallback source may show size without delta until
            refreshed.
          </p>
        </div>
      ) : null}
    </div>
  );
}
