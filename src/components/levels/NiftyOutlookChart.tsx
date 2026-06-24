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

const PAD = { top: 18, right: 18, bottom: 40, left: 60 };

function fmt(p: number): string {
  return Math.round(p).toLocaleString();
}

/**
 * Nifty Outlook — a forward "map" of where option positioning expects support,
 * resistance and the max-pain magnet to sit across the next few expiries.
 * Confidence fades left → right: the nearest expiry is solid, far-dated bands
 * are thin/shifting and shown faded so the reliability drop-off is visible.
 */
export function NiftyOutlookChart({
  levels,
  spot,
  className,
}: {
  levels: PublicLevels | null;
  spot: number | null;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 420 });

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

    const points: OutlookCheckpoint[] = series.today
      ? [series.today, ...series.checkpoints]
      : series.checkpoints;

    return { plotW, plotH, xFor, yFor, points };
  }, [series, size]);

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
  const { xFor, yFor, points } = model;
  const bull = LEVELS_ZONE_CHART.bull;
  const bear = LEVELS_ZONE_CHART.bear;
  const maxPainColor = LEVELS_ZONE_CHART.maxPain.line;

  const yTicks = (() => {
    const ticks: number[] = [];
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      ticks.push(series.priceMin + (series.priceMax - series.priceMin) * (i / steps));
    }
    return ticks;
  })();

  const maxPainPath = points
    .filter((p) => p.maxPain != null)
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(p.daysFromToday)} ${yFor(p.maxPain as number)}`)
    .join(" ");

  function bandSegments(
    pick: (p: OutlookCheckpoint) => { low: number | null; high: number | null },
    color: string,
  ) {
    const segs: React.ReactNode[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const av = pick(a);
      const bv = pick(b);
      if (av.low == null || av.high == null || bv.low == null || bv.high == null) continue;
      const x1 = xFor(a.daysFromToday);
      const x2 = xFor(b.daysFromToday);
      const poly = [
        `${x1},${yFor(av.high)}`,
        `${x2},${yFor(bv.high)}`,
        `${x2},${yFor(bv.low)}`,
        `${x1},${yFor(av.low)}`,
      ].join(" ");
      segs.push(
        <polygon
          key={`${color}-${i}`}
          points={poly}
          fill={color}
          opacity={confidenceOpacity(b.confidence) * 0.4}
        />,
      );
    }
    return segs;
  }

  return (
    <div ref={containerRef} className={className} style={{ position: "relative" }}>
      <svg width={w} height={h} role="img" aria-label="Nifty Outlook forward map">
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
              fontSize={10}
              fontFamily="ui-monospace, monospace"
              fill="#64748b"
            >
              {fmt(t)}
            </text>
          </g>
        ))}

        {/* Vertical expiry checkpoints + date labels */}
        {points.map((p, i) => {
          const x = xFor(p.daysFromToday);
          const isToday = p.expiryKey === "__today__";
          return (
            <g key={`x-${i}`}>
              <line
                x1={x}
                x2={x}
                y1={PAD.top}
                y2={h - PAD.bottom}
                stroke={isToday ? "rgba(251,191,36,0.25)" : "rgba(255,255,255,0.06)"}
                strokeWidth={1}
                strokeDasharray={isToday ? undefined : "3 3"}
              />
              <text
                x={x}
                y={h - PAD.bottom + 15}
                textAnchor="middle"
                fontSize={10}
                fontWeight={isToday ? 700 : 500}
                fontFamily="ui-sans-serif, system-ui"
                fill={isToday ? "#fcd34d" : "#94a3b8"}
              >
                {p.label}
              </text>
              {!isToday && (
                <text
                  x={x}
                  y={h - PAD.bottom + 27}
                  textAnchor="middle"
                  fontSize={8}
                  fontFamily="ui-sans-serif, system-ui"
                  fill={
                    p.confidence === "high"
                      ? "#86efac"
                      : p.confidence === "medium"
                        ? "#fcd34d"
                        : "#fca5a5"
                  }
                >
                  {confidenceLabel(p.confidence)}
                </text>
              )}
            </g>
          );
        })}

        {/* Resistance + support corridors */}
        {bandSegments((p) => ({ low: p.resistanceLow, high: p.resistanceHigh }), bear.line)}
        {bandSegments((p) => ({ low: p.supportLow, high: p.supportHigh }), bull.line)}

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
          </g>
        )}

        {/* Max-pain drift path */}
        {maxPainPath && (
          <path
            d={maxPainPath}
            fill="none"
            stroke={maxPainColor}
            strokeWidth={2}
            strokeDasharray="5 4"
          />
        )}
        {points.map((p, i) =>
          p.maxPain != null ? (
            <g key={`mp-${i}`}>
              <circle
                cx={xFor(p.daysFromToday)}
                cy={yFor(p.maxPain)}
                r={3.5}
                fill={maxPainColor}
                opacity={confidenceOpacity(p.confidence)}
              />
              {p.expiryKey !== "__today__" && (
                <text
                  x={xFor(p.daysFromToday)}
                  y={yFor(p.maxPain) - 7}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={700}
                  fontFamily="ui-monospace, monospace"
                  fill={maxPainColor}
                  opacity={confidenceOpacity(p.confidence)}
                >
                  {fmt(p.maxPain)}
                </text>
              )}
            </g>
          ) : null,
        )}
      </svg>

      {/* Legend */}
      <div
        className="absolute top-2 right-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px]"
        style={{ color: "#94a3b8" }}
      >
        <LegendChip color={bull.line} label="Support" />
        <LegendChip color={bear.line} label="Resistance" />
        <LegendChip color={maxPainColor} label="Max pain" />
        <span style={{ opacity: 0.7 }}>← confident · speculative →</span>
      </div>
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
