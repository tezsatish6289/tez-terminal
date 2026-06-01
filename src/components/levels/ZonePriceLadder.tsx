"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartHeight, setChartHeight] = useState(420);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const sync = () => setChartHeight(el.clientHeight);
    sync();

    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  const geometry = useMemo(() => {
    const prices: number[] = [];
    if (spot != null) prices.push(spot);
    if (bullLow != null) prices.push(bullLow);
    if (bullHigh != null) prices.push(bullHigh);
    if (bearLow != null) prices.push(bearLow);
    if (bearHigh != null) prices.push(bearHigh);
    if (poc != null) prices.push(poc);
    if (bullSl != null) prices.push(bullSl);
    if (bearSl != null) prices.push(bearSl);

    if (prices.length < 2) return null;

    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const span = Math.max(maxP - minP, 1);
    // Tight padding so levels use nearly the full vertical canvas.
    const padPx = span * 0.025;
    const renderMin = minP - padPx;
    const renderMax = maxP + padPx;
    const renderSpan = renderMax - renderMin;

    const yFor = (price: number): number =>
      chartHeight * (1 - (price - renderMin) / renderSpan);

    const bullBandStyle: React.CSSProperties | null =
      bullLow != null && bullHigh != null
        ? { top: yFor(bullHigh), height: Math.max(yFor(bullLow) - yFor(bullHigh), 2) }
        : null;
    const bearBandStyle: React.CSSProperties | null =
      bearLow != null && bearHigh != null
        ? { top: yFor(bearHigh), height: Math.max(yFor(bearLow) - yFor(bearHigh), 2) }
        : null;

    return { yFor, bullBandStyle, bearBandStyle };
  }, [spot, bullLow, bullHigh, bearLow, bearHigh, poc, bullSl, bearSl, chartHeight]);

  const c = currencySymbol;
  const fmt = fmtPrice;

  if (!geometry) {
    return (
      <div className="px-3 py-16 text-center">
        <p className="text-sm" style={{ color: "#64748b" }}>
          Not enough data to render levels
        </p>
      </div>
    );
  }

  const { yFor, bullBandStyle, bearBandStyle } = geometry;

  return (
    <div className="mx-auto w-full max-w-[min(100%,520px)] sm:max-w-[560px]">
      <div
        ref={containerRef}
        className="relative w-full min-h-[320px] h-[min(520px,52vh)] sm:h-[min(540px,56vh)]"
      >
        {/* Left label rail — ~36% width on mobile, fixed feel on desktop */}
        <div className="absolute inset-y-0 left-0 w-[36%] max-w-[148px] min-w-[92px]">
          <div
            className="absolute top-1 bottom-1 right-0 w-px"
            style={{
              background:
                "linear-gradient(to bottom, rgba(255,255,255,0.05), rgba(255,255,255,0.35), rgba(255,255,255,0.05))",
            }}
          />
          {bearSl != null && (
            <RailLabel
              y={yFor(bearSl)}
              label="Bear Inv."
              labelFull="Bear Invalidation"
              price={bearSl}
              c={c}
              fmt={fmt}
              dotColor="#f87171"
              textColor="#fca5a5"
              showPrice={false}
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
              showPrice={false}
            />
          )}
          {bearBandStyle && bearLow != null && (
            <RailPriceMarker
              y={yFor(bearLow)}
              price={bearLow}
              c={c}
              fmt={fmt}
              dotColor="#ef4444"
              textColor="#fca5a5"
            />
          )}
          {poc != null && (
            <RailLabel
              y={yFor(poc)}
              label="POC"
              labelFull="Point of Control"
              price={poc}
              c={c}
              fmt={fmt}
              dotColor="#e2e8f0"
              textColor="#f1f5f9"
              showPrice={false}
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
              showPrice={false}
            />
          )}
          {bullBandStyle && bullLow != null && (
            <RailPriceMarker
              y={yFor(bullLow)}
              price={bullLow}
              c={c}
              fmt={fmt}
              dotColor="#22c55e"
              textColor="#86efac"
            />
          )}
          {bullSl != null && (
            <RailLabel
              y={yFor(bullSl)}
              label="Bull Inv."
              labelFull="Bull Invalidation"
              price={bullSl}
              c={c}
              fmt={fmt}
              dotColor="#4ade80"
              textColor="#86efac"
              showPrice={false}
            />
          )}
        </div>

        {/* Chart panel — narrower, inset from right */}
        <div
          className="absolute top-0 bottom-0 right-0 rounded-xl sm:rounded-2xl overflow-hidden"
          style={{
            left: "calc(36% + 6px)",
            maxWidth: "calc(100% - 36% - 6px)",
            backgroundColor: "rgba(0,0,0,0.45)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "inset 0 0 60px rgba(0,0,0,0.5), 0 0 40px rgba(37,99,235,0.06)",
          }}
        >
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
                className="absolute top-1/2 -translate-y-1/2 left-2 sm:left-3 text-[10px] sm:text-xs font-bold tracking-wide"
                style={{ color: "#fecaca" }}
              >
                Bear Zone
              </span>
              <span
                className="absolute top-0.5 right-2 sm:right-3 text-[10px] font-mono font-bold tabular-nums"
                style={{ color: "#fecaca" }}
              >
                {c}{fmt(bearHigh ?? 0)}
              </span>
              <span
                className="absolute bottom-0.5 right-2 sm:right-3 text-[10px] font-mono font-bold tabular-nums"
                style={{ color: "#fca5a5" }}
              >
                {c}{fmt(bearLow ?? 0)}
              </span>
            </div>
          )}

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
                className="absolute top-1/2 -translate-y-1/2 left-2 sm:left-3 text-[10px] sm:text-xs font-bold tracking-wide"
                style={{ color: "#86efac" }}
              >
                Bull Zone
              </span>
              <span
                className="absolute top-0.5 right-2 sm:right-3 text-[10px] font-mono font-bold tabular-nums"
                style={{ color: "#86efac" }}
              >
                {c}{fmt(bullHigh ?? 0)}
              </span>
              <span
                className="absolute bottom-0.5 right-2 sm:right-3 text-[10px] font-mono font-bold tabular-nums"
                style={{ color: "#6ee7b7" }}
              >
                {c}{fmt(bullLow ?? 0)}
              </span>
            </div>
          )}

          {poc != null && (
            <div
              className="absolute left-0 right-0 border-t border-white/50"
              style={{ top: yFor(poc), boxShadow: "0 0 8px rgba(255,255,255,0.15)" }}
            />
          )}

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

          {spot != null && (
            <>
              <div
                className="absolute left-0 right-0"
                style={{
                  top: yFor(spot),
                  height: 3,
                  background:
                    "linear-gradient(90deg, rgba(251,191,36,0.2), #fbbf24, #fbbf24, rgba(251,191,36,0.2))",
                  boxShadow: "0 0 16px rgba(251,191,36,0.7), 0 0 32px rgba(251,191,36,0.35)",
                }}
              />
              <div
                className="absolute px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg left-1/2 -translate-x-1/2"
                style={{
                  top: yFor(spot) - 16,
                  backgroundColor: "rgba(0,0,0,0.85)",
                  border: "1px solid rgba(251,191,36,0.55)",
                  boxShadow: "0 0 20px rgba(251,191,36,0.25)",
                }}
              >
                <p className="text-[9px] sm:text-[10px] font-medium leading-none mb-0.5 text-center" style={{ color: "#fde68a" }}>
                  Current Price
                </p>
                <p className="text-xs sm:text-sm font-black font-mono tabular-nums leading-none text-center" style={{ color: "#fcd34d" }}>
                  {c}{fmt(spot)}
                </p>
              </div>
            </>
          )}

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg text-[10px] sm:text-[11px] font-bold uppercase tracking-widest transition-all disabled:opacity-50 hover:brightness-110"
              style={{
                color: "#93c5fd",
                border: "1px solid rgba(59,130,246,0.5)",
                backgroundColor: "rgba(15,23,42,0.8)",
                boxShadow: "0 0 20px rgba(59,130,246,0.25)",
              }}
            >
              <RefreshCw className={cn("h-3 w-3 sm:h-3.5 sm:w-3.5", refreshing && "animate-spin")} />
              Refresh
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RailPriceMarker({
  y,
  price,
  c,
  fmt,
  dotColor,
  textColor,
}: {
  y: number;
  price: number;
  c: string;
  fmt: (p: number) => string;
  dotColor: string;
  textColor: string;
}) {
  return (
    <div
      className="absolute right-0 flex items-center pointer-events-none pr-0.5"
      style={{ top: y, transform: "translateY(-50%)" }}
    >
      <div
        className="shrink-0 rounded-full"
        style={{
          width: 7,
          height: 7,
          backgroundColor: dotColor,
          boxShadow: `0 0 8px ${dotColor}`,
        }}
      />
      <span
        className="ml-1.5 text-[9px] sm:text-[10px] font-mono font-bold tabular-nums whitespace-nowrap sm:hidden"
        style={{ color: textColor }}
      >
        {c}{fmt(price)}
      </span>
    </div>
  );
}

