"use client";

import { useMemo } from "react";
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

/**
 * Read-only vertical price ladder for the public freedombot.ai/levels page.
 *
 * Bull band (green) at the bottom, bear band (red) at the top, the Point of
 * Control line between, the current price as the amber anchor — plus:
 *   • strips all engine/bot status (no "active" highlighting),
 *   • renames the stop-loss anchors to "invalidation" lines (one band-offset
 *     outside each band) so the levels aren't read as trade instructions,
 *   • is currency-aware (₹ for NSE indices, $ for crypto).
 */
export function ZonePriceLadder({
  levels,
  spot,
  currencySymbol = "$",
}: {
  levels: PublicLevels;
  spot: number | null;
  currencySymbol?: string;
}) {
  const bullLow = levels.bullLow;
  const bullHigh = levels.bullHigh;
  const bullActionable = levels.bullActive;

  const bearLow = levels.bearLow;
  const bearHigh = levels.bearHigh;
  const bearActionable = levels.bearActive;

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
      <div className="px-3 py-6 text-center">
        <p className="text-[10px] text-muted-foreground/40">
          Not enough data to render levels
        </p>
      </div>
    );
  }

  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const span = Math.max(maxP - minP, 1);
  const padPx = span * 0.12;
  const renderMin = minP - padPx;
  const renderMax = maxP + padPx;
  const renderSpan = renderMax - renderMin;

  const CHART_HEIGHT = 360;
  const yFor = (price: number): number =>
    CHART_HEIGHT * (1 - (price - renderMin) / renderSpan);

  const c = currencySymbol;
  const fmt = (p: number): string =>
    p >= 1000
      ? Math.round(p).toLocaleString()
      : p.toLocaleString(undefined, {
          minimumFractionDigits: p < 10 ? 3 : 2,
          maximumFractionDigits: p < 10 ? 3 : 2,
        });

  const bullBandStyle: React.CSSProperties | null =
    bullLow != null && bullHigh != null
      ? { top: yFor(bullHigh), height: yFor(bullLow) - yFor(bullHigh) }
      : null;
  const bearBandStyle: React.CSSProperties | null =
    bearLow != null && bearHigh != null
      ? { top: yFor(bearHigh), height: yFor(bearLow) - yFor(bearHigh) }
      : null;

  const bullIdle = bullBandStyle != null && bullActionable === false;
  const bearIdle = bearBandStyle != null && bearActionable === false;

  return (
    <div className="flex-1 flex flex-col justify-center px-3 py-3 sm:px-4 sm:py-4 min-h-[360px]">
      <div
        className="relative w-full rounded-lg border border-white/[0.06] bg-[#0a0a0c] overflow-hidden"
        style={{ height: CHART_HEIGHT }}
      >
        {/* ── Bear band ── */}
        {bearBandStyle && (
          <div
            className={cn(
              "absolute left-0 right-0 border-y border-rose-500/40 bg-rose-500/[0.14]",
              bearIdle && "opacity-60",
            )}
            style={bearBandStyle}
          >
            <span className="absolute top-0.5 left-2 text-[9px] font-mono font-bold text-rose-300/95 whitespace-nowrap">
              Bear zone
            </span>
            <span className="absolute top-0.5 right-2 text-[9px] font-mono font-bold text-rose-300/90 tabular-nums">
              {c}{bearHigh != null ? fmt(bearHigh) : "—"}
            </span>
            <span className="absolute bottom-0.5 right-2 text-[9px] font-mono text-rose-300/55 tabular-nums">
              {c}{bearLow != null ? fmt(bearLow) : "—"}
            </span>
          </div>
        )}

        {/* ── Point of Control ── */}
        {poc != null && (
          <div
            className="absolute left-0 right-0 border-t border-dashed border-accent/70"
            style={{ top: yFor(poc) }}
          >
            <span className="absolute left-2 -top-3 text-[9px] font-mono font-bold whitespace-nowrap text-accent">
              Point of Control
            </span>
            <span className="absolute right-2 -top-3 text-[9px] font-mono font-bold tabular-nums text-accent">
              {c}{fmt(poc)}
            </span>
          </div>
        )}

        {/* ── Invalidation lines (one half-width outside each band) ── */}
        {bullSl != null && (
          <InvalidationLine price={bullSl} label="Bull invalidation" tone="emerald" yFor={yFor} fmt={fmt} c={c} />
        )}
        {bearSl != null && (
          <InvalidationLine price={bearSl} label="Bear invalidation" tone="rose" yFor={yFor} fmt={fmt} c={c} />
        )}

        {/* ── Current price ── */}
        {spot != null && (
          <div
            className="absolute left-0 right-0 border-t-2 border-amber-300"
            style={{ top: yFor(spot) }}
          >
            <span className="absolute left-2 -top-3.5 text-[10px] font-mono font-black text-amber-300 whitespace-nowrap drop-shadow">
              Current price
            </span>
            <span className="absolute right-2 -top-3.5 text-[10px] font-mono font-black text-amber-300 tabular-nums">
              {c}{fmt(spot)}
            </span>
          </div>
        )}

        {/* ── Bull band ── */}
        {bullBandStyle && (
          <div
            className={cn(
              "absolute left-0 right-0 border-y border-emerald-500/40 bg-emerald-500/[0.14]",
              bullIdle && "opacity-60",
            )}
            style={bullBandStyle}
          >
            <span className="absolute top-0.5 right-2 text-[9px] font-mono font-bold text-emerald-300/90 tabular-nums">
              {c}{bullHigh != null ? fmt(bullHigh) : "—"}
            </span>
            <span className="absolute bottom-0.5 left-2 text-[9px] font-mono font-bold text-emerald-300/95 whitespace-nowrap">
              Bull zone
            </span>
            <span className="absolute bottom-0.5 right-2 text-[9px] font-mono text-emerald-300/55 tabular-nums">
              {c}{bullLow != null ? fmt(bullLow) : "—"}
            </span>
          </div>
        )}

        {/* ── Range bookends ── */}
        <span className="absolute top-1 right-2 text-[8px] font-mono text-muted-foreground/30 tabular-nums pointer-events-none">
          {!bearBandStyle && `${c}${fmt(renderMax)}`}
        </span>
        <span className="absolute bottom-1 right-2 text-[8px] font-mono text-muted-foreground/30 tabular-nums pointer-events-none">
          {!bullBandStyle && `${c}${fmt(renderMin)}`}
        </span>
      </div>

      {/* ── Missing-side fallback ── */}
      {(!bullBandStyle || !bearBandStyle) && (
        <p className="text-[9px] text-muted-foreground/45 italic mt-2 text-center">
          {!bullBandStyle && "No bullish zone in range"}
          {!bullBandStyle && !bearBandStyle ? " · " : ""}
          {!bearBandStyle && "No bearish zone in range"}
        </p>
      )}
    </div>
  );
}

function InvalidationLine({
  price,
  label,
  tone,
  yFor,
  fmt,
  c,
}: {
  price: number;
  label: string;
  tone: "emerald" | "rose";
  yFor: (price: number) => number;
  fmt: (p: number) => string;
  c: string;
}) {
  const isEmerald = tone === "emerald";
  return (
    <div
      className={cn(
        "absolute left-0 right-0 border-t border-dotted",
        isEmerald ? "border-emerald-500/45" : "border-rose-500/45",
      )}
      style={{ top: yFor(price) }}
    >
      <span
        className={cn(
          "absolute left-2 -top-3 text-[9px] font-mono font-bold whitespace-nowrap",
          isEmerald ? "text-emerald-400/75" : "text-rose-400/75",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "absolute right-2 -top-3 text-[9px] font-mono font-bold tabular-nums",
          isEmerald ? "text-emerald-400/75" : "text-rose-400/75",
        )}
      >
        {c}{fmt(price)}
      </span>
    </div>
  );
}
