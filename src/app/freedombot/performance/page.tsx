"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Rocket,
  Activity,
  DollarSign,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Shield,
  Target,
  Zap,
  Lock,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { format } from "date-fns";
import { calcPerformanceMetrics } from "@/lib/performance-metrics";
import type { PerformanceMetrics } from "@/lib/performance-metrics";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TradeEvent {
  pnl: number;
  fee: number;
  reason?: string;
}

interface ApiTrade {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  leverage: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  slHit: boolean;
  status: "OPEN" | "CLOSED";
  realizedPnl: number;
  positionSize: number | null;
  capitalAtEntry: number | null;
  closeReason: string | null;
  openedAt: string;
  closedAt: string | null;
  // Same structure the simulator uses — required for accurate PnL
  events: TradeEvent[];
}

// ─── trueNetPnl — identical to performance-metrics.ts ────────────────────────
// sum(event.pnl) - events[0].fee  = price PnL - all fees
function trueNetPnl(events: TradeEvent[]): number {
  if (!events.length) return 0;
  return events.reduce((s, e) => s + e.pnl, 0) - events[0].fee;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPct(n: number | null | undefined, dp = 2) {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(dp)}%`;
}

function fmtMoney(n: number | null | undefined) {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtRatio(n: number, dp = 2) {
  if (!isFinite(n)) return "∞";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(dp)}`;
}

// ─── SummaryCard — identical to simulator ─────────────────────────────────────

function SummaryCard({
  label, value, sub, badge, color, icon,
}: {
  label: string;
  value: string;
  sub?: string;
  badge?: { text: string; variant: "projected" | "actual" | "live" };
  color: string;
  icon: React.ReactNode;
}) {
  const badgeStyle =
    badge?.variant === "projected" ? { backgroundColor: "rgba(251,191,36,0.15)", color: "#fbbf24" } :
    badge?.variant === "live"      ? { backgroundColor: "rgba(34,197,94,0.15)",  color: "#22c55e" } :
                                     { backgroundColor: "rgba(255,255,255,0.05)", color: "#64748b" };

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2 transition-colors hover:brightness-110"
      style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.1)" }}
    >
      <div className="flex items-center gap-1.5">
        <span style={{ color, opacity: 0.6 }}>{icon}</span>
        <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#334155" }}>{label}</span>
      </div>
      <div className="text-2xl font-black tabular-nums leading-none" style={{ color }}>{value}</div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {sub && <span className="text-[10px]" style={{ color: "#475569" }}>{sub}</span>}
        {badge && (
          <span
            className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
            style={badgeStyle}
          >
            {badge.text}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── MetricTile — identical to simulator ─────────────────────────────────────

function MetricTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div
      className="flex flex-col gap-1 px-4 py-3 rounded-lg"
      style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(90,140,220,0.08)" }}
    >
      <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#334155" }}>{label}</span>
      <span className="text-xl font-mono font-bold" style={{ color }}>{value}</span>
      {sub && <span className="text-[10px]" style={{ color: "#334155" }}>{sub}</span>}
    </div>
  );
}

// ─── PerformanceMetricsPanel — identical layout to simulator ──────────────────

function PerformanceMetricsPanel({ metrics }: { metrics: PerformanceMetrics | null }) {
  if (!metrics) return null;

  const ratioColor = (n: number) =>
    !isFinite(n) || n >= 1.5 ? "#34d399" : n >= 0.5 ? "#fbbf24" : "#f87171";

  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-3 h-full"
      style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(90,140,220,0.08)" }}
    >
      <div className="flex items-center justify-between flex-wrap gap-1">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4" style={{ color: "#60a5fa" }} />
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#475569" }}>Performance</span>
        </div>
        <span className="text-[9px]" style={{ color: "#334155" }}>{metrics.tradingDays}d · annualised</span>
      </div>

      <div className="flex flex-col gap-2 flex-1">
        <MetricTile label="Sharpe Ratio" value={fmtRatio(metrics.sharpeRatio)} sub="Higher › 1 is good" color={ratioColor(metrics.sharpeRatio)} />
        <MetricTile label="Sortino Ratio" value={fmtRatio(metrics.sortinoRatio)} sub="Downside-adjusted" color={ratioColor(metrics.sortinoRatio)} />
        <MetricTile label="Calmar Ratio" value={fmtRatio(metrics.calmarRatio)} sub="Return / Max DD" color={ratioColor(metrics.calmarRatio)} />
        <MetricTile
          label="Max Drawdown"
          value={`-${metrics.maxDrawdownPct.toFixed(2)}%`}
          sub="Peak-to-trough (closed)"
          color={metrics.maxDrawdownPct < 15 ? "#34d399" : metrics.maxDrawdownPct < 30 ? "#fbbf24" : "#f87171"}
        />
      </div>

      <p className="text-[10px] leading-relaxed" style={{ color: "#1e3a5f" }}>
        Based on <span style={{ color: "#334155", fontWeight: 600 }}>closed trades only</span>. Ratios are annualised. Risk-free: 0% (crypto).
      </p>
    </div>
  );
}

