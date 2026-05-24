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
  CheckCircle2,
} from "lucide-react";
import { EquityChart } from "@/components/charts/EquityChart";
import { MonthlyReturnCharts } from "@/components/charts/MonthlyReturnCharts";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  annualizeReturn,
  compoundReturnOverPeriod,
  MIN_DAYS_FOR_RELIABLE_ANNUALIZATION,
} from "@/lib/performance-metrics";
import { buildEquityCurve } from "@/lib/equity-curve";
import { PublicBotTabs } from "@/components/freedombot/PublicBotTabs";
import { usePublicBots } from "@/hooks/use-public-bots";
import type { CryptoBotId } from "@/lib/crypto-bots";
import { tradeMatchesSelectedPublicBot } from "@/lib/public-bot-flags";
import { RiskRatioDrilldowns } from "@/components/stats/RiskRatioDrilldowns";
import { PerformanceMetricsPanel } from "@/components/stats/PerformanceMetricsPanel";
import {
  DASHBOARD_SECTION_INNER,
  DASHBOARD_SECTION_STACK,
} from "@/components/stats/dashboard-section-spacing";
import type { SimTrade } from "@/lib/simulator";

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

/** Same width + card treatment as /stats (StatsDashboard). */
const DASHBOARD_SHELL = "max-w-[1200px] mx-auto w-full px-4 sm:px-6";

