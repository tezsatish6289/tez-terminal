"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";
import {
  buildOutlookSeries,
  confidenceLabel,
  confidenceOpacity,
  type OutlookCheckpoint,
} from "@/lib/levels/outlook-series";
import {
  formatClusterContracts,
  formatClusterDelta,
  formatClusterStrike,
} from "@/lib/levels/format-cluster-size";

const PAD_DEFAULT = { top: 18, right: 18, bottom: 40, left: 60 };
const PAD_COMPACT = { top: 6, right: 6, bottom: 16, left: 28 };

function fmt(p: number): string {
  return Math.round(p).toLocaleString();
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
}: {
  levels: PublicLevels | null;
  spot: number | null;
  className?: string;
  /** Smaller padding and fewer labels — for learn hub card previews. */
  compact?: boolean;
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

  function bandBlocks(
    pick: (cp: OutlookCheckpoint) => {
      low: number | null;
      high: number | null;
      oi: number | null;
      strike: number | null;
      change: number | null;
    },
    color: string,
    labelColor: string,
  ) {
    return slots.map((s, i) => {
      const v = pick(s.cp);
      if (v.low == null || v.high == null) return null;
      const yTop = yFor(v.high);
      const height = Math.max(yFor(v.low) - yTop, 1);
      const width = Math.max(s.x1 - s.x0, 0);
      const conf = confidenceOpacity(s.cp.confidence);
      // Wall strength → heavier fill + thicker border for bigger OI clusters.
      const strength = v.oi != null && v.oi > 0 ? v.oi / maxOI : 0;
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
      return (
        <g key={`${color}-${i}`}>
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
          {label && height >= 13 && width >= 52 && (
            <text
              x={cx}
              y={showDelta ? cy - 5 : cy}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={9}
              fontWeight={700}
              fontFamily="ui-monospace, monospace"
              fill={labelColor}
              opacity={Math.min(conf + 0.15, 1)}
            >
              {label}
            </text>
          )}
          {showDelta && (
            <text
              x={cx}
              y={cy + 7}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={8.5}
              fontWeight={700}
              fontFamily="ui-monospace, monospace"
              fill={deltaColor}
              opacity={Math.min(conf + 0.15, 1)}
            >
              {`${(v.change ?? 0) >= 0 ? "▲" : "▼"} ${deltaText.replace(/^[+−]/, "")} OI`}
            </text>
          )}
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

        {/* Today marker + expiry boundary lines and labels */}
        <line
          x1={todayX}
          x2={todayX}
          y1={PAD.top}
          y2={h - PAD.bottom}
          stroke="rgba(251,191,36,0.25)"
          strokeWidth={1}
        />
        <text
          x={todayX}
          y={h - PAD.bottom + (compact ? 11 : 15)}
          textAnchor="middle"
          fontSize={compact ? 8 : 10}
          fontWeight={700}
          fontFamily="ui-sans-serif, system-ui"
          fill="#fcd34d"
        >
          Today
        </text>
        {slots.map((s, i) => (
          <g key={`x-${i}`}>
            <line
              x1={s.x1}
              x2={s.x1}
              y1={PAD.top}
              y2={h - PAD.bottom}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <text
              x={s.x1}
              y={h - PAD.bottom + (compact ? 11 : 15)}
              textAnchor="middle"
              fontSize={compact ? 7 : 10}
              fontWeight={500}
              fontFamily="ui-sans-serif, system-ui"
              fill="#94a3b8"
            >
              {s.cp.label}
            </text>
            {!compact ? (
              <text
                x={s.x1}
                y={h - PAD.bottom + 27}
                textAnchor="middle"
                fontSize={8}
                fontFamily="ui-sans-serif, system-ui"
                fill={
                  s.cp.confidence === "high"
                    ? "#86efac"
                    : s.cp.confidence === "medium"
                      ? "#fcd34d"
                      : "#fca5a5"
                }
              >
                {confidenceLabel(s.cp.confidence)}
              </text>
            ) : null}
          </g>
        ))}

        {/* Stepped resistance + support blocks (intensity = wall OI strength) */}
        {bandBlocks(
          (cp) => ({
            low: cp.resistanceLow,
            high: cp.resistanceHigh,
            oi: cp.resistanceOI,
            strike: cp.resistanceStrike,
            change: cp.resistanceOIChange,
          }),
          bear.line,
          bear.labelText,
        )}
        {bandBlocks(
          (cp) => ({
            low: cp.supportLow,
            high: cp.supportHigh,
            oi: cp.supportOI,
            strike: cp.supportStrike,
            change: cp.supportOIChange,
          }),
          bull.line,
          bull.labelText,
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

        {/* Spot reference line */}
        {series.spot != null && (
          <g>
            <line
              x1={PAD.left}
              x2={w - PAD.right}
              y1={yFor(series.spot)}
              y2={yFor(series.spot)}
              stroke="#fbbf24"
              strokeWidth={1.5}
              strokeDasharray="2 3"
              opacity={0.6}
            />
            {!compact ? (
              <text
                x={PAD.left + 4}
                y={yFor(series.spot) - 4}
                fontSize={9}
                fontWeight={700}
                fontFamily="ui-sans-serif, system-ui"
                fill="#fcd34d"
              >
                Spot {fmt(series.spot)}
              </text>
            ) : null}
          </g>
        )}

        {/* Stepped max-pain ladder: flat per slot, vertical step at each boundary */}
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
              strokeDasharray="3 3"
              opacity={confidenceOpacity(next.cp.confidence) * 0.7}
            />
          );
        })}
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
              {!compact ? (
                <text
                  x={s.x1}
                  y={yFor(s.cp.maxPain) - 7}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={700}
                  fontFamily="ui-monospace, monospace"
                  fill={maxPainColor}
                  opacity={confidenceOpacity(s.cp.confidence)}
                >
                  {fmt(s.cp.maxPain)}
                </text>
              ) : null}
            </g>
          ) : null,
        )}
      </svg>

      {/* Legend */}
      {!compact ? (
        <div
          className="absolute top-2 right-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px]"
          style={{ color: "#94a3b8" }}
        >
          <LegendChip color={bull.line} label="Support" />
          <LegendChip color={bear.line} label="Resistance" />
          <LegendChip color={maxPainColor} label="Max pain" />
          <span style={{ opacity: 0.7 }}>← confident · speculative →</span>
        </div>
      ) : null}
    </div>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-block rounded-sm"
        style={{ width: 9, height: 9, backgroundColor: color }}
      />
      {label}
    </span>
  );
}