// ─── EquityCurve — identical layout to simulator ──────────────────────────────

type ChartView = "trade" | "day";

function EquityCurve({ trades, startingCapital }: { trades: ApiTrade[]; startingCapital: number }) {
  const [view, setView] = useState<ChartView>("trade");

  const closed = useMemo(
    () => trades
      .filter((t) => t.status === "CLOSED" && t.closedAt)
      .sort((a, b) => new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime()),
    [trades]
  );

  const tradeData = useMemo(() => {
    if (!closed.length) return [];
    const pts: { x: number | string; value: number; tooltip: string }[] = [
      { x: 0, value: startingCapital, tooltip: "Start" },
    ];
    let running = startingCapital;
    closed.forEach((t, i) => {
      // Use same trueNetPnl as simulator — events-based, not raw realizedPnl
      running += trueNetPnl(t.events ?? []);
      pts.push({
        x: i + 1,
        value: parseFloat(running.toFixed(2)),
        tooltip: `${t.symbol} · ${format(new Date(t.closedAt!), "MMM dd HH:mm")}`,
      });
    });
    return pts;
  }, [closed, startingCapital]);

  const dayData = useMemo(() => {
    if (!closed.length) return [];
    const dayCapital = new Map<string, number>();
    let running = startingCapital;
    for (const t of closed) {
      running += trueNetPnl(t.events ?? []);
      dayCapital.set(t.closedAt!.slice(0, 10), parseFloat(running.toFixed(2)));
    }
    const pts: { x: string; value: number; tooltip: string }[] = [
      { x: "Start", value: startingCapital, tooltip: "Starting capital" },
    ];
    for (const [day, capital] of dayCapital) {
      pts.push({ x: format(new Date(day), "MMM dd"), value: capital, tooltip: day });
    }
    return pts;
  }, [closed, startingCapital]);

  if (closed.length < 2) return null;

  const chartData  = view === "trade" ? tradeData : dayData;
  const lastVal    = chartData[chartData.length - 1]?.value ?? startingCapital;
  const isPositive = lastVal >= startingCapital;
  const chartColor = isPositive ? "#34d399" : "#f87171";
  const yMin = Math.floor(Math.min(...chartData.map((d) => d.value)) * 0.995);
  const yMax = Math.ceil(Math.max(...chartData.map((d) => d.value)) * 1.005);

  return (
    <div
      className="rounded-lg p-4 space-y-3"
      style={{ backgroundColor: "rgba(255,255,255,0.02)", border: "1px solid rgba(90,140,220,0.08)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4" style={{ color: "#60a5fa" }} />
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#475569" }}>Fund Value</span>
        </div>
        <div className="flex items-center gap-0.5 rounded-md p-0.5" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
          {(["trade", "day"] as ChartView[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all"
              style={view === v
                ? { backgroundColor: "rgba(96,165,250,0.2)", color: "#60a5fa" }
                : { color: "#334155" }
              }
            >
              {v === "trade" ? "Tradewise" : "Daywise"}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-[340px] sm:h-[440px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="fbEquityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={chartColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={chartColor} stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(90,140,220,0.06)" />
            <XAxis
              dataKey="x"
              tick={{ fontSize: 9, fill: "rgba(90,140,220,0.45)" }}
              tickLine={false}
              axisLine={{ stroke: "rgba(90,140,220,0.08)" }}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 9, fill: "rgba(90,140,220,0.45)" }}
              tickLine={false}
              axisLine={{ stroke: "rgba(90,140,220,0.08)" }}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
              width={55}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0a1628",
                border: "1px solid rgba(90,140,220,0.2)",
                borderRadius: "8px",
                fontSize: "11px",
              }}
              labelFormatter={(v) => view === "trade" ? (v === 0 ? "Start" : `Trade #${v}`) : String(v)}
              formatter={(value: number, _name: string, props: any) => [
                fmtMoney(value),
                props.payload.tooltip,
              ]}
            />
            <ReferenceLine
              y={startingCapital}
              stroke="rgba(90,140,220,0.15)"
              strokeDasharray="4 4"
              label={{ value: fmtMoney(startingCapital), position: "right", fontSize: 9, fill: "rgba(90,140,220,0.35)" }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={chartColor}
              strokeWidth={2}
              fill="url(#fbEquityGradient)"
              dot={false}
              activeDot={{ r: 4, fill: chartColor, stroke: "#080f1e", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Methodology section components ──────────────────────────────────────────

function MethodCard({ icon: Icon, title, children }: {
  icon: React.ElementType; title: string; children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-7 sm:p-8"
      style={{ backgroundColor: "#0d1a2e", border: "1px solid rgba(148,163,184,0.08)" }}
    >
      <div className="flex items-start gap-4 mb-5">
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ backgroundColor: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.15)" }}
        >
          <Icon className="h-5 w-5" style={{ color: "#60a5fa" }} />
        </div>
        <h3 className="text-base sm:text-lg font-bold text-white leading-snug">{title}</h3>
      </div>
      <div className="space-y-3.5 text-sm sm:text-[15px] leading-relaxed" style={{ color: "#94a3b8" }}>
        {children}
      </div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-[7px] h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: "#60a5fa", opacity: 0.6 }} />
      <span>{children}</span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <span className="h-px flex-1" style={{ backgroundColor: "rgba(148,163,184,0.08)" }} />
      <span className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: "#64748b" }}>{children}</span>
      <span className="h-px flex-1" style={{ backgroundColor: "rgba(148,163,184,0.08)" }} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── Simulator state type ─────────────────────────────────────────────────────

interface SimState {
  capital: number;
  startingCapital: number;
}

type AssetKey = "CRYPTO" | "INDIAN_STOCKS" | "GOLD" | "SILVER";

const ASSETS: { key: AssetKey; label: string; icon: string; live: boolean; cs: string }[] = [
  { key: "CRYPTO",        label: "Crypto Bot",       icon: "₿",  live: true,  cs: "$" },
  { key: "INDIAN_STOCKS", label: "Indian Stock Bot",  icon: "🇮🇳", live: false, cs: "₹" },
  { key: "GOLD",          label: "Gold Bot",          icon: "🥇", live: false, cs: "$" },
  { key: "SILVER",        label: "Silver Bot",        icon: "🥈", live: false, cs: "$" },
];

export default function PerformancePage() {
  const [assetType, setAssetType] = useState<AssetKey>("CRYPTO");
  const [simState,  setSimState]  = useState<SimState | null>(null);
  const [trades,    setTrades]    = useState<ApiTrade[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    setLoading(true);
    setSimState(null);
    setTrades([]);
    fetch(`/api/freedombot/perf-data?assetType=${assetType}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.state)  setSimState(d.state as SimState);
        if (d.trades) setTrades(d.trades as ApiTrade[]);
      })
      .finally(() => setLoading(false));
  }, [assetType]);

  const cs = ASSETS.find((a) => a.key === assetType)?.cs ?? "$";

  // ── Replicate simulator page calculations exactly ──────────────────────────

  const openTrades   = useMemo(() => trades.filter((t) => t.status === "OPEN"),   [trades]);
  const closedTrades = useMemo(() => trades.filter((t) => t.status === "CLOSED"), [trades]);

  // Running days from earliest trade openedAt — identical to simulator page
  const runningDays = useMemo(() => {
    const all = [...openTrades, ...closedTrades];
    if (!all.length) return 0;
    const earliest = all.reduce((a, b) =>
      new Date(a.openedAt ?? 0).getTime() < new Date(b.openedAt ?? 0).getTime() ? a : b
    );
    return Math.max(1, Math.ceil((Date.now() - new Date(earliest.openedAt ?? 0).getTime()) / 86_400_000));
  }, [openTrades, closedTrades]);

  const startCap    = simState?.startingCapital ?? 1000;
  const totalReturn = simState
    ? ((simState.capital - simState.startingCapital) / simState.startingCapital) * 100
    : 0;
  const isPositive  = totalReturn >= 0;

  // Monthly — actual this-calendar-month if ≥30 days, else projected (identical to simulator)
  const monthlyPnl = useMemo(() => {
    if (!simState || runningDays === 0) return { pct: 0, isProjected: true };
    const netPnl = simState.capital - simState.startingCapital;
    if (runningDays >= 30) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthNet = closedTrades.reduce((sum, t) => {
        if (!t.closedAt || new Date(t.closedAt) < monthStart) return sum;
        const evts = t.events ?? [];
        return sum + evts.reduce((s, e) => s + e.pnl, 0) - (evts[0]?.fee ?? 0);
      }, 0);
      return { pct: (monthNet / simState.startingCapital) * 100, isProjected: false };
    }
    return { pct: ((netPnl / runningDays) * 30 / simState.startingCapital) * 100, isProjected: true };
  }, [simState, runningDays, closedTrades]);

  // Yearly — projected if < 365 days (identical to simulator)
  const yearlyPnl = useMemo(() => {
    if (!simState || runningDays === 0) return { pct: 0, isProjected: true };
    const netPnl    = simState.capital - simState.startingCapital;
    const annualPnl = runningDays >= 365 ? netPnl : (netPnl / runningDays) * 365;
    return { pct: (annualPnl / simState.startingCapital) * 100, isProjected: runningDays < 365 };
  }, [simState, runningDays]);

  // Performance metrics — same function AND same args as simulator
  const metrics = useMemo(
    () => closedTrades.length > 0 && startCap > 0
      ? calcPerformanceMetrics(closedTrades as any, startCap, 0)
      : null,
    [closedTrades, startCap]
  );

  const monthlyIsProjected = monthlyPnl.isProjected;
  const yearlyIsProjected  = yearlyPnl.isProjected;

  return (
    <div className="min-h-screen font-sans antialiased" style={{ backgroundColor: "#080f1e", color: "#f0f4ff" }}>

      {/* ── Nav ── */}
      <nav
        className="sticky top-0 z-40 border-b"
        style={{ backgroundColor: "rgba(8,15,30,0.92)", borderColor: "rgba(90,140,220,0.12)", backdropFilter: "blur(16px)" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
            <Image src="/freedombot/icon.png" alt="FreedomBot.ai" width={32} height={32} className="rounded-xl object-contain" />
            <span className="font-black text-lg tracking-tight" style={{ color: "#60a5fa" }}>FreedomBot.ai</span>
          </Link>
          <Link href="/" className="flex items-center gap-1.5 text-xs font-bold transition-colors hover:text-white flex-shrink-0" style={{ color: "#64748b" }}>
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Back to Home</span>
            <span className="sm:hidden">Home</span>
          </Link>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ── Hero header ── */}
        <div className="text-center py-6 sm:py-10 space-y-4">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest"
            style={{ backgroundColor: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)", color: "#60a5fa" }}
          >
            <BarChart3 className="h-3 w-3" />
            Live Performance
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tighter">
            Transparent by{" "}
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #93c5fd)" }}>
              design
            </span>
          </h1>
          <p className="text-sm sm:text-base max-w-xl mx-auto leading-relaxed" style={{ color: "#64748b" }}>
            Real data. Real trades. Every number on this page is live — pulled directly from our trading system, not a backtest.
          </p>
          <Link
            href="/records"
            className="inline-flex items-center gap-1.5 text-xs font-semibold transition-colors hover:text-blue-300 mt-1"
            style={{ color: "#60a5fa" }}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Every trade is permanently recorded on the Solana blockchain — verify independently →
          </Link>
        </div>

        {/* ── Asset selector — same style as dashboard ── */}
        <div className="flex items-center gap-0 rounded-xl p-1 w-fit mx-auto overflow-x-auto"
          style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(90,140,220,0.1)" }}
        >
          {ASSETS.map((a) => {
            const isActive = assetType === a.key;
            return (
              <button
                key={a.key}
                onClick={() => a.live && setAssetType(a.key)}
                disabled={!a.live}
                className="relative flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap"
                style={isActive
                  ? { backgroundColor: "rgba(96,165,250,0.15)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.25)" }
                  : { color: "#475569", border: "1px solid transparent", cursor: a.live ? "pointer" : "default" }
                }
              >
                <span>{a.icon}</span>
                <span className="hidden sm:inline">{a.label}</span>
                <span className="sm:hidden">{a.label.split(" ")[0]}</span>
                {a.live && isActive && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                )}
                {!a.live && (
                  <span
                    className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded"
                    style={{ backgroundColor: "rgba(96,165,250,0.08)", color: "#334155" }}
                  >
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Coming soon state for non-live assets ── */}
        {!ASSETS.find((a) => a.key === assetType)?.live ? (
          <div
            className="rounded-2xl p-12 text-center"
            style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.1)" }}
          >
            <div className="text-4xl mb-4">{ASSETS.find((a) => a.key === assetType)?.icon}</div>
            <h3 className="text-lg font-black text-white mb-2">
              {ASSETS.find((a) => a.key === assetType)?.label} — Coming Soon
            </h3>
            <p className="text-sm" style={{ color: "#475569" }}>
              We&apos;re actively building this bot. Join the waitlist to get early access.
            </p>
            <a
              href="/"
              className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-105"
              style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
            >
              Join Waitlist
            </a>
          </div>
        ) : loading ? (
          /* loading skeletons for live asset */
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl animate-pulse h-[100px]" style={{ backgroundColor: "#0a1628" }} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <SummaryCard
              label="Running"
              value={`${runningDays} Day${runningDays !== 1 ? "s" : ""}`}
              sub="live bot active"
              icon={<Activity className="w-3.5 h-3.5" />}
              color="#94a3b8"
              badge={{ text: "Live", variant: "live" }}
            />
            <SummaryCard
              label="Starting Capital"
              value={fmtMoney(simState?.startingCapital)}
              sub="initial investment"
              icon={<DollarSign className="w-3.5 h-3.5" />}
              color="#94a3b8"
            />
            <SummaryCard
              label="Current Capital"
              value={fmtMoney(simState?.capital)}
              sub={`${totalReturn >= 0 ? "+" : ""}${fmtMoney((simState?.capital ?? startCap) - startCap)} overall`}
              icon={<DollarSign className="w-3.5 h-3.5" />}
              color={isPositive ? "#34d399" : "#f87171"}
            />
            <SummaryCard
              label="Total Return"
              value={fmtPct(totalReturn)}
              sub={`across ${runningDays} day${runningDays !== 1 ? "s" : ""}`}
              icon={isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              color={isPositive ? "#34d399" : "#f87171"}
            />
            <SummaryCard
              label="Monthly Return"
              value={fmtPct(monthlyPnl.pct)}
              sub={monthlyIsProjected ? `at current ${runningDays}d rate` : "this calendar month"}
              icon={monthlyPnl.pct >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              color={monthlyPnl.pct >= 0 ? "#34d399" : "#f87171"}
              badge={monthlyIsProjected ? { text: "Projected", variant: "projected" } : undefined}
            />
            <SummaryCard
              label="Annual Return"
              value={fmtPct(yearlyPnl.pct)}
              sub={yearlyIsProjected ? `at current ${runningDays}d rate` : "actual 12-month"}
              icon={yearlyPnl.pct >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              color={yearlyPnl.pct >= 0 ? "#34d399" : "#f87171"}
              badge={yearlyIsProjected ? { text: "Projected", variant: "projected" } : { text: "Actual", variant: "actual" }}
            />
          </div>
        )}

        {/* ── Chart + Performance Panel — same side-by-side as simulator ── */}
        {ASSETS.find((a) => a.key === assetType)?.live && !loading && closedTrades.length >= 2 && (
          <div className="flex flex-col lg:flex-row gap-3 items-stretch">
            <div className="flex-1 min-w-0">
              <EquityCurve trades={trades} startingCapital={startCap} />
            </div>
            <div className="lg:w-72 xl:w-80 shrink-0 flex flex-col">
              <PerformanceMetricsPanel metrics={metrics} />
            </div>
          </div>
        )}

        {/* ── Methodology ── */}
        <div className="border-t pt-14 sm:pt-20" style={{ borderColor: "rgba(148,163,184,0.08)" }}>
          <div className="text-center mb-14 sm:mb-16">
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight mb-4">
              How it{" "}
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #93c5fd)" }}>
                works
              </span>
            </h2>
            <p className="text-base sm:text-lg max-w-xl mx-auto leading-relaxed" style={{ color: "#94a3b8" }}>
              Every trade follows a strict, rule-based playbook. No improvisation. No emotions.
            </p>
          </div>

          {/* Trade execution */}
          <SectionLabel>Trade Execution</SectionLabel>
          <div className="grid sm:grid-cols-2 gap-5 sm:gap-6 mb-14 sm:mb-16">
            <MethodCard icon={Target} title="Stop Loss — Capital Protection First">
              <Bullet>Every position has a Stop Loss set <strong className="text-white">at the moment of entry</strong> — no exceptions.</Bullet>
              <Bullet>SL is placed at a technically significant level, not an arbitrary percentage, so it reflects genuine market structure.</Bullet>
              <Bullet>If SL is triggered, the position is fully closed and capital is preserved for the next opportunity.</Bullet>
            </MethodCard>
            <MethodCard icon={TrendingUp} title="Trailing Stop Loss — Lock In Gains">
              <Bullet>Once a trade moves in our favour past a defined threshold, the SL automatically <strong className="text-white">trails the price</strong>.</Bullet>
              <Bullet>This locks in profit progressively — you can never give back more than a small portion of an open gain.</Bullet>
              <Bullet>Trailing is based on market structure, not a fixed trailing distance, so it adapts to volatility.</Bullet>
            </MethodCard>
            <MethodCard icon={Zap} title="TP1 — Lock In & De-Risk">
              <Bullet>When price hits <strong className="text-white">TP1</strong>, we close <strong className="text-white">20% of the position</strong> — securing a small, guaranteed profit immediately.</Bullet>
              <Bullet>The SL is then moved to the <strong className="text-white">cost price (breakeven)</strong> — the trade can no longer result in a loss, no matter what happens next.</Bullet>
              <Bullet>The remaining <strong className="text-white">80%</strong> continues to run with zero downside risk.</Bullet>
            </MethodCard>
            <MethodCard icon={CheckCircle2} title="TP2, TP3 & Trailing SL — Let Winners Run">
              <Bullet>TP2 and TP3 are <strong className="text-white">reference levels</strong>, not partial exits — when price reaches them, we know momentum is strong and tighten the trailing SL.</Bullet>
              <Bullet>The trailing SL <strong className="text-white">follows the price upward</strong>, locking in more profit with every move in our favour.</Bullet>
              <Bullet>The remaining 80% is closed when the trailing SL is eventually triggered — capturing as much of the move as possible.</Bullet>
            </MethodCard>
          </div>

          {/* Risk management */}
          <SectionLabel>Risk Management</SectionLabel>
          <div className="grid sm:grid-cols-2 gap-5 sm:gap-6 mb-14 sm:mb-16">
            <MethodCard icon={Shield} title="Position Sizing — Never Risk the House">
              <Bullet>Each trade risks <strong className="text-white">1% of current capital</strong> by default. During a confirmed win streak, this steps up to <strong className="text-white">1.5%</strong> — still small, just leaning into momentum.</Bullet>
              <Bullet>Because we use compounding risk (% of current balance, not a fixed dollar), position sizes automatically shrink as capital dips and grow as it rises.</Bullet>
              <Bullet>At 1% risk per trade, it would take roughly <strong className="text-white">460 consecutive losses</strong> to approach zero — a scenario that has never come close to occurring. Even after 100 straight losses, capital would still be ~36% intact.</Bullet>
              <Bullet>Every drawdown in our history has recovered. The math is designed so that <strong className="text-white">staying committed</strong> is the most powerful edge a user has — though past behaviour is not a promise of future outcomes.</Bullet>
            </MethodCard>
            <MethodCard icon={Lock} title="Leverage — Controlled, Not Reckless">
              <Bullet>We use leverage to amplify <strong className="text-white">signal efficiency</strong>, not to chase bigger bets.</Bullet>
              <Bullet>Leverage is capped at <strong className="text-white">10×</strong>. With our 1% position sizing, a stop-loss hit represents a <strong className="text-white">small, defined loss</strong> — not a wipeout.</Bullet>
              <Bullet>The distance from entry to stop loss is always wider than the liquidation price — <strong className="text-white">liquidation cannot happen on a normal SL-triggering move</strong>.</Bullet>
            </MethodCard>
            <MethodCard icon={AlertTriangle} title="Funding Rate Awareness">
              <Bullet>In perpetual futures, open positions pay or receive <strong className="text-white">funding every 8 hours</strong>.</Bullet>
              <Bullet>We monitor funding rates in real time. When funding becomes extreme, it signals an overcrowded trade — a potential reversal.</Bullet>
              <Bullet>High funding on a long = we avoid adding. Extremely negative funding = we look for long entries, not shorts.</Bullet>
            </MethodCard>
            <MethodCard icon={TrendingDown} title="Liquidation Protection">
              <Bullet>Our position sizing ensures the SL is always triggered <strong className="text-white">long before</strong> the liquidation price is reached.</Bullet>
              <Bullet>We use <strong className="text-white">isolated margin</strong> on every trade — the bot sets this automatically before placing any order. Your full account balance is never at risk from a single position.</Bullet>
              <Bullet>In the event of a flash crash, the position closes at the next available price — but liquidation risk is <strong className="text-white">structurally eliminated by design</strong>.</Bullet>
            </MethodCard>
          </div>

          {/* Market intelligence */}
          <SectionLabel>Market Intelligence</SectionLabel>
          <div className="grid sm:grid-cols-3 gap-5 sm:gap-6 mb-14 sm:mb-16">
            <MethodCard icon={BarChart3} title="Order Blocks">
              <Bullet>Order blocks are zones where large institutional orders were previously filled, leaving a footprint in price action.</Bullet>
              <Bullet>Price often returns to these zones to retest them. We use order blocks to identify <strong className="text-white">high-probability entry zones</strong>.</Bullet>
              <Bullet>Entering at an order block means a tighter SL — better risk-reward on every trade.</Bullet>
            </MethodCard>
            <MethodCard icon={Zap} title="Liquidation Heatmaps">
              <Bullet>Exchanges track where leveraged positions will be force-closed, creating <strong className="text-white">liquidity clusters</strong> at predictable price levels.</Bullet>
              <Bullet>Large players push price into these zones to trigger liquidations and fill their own orders.</Bullet>
              <Bullet>We map these zones in advance, avoiding obvious liquidation cluster stops.</Bullet>
            </MethodCard>
            <MethodCard icon={TrendingUp} title="Funding Rate Signals">
              <Bullet>Funding rate is a real-time measure of sentiment. Extreme funding = the crowd is likely wrong.</Bullet>
              <Bullet>We use extreme funding readings as a <strong className="text-white">contrarian filter</strong> — avoiding trades that align with an overly crowded side.</Bullet>
              <Bullet>Normal or negative funding supports long bias. Extreme positive funding signals caution.</Bullet>
            </MethodCard>
          </div>

          {/* What we don't publish */}
          <div
            className="rounded-2xl p-7 sm:p-9 mb-14"
            style={{ backgroundColor: "rgba(96,165,250,0.04)", border: "1px solid rgba(96,165,250,0.1)" }}
          >
            <h3 className="text-base sm:text-lg font-bold text-white mb-3">What we don&apos;t publish</h3>
            <p className="text-sm sm:text-[15px] leading-relaxed" style={{ color: "#94a3b8" }}>
              The specific signal logic — which indicators, which thresholds, which combinations trigger an entry — is our core IP.
              Publishing it would let anyone replicate (and front-run) the strategy, degrading performance for all users.
              What you see above is <strong className="text-white">everything that matters to you as a capital allocator</strong>:
              how risk is managed, what the real numbers look like, and exactly what the system does when things go right or wrong.
            </p>
          </div>

          {/* CTA */}
          <div className="text-center pb-10">
            <p className="text-base mb-6" style={{ color: "#94a3b8" }}>Ready to let FreedomBot trade for you?</p>
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 h-14 px-10 rounded-2xl font-bold text-base text-white transition-all hover:scale-105"
              style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)", boxShadow: "0 8px 30px rgba(59,130,246,0.35)" }}
            >
              <Rocket className="h-5 w-5" />
              Deploy Your Bot
            </Link>
            <p className="text-sm mt-4" style={{ color: "#64748b" }}>
              Takes less than 5 minutes · No withdrawal access required · Free to start
            </p>
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="py-8 border-t" style={{ borderColor: "rgba(90,140,220,0.08)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-70">
            <Image src="/freedombot/icon.png" alt="FreedomBot.ai" width={24} height={24} className="rounded-lg object-contain" />
            <span className="text-xs font-bold" style={{ color: "#334155" }}>freedombot.ai</span>
          </Link>
          <p className="text-[11px]" style={{ color: "#1e3a5f" }}>
            &copy; {new Date().getFullYear()} FreedomBot.ai · Trading involves risk. Past performance does not guarantee future results.
          </p>
        </div>
      </footer>
    </div>
  );
}
