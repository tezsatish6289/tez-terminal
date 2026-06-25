"use client";

import { Loader2 } from "lucide-react";
import { NiftyOutlookChart } from "@/components/levels/NiftyOutlookChart";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  buildOutlookSeries,
  confidenceLabel,
  type OutlookCheckpoint,
} from "@/lib/levels/outlook-series";
import {
  formatClusterContracts,
  formatClusterDelta,
  formatClusterStrike,
} from "@/lib/levels/format-cluster-size";
import { formatLevelsChartMeta, levelsTradingViewParams } from "@/lib/levels/tradingview-symbol";
import { FNO_ACCENT, FNO_CARD_BORDER } from "@/lib/fnoninja/theme";

const EXAMPLE_SYMBOL = "NIFTY";

function fmtBand(low: number | null, high: number | null): string {
  if (low == null && high == null) return "—";
  if (low != null && high != null) return `${Math.round(low).toLocaleString()} – ${Math.round(high).toLocaleString()}`;
  const v = low ?? high;
  return v != null ? Math.round(v).toLocaleString() : "—";
}

function wallLabel(cp: OutlookCheckpoint, side: "support" | "resistance"): string | null {
  const oi = side === "support" ? cp.supportOI : cp.resistanceOI;
  const strike = side === "support" ? cp.supportStrike : cp.resistanceStrike;
  const change = side === "support" ? cp.supportOIChange : cp.resistanceOIChange;
  const size = formatClusterContracts(oi);
  const strikeText = formatClusterStrike(strike);
  if (!size) return null;
  const base = strikeText ? `${size} @ ${strikeText}` : size;
  const delta = formatClusterDelta(change);
  return delta ? `${base} (${delta} OI today)` : base;
}

function CheckpointRow({ cp, index }: { cp: OutlookCheckpoint; index: number }) {
  const conf = confidenceLabel(cp.confidence);
  return (
    <div
      className="rounded-lg px-3 py-2.5 text-xs sm:text-[13px]"
      style={{ backgroundColor: "rgba(8,15,30,0.45)", border: "1px solid rgba(90,140,220,0.12)" }}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5">
        <span className="font-bold text-white">{cp.label}</span>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{
            color:
              cp.confidence === "high"
                ? "#86efac"
                : cp.confidence === "medium"
                  ? "#fcd34d"
                  : "#fca5a5",
          }}
        >
          {conf}
        </span>
        {index === 0 ? (
          <span className="text-[10px]" style={{ color: "#64748b" }}>
            nearest expiry
          </span>
        ) : null}
      </div>
      <dl className="grid gap-1 sm:grid-cols-2" style={{ color: "#94a3b8" }}>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-emerald-400/80">Support band</dt>
          <dd className="font-mono tabular-nums text-slate-300">{fmtBand(cp.supportLow, cp.supportHigh)}</dd>
          {wallLabel(cp, "support") ? (
            <dd className="text-[11px] mt-0.5">{wallLabel(cp, "support")}</dd>
          ) : null}
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-red-400/80">Resistance band</dt>
          <dd className="font-mono tabular-nums text-slate-300">{fmtBand(cp.resistanceLow, cp.resistanceHigh)}</dd>
          {wallLabel(cp, "resistance") ? (
            <dd className="text-[11px] mt-0.5">{wallLabel(cp, "resistance")}</dd>
          ) : null}
        </div>
        {cp.maxPain != null ? (
          <div className="sm:col-span-2">
            <dt className="text-[10px] uppercase tracking-wide text-amber-400/80">Max pain</dt>
            <dd className="font-mono tabular-nums text-slate-300">{Math.round(cp.maxPain).toLocaleString()}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

/** Live Outlook ladder — NIFTY shown as the worked example; same view for all NSE indices. */
export function FnoNinjaOutlookLiveVisual({
  levels,
  loading,
  symbol = EXAMPLE_SYMBOL,
  indexLabel = "Nifty 50",
}: {
  levels: PublicLevels | null;
  loading?: boolean;
  symbol?: string;
  indexLabel?: string;
}) {
  const tv = levelsTradingViewParams("index", symbol);
  const meta = tv ? formatLevelsChartMeta(tv) : "15M · NSE index";
  const series = buildOutlookSeries(levels);
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
      className="rounded-xl overflow-hidden"
      style={{ border: FNO_CARD_BORDER, backgroundColor: "rgba(8,15,30,0.55)" }}
    >
      <div
        className="px-3 py-2.5 border-b flex flex-wrap items-center gap-x-3 gap-y-1"
        style={{ borderColor: "rgba(90,140,220,0.12)", color: "#94a3b8" }}
      >
        <span className="font-black text-white text-sm">{symbol}</span>
        <span className="text-[11px] font-medium">{indexLabel}</span>
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

      <div className="relative w-full" style={{ height: 420, backgroundColor: "rgba(0,0,0,0.35)" }}>
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: FNO_ACCENT }} />
            <span className="text-sm" style={{ color: "#64748b" }}>
              Loading live Outlook…
            </span>
          </div>
        ) : (
          <NiftyOutlookChart className="h-full w-full" levels={levels} spot={levels?.spot ?? null} />
        )}
      </div>

      {series && !loading ? (
        <div className="px-3 py-3 sm:px-4 sm:py-4 border-t space-y-3" style={{ borderColor: "rgba(90,140,220,0.12)" }}>
          <p className="text-xs sm:text-sm leading-relaxed" style={{ color: "#94a3b8" }}>
            <strong className="text-slate-200">Reading this chart:</strong>{" "}
            {series.spot != null ? (
              <>
                Spot is{" "}
                <span className="font-mono text-amber-200/90">{Math.round(series.spot).toLocaleString()}</span>
                .{" "}
              </>
            ) : null}
            Green blocks are support bands, red blocks are resistance, and the yellow stepped line is max pain across{" "}
            {series.checkpoints.length} upcoming {series.checkpoints.length === 1 ? "expiry" : "expiries"}.
            {updatedAt ? ` Updated ${updatedAt}.` : ""}
          </p>
          <div className="space-y-2">
            {series.checkpoints.map((cp, i) => (
              <CheckpointRow key={cp.expiryKey} cp={cp} index={i} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
