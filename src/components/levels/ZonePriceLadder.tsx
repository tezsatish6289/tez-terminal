"use client";

import { useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { computeZoneSlAnchors } from "@/lib/zone-bot-engine";

/**
 * Neutral, render-only level data for the public page. Mirrors the shape the
 * `/api/freedombot/levels` route emits — deliberately free of any option-chain
 * terminology (no strikes / OI / max-pain / expiry), so nothing about the
 * derivation reaches the browser.
 */
export interface PublicLevels {
  spot: number | null;
  poc: number | null;
  bullLow: number | null;
  bullHigh: number | null;
  bearLow: number | null;
  bearHigh: number | null;
  bandOffset: number | null;
  bullActive: boolean | null;
  bearActive: boolean | null;
  computedAt: string | null;
  unavailable: boolean;
}

const CHART_HEIGHT = 440;
const RAIL_W = 168;
const AXIS_X = RAIL_W;

function fmtPrice(p: number): string {
  return p >= 1000
    ? Math.round(p).toLocaleString()
    : p.toLocaleString(undefined, {
        minimumFractionDigits: p < 10 ? 3 : 2,
        maximumFractionDigits: p < 10 ? 3 : 2,
      });
}

/**
 * Cinematic price-ladder for the public freedombot.ai/levels page — left label
 * rail, glowing zones, Point of Control, and current-price anchor inside a
 * dark chart panel.
 */
export function ZonePriceLadder({
  levels,
  spot,
  currencySymbol = "$",
  onRefresh,
  refreshing,
}: {
  levels: PublicLevels;
  spot: number | null;
  currencySymbol?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const bullLow = levels.bullLow;
  const bullHigh = levels.bullHigh;
  const bearLow = levels.bearLow;
  const bearHigh = levels.bearHigh;
  const halfWidth = levels.bandOffset;
  const poc = levels.poc;

  const { bullSl, bearSl } = useMemo(
    () =>
      computeZoneSlAnchors({
        halfWidthUsd: halfWidth,
        bullZoneLow: bullLow,
        bullZoneHigh: bullHigh,
        bearZoneLow: bearLow,
        bearZoneHigh: bearHigh,
      }),
    [halfWidth, bullLow, bullHigh, bearLow, bearHigh],
  );

  const prices: number[] = [];
  if (spot != null) prices.push(spot);
  if (bullLow != null) prices.push(bullLow);
  if (bullHigh != null) prices.push(bullHigh);
  if (bearLow != null) prices.push(bearLow);
  if (bearHigh != null) prices.push(bearHigh);
  if (poc != null) prices.push(poc);
  if (bullSl != null) prices.push(bullSl);
  if (bearSl != null) prices.push(bearSl);

  if (prices.length < 2) {
    return (
      <div className="px-3 py-16 text-center">
        <p className="text-sm" style={{ color: "#64748b" }}>
          Not enough data to render levels
        </p>
      </div>
    );
  }

  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const span = Math.max(maxP - minP, 1);
  const padPx = span * 0.14;
  const renderMin = minP - padPx;
  const renderMax = maxP + padPx;
  const renderSpan = renderMax - renderMin;

  const yFor = (price: number): number =>
    CHART_HEIGHT * (1 - (price - renderMin) / renderSpan);

  const c = currencySymbol;
  const fmt = fmtPrice;

  const bullBandStyle: React.CSSProperties | null =
    bullLow != null && bullHigh != null
      ? { top: yFor(bullHigh), height: yFor(bullLow) - yFor(bullHigh) }
      : null;
  const bearBandStyle: React.CSSProperties | null =
    bearLow != null && bearHigh != null
      ? { top: yFor(bearHigh), height: yFor(bearLow) - yFor(bearHigh) }
      : null;

  return (
    <div className="relative w-full" style={{ height: CHART_HEIGHT }}>
      {/* Vertical axis */}
      <div
        className="absolute top-6 bottom-6 w-px"
        style={{
          left: AXIS_X,
          background: "linear-gradient(to bottom, rgba(255,255,255,0.05), rgba(255,255,255,0.35), rgba(255,255,255,0.05))",
        }}
      />

      {/* Left label rail */}
      {bearSl != null && (
        <RailLabel
          y={yFor(bearSl)}
          label="Bear Invalidation"
          price={bearSl}
          c={c}
          fmt={fmt}
          dotColor="#f87171"
          textColor="#fca5a5"
        />
      )}
      {bearBandStyle && bearHigh != null && (
        <RailLabel
          y={yFor(bearHigh)}
          label="Bear Zone"
          price={bearHigh}
          c={c}
          fmt={fmt}
          dotColor="#ef4444"
          textColor="#fecaca"
        />
      )}
      {poc != null && (
        <RailLabel
          y={yFor(poc)}
          label="Point of Control"
          price={poc}
          c={c}
          fmt={fmt}
          dotColor="#e2e8f0"
          textColor="#f1f5f9"
        />
      )}
      {bullBandStyle && bullHigh != null && (
        <RailLabel
          y={yFor(bullHigh)}
          label="Bull Zone"
          price={bullHigh}
          c={c}
          fmt={fmt}
          dotColor="#22c55e"
          textColor="#86efac"
        />
      )}
      {bullSl != null && (
        <RailLabel
          y={yFor(bullSl)}
          label="Bull Invalidation"
          price={bullSl}
          c={c}
          fmt={fmt}
          dotColor="#4ade80"
          textColor="#86efac"
        />
      )}

      {/* Chart panel */}
      <div
        className="absolute top-0 bottom-0 right-0 rounded-2xl overflow-hidden"
        style={{
          left: AXIS_X + 12,
          backgroundColor: "rgba(0,0,0,0.45)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "inset 0 0 60px rgba(0,0,0,0.5), 0 0 40px rgba(37,99,235,0.06)",
        }}
      >
        {/* Bear zone band */}
        {bearBandStyle && (
          <div
            className="absolute left-0 right-0"
            style={{
              ...bearBandStyle,
              background: "linear-gradient(90deg, rgba(239,68,68,0.35), rgba(239,68,68,0.12))",
              borderTop: "1px solid rgba(248,113,113,0.5)",
              borderBottom: "1px solid rgba(248,113,113,0.5)",
              boxShadow: "0 0 24px rgba(239,68,68,0.15)",
            }}
          >
            <span
              className="absolute top-1/2 -translate-y-1/2 left-4 text-xs font-bold tracking-wide"
              style={{ color: "#fecaca" }}
            >
              Bear Zone
            </span>
            <span
              className="absolute top-1/2 -translate-y-1/2 right-4 text-xs font-mono font-bold tabular-nums"
              style={{ color: "#fecaca" }}
            >
              {c}{fmt(bearHigh ?? 0)}
            </span>
          </div>
        )}

        {/* Bull zone band */}
        {bullBandStyle && (
          <div
            className="absolute left-0 right-0"
            style={{
              ...bullBandStyle,
              background: "linear-gradient(90deg, rgba(34,197,94,0.35), rgba(34,197,94,0.12))",
              borderTop: "1px solid rgba(74,222,128,0.5)",
              borderBottom: "1px solid rgba(74,222,128,0.5)",
              boxShadow: "0 0 24px rgba(34,197,94,0.15)",
            }}
          >
            <span
              className="absolute top-1/2 -translate-y-1/2 left-4 text-xs font-bold tracking-wide"
              style={{ color: "#86efac" }}
            >
              Bull Zone
            </span>
            <span
              className="absolute top-1/2 -translate-y-1/2 right-4 text-xs font-mono font-bold tabular-nums"
              style={{ color: "#86efac" }}
            >
              {c}{fmt(bullHigh ?? 0)}
            </span>
          </div>
        )}

        {/* Point of Control */}
        {poc != null && (
          <div
            className="absolute left-0 right-0 border-t border-white/50"
            style={{ top: yFor(poc), boxShadow: "0 0 8px rgba(255,255,255,0.15)" }}
          />
        )}

        {/* Invalidation guides */}
        {bearSl != null && (
          <div
            className="absolute left-0 right-0 border-t border-dotted border-rose-400/40"
            style={{ top: yFor(bearSl) }}
          />
        )}
        {bullSl != null && (
          <div
            className="absolute left-0 right-0 border-t border-dotted border-emerald-400/40"
            style={{ top: yFor(bullSl) }}
          />
        )}

        {/* Current price — glowing anchor */}
        {spot != null && (
          <>
            <div
              className="absolute left-0 right-0"
              style={{
                top: yFor(spot),
                height: 3,
                background: "linear-gradient(90deg, rgba(251,191,36,0.2), #fbbf24, #fbbf24, rgba(251,191,36,0.2))",
                boxShadow: "0 0 16px rgba(251,191,36,0.7), 0 0 32px rgba(251,191,36,0.35)",
              }}
            />
            <div
              className="absolute px-3 py-1.5 rounded-lg"
              style={{
                top: yFor(spot) - 18,
                left: "42%",
                backgroundColor: "rgba(0,0,0,0.85)",
                border: "1px solid rgba(251,191,36,0.55)",
                boxShadow: "0 0 20px rgba(251,191,36,0.25)",
              }}
            >
              <p className="text-[10px] font-medium leading-none mb-0.5" style={{ color: "#fde68a" }}>
                Current Price
              </p>
              <p className="text-sm font-black font-mono tabular-nums leading-none" style={{ color: "#fcd34d" }}>
                {c}{fmt(spot)}
              </p>
            </div>
          </>
        )}

        {/* Refresh */}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="absolute bottom-4 right-4 flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all disabled:opacity-50 hover:brightness-110"
            style={{
              color: "#93c5fd",
              border: "1px solid rgba(59,130,246,0.5)",
              backgroundColor: "rgba(15,23,42,0.8)",
              boxShadow: "0 0 20px rgba(59,130,246,0.25)",
            }}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            Refresh
          </button>
        )}
      </div>
    </div>
  );
}

