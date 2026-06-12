"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import { formatClusterPeakLabel } from "@/lib/levels/format-cluster-size";
import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import { FNO_ACCENT, FNO_CARD_BORDER } from "@/lib/fnoninja/theme";

export type ScienceVisualFocus = "put" | "call" | "maxPain" | "expiry";

function fmtPrice(p: number): string {
  return p >= 1000 ? Math.round(p).toLocaleString("en-IN") : p.toFixed(2);
}

function bandStyle(
  yTop: number,
  yBottom: number,
): { top: number; height: number } {
  return { top: yTop, height: Math.max(yBottom - yTop, 3) };
}

function lineStyle(y: number): { top: number } {
  return { top: y - 1 };
}

export function FnoNinjaScienceLiveVisual({
  levels,
  focus,
  loading,
}: {
  levels: PublicLevels | null;
  focus: ScienceVisualFocus;
  loading?: boolean;
}) {
  const geometry = useMemo(() => {
    if (!levels) return null;

    const prices: number[] = [];
    const push = (v: number | null | undefined) => {
      if (v != null && Number.isFinite(v)) prices.push(v);
    };

    push(levels.spot);
    push(levels.bullLow);
    push(levels.bullHigh);
    push(levels.bearLow);
    push(levels.bearHigh);
    push(levels.poc);
    push(levels.putClusterStrike);
    push(levels.callClusterStrike);

    if (prices.length < 2) return null;

    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const pad = Math.max((maxP - minP) * 0.08, 80);
    const renderMin = minP - pad;
    const renderMax = maxP + pad;
    const span = renderMax - renderMin;
    const chartHeight = 300;

    const yFor = (price: number) => chartHeight * (1 - (price - renderMin) / span);

    return {
      chartHeight,
      yFor,
      renderMin,
      renderMax,
      bullBand:
        levels.bullLow != null && levels.bullHigh != null
          ? bandStyle(yFor(levels.bullHigh), yFor(levels.bullLow))
          : null,
      bearBand:
        levels.bearLow != null && levels.bearHigh != null
          ? bandStyle(yFor(levels.bearHigh), yFor(levels.bearLow))
          : null,
      putStrike:
        levels.putClusterStrike != null ? lineStyle(yFor(levels.putClusterStrike)) : null,
      callStrike:
        levels.callClusterStrike != null ? lineStyle(yFor(levels.callClusterStrike)) : null,
      maxPain: levels.poc != null ? lineStyle(yFor(levels.poc)) : null,
      spot: levels.spot != null ? lineStyle(yFor(levels.spot)) : null,
      putLabel: formatClusterPeakLabel("Put", levels.putClusterSize, levels.putClusterStrike),
      callLabel: formatClusterPeakLabel("Call", levels.callClusterSize, levels.callClusterStrike),
      expiry: levels.zonesExpiry,
    };
  }, [levels]);

  const dim = (key: ScienceVisualFocus | "spot") => {
    if (focus === "expiry") return key === "spot" ? 0.85 : 0.45;
    return focus === key ? 1 : 0.18;
  };

  if (loading) {
    return (
      <div
        className="flex h-[340px] items-center justify-center rounded-xl"
        style={{ border: FNO_CARD_BORDER, backgroundColor: "rgba(0,0,0,0.35)" }}
      >
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: FNO_ACCENT }} />
        <span className="ml-2 text-sm" style={{ color: "#64748b" }}>
          Loading live NIFTY zones…
        </span>
      </div>
    );
  }

  if (!geometry || !levels) {
    return (
      <div
        className="flex h-[200px] items-center justify-center rounded-xl px-4 text-center"
        style={{ border: FNO_CARD_BORDER, backgroundColor: "rgba(0,0,0,0.35)" }}
      >
        <p className="text-sm" style={{ color: "#64748b" }}>
          Live NIFTY zones unavailable right now. Open the market map to see current levels.
        </p>
      </div>
    );
  }

  const { chartHeight, yFor, renderMin, renderMax, bullBand, bearBand, putStrike, callStrike, maxPain, spot, putLabel, callLabel, expiry } =
    geometry;

  const axisTicks = [renderMax, (renderMax + renderMin) / 2, renderMin];

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: FNO_CARD_BORDER, backgroundColor: "rgba(0,0,0,0.45)" }}
    >
      <div
        className="px-3 py-2 border-b flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] sm:text-[11px]"
        style={{ borderColor: "rgba(90,140,220,0.12)", color: "#94a3b8" }}
      >
        <span className="font-black text-white text-sm">NIFTY</span>
        <span>Live zones</span>
        <span className="uppercase tracking-wider font-bold" style={{ color: "#64748b" }}>
          15m · NSE
        </span>
        {expiry ? (
          <span
            className="ml-auto font-semibold rounded px-2 py-0.5 transition-opacity"
            style={{
              color: focus === "expiry" ? "#93c5fd" : "#64748b",
              backgroundColor: focus === "expiry" ? "rgba(37,99,235,0.2)" : "transparent",
              opacity: dim("expiry"),
            }}
          >
            Expiry {expiry}
          </span>
        ) : null}
      </div>

      <div className="relative flex" style={{ height: chartHeight }}>
        <div className="relative flex-1 mx-3 my-3 min-w-0">
          {bearBand ? (
            <div
              className="absolute left-0 right-12 rounded-sm transition-opacity duration-300"
              style={{
                ...bearBand,
                opacity: dim("call"),
                background: `linear-gradient(180deg, ${LEVELS_ZONE_CHART.bear.nativeBandTop}, ${LEVELS_ZONE_CHART.bear.nativeBandBottom})`,
                boxShadow: focus === "call" ? `0 0 24px ${LEVELS_ZONE_CHART.bear.nativeBandTop}` : "none",
              }}
            />
          ) : null}

          {bullBand ? (
            <div
              className="absolute left-0 right-12 rounded-sm transition-opacity duration-300"
              style={{
                ...bullBand,
                opacity: dim("put"),
                background: `linear-gradient(180deg, ${LEVELS_ZONE_CHART.bull.nativeBandTop}, ${LEVELS_ZONE_CHART.bull.nativeBandBottom})`,
                boxShadow: focus === "put" ? `0 0 24px ${LEVELS_ZONE_CHART.bull.nativeBandTop}` : "none",
              }}
            />
          ) : null}

          {callStrike ? (
            <div
              className="absolute left-0 right-12 border-t-2 border-dotted transition-opacity duration-300"
              style={{
                top: callStrike.top,
                opacity: dim("call"),
                borderColor: LEVELS_ZONE_CHART.bear.line,
              }}
            />
          ) : null}

          {maxPain ? (
            <div
              className="absolute left-0 right-12 border-t-2 border-dashed transition-opacity duration-300"
              style={{
                top: maxPain.top,
                opacity: dim("maxPain"),
                borderColor: LEVELS_ZONE_CHART.maxPain.line,
              }}
            />
          ) : null}

          {putStrike ? (
            <div
              className="absolute left-0 right-12 border-t-2 border-dotted transition-opacity duration-300"
              style={{
                top: putStrike.top,
                opacity: dim("put"),
                borderColor: LEVELS_ZONE_CHART.bull.line,
              }}
            />
          ) : null}

          {spot ? (
            <div
              className="absolute left-0 right-12 border-t transition-opacity duration-300"
              style={{
                top: spot.top,
                opacity: dim("spot"),
                borderColor: "rgba(248,250,252,0.7)",
              }}
            />
          ) : null}

          {focus === "put" && putLabel ? (
            <div
              className="absolute left-2 max-w-[85%] rounded-md px-2 py-1 text-[10px] sm:text-[11px] font-bold"
              style={{
                top: putStrike ? putStrike.top - 28 : bullBand?.top ?? 8,
                color: "#86efac",
                backgroundColor: "rgba(8,15,30,0.85)",
              }}
            >
              {putLabel}
            </div>
          ) : null}

          {focus === "call" && callLabel ? (
            <div
              className="absolute left-2 max-w-[85%] rounded-md px-2 py-1 text-[10px] sm:text-[11px] font-bold"
              style={{
                top: callStrike ? callStrike.top - 28 : bearBand?.top ?? 8,
                color: "#fca5a5",
                backgroundColor: "rgba(8,15,30,0.85)",
              }}
            >
              {callLabel}
            </div>
          ) : null}

          {focus === "maxPain" && levels.poc != null ? (
            <div
              className="absolute left-2 rounded-md px-2 py-1 text-[10px] sm:text-[11px] font-bold"
              style={{
                top: maxPain ? maxPain.top - 28 : chartHeight / 2,
                color: LEVELS_ZONE_CHART.maxPain.labelText,
                backgroundColor: "rgba(8,15,30,0.85)",
              }}
            >
              Max Pain @ {fmtPrice(levels.poc)}
              {expiry ? ` · ${expiry}` : ""}
            </div>
          ) : null}

          {focus === "expiry" && expiry ? (
            <div
              className="absolute left-2 right-2 bottom-2 rounded-md px-3 py-2 text-[11px] font-semibold text-center"
              style={{
                color: "#cbd5e1",
                backgroundColor: "rgba(37,99,235,0.15)",
                border: "1px solid rgba(96,165,250,0.35)",
              }}
            >
              All levels on this chart use option-chain data for expiry{" "}
              <span className="text-white">{expiry}</span>
            </div>
          ) : null}

          {levels.spot != null ? (
            <div
              className="absolute right-14 -translate-y-1/2 text-[9px] font-mono px-1 rounded"
              style={{
                top: spot?.top ?? yFor(levels.spot),
                color: "#f8fafc",
                backgroundColor: "rgba(34,197,94,0.35)",
                opacity: dim("spot"),
              }}
            >
              {fmtPrice(levels.spot)}
            </div>
          ) : null}
        </div>

        <div
          className="relative w-14 shrink-0 border-l text-[9px] font-mono py-3 pr-1"
          style={{ borderColor: "rgba(90,140,220,0.12)", color: "#64748b" }}
        >
          {axisTicks.map((tick) => (
            <span
              key={tick}
              className="absolute right-1 -translate-y-1/2"
              style={{ top: yFor(tick) }}
            >
              {fmtPrice(tick)}
            </span>
          ))}
        </div>
      </div>

      <p
        className="px-3 py-2 text-[10px] border-t leading-relaxed"
        style={{ borderColor: "rgba(90,140,220,0.12)", color: "#64748b" }}
      >
        Live NIFTY levels from FNONINJA — updates as new NSE option-chain data arrives.
      </p>
    </div>
  );
}
