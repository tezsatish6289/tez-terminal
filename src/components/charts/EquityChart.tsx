"use client";

/**
 * Shared equity-curve chart used by:
 *   • /freedombot/performance  (public performance page)
 *   • /simulation              (TezTerminal simulator dashboard)
 *
 * Features:
 *   - Tradewise view: one point per closed trade
 *   - Daywise view:  one point per calendar day + daily PnL bars on secondary axis
 *   - theme="blue"  → performance page blue tints
 *   - theme="white" → simulator white tints + green/red gradient split at baseline
 */

import { useState, useMemo } from "react";
import { BarChart3 } from "lucide-react";
import {
  ComposedChart,
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

// ─── Types ────────────────────────────────────────────────────────────────────

type ChartView = "trade" | "day";

interface TradePoint {
  x: number | string;
  value: number;
  tooltip: string;
  dailyPnl?: undefined;
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
   * "white" → simulator dark theme with white tints + baseline gradient split
   */
  theme?: "blue" | "white";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtMoney(v: number, cs: string): string {
  if (cs === "₹") return `₹${Math.round(v).toLocaleString("en-IN")}`;
  return `$${v.toFixed(2)}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EquityChart({
  trades,
  startingCapital,
  cs = "$",
  theme = "blue",
}: EquityChartProps) {
  const [view, setView] = useState<ChartView>("trade");

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
  const tradeData: TradePoint[] = useMemo(() => {
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

  // ── Daywise: last trade value of each calendar day + daily PnL ──
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
      const dailyPnl = parseFloat((capital - prev).toFixed(2));
      pts.push({
        x: format(new Date(day), "MMM dd"),
        value: capital,
        tooltip: day,
        dailyPnl,
      });
      prev = capital;
    }
    return pts;
  }, [curve, startingCapital]);

  if (curve.points.length < 2) return null;

  const isDay     = view === "day";
  const chartData = isDay ? dayData : tradeData;
  const lastVal   = chartData[chartData.length - 1]?.value ?? startingCapital;
  const allValues = chartData.map((d) => d.value);
  const yMin      = Math.floor(Math.min(...allValues) * 0.995);
  const yMax      = Math.ceil(Math.max(...allValues) * 1.005);

  // For the "white" theme: split gradient at the baseline
  const splitPct = Math.max(0, Math.min(100,
    yMax === yMin ? 50 : ((yMax - startingCapital) / (yMax - yMin)) * 100,
  ));

  // For the "blue" theme: single colour based on overall direction
  const blueColor = lastVal >= startingCapital ? "#34d399" : "#f87171";

  // Daily PnL bar Y-axis domain — symmetric around zero so bars read intuitively
  const pnlVals  = dayData.map((d) => Math.abs(d.dailyPnl));
  const pnlMax   = pnlVals.length ? Math.ceil(Math.max(...pnlVals) * 1.1) : 10;
  const pnlDomain: [number, number] = [-pnlMax, pnlMax];

  return (
    <div
      className="rounded-lg p-4 space-y-3"
      style={isBlue
        ? { backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(90,140,220,0.08)" }
        : { border: "1px solid rgba(255,255,255,0.06)", backgroundColor: "rgba(255,255,255,0.02)" }
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3
            className="w-4 h-4"
            style={{ color: isBlue ? "#60a5fa" : undefined }}
          />
          <span
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: isBlue ? "#475569" : undefined }}
          >
            Fund Value
          </span>
        </div>
        <div
          className="flex items-center gap-0.5 rounded-md p-0.5"
          style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
        >
          {(["trade", "day"] as ChartView[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all"
              style={view === v
                ? { backgroundColor: isBlue ? "rgba(96,165,250,0.2)" : "rgba(96,165,250,0.2)", color: "#60a5fa" }
                : { color: isBlue ? "#334155" : "rgba(255,255,255,0.35)" }
              }
            >
              {v === "trade" ? "Tradewise" : "Daywise"}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {chartData.length < 2 ? (
        <div className="text-center py-6" style={{ color: "rgba(255,255,255,0.2)" }}>
          <p className="text-[10px] font-bold">Not enough data</p>
        </div>
      ) : (
        <div className="h-[340px] sm:h-[440px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: isDay ? 50 : 5, left: 0, bottom: 0 }}>
              <defs>
                {isBlue ? (
                  <linearGradient id="ecGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={blueColor} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={blueColor} stopOpacity={0}   />
                  </linearGradient>
                ) : (
                  <>
                    <linearGradient id="ecStroke" x1="0" y1="0" x2="0" y2="1">
                      <stop offset={`${splitPct}%`} stopColor="#34d399" />
                      <stop offset={`${splitPct}%`} stopColor="#f87171" />
                    </linearGradient>
                    <linearGradient id="ecFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"             stopColor="#34d399" stopOpacity={0.28} />
                      <stop offset={`${splitPct}%`} stopColor="#34d399" stopOpacity={0.06} />
                      <stop offset={`${splitPct}%`} stopColor="#f87171" stopOpacity={0.06} />
                      <stop offset="100%"           stopColor="#f87171" stopOpacity={0}    />
                    </linearGradient>
                  </>
                )}
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke={gridCol} />

              <XAxis
                dataKey="x"
                tick={{ fontSize: 9, fill: axisCol }}
                tickLine={false}
                axisLine={{ stroke: axisLn }}
              />

              {/* Capital Y-axis (left) */}
              <YAxis
                yAxisId="capital"
                domain={[yMin, yMax]}
                tick={{ fontSize: 9, fill: axisCol }}
                tickLine={false}
                axisLine={{ stroke: axisLn }}
                tickFormatter={(v: number) =>
                  cs === "₹"
                    ? `₹${Math.round(v).toLocaleString("en-IN")}`
                    : `$${v.toFixed(0)}`
                }
                width={yWidth}
              />

              {/* Daily PnL Y-axis (right) — only rendered in daywise view */}
              {isDay && (
                <YAxis
                  yAxisId="pnl"
                  orientation="right"
                  domain={pnlDomain}
                  tick={{ fontSize: 9, fill: axisCol }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) =>
                    `${v >= 0 ? "+" : ""}${cs === "₹" ? Math.round(v).toLocaleString("en-IN") : v.toFixed(0)}`
                  }
                  width={50}
                />
              )}

              <Tooltip
                contentStyle={{
                  backgroundColor: ttBg,
                  border: `1px solid ${ttBdr}`,
                  borderRadius: "8px",
                  fontSize: "11px",
                }}
                labelFormatter={(v) =>
                  view === "trade" ? (v === 0 ? "Start" : `Trade #${v}`) : String(v)
                }
                formatter={(value: number, name: string, props: any) => {
                  if (name === "dailyPnl") {
                    const sign = value >= 0 ? "+" : "";
                    return [`${sign}${fmtMoney(value, cs)}`, "Daily P&L"];
                  }
                  return [fmtMoney(value, cs), props.payload?.tooltip ?? "Capital"];
                }}
              />

              <ReferenceLine
                yAxisId="capital"
                y={startingCapital}
                stroke={refCol}
                strokeDasharray="4 4"
                label={{
                  value: fmtMoney(startingCapital, cs),
                  position: "right",
                  fontSize: 9,
                  fill: refLbl,
                }}
              />

              {/* Capital area line */}
              <Area
                yAxisId="capital"
                type="monotone"
                dataKey="value"
                stroke={isBlue ? blueColor : "url(#ecStroke)"}
                strokeWidth={2}
                fill={isBlue ? "url(#ecGradient)" : "url(#ecFill)"}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: isBlue ? blueColor : "#ffffff",
                  stroke: isBlue ? "#080f1e" : "#0f0f11",
                  strokeWidth: 2,
                }}
              />

              {/* Daily PnL bars — only in daywise view */}
              {isDay && (
                <Bar
                  yAxisId="pnl"
                  dataKey="dailyPnl"
                  maxBarSize={18}
                  radius={[2, 2, 0, 0]}
                >
                  {dayData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={
                        entry.dailyPnl >= 0
                          ? "rgba(52,211,153,0.45)"
                          : "rgba(248,113,113,0.45)"
                      }
                    />
                  ))}
                </Bar>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
