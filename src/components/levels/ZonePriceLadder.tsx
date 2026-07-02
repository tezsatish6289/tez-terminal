"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import type { PublicLevelsSource } from "@/lib/levels/levels-source";
import type {
  PublicLevelsExpiryOption,
  PublicLevelsExpirySlice,
} from "@/lib/levels/index-expiry-levels";
import { computeZoneSlAnchors } from "@/lib/zones/zone-sl-anchors";
import type { VolRegimeFlag } from "@/lib/zones/vol-regime";
import type { OiWallMomentum } from "@/lib/zones/oi-momentum-signal";
import { VolRegimeBadge } from "@/components/levels/VolRegimeBadge";

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
  /** `nse` = high confidence (★); `dhan` = low; null = unknown / awaiting scan. */
  levelsSource: PublicLevelsSource | null;
  /**
   * Volatility-regime qualifier (stocks only for now). Display/warning use —
   * does NOT affect zone selection. Null on indices / awaiting scan.
   */
  volRegime?: VolRegimeFlag | null;
  volRegimeReason?: string | null;
  atmIV?: number | null;
  daysToEarnings?: number | null;
  /** Nearest option-chain expiry used for zone derivation (DD/MM/YYYY). */
  zonesExpiry?: string | null;
  /** Dominant put-cluster open interest at support (contracts). */
  putClusterSize?: number | null;
  /** Dominant call-cluster open interest at resistance (contracts). */
  callClusterSize?: number | null;
  /** Strike with highest put OI below spot (support cluster anchor). */
  putClusterStrike?: number | null;
  /** Strike with highest call OI above spot (resistance cluster anchor). */
  callClusterStrike?: number | null;
  /** Change in support put OI since prev close (+ = reinforcing, − = unwinding). */
  putClusterChange?: number | null;
  /** Change in resistance call OI since prev close (+ = reinforcing, − = unwinding). */
  callClusterChange?: number | null;
  /** NSE indices: nearest-first expiry choices for the chart picker. */
  expiryOptions?: PublicLevelsExpiryOption[];
  /** NSE indices: full band payload per expiry (client-side expiry switch). */
  zonesByExpiry?: PublicLevelsExpirySlice[];
  /** Day-over-day OI-wall momentum (thickness + dominance) for the At/Near filter. */
  oi?: OiWallMomentum | null;
}

