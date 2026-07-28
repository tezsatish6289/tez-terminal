"use client";

import {
  formatMmiUpdatedAgo,
  formatMmiValue,
  MMI_ZONE_META,
  type MmiSnapshot,
  type MmiZone,
} from "@/lib/fnoninja/mmi";

/** Gauge spans 270° from bottom-left → bottom-right (Tickertape-style horseshoe). */
const START_DEG = 225;
const SWEEP_DEG = 270;
const VIEW = 100;
const CX = 50;
const CY = 52;
const R_TRACK = 34;
const R_RIM = 38.5;
const STROKE = 7.5;
const RIM_STROKE = 2.2;

const ZONES: { zone: MmiZone; from: number; to: number }[] = [
  { zone: "extreme_fear", from: 0, to: 30 },
  { zone: "fear", from: 30, to: 50 },
  { zone: "greed", from: 50, to: 70 },
  { zone: "extreme_greed", from: 70, to: 100 },
];

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function valueToDeg(value: number): number {
  const t = Math.max(0, Math.min(100, value)) / 100;
  return START_DEG + t * SWEEP_DEG;
}

function arcPath(r: number, fromVal: number, toVal: number): string {
  const a0 = valueToDeg(fromVal);
  const a1 = valueToDeg(toVal);
  const p0 = polar(CX, CY, r, a0);
  const p1 = polar(CX, CY, r, a1);
  const sweep = a1 - a0;
  const large = sweep > 180 ? 1 : 0;
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y}`;
}

function rimLabel(
  zone: MmiZone,
  from: number,
  to: number,
  compact: boolean,
): { text: string; x: number; y: number; rotate: number; color: string } {
  const mid = (from + to) / 2;
  const deg = valueToDeg(mid);
  const p = polar(CX, CY, R_RIM + (compact ? 5.4 : 6.6), deg);
  const meta = MMI_ZONE_META[zone];
  // Keep short labels upright-ish along the rim
  let rotate = deg;
  if (deg > 90 && deg < 270) rotate = deg + 180;
  const text = compact
    ? zone === "extreme_fear"
      ? "E.FEAR"
      : zone === "extreme_greed"
        ? "E.GREED"
        : meta.short
    : meta.short;
  return {
    text,
    x: p.x,
    y: p.y,
    rotate,
    color: meta.color,
  };
}

/**
 * Compact Tickertape-style MMI gauge for a market-map bubble.
 * Sized to fill the circle; parent supplies the circular chrome.
 */
export function LevelsMmiBubbleContent({
  mmi,
  compact = false,
}: {
  mmi: MmiSnapshot | null;
  /** Smaller type when the physics radius shrinks (mobile embed). */
  compact?: boolean;
}) {
  const value = mmi?.value ?? null;
  const zone = mmi?.zone ?? null;
  const accent = zone ? MMI_ZONE_META[zone].color : "#f59e0b";
  const zoneLabel = zone ? MMI_ZONE_META[zone].label : "—";
  const needleDeg = value != null ? valueToDeg(value) : START_DEG;
  const fillTo = value != null ? value : 0;
  const zoneStart = zone ? MMI_ZONE_META[zone].min : 0;

  const titleSize = compact ? 6.2 : 7.4;
  const valueSize = compact ? 11 : 13.5;
  const subSize = compact ? 5.4 : 6.2;

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full pointer-events-none">
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="absolute inset-[6%] h-[88%] w-[88%]"
        aria-hidden
      >
        {/* Soft wedge behind active fill */}
        {value != null && zone ? (
          <path
            d={`M ${CX} ${CY} L ${polar(CX, CY, R_TRACK - STROKE / 2, valueToDeg(zoneStart)).x} ${
              polar(CX, CY, R_TRACK - STROKE / 2, valueToDeg(zoneStart)).y
            } A ${R_TRACK - STROKE / 2} ${R_TRACK - STROKE / 2} 0 ${
              fillTo - zoneStart > 50 ? 1 : 0
            } 1 ${polar(CX, CY, R_TRACK - STROKE / 2, needleDeg).x} ${
              polar(CX, CY, R_TRACK - STROKE / 2, needleDeg).y
            } Z`}
            fill={accent}
            opacity={0.12}
          />
        ) : null}

        {/* Grey track */}
        <path
          d={arcPath(R_TRACK, 0, 100)}
          fill="none"
          stroke="rgba(148,163,184,0.22)"
          strokeWidth={STROKE}
          strokeLinecap="butt"
        />

        {/* Active fill: current zone start → value */}
        {value != null && zone ? (
          <path
            d={arcPath(R_TRACK, zoneStart, fillTo)}
            fill="none"
            stroke={accent}
            strokeWidth={STROKE}
            strokeLinecap="butt"
          />
        ) : null}

        {/* Colored outer rim segments */}
        {ZONES.map(({ zone: z, from, to }) => (
          <path
            key={z}
            d={arcPath(R_RIM, from, to)}
            fill="none"
            stroke={MMI_ZONE_META[z].color}
            strokeWidth={RIM_STROKE}
            strokeLinecap="butt"
            opacity={0.95}
          />
        ))}

        {/* Tick marks between zones */}
        {[30, 50, 70].map((v) => {
          const deg = valueToDeg(v);
          const inner = polar(CX, CY, R_RIM - 1.2, deg);
          const outer = polar(CX, CY, R_RIM + 1.8, deg);
          return (
            <line
              key={v}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="rgba(226,232,240,0.55)"
              strokeWidth={0.7}
            />
          );
        })}

        {/* Curved zone labels */}
        {ZONES.map(({ zone: z, from, to }) => {
          const lab = rimLabel(z, from, to, compact);
          const fs = compact
            ? z.startsWith("extreme")
              ? 3.1
              : 3.5
            : z.startsWith("extreme")
              ? 3.2
              : 3.75;
          return (
            <text
              key={`lab-${z}`}
              x={lab.x}
              y={lab.y}
              fill={lab.color}
              fontSize={fs}
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(${lab.rotate} ${lab.x} ${lab.y})`}
              style={{ letterSpacing: "0.03em" }}
            >
              {lab.text}
            </text>
          );
        })}

        {/* Needle */}
        {value != null ? (
          <g transform={`rotate(${needleDeg} ${CX} ${CY})`}>
            <line
              x1={CX}
              y1={CY + 2}
              x2={CX}
              y2={CY - (R_TRACK - STROKE / 2 - 1)}
              stroke={accent}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
            <circle cx={CX} cy={CY} r={2.6} fill={accent} />
            <circle cx={CX} cy={CY} r={1.15} fill="rgba(15,23,42,0.9)" />
          </g>
        ) : null}
      </svg>

      {/* Center copy */}
      <div
        className="relative z-[1] flex flex-col items-center justify-end text-center"
        style={{
          paddingTop: "42%",
          width: "72%",
        }}
      >
        <span
          className="font-semibold uppercase tracking-[0.14em] leading-none"
          style={{ fontSize: titleSize, color: "rgba(148,163,184,0.95)" }}
        >
          MMI
        </span>
        <span
          className="font-black tabular-nums leading-none mt-[0.2em]"
          style={{ fontSize: valueSize, color: accent }}
        >
          {value != null ? formatMmiValue(value) : "—"}
        </span>
        <span
          className="font-semibold leading-none mt-[0.35em]"
          style={{ fontSize: subSize, color: accent }}
        >
          {zoneLabel}
        </span>
        <span
          className="leading-none mt-[0.4em]"
          style={{ fontSize: Math.max(4.5, subSize - 0.6), color: "rgba(148,163,184,0.75)" }}
        >
          {mmi ? formatMmiUpdatedAgo(mmi.updatedAt) : "Loading…"}
        </span>
      </div>
    </div>
  );
}
