"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  buildOutlookSeries,
  confidenceOpacity,
  type OutlookCheckpoint,
} from "@/lib/levels/outlook-series";
import {
  formatClusterContracts,
  formatClusterDelta,
  formatClusterStrike,
} from "@/lib/levels/format-cluster-size";
import { LevelsChartAttributionOverlay } from "@/components/levels/LevelsChartAttributionOverlay";

const PAD_DEFAULT = { top: 38, right: 18, bottom: 36, left: 60 };
const PAD_COMPACT = { top: 24, right: 6, bottom: 16, left: 28 };
/** Max pain — dashed everywhere else on levels charts. */
const MAX_PAIN_DASH = "6 4";
/** Spot — distinct from amber max pain on this chart. */
const SPOT_LINE = "#e2e8f0";
const SPOT_ACCENT = "#38bdf8";

function fmt(p: number): string {
  return Math.round(p).toLocaleString();
}

/** Keeps numeric labels readable when reference lines pass through them. */
function legibleChartText(props: {
  x: number;
  y: number;
  fill: string;
  fontSize: number;
  fontWeight?: number;
  textAnchor?: "start" | "middle" | "end";
  dominantBaseline?: "middle" | "auto" | "hanging" | "alphabetic";
  opacity?: number;
  children: string;
}) {
  const {
    x,
    y,
    fill,
    fontSize,
    fontWeight = 700,
    textAnchor = "middle",
    dominantBaseline = "middle",
    opacity = 1,
    children,
  } = props;
  return (
    <text
      x={x}
      y={y}
      textAnchor={textAnchor}
      dominantBaseline={dominantBaseline}
      fontSize={fontSize}
      fontWeight={fontWeight}
      fontFamily="ui-monospace, monospace"
      fill={fill}
      opacity={opacity}
      paintOrder="stroke fill"
      stroke="rgba(8, 13, 26, 0.94)"
      strokeWidth={3}
      strokeLinejoin="round"
    >
      {children}
    </text>
  );
}

interface Slot {
  cp: OutlookCheckpoint;
  x0: number;
  x1: number;
}

/**
 * Nifty Outlook — a stepped "ladder" of where option positioning expects
 * support, resistance and the max-pain magnet to sit across the next few
 * expiries. Each expiry owns the time slot ending on its date and is drawn as a
 * flat block (no diagonal interpolation — the levels are discrete, not a glide).
 * Confidence fades left → right: the nearest expiry is solid, far-dated bands
 * are thin/shifting and shown faded so the reliability drop-off is visible.
 */
