"use client";

/**
 * Shared equity-curve chart used by:
 *   • /freedombot/performance  (public performance page)
 *   • /simulation              (TezTerminal simulator dashboard)
 *
 * Three focused views (toggled, never overlaid):
 *   - "trade"  → capital line, one point per closed trade
 *   - "day"    → capital curve, one point per calendar day
 *   - "pnl"    → green/red bars, one bar per calendar day
 *
 * theme="blue"  → performance page blue tints
 * theme="white" → simulator white tints (curve stroke is brand blue on both)
 */

import { useState, useMemo } from "react";
import {
  BRAND_CURVE_FILL_OPACITY,
  BRAND_CURVE_MUTED,
  BRAND_CURVE_STROKE,
} from "@/lib/chart-brand-colors";
import { BarChart3 } from "lucide-react";
import {
  AreaChart,
  BarChart,
  Area,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { format } from "date-fns";
import { buildEquityCurve, type ClosedTradeLike } from "@/lib/equity-curve";
import { useChartMotion } from "@/hooks/use-chart-motion";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChartView = "trade" | "day" | "pnl";

interface CurvePoint {
  x: number | string;
  value: number;
  tooltip: string;
}

interface DayPoint {
  x: string;
  value: number;
  tooltip: string;
  dailyPnl: number;
}

export interface EquityChartProps {
  /** Closed trades only. The component does NOT re-filter by status. */
  trades: ClosedTradeLike[];
  startingCapital: number;
  /** Currency symbol shown on axis labels. Default: "$" */
  cs?: string;
  /**
   * "blue"  → performance page dark-blue tints (default)
   * "white" → simulator dark theme with white tints
   */
  theme?: "blue" | "white";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMoney(v: number, cs: string): string {
  if (cs === "₹") return `₹${Math.round(v).toLocaleString("en-IN")}`;
  return `$${v.toFixed(2)}`;
}

const VIEWS: { key: ChartView; label: string }[] = [
  { key: "trade", label: "Tradewise" },
  { key: "day",   label: "Daywise"   },
  { key: "pnl",   label: "Daily P&L" },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function EquityChart({
  trades,
  startingCapital,
  cs = "$",
  theme = "blue",
}: EquityChartProps) {
  const [view, setView] = useState<ChartView>("trade");
  const motion = useChartMotion();
  const anim = motion.enabled
    ? {
        isAnimationActive: true as const,
        animationDuration: motion.duration,
        animationEasing: "ease-out" as const,
      }
    : { isAnimationActive: false as const };

  const isBlue  = theme === "blue";
  const gridCol = isBlue ? "rgba(90,140,220,0.06)"  : "rgba(255,255,255,0.06)";
  const axisCol = isBlue ? "rgba(90,140,220,0.45)"  : "rgba(255,255,255,0.45)";
  const axisLn  = isBlue ? "rgba(90,140,220,0.08)"  : "rgba(255,255,255,0.08)";
  const refCol  = isBlue ? "rgba(90,140,220,0.15)"  : "rgba(255,255,255,0.10)";
  const refLbl  = isBlue ? "rgba(90,140,220,0.35)"  : "rgba(255,255,255,0.35)";
  const ttBg    = isBlue ? "#0a1628"                : "#1a1a1d";
  const ttBdr   = isBlue ? "rgba(90,140,220,0.2)"   : "rgba(255,255,255,0.1)";
  const yWidth  = cs === "₹" ? 75 : 55;

  const curve = useMemo(
    () => buildEquityCurve(trades, startingCapital),
    [trades, startingCapital],
  );

  // ── Tradewise: one point per closed trade ──
  const tradeData: CurvePoint[] = useMemo(() => {
    if (!curve.points.length) return [];
    return [
      { x: 0, value: startingCapital, tooltip: "Start" },
      ...curve.points.map((p) => ({
        x: p.tradeNumber,
        value: p.value,
        tooltip: `${p.symbol} · ${format(new Date(p.closedAt), "MMM dd HH:mm")}`,
      })),
    ];
  }, [curve, startingCapital]);

  // ── Daywise: last capital value of each calendar day ──
  const dayData: DayPoint[] = useMemo(() => {
    if (!curve.points.length) return [];
    const dayCapital = new Map<string, number>();
    for (const p of curve.points) {
      dayCapital.set(p.closedAt.slice(0, 10), p.value);
    }
    const pts: DayPoint[] = [
      { x: "Start", value: startingCapital, tooltip: "Starting capital", dailyPnl: 0 },
    ];
    let prev = startingCapital;
    for (const [day, capital] of dayCapital) {
      pts.push({
        x: format(new Date(day), "MMM dd"),
        value: capital,
        tooltip: day,
        dailyPnl: parseFloat((capital - prev).toFixed(2)),
      });
      prev = capital;
    }
    return pts;
  }, [curve, startingCapital]);

  const chartKey = `${curve.points.length}-${curve.finalCapital}-${view}`;

  if (curve.points.length < 2) return null;

  // ── Curve view metrics ──
  const curveData  = view === "trade" ? tradeData : dayData;
  const allValues  = curveData.map((d) => d.value);
  const yMin       = Math.floor(Math.min(...allValues) * 0.995);
  const yMax       = Math.ceil(Math.max(...allValues) * 1.005);
  const curveColor = BRAND_CURVE_STROKE;

  // ── PnL bar view metrics (exclude "Start" point) ──
  const pnlData    = dayData.slice(1);
  const pnlValues  = pnlData.map((d) => Math.abs(d.dailyPnl));
  const pnlMax     = pnlValues.length ? Math.ceil(Math.max(...pnlValues) * 1.15) : 10;
  const pnlYWidth  = cs === "₹" ? 75 : 50;

  const tooltipStyle = {
    contentStyle: {
      backgroundColor: ttBg,
      border: `1px solid ${ttBdr}`,
      borderRadius: "8px",
      fontSize: "11px",
      color: "#e2e8f0",
    },
    labelStyle: { color: "#94a3b8", marginBottom: "2px" },
    itemStyle: { color: "#e2e8f0" },
  };

  return (
    <div
      className="rounded-lg p-4 space-y-3"
      style={{ backgroundColor: "rgba(255,255,255,0.02)", border: `1px solid ${isBlue ? "rgba(90,140,220,0.08)" : "rgba(255,255,255,0.06)"}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4" style={{ color: isBlue ? "#60a5fa" : undefined }} />
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: isBlue ? "#475569" : undefined }}>
            Fund Value
          </span>
        </div>

        {/* 3-way toggle */}
        <div className="flex items-center gap-0.5 rounded-md p-0.5" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className="px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all"
              style={view === v.key
                ? { backgroundColor: "rgba(96,165,250,0.2)", color: "#60a5fa" }
                : { color: isBlue ? "#334155" : "rgba(255,255,255,0.35)" }
              }
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Curve view (Tradewise / Daywise) ── */}
      {view !== "pnl" && (
        curveData.length < 2 ? (
          <div className="text-center py-6" style={{ color: "rgba(255,255,255,0.2)" }}>
            <p className="text-[10px] font-bold">Not enough data</p>
          </div>
        ) : (
          <div className="h-[340px] sm:h-[440px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart key={chartKey} data={curveData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="ecGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={curveColor}
                      stopOpacity={BRAND_CURVE_FILL_OPACITY.top}
                    />
                    <stop
                      offset="95%"
                      stopColor={curveColor}
                      stopOpacity={BRAND_CURVE_FILL_OPACITY.bottom}
                    />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke={gridCol} />
                <XAxis dataKey="x" tick={{ fontSize: 9, fill: axisCol }} tickLine={false} axisLine={{ stroke: axisLn }} />
                <YAxis
                  domain={[yMin, yMax]}
                  tick={{ fontSize: 9, fill: axisCol }}
                  tickLine={false}
                  axisLine={{ stroke: axisLn }}
                  tickFormatter={(v: number) => cs === "₹" ? `₹${Math.round(v).toLocaleString("en-IN")}` : `$${v.toFixed(0)}`}
                  width={yWidth}
                />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={(v) => view === "trade" ? (v === 0 ? "Start" : `Trade #${v}`) : String(v)}
                  formatter={(value: number, _: string, props: any) => [fmtMoney(value, cs), props.payload?.tooltip ?? "Capital"]}
                />
                <ReferenceLine
                  y={startingCapital}
                  stroke={refCol}
                  strokeDasharray="4 4"
                  label={{ value: fmtMoney(startingCapital, cs), position: "right", fontSize: 9, fill: refLbl }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={curveColor}
                  strokeWidth={2}
                  fill="url(#ecGradient)"
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: curveColor,
                    stroke: isBlue ? "#080f1e" : "#0f0f11",
                    strokeWidth: 2,
                  }}
                  {...anim}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )
      )}

      {/* ── Daily P&L bars ── */}
      {view === "pnl" && (
        pnlData.length < 1 ? (
          <div className="text-center py-6" style={{ color: "rgba(255,255,255,0.2)" }}>
            <p className="text-[10px] font-bold">Not enough data</p>
          </div>
        ) : (
          <div className="h-[340px] sm:h-[440px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart key={chartKey} data={pnlData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridCol} vertical={false} />
                <XAxis dataKey="x" tick={{ fontSize: 9, fill: axisCol }} tickLine={false} axisLine={{ stroke: axisLn }} />
                <YAxis
                  domain={[-pnlMax, pnlMax]}
                  tick={{ fontSize: 9, fill: axisCol }}
                  tickLine={false}
                  axisLine={{ stroke: axisLn }}
                  tickFormatter={(v: number) => {
                    if (v === 0) return cs === "₹" ? "₹0" : "$0";
                    const sign = v > 0 ? "+" : "-";
                    const abs = Math.abs(v);
                    return cs === "₹"
                      ? `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`
                      : `${sign}$${abs.toFixed(0)}`;
                  }}
                  width={pnlYWidth}
                />
                <Tooltip
                  {...tooltipStyle}
                  labelFormatter={(v) => String(v)}
                  formatter={(value: number) => {
                    const sign = value > 0 ? "+" : "";
                    return [`${sign}${fmtMoney(value, cs)}`, "Daily P&L"];
                  }}
                />
                <ReferenceLine y={0} stroke={refCol} />
                <Bar
                  dataKey="dailyPnl"
                  maxBarSize={20}
                  radius={[2, 2, 0, 0]}
                  activeBar={false}
                  {...anim}
                >
                  {pnlData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.dailyPnl >= 0 ? BRAND_CURVE_STROKE : BRAND_CURVE_MUTED}
                      fillOpacity={0.75}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      )}
    </div>
  );
}
