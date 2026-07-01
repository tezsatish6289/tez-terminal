"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { LEVELS_ZONE_CHART } from "@/lib/levels/zone-chart-colors";
import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";
import {
  formatClusterContracts,
  formatClusterStrike,
} from "@/lib/levels/format-cluster-size";
import {
  buildOiWallSegmentWidths,
  oiWallDominancePct,
  oiWallDominantSide,
  oiWallGlowStrength,
  type OiWallSide,
} from "@/lib/levels/oi-wall-line-width";

/** Daily candle from /api/freedombot/levels/candles?interval=D. */
interface DailyCandle {
  time: number; // epoch seconds
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Daily OI-wall point from /api/freedombot/oi-history. */
interface OiPoint {
  date: string; // YYYY-MM-DD
  spot: number | null;
  putStrike: number | null;
  putOI: number | null;
  callStrike: number | null;
  callOI: number | null;
  maxPain: number | null;
  expiry: string | null;
}

interface Row {
  date: string;
  candle: DailyCandle | null;
  oi: OiPoint | null;
}

const PAD = { top: 16, right: 16, bottom: 44, left: 56 };
const CANDLE_COLOR = "#3b82f6";

/** Dedicated footer row — chart SVG must never bleed into this zone. */
const GUIDE_FOOTER_CLASS =
  "shrink-0 min-h-[7.5rem] border-t border-white/10 bg-[#070d1a] px-0.5 py-2.5 relative z-10";

const CHART_SHELL_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr) auto",
  minHeight: 0,
};

const COMPACT_SHELL_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  minHeight: 0,
};

export type OiHistoryRange = "1M" | "3M" | "6M";

/** Calendar lookback from the latest stored day (6M matches our ~120-day store cap). */
const RANGE_CALENDAR_DAYS: Record<OiHistoryRange, number> = {
  "1M": 31,
  "3M": 92,
  "6M": 183,
};

function filterRowsByRange(rows: Row[], range: OiHistoryRange): Row[] {
  if (!rows.length) return rows;
  const last = rows[rows.length - 1]!.date;
  const lastMs = Date.parse(`${last}T00:00:00Z`);
  if (!Number.isFinite(lastMs)) return rows;
  const cutoff = new Date(lastMs - RANGE_CALENDAR_DAYS[range] * 86_400_000).toISOString().slice(0, 10);
  return rows.filter((r) => r.date >= cutoff);
}

function istDateKey(epochSec: number): string {
  return new Date(epochSec * 1000 + 5.5 * 3600_000).toISOString().slice(0, 10);
}

function fmtPrice(p: number): string {
  return Math.round(p).toLocaleString("en-IN");
}

function fmtDateLabel(date: string): string {
  const [y, m, d] = date.split("-");
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m) - 1];
  return `${d} ${mon}${y ? ` '${y.slice(2)}` : ""}`;
}