function SummaryCard({
  label,
  value,
  sub,
  subTone = "muted",
  badge,
  color,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  subTone?: "muted" | "warn";
  badge?: { text: string; variant: "projected" | "actual" | "live" };
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 flex flex-col gap-2 hover:bg-white/[0.04] transition-colors">
      <div className="flex items-center gap-1.5">
        <span className={cn("opacity-60", color)}>{icon}</span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">
          {label}
        </span>
      </div>
      <div className={cn("text-2xl font-black tabular-nums leading-none", color)}>{value}</div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {sub && (
          <span
            className={cn(
              "text-[10px]",
              subTone === "warn" ? "text-amber-400/90 font-semibold" : "text-muted-foreground/50",
            )}
          >
            {sub}
          </span>
        )}
        {badge && (
          <span
            className={cn(
              "text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full",
              badge.variant === "projected"
                ? "bg-amber-500/15 text-amber-400"
                : badge.variant === "live"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-white/[0.05] text-muted-foreground/60",
            )}
          >
            {badge.text}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── Simulator state type ─────────────────────────────────────────────────────

interface SimState {
  capital: number;
  startingCapital: number;
}

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

export default function PerformancePage() {
  const { bots, flags, defaultBotId, loading: publicBotsLoading } = usePublicBots();
  const [selectedBotId, setSelectedBotId] = useState<CryptoBotId>("crypto");

  useEffect(() => {
    if (!publicBotsLoading) setSelectedBotId(defaultBotId);
  }, [defaultBotId, publicBotsLoading]);

  const selectedBot = bots.find((b) => b.id === selectedBotId);
  const selectedIsLive = selectedBot?.publicLive ?? false;
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
      fetch(`/api/freedombot/perf-data?assetType=CRYPTO`).then((r) => r.json()),
      fetch(`/api/freedombot/stats`).then((r) => r.json()),
    ])
      .then(([perfData, stats]) => {
        if (perfData.state)  setSimState(perfData.state as SimState);
        if (perfData.trades) setTrades(perfData.trades as ApiTrade[]);
        if (stats?.startingCapital != null) setStatsData(stats);
      })
      .finally(() => setLoading(false));
  }, []);

  const cs = "$";

  const matchesSelected = useMemo(
    () => (t: ApiTrade) => tradeMatchesSelectedPublicBot(t, selectedBotId, flags),
    [selectedBotId, flags],
  );

  const openTrades   = useMemo(
    () => trades.filter((t) => t.status === "OPEN").filter(matchesSelected),
    [trades, matchesSelected],
  );
  const closedTrades = useMemo(
    () => trades.filter((t) => t.status === "CLOSED").filter(matchesSelected),
    [trades, matchesSelected],
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
      if (selectedBotId === "crypto") {
        return statsData?.currentCapital ?? simState?.capital ?? startCap;
      }
      return startCap;
    }
    return closedEquity;
  }, [closedTrades.length, closedEquity, statsData, simState, startCap, selectedBotId]);

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

  const monthlyIsProjected = monthlyPnl.isProjected;
  const yearlyIsProjected  = yearlyPnl.isProjected;

  return (
    <div className="min-h-screen font-sans antialiased overflow-x-hidden" style={{ backgroundColor: "#080f1e", color: "#f0f4ff" }}>

      <main className={cn(DASHBOARD_SHELL, "py-8 space-y-6")}>

        {/* ── Hero header ── */}
        <div className="text-center py-4 sm:py-8 space-y-4">
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
        </div>

        {/* ── Bot selector (matches /stats layout) ── */}
        {!publicBotsLoading && bots.length > 0 && (
          <PublicBotTabs
            bots={bots}
            selectedId={selectedBotId}
            onSelect={setSelectedBotId}
          />
        )}

        {/* ── Coming soon for bots not publicLive ── */}
        {!selectedIsLive ? (
          <div
            className="rounded-2xl p-12 text-center"
            style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.1)" }}
          >
            {selectedBot?.logo ? (
              <div className="h-14 w-14 rounded-full bg-white/5 flex items-center justify-center overflow-hidden mx-auto mb-4">
                <Image src={selectedBot.logo} alt={selectedBot.shortLabel} width={48} height={48} className="object-contain rounded-full" />
              </div>
            ) : (
              <div className="text-4xl mb-4">{selectedBot?.icon ?? "₿"}</div>
            )}
            <h3 className="text-lg font-black text-white mb-2">
              {selectedBot?.label ?? "Bot"} — Coming Soon
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
        ) : loading || publicBotsLoading ? (
          <div className="space-y-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl animate-pulse h-[100px]" style={{ backgroundColor: "#0a1628" }} />
              ))}
            </div>
          </div>
        ) : (
          <div className={DASHBOARD_SECTION_STACK}>
          <section className={DASHBOARD_SECTION_INNER}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <SummaryCard
              label="Running"
              value={`${runningDays} Day${runningDays !== 1 ? "s" : ""}`}
              sub="live bot active"
              icon={<Activity className="w-3.5 h-3.5" />}
              color="text-muted-foreground/70"
              badge={{ text: "Live", variant: "live" }}
            />
            <SummaryCard
              label="Starting Capital"
              value={fmtMoney(simState?.startingCapital)}
              sub="initial investment"
              icon={<DollarSign className="w-3.5 h-3.5" />}
              color="text-muted-foreground/70"
            />
            <SummaryCard
              label="Current Capital"
              value={fmtMoney(derivedCapital)}
              sub={`${totalReturn >= 0 ? "+" : ""}${fmtMoney(derivedCapital - startCap)} overall`}
              icon={<DollarSign className="w-3.5 h-3.5" />}
              color={totalReturn >= 0 ? "text-positive" : "text-negative"}
            />
            <SummaryCard
              label="Total Return"
              value={fmtPct(totalReturn)}
              sub={`across ${runningDays} day${runningDays !== 1 ? "s" : ""}`}
              icon={totalReturn >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              color={totalReturn >= 0 ? "text-positive" : "text-negative"}
            />
            <SummaryCard
              label="Monthly Return"
              value={fmtPct(monthlyPnl.pct)}
              sub={monthlyIsProjected ? `compounded from ${runningDays}-day live performance` : "this calendar month"}
              icon={monthlyPnl.pct >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              color={monthlyPnl.pct >= 0 ? "text-positive" : "text-negative"}
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
              color={yearlyPnl.pct >= 0 ? "text-positive" : "text-negative"}
              badge={yearlyIsProjected ? { text: "Projected", variant: "projected" } : { text: "Actual", variant: "actual" }}
            />
          </div>

        {closedTrades.length >= 2 && (
          <>
            <div className="flex flex-col lg:flex-row gap-5 items-stretch">
              <div className="flex-1 min-w-0">
                <EquityChart
                  trades={closedTrades}
                  startingCapital={startCap}
                  cs="$"
                  theme="white"
                />
              </div>
              <div className="lg:w-72 xl:w-80 shrink-0 flex flex-col">
                <PerformanceMetricsPanel
                  trades={closedTrades as SimTrade[]}
                  startingCapital={startCap}
                  assetType="CRYPTO"
                />
              </div>
            </div>
            <p className="text-center pt-2">
              <Link
                href="/records"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground/55 transition-colors hover:text-accent"
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                Every trade is permanently recorded on the Solana blockchain — verify independently →
              </Link>
            </p>
          </>
        )}
          </section>

        {closedTrades.length >= 2 && (
          <MonthlyReturnCharts
            trades={closedTrades}
            startingCapital={startCap}
            cs="$"
            theme="white"
          />
        )}

        <RiskRatioDrilldowns
          trades={closedTrades as SimTrade[]}
          startingCapital={startCap}
          assetType="CRYPTO"
        />
          </div>
        )}

        {/* ── Methodology CTA (public promise — kept on this page only) ── */}
        <div
          className="rounded-2xl p-8 sm:p-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mt-12 sm:mt-16"
          style={{ backgroundColor: "rgba(96,165,250,0.04)", border: "1px solid rgba(96,165,250,0.1)" }}
        >
          <div className="space-y-3 max-w-2xl">
            <p className="text-base sm:text-lg font-bold text-white leading-relaxed">
              What we promise is not profit —{" "}
              <span style={{ color: "#60a5fa" }}>we promise transparency and control.</span>
            </p>
            <p className="text-sm sm:text-base leading-relaxed" style={{ color: "#475569" }}>
              Entry rules, stop-loss logic, position sizing — fully documented.
            </p>
          </div>
          <Link
            href="/methodology"
            className="flex items-center gap-1.5 text-sm sm:text-base font-semibold whitespace-nowrap transition-colors hover:text-blue-300 shrink-0"
            style={{ color: "#60a5fa" }}
          >
            Methodology →
          </Link>
        </div>

      </main>

      {/* Footer */}
      <footer className="py-8 border-t" style={{ borderColor: "rgba(90,140,220,0.08)" }}>
        <div className={cn(DASHBOARD_SHELL, "flex flex-col sm:flex-row items-center justify-between gap-3")}>
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