function RailLabel({
  y,
  label,
  price,
  c,
  fmt,
  dotColor,
  textColor,
}: {
  y: number;
  label: string;
  price: number;
  c: string;
  fmt: (p: number) => string;
  dotColor: string;
  textColor: string;
}) {
  return (
    <div
      className="absolute flex items-center gap-2 pointer-events-none"
      style={{
        top: y,
        left: 0,
        width: AXIS_X + 6,
        transform: "translateY(-50%)",
      }}
    >
      <span
        className="flex-1 text-right text-[11px] font-bold leading-tight pr-1"
        style={{ color: textColor }}
      >
        {label}
      </span>
      <div
        className="shrink-0 rounded-full"
        style={{
          width: 10,
          height: 10,
          backgroundColor: dotColor,
          boxShadow: `0 0 10px ${dotColor}, 0 0 20px ${dotColor}88`,
        }}
      />
      <span
        className="absolute text-[11px] font-mono font-bold tabular-nums whitespace-nowrap"
        style={{ left: AXIS_X + 18, color: textColor }}
      >
        {c}{fmt(price)}
      </span>
    </div>
  );
}

/** Format spot for the hero display above the chart. */
export function formatHeroPrice(spot: number, currency: string): string {
  return `${currency}${fmtPrice(spot)}`;
}