export function NiftyOutlookChart({
  levels,
  spot,
  className,
  compact = false,
  webChartUrl,
  showAttribution = false,
}: {
  levels: PublicLevels | null;
  spot: number | null;
  className?: string;
  /** Smaller padding and fewer labels — for learn hub card previews. */
  compact?: boolean;
  webChartUrl?: string;
  showAttribution?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 420 });
  const PAD = compact ? PAD_COMPACT : PAD_DEFAULT;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const sync = () =>
      setSize({ w: el.clientWidth || 800, h: el.clientHeight || 420 });
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const series = useMemo(
    () => buildOutlookSeries(levels, spot),
    [levels, spot],
  );

  const model = useMemo(() => {
    if (!series) return null;
    const { w, h } = size;
    const plotW = Math.max(w - PAD.left - PAD.right, 10);
    const plotH = Math.max(h - PAD.top - PAD.bottom, 10);
    const { horizonDays, priceMin, priceMax } = series;
    const span = Math.max(priceMax - priceMin, 1);

    const xFor = (days: number) =>
      PAD.left + (Math.min(days, horizonDays) / horizonDays) * plotW;
    const yFor = (price: number) =>
      PAD.top + (1 - (price - priceMin) / span) * plotH;

    const cps = series.checkpoints;
    const slots: Slot[] = cps.map((cp, i) => ({
      cp,
      x0: i === 0 ? xFor(0) : xFor(cps[i - 1].daysFromToday),
      x1: xFor(cp.daysFromToday),
    }));

    return { plotW, plotH, xFor, yFor, slots };
  }, [series, size, compact]);

  if (!series || !model) {
    return (
      <div
        ref={containerRef}
        className={className}
        style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <p className="text-sm" style={{ color: "#64748b" }}>
          Outlook needs at least one upcoming expiry of positioning data.
        </p>
      </div>
    );
  }

  const { w, h } = size;
  const { xFor, yFor, slots } = model;
  const bull = LEVELS_ZONE_CHART.bull;
  const bear = LEVELS_ZONE_CHART.bear;
  const maxPainColor = LEVELS_ZONE_CHART.maxPain.line;
  const todayX = xFor(0);

  // Relative wall strength: heaviest cluster (either side, any expiry) = 1.
  const maxOI = Math.max(
    1,
    ...series.checkpoints.flatMap((cp) => [cp.supportOI ?? 0, cp.resistanceOI ?? 0]),
  );

  const yTicks = (() => {
    const ticks: number[] = [];
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      ticks.push(series.priceMin + (series.priceMax - series.priceMin) * (i / steps));
    }
    return ticks;
  })();

  function bandBlockShapes(
    pick: (cp: OutlookCheckpoint) => {
      low: number | null;
      high: number | null;
      oi: number | null;
    },
    color: string,
  ) {
    return slots.map((s, i) => {
      const v = pick(s.cp);
      if (v.low == null || v.high == null) return null;
      const yTop = yFor(v.high);
      const height = Math.max(yFor(v.low) - yTop, 1);
      const width = Math.max(s.x1 - s.x0, 0);
      const conf = confidenceOpacity(s.cp.confidence);
      const strength = v.oi != null && v.oi > 0 ? v.oi / maxOI : 0;
      return (
        <g key={`${color}-shape-${i}`}>
          <rect
            x={s.x0}
            y={yTop}
            width={width}
            height={height}
            fill={color}
            opacity={conf * (0.22 + 0.3 * strength)}
          />
          <rect
            x={s.x0}
            y={yTop}
            width={width}
            height={height}
            fill="none"
            stroke={color}
            strokeWidth={1 + 2.2 * strength}
            opacity={conf * (0.35 + 0.55 * strength)}
          />
        </g>
      );
    });
  }

  function bandBlockLabels(
    pick: (cp: OutlookCheckpoint) => {
      low: number | null;
      high: number | null;
      oi: number | null;
      strike: number | null;
      change: number | null;
    },
    labelColor: string,
  ) {
    return slots.map((s, i) => {
      const v = pick(s.cp);
      if (v.low == null || v.high == null) return null;
      const yTop = yFor(v.high);
      const height = Math.max(yFor(v.low) - yTop, 1);
      const width = Math.max(s.x1 - s.x0, 0);
      const conf = confidenceOpacity(s.cp.confidence);
      const sizeText = formatClusterContracts(v.oi);
      const strikeText = formatClusterStrike(v.strike);
      const label = sizeText
        ? strikeText
          ? `${sizeText} @ ${strikeText}`
          : sizeText
        : null;
      const deltaText = formatClusterDelta(v.change);
      const deltaColor = (v.change ?? 0) >= 0 ? "#86efac" : "#fca5a5";
      const cx = s.x0 + width / 2;
      const cy = yTop + height / 2;
      const showDelta = deltaText != null && height >= 26 && width >= 52;
      if (!label || height < 13 || width < 52) return null;
      return (
        <g key={`${labelColor}-label-${i}`}>
          {legibleChartText({
            x: cx,
            y: showDelta ? cy - 5 : cy,
            fill: labelColor,
            fontSize: 9,
            opacity: Math.min(conf + 0.15, 1),
            children: label,
          })}
          {showDelta
            ? legibleChartText({
                x: cx,
                y: cy + 7,
                fill: deltaColor,
                fontSize: 8.5,
                opacity: Math.min(conf + 0.15, 1),
                children: `${(v.change ?? 0) >= 0 ? "▲" : "▼"} ${deltaText.replace(/^[+−]/, "")} OI`,
              })
            : null}
        </g>
      );
    });
  }

  return (
    <div ref={containerRef} className={className} style={{ position: "relative" }}>
      <svg width={w} height={h} role="img" aria-label="Nifty Outlook ladder">
        <defs>
          <linearGradient id="outlook-fade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.22" />
          </linearGradient>
        </defs>

        {/* Horizontal price grid + axis labels */}
        {yTicks.map((t, i) => (
          <g key={`y-${i}`}>
            <line
              x1={PAD.left}
              x2={w - PAD.right}
              y1={yFor(t)}
              y2={yFor(t)}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={yFor(t)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={compact ? 8 : 10}
              fontFamily="ui-monospace, monospace"
              fill="#64748b"
            >
              {fmt(t)}
            </text>
          </g>
        ))}

        {/* Today marker */}
        <line
          x1={todayX}
          x2={todayX}
          y1={PAD.top}
          y2={h - PAD.bottom}
          stroke="rgba(251,191,36,0.25)"
          strokeWidth={1}
        />

        {/* Per-expiry column bands + boundary lines */}
        {slots.map((s, i) => {
          const width = Math.max(s.x1 - s.x0, 0);
          return (
            <g key={`col-bg-${i}`}>
              <rect
                x={s.x0}
                y={PAD.top}
                width={width}
                height={h - PAD.top - PAD.bottom}
                fill={i % 2 === 0 ? "rgba(148,163,184,0.035)" : "rgba(148,163,184,0.07)"}
              />
              <line
                x1={s.x1}
                x2={s.x1}
                y1={PAD.top}
                y2={h - PAD.bottom}
                stroke="rgba(255,255,255,0.1)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            </g>
          );
        })}

        <text
          x={todayX}
          y={h - PAD.bottom + (compact ? 11 : 14)}
          textAnchor="middle"
          fontSize={compact ? 8 : 10}
          fontWeight={700}
          fontFamily="ui-sans-serif, system-ui"
          fill="#fcd34d"
        >
          Today
        </text>

        {/* Stepped resistance + support blocks — shapes first, labels after reference lines */}
        {bandBlockShapes(
          (cp) => ({
            low: cp.resistanceLow,
            high: cp.resistanceHigh,
            oi: cp.resistanceOI,
          }),
          bear.line,
        )}
        {bandBlockShapes(
          (cp) => ({
            low: cp.supportLow,
            high: cp.supportHigh,
            oi: cp.supportOI,
          }),
          bull.line,
        )}

        {/* Confidence fade overlay (far-right = least reliable) */}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={w - PAD.left - PAD.right}
          height={h - PAD.top - PAD.bottom}
          fill="url(#outlook-fade)"
          pointerEvents="none"
        />

        {/* Reference lines — below cluster labels */}
        {slots.map((s, i) =>
          s.cp.maxPain != null ? (
            <line
              key={`mp-h-${i}`}
              x1={s.x0}
              x2={s.x1}
              y1={yFor(s.cp.maxPain)}
              y2={yFor(s.cp.maxPain)}
              stroke={maxPainColor}
              strokeWidth={2}
              strokeDasharray={MAX_PAIN_DASH}
              opacity={confidenceOpacity(s.cp.confidence)}
            />
          ) : null,
        )}
        {slots.slice(0, -1).map((s, i) => {
          const next = slots[i + 1];
          if (s.cp.maxPain == null || next.cp.maxPain == null) return null;
          return (
            <line
              key={`mp-v-${i}`}
              x1={s.x1}
              x2={s.x1}
              y1={yFor(s.cp.maxPain)}
              y2={yFor(next.cp.maxPain)}
              stroke={maxPainColor}
              strokeWidth={1.5}
              strokeDasharray={MAX_PAIN_DASH}
              opacity={confidenceOpacity(next.cp.confidence) * 0.7}
            />
          );
        })}
        {series.spot != null ? (
          (() => {
            const spotY = yFor(series.spot);
            return (
              <g key="spot-lines">
                <line
                  x1={PAD.left}
                  x2={w - PAD.right}
                  y1={spotY}
                  y2={spotY}
                  stroke={SPOT_ACCENT}
                  strokeWidth={5}
                  opacity={0.12}
                />
                <line
                  x1={PAD.left}
                  x2={w - PAD.right}
                  y1={spotY}
                  y2={spotY}
                  stroke={SPOT_LINE}
                  strokeWidth={compact ? 1.5 : 2}
                  opacity={0.95}
                />
              </g>
            );
          })()
        ) : null}

        {/* Cluster + max-pain labels on top of reference lines */}
        {bandBlockLabels(
          (cp) => ({
            low: cp.resistanceLow,
            high: cp.resistanceHigh,
            oi: cp.resistanceOI,
            strike: cp.resistanceStrike,
            change: cp.resistanceOIChange,
          }),
          bear.labelText,
        )}
        {bandBlockLabels(
          (cp) => ({
            low: cp.supportLow,
            high: cp.supportHigh,
            oi: cp.supportOI,
            strike: cp.supportStrike,
            change: cp.supportOIChange,
          }),
          bull.labelText,
        )}
        {slots.map((s, i) =>
          s.cp.maxPain != null ? (
            <g key={`mp-dot-${i}`}>
              <circle
                cx={s.x1}
                cy={yFor(s.cp.maxPain)}
                r={compact ? 2.5 : 3.5}
                fill={maxPainColor}
                opacity={confidenceOpacity(s.cp.confidence)}
              />
              {!compact
                ? legibleChartText({
                    x: s.x1,
                    y: yFor(s.cp.maxPain) - 7,
                    fill: maxPainColor,
                    fontSize: 9,
                    opacity: confidenceOpacity(s.cp.confidence),
                    children: fmt(s.cp.maxPain),
                  })
                : null}
            </g>
          ) : null,
        )}

        {/* Expiry column headers — on top so fade overlay does not wash them out */}
        {slots.map((s, i) => {
          const width = Math.max(s.x1 - s.x0, 0);
          const cx = s.x0 + width / 2;
          const headerH = compact ? 18 : 22;
          const showHeader = width >= (compact ? 52 : 72);

          if (!showHeader) return null;

          return (
            <g key={`col-hdr-${i}`}>
              <rect
                x={s.x0 + 2}
                y={PAD.top + 3}
                width={Math.max(width - 4, 0)}
                height={headerH}
                rx={5}
                fill="rgba(8, 13, 26, 0.92)"
                stroke="rgba(148,163,184,0.28)"
              />
              <text
                x={cx}
                y={PAD.top + 3 + headerH / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={compact ? 7 : 8}
                fontWeight={800}
                fontFamily="ui-sans-serif, system-ui"
                fill="#f1f5f9"
              >
                {s.cp.label}
              </text>
            </g>
          );
        })}

        {/* Spot tag — after labels so the pill stays readable */}
        {series.spot != null ? (
          (() => {
            const spotY = yFor(series.spot);
            const tagW = compact ? 72 : 84;
            const tagH = compact ? 20 : 24;
            const tagX = w - PAD.right - tagW - 2;
            return (
              <g key="spot-ref">
                <circle
                  cx={todayX + (compact ? 4 : 6)}
                  cy={spotY}
                  r={compact ? 3 : 3.5}
                  fill={SPOT_LINE}
                  stroke={SPOT_ACCENT}
                  strokeWidth={1.5}
                />
                <rect
                  x={tagX}
                  y={spotY - tagH / 2}
                  width={tagW}
                  height={tagH}
                  rx={5}
                  fill="rgba(8, 13, 26, 0.96)"
                  stroke={SPOT_ACCENT}
                  strokeWidth={1.5}
                />
                <text
                  x={tagX + 8}
                  y={spotY + (compact ? 3 : 4)}
                  dominantBaseline="middle"
                  fontSize={compact ? 7 : 8}
                  fontWeight={700}
                  fontFamily="ui-sans-serif, system-ui"
                  fill={SPOT_ACCENT}
                >
                  SPOT
                </text>
                <text
                  x={tagX + tagW - 8}
                  y={spotY + (compact ? 3 : 4)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={compact ? 9 : 10}
                  fontWeight={800}
                  fontFamily="ui-monospace, monospace"
                  fill={SPOT_LINE}
                >
                  {fmt(series.spot)}
                </text>
              </g>
            );
          })()
        ) : null}
      </svg>

      {/* Legend */}
      {!compact ? (
        <div
          className="absolute top-2 left-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] max-w-[min(55%,16rem)]"
          style={{ color: "#94a3b8" }}
        >
          <LegendChip color={bull.line} label="Support" />
          <LegendChip color={bear.line} label="Resistance" />
          <LegendChip color={maxPainColor} label="Max pain" dashed />
          <LegendChip color={SPOT_ACCENT} label="Spot" />
        </div>
      ) : null}
      {showAttribution ? (
        <LevelsChartAttributionOverlay
          variant="outlook"
          levels={levels}
          webChartUrl={webChartUrl}
          showTradingView={Boolean(webChartUrl)}
        />
      ) : null}
    </div>
  );
}

function LegendChip({
  color,
  label,
  dashed = false,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1">
      {dashed ? (
        <span
          className="inline-block w-[11px] border-t-[2.5px] border-dashed"
          style={{ borderColor: color }}
          aria-hidden
        />
      ) : (
        <span
          className="inline-block rounded-sm"
          style={{ width: 9, height: 9, backgroundColor: color }}
          aria-hidden
        />
      )}
      {label}
    </span>
  );
}