function RailLabel({
  y,
  label,
  labelFull,
  price,
  c,
  fmt,
  dotColor,
  textColor,
  showPrice = true,
}: {
  y: number;
  label: string;
  labelFull?: string;
  price: number;
  c: string;
  fmt: (p: number) => string;
  dotColor: string;
  textColor: string;
  showPrice?: boolean;
}) {
  return (
    <div
      className="absolute right-0 flex items-center gap-1 pointer-events-none pr-0.5 max-w-full"
      style={{ top: y, transform: "translateY(-50%)" }}
    >
      <span
        className="flex-1 min-w-0 text-right text-[9px] sm:text-[10px] font-bold leading-tight truncate"
        style={{ color: textColor }}
        title={labelFull ?? label}
      >
        <span className="sm:hidden">{label}</span>
        <span className="hidden sm:inline">{labelFull ?? label}</span>
      </span>
      <div
        className="shrink-0 rounded-full"
        style={{
          width: 8,
          height: 8,
          backgroundColor: dotColor,
          boxShadow: `0 0 8px ${dotColor}, 0 0 16px ${dotColor}88`,
        }}
      />
      {showPrice && (
        <span
          className="hidden sm:inline text-[10px] font-mono font-bold tabular-nums whitespace-nowrap ml-1"
          style={{ color: textColor }}
        >
          {c}{fmt(price)}
        </span>
      )}
    </div>
  );
}

/** Format spot for the hero display above the chart. */
export function formatHeroPrice(spot: number, currency: string): string {
  return `${currency}${fmtPrice(spot)}`;
}