export function OiHistoryChart({
  scope,
  symbol,
  className,
  hideGuide = false,
}: {
  scope: LevelsTvScope;
  symbol: string;
  className?: string;
  /** Hide Put/Call wall legend footer (e.g. homepage showcase). */
  hideGuide?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 320, h: 240 });
  const [candles, setCandles] = useState<DailyCandle[] | null>(null);
  const [oi, setOi] = useState<OiPoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [range, setRange] = useState<OiHistoryRange>("3M");

  useEffect(() => {
    setRange("3M");
    setHoverIdx(null);
  }, [scope, symbol]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const sync = () => {
      const w = el.clientWidth || 320;
      const h = el.clientHeight || 240;
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [cRes, oRes] = await Promise.all([
          fetch(
            `/api/freedombot/levels/candles?scope=${scope}&symbol=${encodeURIComponent(symbol)}&interval=D`,
          ),
          fetch(
            `/api/freedombot/oi-history?scope=${scope}&symbol=${encodeURIComponent(symbol)}&ensure=1`,
          ),
        ]);
        const cJson = (await cRes.json()) as { ok?: boolean; candles?: DailyCandle[] };
        const oJson = (await oRes.json()) as { ok?: boolean; history?: OiPoint[] };
        if (cancelled) return;
        setCandles(Array.isArray(cJson.candles) ? cJson.candles : []);
        setOi(Array.isArray(oJson.history) ? oJson.history : []);
      } catch {
        if (!cancelled) setError("Could not load OI history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, symbol]);

  /** Merge candles + OI by trading-day key. Only days with an OI point matter for
   *  the walls; candles supply the price context. Anchor the row set to the OI
   *  history window (that's what we have walls for). */
  const rows = useMemo<Row[]>(() => {
    if (!oi || !oi.length) return [];
    const candleByDate = new Map<string, DailyCandle>();
    for (const c of candles ?? []) candleByDate.set(istDateKey(c.time), c);
    return [...oi]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((p) => ({ date: p.date, oi: p, candle: candleByDate.get(p.date) ?? null }));
  }, [candles, oi]);

  const displayRows = useMemo(() => filterRowsByRange(rows, range), [rows, range]);

  const model = useMemo(() => {
    if (!displayRows.length) return null;
    const { w, h } = size;
    const plotW = Math.max(w - PAD.left - PAD.right, 10);
    const plotH = Math.max(h - PAD.top - PAD.bottom, 10);

    let lo = Infinity;
    let hi = -Infinity;
    for (const r of displayRows) {
      for (const v of [
        r.candle?.low,
        r.candle?.high,
        r.oi?.putStrike,
        r.oi?.callStrike,
        r.oi?.maxPain,
        r.oi?.spot,
      ]) {
        if (v != null && Number.isFinite(v)) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
    const pad = (hi - lo) * 0.06 || hi * 0.01 || 1;
    lo -= pad;
    hi += pad;
    const span = Math.max(hi - lo, 1);

    const n = displayRows.length;
    const xFor = (i: number) => PAD.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yFor = (price: number) => PAD.top + (1 - (price - lo) / span) * plotH;
    const colW = Math.max(1.5, Math.min(10, (plotW / Math.max(n, 1)) * 0.6));

    const yTicks: number[] = [];
    for (let i = 0; i <= 5; i++) yTicks.push(lo + (span * i) / 5);

    const line = (pick: (r: Row) => number | null) => {
      const pts: { x: number; y: number; i: number }[] = [];
      displayRows.forEach((r, i) => {
        const v = pick(r);
        if (v != null && Number.isFinite(v)) pts.push({ x: xFor(i), y: yFor(v), i });
      });
      return pts;
    };

    const putWidths = buildOiWallSegmentWidths(displayRows.map((r) => r.oi?.putOI));
    const callWidths = buildOiWallSegmentWidths(displayRows.map((r) => r.oi?.callOI));

    return {
      plotW,
      plotH,
      xFor,
      yFor,
      colW,
      yTicks,
      lo,
      hi,
      putWidths,
      callWidths,
      mpPts: line((r) => r.oi?.maxPain ?? null),
    };
  }, [displayRows, size]);

  const bull = LEVELS_ZONE_CHART.bull;
  const bear = LEVELS_ZONE_CHART.bear;
  const mp = LEVELS_ZONE_CHART.maxPain.line;

  const guide = <HistoryChartGuide bullLine={bull.line} bearLine={bear.line} maxPainColor={mp} />;

  const shellStyle = hideGuide ? COMPACT_SHELL_STYLE : CHART_SHELL_STYLE;
  const guideFooter = hideGuide ? null : <div className={GUIDE_FOOTER_CLASS}>{guide}</div>;

  const historyLoading = loading || (!error && !rows.length);

  if (historyLoading) {
    return (
      <div className={className} style={shellStyle}>
        <HistoryRangeToggle value={range} onChange={(r) => { setRange(r); setHoverIdx(null); }} />
        <div
          ref={containerRef}
          className="min-h-0 overflow-hidden relative flex flex-col items-center justify-center gap-2.5"
        >
          <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#60a5fa" }} />
          <p className="text-sm" style={{ color: "#94a3b8" }}>
            Loading History ....
          </p>
        </div>
        {guideFooter}
      </div>
    );
  }

  if (error || !displayRows.length || !model) {
    return (
      <div className={className} style={shellStyle}>
        {rows.length > 0 ? (
          <HistoryRangeToggle value={range} onChange={(r) => { setRange(r); setHoverIdx(null); }} />
        ) : (
          <div />
        )}
        <div ref={containerRef} className="min-h-0 overflow-hidden relative flex items-center justify-center">
          <p className="text-sm px-6 text-center" style={{ color: "#64748b" }}>
            {error ?? "Could not load OI history for this symbol."}
          </p>
        </div>
        {guideFooter}
      </div>
    );
  }

  const { w, h } = size;
  const { xFor, yFor, colW, yTicks, putWidths, callWidths, mpPts } = model;
  const poly = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).join(" ");

  const hover = hoverIdx != null && hoverIdx >= 0 && hoverIdx < displayRows.length ? displayRows[hoverIdx] : null;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const n = displayRows.length;
    const t = (x - PAD.left) / Math.max(w - PAD.left - PAD.right, 1);
    const idx = Math.round(t * (n - 1));
    setHoverIdx(Math.max(0, Math.min(n - 1, idx)));
  }

  return (
    <div className={className} style={shellStyle}>
      <HistoryRangeToggle value={range} onChange={(r) => { setRange(r); setHoverIdx(null); }} />
      <div ref={containerRef} className="min-h-0 overflow-hidden relative">
        <svg
          width={w}
          height={h}
          role="img"
          aria-label="OI wall history"
          onPointerMove={onMove}
          onPointerLeave={() => setHoverIdx(null)}
          style={{ touchAction: "none", display: "block" }}
        >
        {/* price grid */}
        {yTicks.map((t, i) => (
          <g key={`y-${i}`}>
            <line x1={PAD.left} x2={w - PAD.right} y1={yFor(t)} y2={yFor(t)} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <text x={PAD.left - 6} y={yFor(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fontFamily="ui-monospace, monospace" fill="#64748b">
              {fmtPrice(t)}
            </text>
          </g>
        ))}

        {/* max pain (yellow dashed) */}
        <polyline points={poly(mpPts)} fill="none" stroke={mp} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.85} />
        {/* put / call walls — segment stroke width tracks cumulative OI momentum */}
        <WallLineSegments
          side="put"
          rows={displayRows}
          xFor={xFor}
          yFor={yFor}
          pickStrike={(r) => r.oi?.putStrike ?? null}
          widths={putWidths}
          color={bull.line}
        />
        <WallLineSegments
          side="call"
          rows={displayRows}
          xFor={xFor}
          yFor={yFor}
          pickStrike={(r) => r.oi?.callStrike ?? null}
          widths={callWidths}
          color={bear.line}
        />

        {/* daily candles — solid blue, always above wall lines */}
        {displayRows.map((r, i) => {
          const c = r.candle;
          if (!c) return null;
          const x = xFor(i);
          const yO = yFor(c.open);
          const yC = yFor(c.close);
          const top = Math.min(yO, yC);
          const bh = Math.max(Math.abs(yC - yO), 1);
          return (
            <g key={`c-${i}`}>
              <line x1={x} x2={x} y1={yFor(c.high)} y2={yFor(c.low)} stroke={CANDLE_COLOR} strokeWidth={1} />
              <rect x={x - colW / 2} y={top} width={colW} height={bh} fill={CANDLE_COLOR} />
            </g>
          );
        })}

        {/* hover crosshair */}
        {hover && (
          <line
            x1={xFor(hoverIdx!)}
            x2={xFor(hoverIdx!)}
            y1={PAD.top}
            y2={h - PAD.bottom}
            stroke="rgba(255,255,255,0.25)"
            strokeWidth={1}
          />
        )}

        {/* x date labels — kept inside bottom padding, above the guide footer */}
        {displayRows.map((r, i) => {
          const everyN = Math.ceil(displayRows.length / 7);
          if (i % everyN !== 0 && i !== displayRows.length - 1) return null;
          return (
            <text
              key={`x-${i}`}
              x={xFor(i)}
              y={h - 10}
              textAnchor="middle"
              dominantBaseline="auto"
              fontSize={9}
              fontFamily="ui-sans-serif, system-ui"
              fill="#64748b"
            >
              {fmtDateLabel(r.date)}
            </text>
          );
        })}
        </svg>

      {/* hover tooltip */}
      {hover && (
        <div
          className="absolute pointer-events-none rounded-md px-2.5 py-1.5 text-[10px] leading-tight"
          style={{
            left: Math.min(Math.max(xFor(hoverIdx!) + 8, 8), w - 150),
            top: PAD.top + 4,
            background: "rgba(15,23,42,0.95)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#e2e8f0",
            minWidth: 130,
          }}
        >
          <div className="font-semibold mb-0.5" style={{ color: "#cbd5e1" }}>{fmtDateLabel(hover.date)}</div>
          {hover.candle && <Stat label="Close" value={fmtPrice(hover.candle.close)} color="#94a3b8" />}
          <Stat label="Call" value={tooltipVal(hover.oi?.callOI, hover.oi?.callStrike)} color={bear.labelText} />
          <Stat label="Put" value={tooltipVal(hover.oi?.putOI, hover.oi?.putStrike)} color={bull.labelText} />
          <Stat label="Max pain" value={hover.oi?.maxPain != null ? fmtPrice(hover.oi.maxPain) : "—"} color={mp} />
          {hover.oi?.putOI != null && hover.oi?.callOI != null && (
            <Stat
              label="OI edge"
              value={`${oiWallDominancePct(hover.oi.putOI, hover.oi.callOI).toFixed(0)}% ${oiWallDominantSide(hover.oi.putOI, hover.oi.callOI) === "put" ? "puts" : oiWallDominantSide(hover.oi.putOI, hover.oi.callOI) === "call" ? "calls" : "even"}`}
              color="#94a3b8"
            />
          )}
        </div>
        )}
      </div>
      {guideFooter}
    </div>
  );
}

function HistoryRangeToggle({
  value,
  onChange,
}: {
  value: OiHistoryRange;
  onChange: (v: OiHistoryRange) => void;
}) {
  const options: OiHistoryRange[] = ["1M", "3M", "6M"];
  return (
    <div className="mb-1.5 flex shrink-0 items-center gap-1 self-start rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
      {options.map((o) => {
        const active = value === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className="rounded-md px-3 py-1 text-[11px] font-semibold transition-colors"
            style={{
              backgroundColor: active ? "rgba(96,165,250,0.18)" : "transparent",
              color: active ? "#bfdbfe" : "#94a3b8",
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function WallLineSegments({
  side,
  rows,
  xFor,
  yFor,
  pickStrike,
  widths,
  color,
}: {
  side: OiWallSide;
  rows: Row[];
  xFor: (i: number) => number;
  yFor: (price: number) => number;
  pickStrike: (r: Row) => number | null;
  widths: number[];
  color: string;
}) {
  const segs: React.ReactNode[] = [];

  for (let i = 1; i < rows.length; i++) {
    const prev = pickStrike(rows[i - 1]!);
    const cur = pickStrike(rows[i]!);
    if (prev == null || cur == null) continue;
    const w = widths[i - 1] ?? 2;
    const putOI = rows[i]!.oi?.putOI;
    const callOI = rows[i]!.oi?.callOI;
    const pct = oiWallDominancePct(putOI, callOI);
    const dominant = oiWallDominantSide(putOI, callOI);
    const strength = dominant === side ? oiWallGlowStrength(pct) : 0;
    const lineOpacity = 0.55 + (w / 7) * 0.45;

    const x1 = xFor(i - 1);
    const y1 = yFor(prev);
    const x2 = xFor(i);
    const y2 = yFor(cur);

    // Sharp halo: wider under-strokes (no blur — blur smears on vertical wall moves).
    if (strength > 0) {
      if (strength > 0.45) {
        segs.push(
          <line
            key={`${side}-halo-outer-${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={color}
            strokeWidth={w + 5 + strength * 6}
            strokeLinecap="round"
            opacity={0.08 + strength * 0.12}
          />,
        );
      }
      segs.push(
        <line
          key={`${side}-halo-${i}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={color}
          strokeWidth={w + 2 + strength * 4}
          strokeLinecap="round"
          opacity={0.18 + strength * 0.32}
        />,
      );
    }

    segs.push(
      <line
        key={`${side}-${i}`}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={color}
        strokeWidth={w}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={lineOpacity}
      />,
    );
  }
  return <g>{segs}</g>;
}

function tooltipVal(oi: number | null | undefined, strike: number | null | undefined): string {
  const k = formatClusterStrike(strike);
  const s = formatClusterContracts(oi);
  if (!k) return "—";
  return s ? `${k} · ${s}` : k;
}

function HistoryChartGuide({
  bullLine,
  bearLine,
  maxPainColor,
}: {
  bullLine: string;
  bearLine: string;
  maxPainColor: string;
}) {
  return (
    <div className="space-y-2" aria-label="How to read this chart">
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-3">
        <GuideSeries color={bullLine} label="Put wall" desc="Highest put OI strike below spot — support." />
        <GuideSeries color={bearLine} label="Call wall" desc="Highest call OI strike above spot — resistance." />
        <GuideSeries color={maxPainColor} label="Max pain" desc="Strike where total option payout is lowest." dashed />
      </div>
      <div
        className="flex flex-wrap items-start gap-x-5 gap-y-2 border-t border-white/[0.06] pt-2"
        style={{ color: "#94a3b8" }}
      >
        <GuideEncoding label="Thickness" sample={<ThicknessSample color={bullLine} />}>
          Line gets thicker when that wall&apos;s OI builds day over day, thinner when it decays.
        </GuideEncoding>
        <GuideEncoding label="Glow" sample={<GlowDualSample putColor={bullLine} callColor={bearLine} />}>
          Only the heavier side glows — green for puts, red for calls; strength tracks the % gap between wall OI.
        </GuideEncoding>
        <p className="text-[9px] leading-snug self-center" style={{ color: "#64748b" }}>
          Hover any day for strikes, OI, and dominance.
        </p>
      </div>
    </div>
  );
}

function GuideSeries({
  color,
  label,
  desc,
  dashed,
}: {
  color: string;
  label: string;
  desc: string;
  dashed?: boolean;
}) {
  return (
    <div className="flex gap-2 min-w-0">
      <span
        className="mt-1.5 shrink-0 inline-block"
        style={{ width: 14, height: 0, borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}` }}
        aria-hidden
      />
      <div className="min-w-0">
        <div className="text-[10px] font-semibold leading-tight" style={{ color: "#cbd5e1" }}>
          {label}
        </div>
        <p className="text-[9px] leading-snug mt-0.5" style={{ color: "#64748b" }}>
          {desc}
        </p>
      </div>
    </div>
  );
}

function GuideEncoding({
  label,
  sample,
  children,
}: {
  label: string;
  sample: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 min-w-[140px] max-w-sm">
      {sample}
      <div className="min-w-0">
        <div className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "#94a3b8" }}>
          {label}
        </div>
        <p className="text-[9px] leading-snug mt-0.5" style={{ color: "#64748b" }}>
          {children}
        </p>
      </div>
    </div>
  );
}

function ThicknessSample({ color }: { color: string }) {
  return (
    <svg width={44} height={18} aria-hidden className="shrink-0">
      <line x1={2} y1={13} x2={42} y2={13} stroke={color} strokeWidth={1.5} opacity={0.45} strokeLinecap="round" />
      <line x1={2} y1={5} x2={42} y2={5} stroke={color} strokeWidth={4.5} opacity={0.9} strokeLinecap="round" />
    </svg>
  );
}

function GlowDualSample({ putColor, callColor }: { putColor: string; callColor: string }) {
  return (
    <svg width={56} height={30} aria-hidden className="shrink-0">
      <GlowLineSample y={8} color={putColor} />
      <GlowLineSample y={22} color={callColor} />
    </svg>
  );
}

/** Matches chart halo layers at high dominance — boosted slightly for the legend. */
function GlowLineSample({ y, color }: { y: number; color: string }) {
  const w = 2;
  const strength = 1;
  return (
    <g>
      <line
        x1={2}
        y1={y}
        x2={54}
        y2={y}
        stroke={color}
        strokeWidth={w + 6 + strength * 7}
        strokeLinecap="round"
        opacity={0.28}
      />
      <line
        x1={2}
        y1={y}
        x2={54}
        y2={y}
        stroke={color}
        strokeWidth={w + 3 + strength * 5}
        strokeLinecap="round"
        opacity={0.55}
      />
      <line x1={2} y1={y} x2={54} y2={y} stroke={color} strokeWidth={w} strokeLinecap="round" opacity={1} />
    </g>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span style={{ color: "#64748b" }}>{label}</span>
      <span style={{ color }} className="font-mono font-semibold">{value}</span>
    </div>
  );
}
