"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { computeZoneSlAnchors } from "@/lib/zone-bot-engine";
import {
  noClusterLine,
  type SuggestedZonesSnapshot,
} from "@/components/simulator/heatmap-types";

/**
 * Read-only vertical price ladder for the public freedombot.ai/levels page.
 *
 * Mirrors the simulator's `ZonePriceLadder` (HeatmapAssetCard) visual — bull
 * band (green) at the bottom, bear band (red) at the top, max-pain magnet
 * lines between, the current price as the amber anchor — but:
 *   • strips all engine/bot status (no "active" highlighting),
 *   • renames the stop-loss anchors to "invalidation" lines (one half-width
 *     outside each band) so the levels aren't read as trade instructions,
 *   • is currency-aware (₹ for NSE indices, $ for crypto).
 */
export function ZonePriceLadder({
  suggested,
  spot,
  currencySymbol = "$",
}: {
  suggested: SuggestedZonesSnapshot;
  spot: number | null;
  currencySymbol?: string;
}) {
  const bullLow = suggested.bullZoneLow;
  const bullHigh = suggested.bullZoneHigh;
  const bullStrike = suggested.bullStrike;
  const bullOI = suggested.bullOI;
  const bullShare = suggested.bullClusterShare;
  const bullTp = suggested.bullTpTarget;
  const bullActionable = suggested.bullActionable;

  const bearLow = suggested.bearZoneLow;
  const bearHigh = suggested.bearZoneHigh;
  const bearStrike = suggested.bearStrike;
  const bearOI = suggested.bearOI;
  const bearShare = suggested.bearClusterShare;
  const bearTp = suggested.bearTpTarget;
  const bearActionable = suggested.bearActionable;

  const halfWidth = suggested.halfWidthUsd;

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

  const days = suggested.maxPainByExpiry ?? [];

  const mpGroups = useMemo(() => {
    const buckets = new Map<number, { price: number; labels: string[] }>();
    for (const e of days) {
      const key = Math.round(e.maxPain * 100) / 100;
      const dayLabel =
        e.dayIndex === 0 ? "Today" : e.dayIndex === 1 ? "D+1" : "D+2";
      const existing = buckets.get(key);
      if (existing) existing.labels.push(dayLabel);
      else buckets.set(key, { price: e.maxPain, labels: [dayLabel] });
    }
    return Array.from(buckets.values()).sort((a, b) => b.price - a.price);
  }, [days]);

  const prices: number[] = [];
  if (spot != null) prices.push(spot);
  if (bullLow != null) prices.push(bullLow);
  if (bullHigh != null) prices.push(bullHigh);
  if (bearLow != null) prices.push(bearLow);
  if (bearHigh != null) prices.push(bearHigh);
  for (const g of mpGroups) prices.push(g.price);
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

  const fmtHalfWidth = (hw: number): string => {
    if (hw >= 1000) return Math.round(hw).toLocaleString();
    if (hw >= 10) return hw.toFixed(0);
    if (hw >= 1) return hw.toFixed(2);
    return hw.toFixed(3);
  };

  const bullBandStyle: React.CSSProperties | null =
    bullLow != null && bullHigh != null
      ? { top: yFor(bullHigh), height: yFor(bullLow) - yFor(bullHigh) }
      : null;
  const bearBandStyle: React.CSSProperties | null =
    bearLow != null && bearHigh != null
      ? { top: yFor(bearHigh), height: yFor(bearLow) - yFor(bearHigh) }
      : null;

  const bullDetail = (() => {
    const bits: string[] = [];
    if (bullStrike != null) bits.push(`@ ${fmt(bullStrike)}`);
    if (halfWidth != null) bits.push(`HW ${fmtHalfWidth(halfWidth)}`);
    if (bullOI != null && bullOI > 0) bits.push(`OI ${Math.round(bullOI).toLocaleString()}`);
    if (bullShare != null && bullShare > 0) bits.push(`${Math.round(bullShare * 100)}%`);
    if (bullTp != null) bits.push(`TP ${fmt(bullTp)}`);
    return bits.join(" · ");
  })();
  const bearDetail = (() => {
    const bits: string[] = [];
    if (bearStrike != null) bits.push(`@ ${fmt(bearStrike)}`);
    if (halfWidth != null) bits.push(`HW ${fmtHalfWidth(halfWidth)}`);
    if (bearOI != null && bearOI > 0) bits.push(`OI ${Math.round(bearOI).toLocaleString()}`);
    if (bearShare != null && bearShare > 0) bits.push(`${Math.round(bearShare * 100)}%`);
    if (bearTp != null) bits.push(`TP ${fmt(bearTp)}`);
    return bits.join(" · ");
  })();

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
              Bear zone {bearDetail}
            </span>
            <span className="absolute top-0.5 right-2 text-[9px] font-mono font-bold text-rose-300/90 tabular-nums">
              {c}{bearHigh != null ? fmt(bearHigh) : "—"}
            </span>
            <span className="absolute bottom-0.5 right-2 text-[9px] font-mono text-rose-300/55 tabular-nums">
              {c}{bearLow != null ? fmt(bearLow) : "—"}
            </span>
          </div>
        )}

        {/* ── Max-pain lines ── */}
        {mpGroups.map((g) => {
          const isToday = g.labels.includes("Today");
          return (
            <div
              key={`mp-${g.price}`}
              className={cn(
                "absolute left-0 right-0 border-t border-dashed",
                isToday ? "border-accent/70" : "border-white/35",
              )}
              style={{ top: yFor(g.price) }}
            >
              <span
                className={cn(
                  "absolute left-2 -top-3 text-[9px] font-mono font-bold whitespace-nowrap",
                  isToday ? "text-accent" : "text-foreground/75",
                )}
              >
                Max pain
              </span>
              <span
                className={cn(
                  "absolute right-2 -top-3 text-[9px] font-mono font-bold tabular-nums",
                  isToday ? "text-accent" : "text-foreground/75",
                )}
              >
                {c}{fmt(g.price)}
              </span>
            </div>
          );
        })}

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
              Bull zone {bullDetail}
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
          {!bullBandStyle && noClusterLine("bull", suggested)}
          {!bullBandStyle && !bearBandStyle ? " · " : ""}
          {!bearBandStyle && noClusterLine("bear", suggested)}
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