export type { PublicLevelsExpiryOption, PublicLevelsExpirySlice };

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
  variant = "page",
}: {
  levels: PublicLevels;
  spot: number | null;
  currencySymbol?: string;
  /** `embedded` drops page-only offsets for simulator/carousel panes. */
  variant?: "page" | "embedded";
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
    <div
      className={
        variant === "embedded"
          ? "mx-auto w-full max-w-full"
          : "mx-auto w-full max-w-[min(100%,520px)] sm:max-w-[560px] -translate-x-2 sm:translate-x-0"
      }
    >
      <div
        ref={containerRef}
        className={
          variant === "embedded"
            ? "relative w-full min-h-[200px] h-full flex-1"
            : "relative w-full min-h-[320px] h-[min(520px,52vh)] sm:h-[min(540px,56vh)]"
        }
      >
        {/* Volatility-regime chip (display only — never filters the setup). */}
        <div className="pointer-events-none absolute right-1 top-1 z-10">
          <VolRegimeBadge
            flag={levels.volRegime}
            reason={levels.volRegimeReason}
            atmIV={levels.atmIV}
            daysToEarnings={levels.daysToEarnings}
            className="pointer-events-auto"
          />
        </div>

        {/* Left label rail */}
        <div className="absolute inset-y-0 left-0 w-[38%] max-w-[168px] min-w-[108px] sm:w-[36%] sm:max-w-[172px] sm:min-w-[112px]">
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
              dotColor={LEVELS_ZONE_CHART.bear.lineInv}
              textColor={LEVELS_ZONE_CHART.bear.labelText}
            />
          )}
          {bearBandStyle && bearHigh != null && (
            <RailLabel
              y={yFor(bearHigh)}
              label="Bear High"
              labelFull="Bear Zone High"
              price={bearHigh}
              c={c}
              fmt={fmt}
              dotColor={LEVELS_ZONE_CHART.bear.line}
              textColor={LEVELS_ZONE_CHART.bear.labelTextMuted}
            />
          )}
          {bearBandStyle && bearLow != null && (
            <RailLabel
              y={yFor(bearLow)}
              label="Bear Low"
              labelFull="Bear Zone Low"
              price={bearLow}
              c={c}
              fmt={fmt}
              dotColor="#ef4444"
              textColor={LEVELS_ZONE_CHART.bear.labelText}
            />
          )}
          {poc != null && (
            <RailLabel
              y={yFor(poc)}
              label="Max Pain"
              labelFull="Max Pain"
              price={poc}
              c={c}
              fmt={fmt}
              dotColor={LEVELS_ZONE_CHART.maxPain.line}
              textColor={LEVELS_ZONE_CHART.maxPain.labelText}
            />
          )}
          {bullBandStyle && bullHigh != null && (
            <RailLabel
              y={yFor(bullHigh)}
              label="Bull High"
              labelFull="Bull Zone High"
              price={bullHigh}
              c={c}
              fmt={fmt}
              dotColor={LEVELS_ZONE_CHART.bull.line}
              textColor={LEVELS_ZONE_CHART.bull.labelText}
            />
          )}
          {bullBandStyle && bullLow != null && (
            <RailLabel
              y={yFor(bullLow)}
              label="Bull Low"
              labelFull="Bull Zone Low"
              price={bullLow}
              c={c}
              fmt={fmt}
              dotColor={LEVELS_ZONE_CHART.bull.line}
              textColor={LEVELS_ZONE_CHART.bull.labelTextMuted}
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
              dotColor={LEVELS_ZONE_CHART.bull.lineInv}
              textColor={LEVELS_ZONE_CHART.bull.labelText}
            />
          )}
        </div>

        <div
          className="absolute top-0 bottom-0 right-0 left-[calc(38%+4px)] sm:left-[calc(36%+4px)] rounded-xl sm:rounded-2xl overflow-hidden"
          style={{
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
                background: `linear-gradient(90deg, ${LEVELS_ZONE_CHART.bear.bandFill}, ${LEVELS_ZONE_CHART.bear.bandFillSoft})`,
                borderTop: `1px solid ${LEVELS_ZONE_CHART.bear.bandBorder}`,
                borderBottom: `1px solid ${LEVELS_ZONE_CHART.bear.bandBorder}`,
                boxShadow: LEVELS_ZONE_CHART.bear.bandGlow,
              }}
            >
              <span
                className="absolute top-1/2 -translate-y-1/2 left-2 sm:left-3 text-[10px] sm:text-xs font-bold tracking-wide"
                style={{ color: LEVELS_ZONE_CHART.bear.labelTextMuted }}
              >
                Bear Zone
              </span>
              <span
                className="absolute top-0.5 right-2 sm:right-3 text-[10px] font-mono font-bold tabular-nums"
                style={{ color: LEVELS_ZONE_CHART.bear.labelTextMuted }}
              >
                {c}{fmt(bearHigh ?? 0)}
              </span>
              <span
                className="absolute bottom-0.5 right-2 sm:right-3 text-[10px] font-mono font-bold tabular-nums"
                style={{ color: LEVELS_ZONE_CHART.bear.labelText }}
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
                background: `linear-gradient(90deg, ${LEVELS_ZONE_CHART.bull.bandFill}, ${LEVELS_ZONE_CHART.bull.bandFillSoft})`,
                borderTop: `1px solid ${LEVELS_ZONE_CHART.bull.bandBorder}`,
                borderBottom: `1px solid ${LEVELS_ZONE_CHART.bull.bandBorder}`,
                boxShadow: LEVELS_ZONE_CHART.bull.bandGlow,
              }}
            >
              <span
                className="absolute top-1/2 -translate-y-1/2 left-2 sm:left-3 text-[10px] sm:text-xs font-bold tracking-wide"
                style={{ color: LEVELS_ZONE_CHART.bull.labelText }}
              >
                Bull Zone
              </span>
              <span
                className="absolute top-0.5 right-2 sm:right-3 text-[10px] font-mono font-bold tabular-nums"
                style={{ color: LEVELS_ZONE_CHART.bull.labelText }}
              >
                {c}{fmt(bullHigh ?? 0)}
              </span>
              <span
                className="absolute bottom-0.5 right-2 sm:right-3 text-[10px] font-mono font-bold tabular-nums"
                style={{ color: LEVELS_ZONE_CHART.bull.labelTextMuted }}
              >
                {c}{fmt(bullLow ?? 0)}
              </span>
            </div>
          )}

          {poc != null && (
            <div
              className="absolute left-0 right-0 border-t border-dashed"
              style={{
                top: yFor(poc),
                borderColor: LEVELS_ZONE_CHART.maxPain.line,
                boxShadow: "0 0 10px rgba(251, 191, 36, 0.2)",
              }}
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
        </div>
      </div>
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
}: {
  y: number;
  label: string;
  labelFull?: string;
  price: number;
  c: string;
  fmt: (p: number) => string;
  dotColor: string;
  textColor: string;
}) {
  return (
    <div
      className="absolute right-0 flex items-center gap-1 pointer-events-none pr-0.5 max-w-full"
      style={{ top: y, transform: "translateY(-50%)" }}
    >
      <span
        className="flex-1 min-w-0 text-right text-[8px] sm:text-[9px] font-bold leading-tight truncate"
        style={{ color: textColor }}
        title={labelFull ?? label}
      >
        <span className="sm:hidden">{label}</span>
        <span className="hidden sm:inline">{labelFull ?? label}</span>
      </span>
      <span
        className="shrink-0 text-[8px] sm:text-[9px] font-mono font-bold tabular-nums whitespace-nowrap"
        style={{ color: textColor }}
      >
        {c}{fmt(price)}
      </span>
      <div
        className="shrink-0 rounded-full"
        style={{
          width: 7,
          height: 7,
          backgroundColor: dotColor,
          boxShadow: `0 0 8px ${dotColor}, 0 0 14px ${dotColor}88`,
        }}
      />
    </div>
  );
}

/** Format spot for the hero display above the chart. */
export function formatHeroPrice(spot: number, currency: string): string {
  return `${currency}${fmtPrice(spot)}`;
}
