"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Activity,
  DollarSign,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Shield,
  CheckCircle2,
} from "lucide-react";
import { EquityChart } from "@/components/charts/EquityChart";
import { format } from "date-fns";
import {
  calcPerformanceMetrics,
  annualizeReturn,
  compoundReturnOverPeriod,
  MIN_DAYS_FOR_RELIABLE_ANNUALIZATION,
} from "@/lib/performance-metrics";
import type { PerformanceMetrics } from "@/lib/performance-metrics";
import { buildEquityCurve } from "@/lib/equity-curve";
import { BotSourceFilter } from "@/components/dashboard/BotSourceFilter";
import { matchesBotSource, type BotSourceFilter as BotSourceFilterValue } from "@/lib/bot-source-filter";

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
  capitalAfter: number | null;
  closeReason: string | null;
  openedAt: string;
  closedAt: string | null;
  // Same structure the simulator uses — required for accurate PnL
  events: TradeEvent[];
  /** Bot origin tag — null/missing on legacy + pattern trades, non-null
   *  on zone-bot trades. Drives the bot-source filter pills below. */
  botSource?: string | null;
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
  label, value, sub, subTone = "muted", badge, color, icon,
}: {
  label: string;
  value: string;
  sub?: string;
  subTone?: "muted" | "warn";
  badge?: { text: string; variant: "projected" | "actual" | "live" };
  color: string;
  icon: React.ReactNode;
}) {
  const badgeStyle =
    badge?.variant === "projected" ? { backgroundColor: "rgba(251,191,36,0.15)", color: "#fbbf24" } :
    badge?.variant === "live"      ? { backgroundColor: "rgba(34,197,94,0.15)",  color: "#22c55e" } :
                                     { backgroundColor: "rgba(255,255,255,0.05)", color: "#64748b" };

  const subStyle = subTone === "warn"
    ? { color: "#fbbf24", fontWeight: 600 as const }
    : { color: "#475569" };

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
        {sub && <span className="text-[10px]" style={subStyle}>{sub}</span>}
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

// ─── EquityCurve — delegates to shared EquityChart component ─────────────────

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── Simulator state type ─────────────────────────────────────────────────────

interface SimState {
  capital: number;
  startingCapital: number;
}

type AssetKey = "CRYPTO" | "BTC" | "ETH" | "SOL" | "XRP";

// Fallback running-days calc from trade openedAt (used when stats API is unavailable)
function useFallbackRunningDays(openTrades: ApiTrade[], closedTrades: ApiTrade[]) {
  return useMemo(() => {
    const all = [...openTrades, ...closedTrades];
    if (!all.length) return 0;
    const earliest = all.reduce((a, b) =>
      new Date(a.openedAt ?? 0).getTime() < new Date(b.openedAt ?? 0).getTime() ? a : b
    );
    return Math.max(1, Math.ceil((Date.now() - new Date(earliest.openedAt ?? 0).getTime()) / 86_400_000));
  }, [openTrades, closedTrades]);
}

const ASSETS: { key: AssetKey; label: string; icon: string; logo?: string; live: boolean; cs: string }[] = [
  { key: "CRYPTO", label: "Crypto Bot",   icon: "₿",  live: true,  cs: "$" },
  { key: "BTC",    label: "Bitcoin Bot",  icon: "BTC", logo: "/freedombot/coins/btc.png", live: false, cs: "$" },
  { key: "ETH",    label: "Ethereum Bot", icon: "ETH", logo: "/freedombot/coins/eth.png", live: false, cs: "$" },
  { key: "SOL",    label: "Solana Bot",   icon: "SOL", logo: "/freedombot/coins/sol.png", live: false, cs: "$" },
  { key: "XRP",    label: "XRP Bot",      icon: "XRP", logo: "/freedombot/coins/xrp.png", live: false, cs: "$" },
];

export default function PerformancePage() {
  const [assetType, setAssetType] = useState<AssetKey>("CRYPTO");
  const [simState,  setSimState]  = useState<SimState | null>(null);
  const [trades,    setTrades]    = useState<ApiTrade[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [statsData, setStatsData] = useState<{
    currentCapital: number;
    totalReturnPct: number;
    profitPerMonth: number | null;
    profitPerMonthIsActual: boolean;
    profitPerYear: number | null;
    runningDays: number;
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    setSimState(null);
    setTrades([]);
    setStatsData(null);
    // Fetch chart/metrics data and headline stats in parallel
    Promise.all([
      fetch(`/api/freedombot/perf-data?assetType=${assetType}`).then((r) => r.json()),
      assetType === "CRYPTO"
        ? fetch(`/api/freedombot/stats`).then((r) => r.json())
        : Promise.resolve(null),
    ])
      .then(([perfData, stats]) => {
        if (perfData.state)  setSimState(perfData.state as SimState);
        if (perfData.trades) setTrades(perfData.trades as ApiTrade[]);
        if (stats?.startingCapital != null) setStatsData(stats);
      })
      .finally(() => setLoading(false));
  }, [assetType]);

  const cs = ASSETS.find((a) => a.key === assetType)?.cs ?? "$";

  // Bot-source filter (PR #6). "ALL" mirrors the actual shared-capital
  // numbers we get from /api/freedombot/stats. Per-bot filters render
  // a counterfactual ("if only this bot ran from start") so the user can
  // race bots head-to-head.
  const [botSourceFilter, setBotSourceFilter] = useState<BotSourceFilterValue>("ALL");
  const botSourcePredicate = useMemo(() => matchesBotSource(botSourceFilter), [botSourceFilter]);
  const isBotFiltered = botSourceFilter !== "ALL";

  const openTrades   = useMemo(
    () => trades.filter((t) => t.status === "OPEN").filter(botSourcePredicate),
    [trades, botSourcePredicate],
  );
  const closedTrades = useMemo(
    () => trades.filter((t) => t.status === "CLOSED").filter(botSourcePredicate),
    [trades, botSourcePredicate],
  );

  const startCap = simState?.startingCapital ?? 1000;

  // ── Headline metrics — derived from the SAME shared equity-curve helper
  // as /simulation. derivedCapital === chart's last point === latest history
  // row's balance, by construction.
  const equityCurve = useMemo(
    () => buildEquityCurve(closedTrades, startCap),
    [closedTrades, startCap],
  );
  const closedEquity = equityCurve.finalCapital;

  const derivedCapital = useMemo(() => {
    if (closedTrades.length === 0) {
      // Per-bot view with no trades yet → starting capital (the
      // counterfactual baseline). For "All" with no trades, fall back
      // to the live ledger so the headline still reads sensibly.
      if (isBotFiltered) return startCap;
      return statsData?.currentCapital ?? simState?.capital ?? startCap;
    }
    return closedEquity;
  }, [closedTrades.length, closedEquity, statsData, simState, startCap, isBotFiltered]);

  const fallbackRunningDays = useFallbackRunningDays(openTrades, closedTrades);
  const runningDays = statsData?.runningDays ?? fallbackRunningDays;

  const totalReturn = startCap > 0 ? ((derivedCapital - startCap) / startCap) * 100 : 0;

  const monthlyPnl = useMemo(() => {
    if (!simState || runningDays === 0) return { pct: 0, isProjected: true };
    if (runningDays >= 30 && closedTrades.length > 0) {
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const monthNet = closedTrades.reduce((sum, t) => {
        if (!t.closedAt || new Date(t.closedAt) < monthStart) return sum;
        return sum + (t.realizedPnl ?? 0);
      }, 0);
      return { pct: (monthNet / simState.startingCapital) * 100, isProjected: false };
    }
    const totalReturnDecimal = startCap > 0 ? (derivedCapital - startCap) / startCap : 0;
    return {
      pct: compoundReturnOverPeriod(totalReturnDecimal, runningDays, 30) * 100,
      isProjected: true,
    };
  }, [simState, derivedCapital, startCap, runningDays, closedTrades]);

  // Annualised return — CAGR shared with calcPerformanceMetrics so Calmar /
  // Sharpe / Sortino and this headline tile stay in lockstep.
  const yearlyPnl = useMemo(() => {
    if (!simState || runningDays === 0) {
      return { pct: 0, isProjected: true, isReliable: false };
    }
    const totalReturnDecimal = startCap > 0 ? (derivedCapital - startCap) / startCap : 0;
    if (runningDays >= 365) {
      return { pct: totalReturnDecimal * 100, isProjected: false, isReliable: true };
    }
    return {
      pct: annualizeReturn(totalReturnDecimal, runningDays) * 100,
      isProjected: true,
      isReliable: runningDays >= MIN_DAYS_FOR_RELIABLE_ANNUALIZATION,
    };
  }, [simState, derivedCapital, startCap, runningDays]);

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
    <div className="min-h-screen font-sans antialiased overflow-x-hidden" style={{ backgroundColor: "#080f1e", color: "#f0f4ff" }}>

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
        <div className="w-full overflow-x-auto pb-1">
        <div className="flex items-center gap-0 rounded-xl p-1 w-fit mx-auto"
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
                {a.logo ? (
                  <div className="h-4 w-4 rounded-full bg-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                    <Image src={a.logo} alt={a.icon} width={14} height={14} className="object-contain rounded-full" />
                  </div>
                ) : (
                  <span>{a.icon}</span>
                )}
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
        </div>

        {/* ── Coming soon state for non-live assets ── */}
        {!ASSETS.find((a) => a.key === assetType)?.live ? (
          <div
            className="rounded-2xl p-12 text-center"
            style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.1)" }}
          >
            {(() => {
              const asset = ASSETS.find((a) => a.key === assetType);
              return asset?.logo ? (
                <div className="h-14 w-14 rounded-full bg-white/5 flex items-center justify-center overflow-hidden mx-auto mb-4">
                  <Image src={asset.logo} alt={asset.icon} width={48} height={48} className="object-contain rounded-full" />
                </div>
              ) : (
                <div className="text-4xl mb-4">{asset?.icon}</div>
              );
            })()}
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
              value={fmtMoney(derivedCapital)}
              sub={`${totalReturn >= 0 ? "+" : ""}${fmtMoney(derivedCapital - startCap)} overall`}
              icon={<DollarSign className="w-3.5 h-3.5" />}
              color={totalReturn >= 0 ? "#34d399" : "#f87171"}
            />
            <SummaryCard
              label="Total Return"
              value={fmtPct(totalReturn)}
              sub={`across ${runningDays} day${runningDays !== 1 ? "s" : ""}`}
              icon={totalReturn >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              color={totalReturn >= 0 ? "#34d399" : "#f87171"}
            />
            <SummaryCard
              label="Monthly Return"
              value={fmtPct(monthlyPnl.pct)}
              sub={monthlyIsProjected ? `compounded from ${runningDays}-day live performance` : "this calendar month"}
              icon={monthlyPnl.pct >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              color={monthlyPnl.pct >= 0 ? "#34d399" : "#f87171"}
              badge={monthlyIsProjected ? { text: "Projected", variant: "projected" } : undefined}
            />
            <SummaryCard
              label="Annualized Return"
              value={fmtPct(yearlyPnl.pct)}
              sub={
                yearlyIsProjected
                  ? (yearlyPnl.isReliable
                      ? `compounded from ${runningDays}-day live performance`
                      : "Short track record — annualized metrics may be volatile")
                  : "actual 12-month"
              }
              subTone={yearlyIsProjected && !yearlyPnl.isReliable ? "warn" : "muted"}
              icon={yearlyPnl.pct >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              color={yearlyPnl.pct >= 0 ? "#34d399" : "#f87171"}
              badge={yearlyIsProjected ? { text: "Projected", variant: "projected" } : { text: "Actual", variant: "actual" }}
            />
          </div>
        )}

        {/* ── Bot-source filter — only meaningful on live assets ── */}
        {ASSETS.find((a) => a.key === assetType)?.live && !loading && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <BotSourceFilter value={botSourceFilter} onChange={setBotSourceFilter} />
            {isBotFiltered && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border" style={{ color: "#fbbf24", borderColor: "rgba(251,191,36,0.25)", backgroundColor: "rgba(251,191,36,0.06)" }}>
                Counterfactual — &ldquo;if only this bot ran from start&rdquo;
              </span>
            )}
          </div>
        )}

        {/* ── Chart + Performance Panel — same side-by-side as simulator ── */}
        {ASSETS.find((a) => a.key === assetType)?.live && !loading && closedTrades.length >= 2 && (
          <div className="flex flex-col lg:flex-row gap-3 items-stretch">
            <div className="flex-1 min-w-0">
              <EquityChart
                trades={closedTrades}
                startingCapital={startCap}
                cs="$"
                theme="blue"
              />
            </div>
            <div className="lg:w-72 xl:w-80 shrink-0 flex flex-col">
              <PerformanceMetricsPanel metrics={metrics} />
            </div>
          </div>
        )}

        {/* ── Methodology CTA ── */}
        <div
          className="rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          style={{ backgroundColor: "rgba(96,165,250,0.04)", border: "1px solid rgba(96,165,250,0.1)" }}
        >
          <div>
            <p className="font-bold text-white mb-1">
              What we promise is not profit —{" "}
              <span style={{ color: "#60a5fa" }}>we promise transparency and control.</span>
            </p>
            <p className="text-sm" style={{ color: "#475569" }}>
              Entry rules, stop-loss logic, position sizing — fully documented.
            </p>
          </div>
          <Link
            href="/methodology"
            className="flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap transition-colors hover:text-blue-300"
            style={{ color: "#60a5fa" }}
          >
            Methodology →
          </Link>
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
