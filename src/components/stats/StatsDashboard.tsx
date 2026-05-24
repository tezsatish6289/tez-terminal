"use client";

/**
 * StatsDashboard — extracted from /simulation into its own component so the
 * operations cockpit (/simulation) and the performance dashboard (/stats)
 * can evolve independently.
 *
 * Single responsibility: render headline P&L, fund-value chart and risk
 * ratios for one asset type. Owns its own data fetching, bot-source filter
 * state, and counterfactual recompute — drop it into any page.
 *
 * Source of truth for headline numbers is exactly the same path that
 * /freedombot/performance uses (perf-data API + buildEquityCurve), so
 * everything reconciles across pages.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  DollarSign,
  IndianRupee,
  Loader2,
  Shield,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFirestore, useUser, useDoc, useMemoFirebase } from "@/firebase";
import { doc } from "firebase/firestore";
import { EquityChart } from "@/components/charts/EquityChart";
import { StatsBotTabs } from "@/components/stats/StatsBotTabs";
import {
  matchesBotSource,
  type BotSourceFilter as BotSourceFilterValue,
} from "@/lib/bot-source-filter";
import {
  type SimTrade,
  type SimulatorState,
  getSimStateDocId,
} from "@/lib/simulator";
import { buildEquityCurve } from "@/lib/equity-curve";
import {
  calcPerformanceMetrics,
  annualizeReturn,
  compoundReturnOverPeriod,
  MIN_DAYS_FOR_RELIABLE_ANNUALIZATION,
} from "@/lib/performance-metrics";
import type { PerformanceMetrics } from "@/lib/performance-metrics";
import { formatDrawdownValue } from "@/lib/metric-insight-config";
import { botSourceLabel } from "@/lib/bot-source-filter";
import { StatsSocialShareCard } from "@/components/stats/StatsSocialShareCard";
import { RiskRatioDrilldowns } from "@/components/stats/RiskRatioDrilldowns";

// ── Formatting helpers (mirrored from /simulation so the two pages
//    cannot drift apart). Intentionally local — these are presentation
//    concerns and don't belong in a shared lib.

// Defensive against null/undefined/NaN — server stats can omit fields
// (e.g. legacy trades) and unguarded .toFixed crashes the page.
function formatMoney(val: number | null | undefined, cs: string): string {
  if (val == null || !Number.isFinite(val)) {
    return cs === "₹" ? "₹0.00" : "$0.00";
  }
  if (cs === "₹") {
    return `₹${val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${val.toFixed(2)}`;
}

function formatPct(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "0.00%";
  const sign = val >= 0 ? "+" : "";
  return `${sign}${val.toFixed(2)}%`;
}

// ── Card subcomponents (lifted verbatim from /simulation so the visual
//    treatment is identical to what users already know).

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
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60">{label}</span>
      </div>
      <div className={cn("text-2xl font-black tabular-nums leading-none", color)}>{value}</div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {sub && (
          <span className={cn(
            "text-[10px]",
            subTone === "warn" ? "text-amber-400/90 font-semibold" : "text-muted-foreground/50",
          )}>
            {sub}
          </span>
        )}
        {badge && (
          <span className={cn(
            "text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full",
            badge.variant === "projected" ? "bg-amber-500/15 text-amber-400" :
            badge.variant === "live"      ? "bg-emerald-500/15 text-emerald-400" :
                                            "bg-white/[0.05] text-muted-foreground/60"
          )}>
            {badge.text}
          </span>
        )}
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/55">{label}</span>
      <span className={cn("text-xl font-mono font-bold", color)}>{value}</span>
      {sub && <span className="text-[10px] text-muted-foreground/50">{sub}</span>}
    </div>
  );
}

function PerformanceMetricsPanel({
  trades,
  startingCapital,
  assetType,
}: {
  trades: SimTrade[];
  startingCapital: number;
  assetType: string;
}) {
  const metrics = useMemo(
    () => calcPerformanceMetrics(
      trades,
      startingCapital,
      assetType === "INDIAN_STOCKS" ? 0.065 : 0,
    ),
    [trades, startingCapital, assetType],
  );

  if (!metrics) return null;

  const fmt = (n: number, dp = 2) => {
    if (!isFinite(n)) return "∞";
    const sign = n >= 0 ? "+" : "";
    return `${sign}${n.toFixed(dp)}`;
  };

  const ratioColor = (n: number) =>
    !isFinite(n) || n >= 1.5
      ? "text-emerald-400"
      : n >= 0.5
      ? "text-amber-400"
      : "text-rose-400";

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 flex flex-col gap-3 h-full">
      <div className="flex items-center justify-between flex-wrap gap-1">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-accent" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/75">
            Performance
          </span>
        </div>
        <span className="text-[9px] text-muted-foreground/50">
          {metrics.tradingDays}d · annualised
        </span>
      </div>

      <div className="flex flex-col gap-2 flex-1">
        <MetricTile
          label="Sharpe Ratio"
          value={fmt(metrics.sharpeRatio)}
          sub="Higher › 1 is good"
          color={ratioColor(metrics.sharpeRatio)}
        />
        <MetricTile
          label="Sortino Ratio"
          value={fmt(metrics.sortinoRatio)}
          sub="Downside-adjusted"
          color={ratioColor(metrics.sortinoRatio)}
        />
        <MetricTile
          label="Calmar Ratio"
          value={fmt(metrics.calmarRatio)}
          sub="Return / Max DD"
          color={ratioColor(metrics.calmarRatio)}
        />
        <MetricTile
          label="Max Drawdown"
          value={formatDrawdownValue(metrics.maxDrawdownPct)}
          sub="Peak-to-trough (closed)"
          color={
            metrics.maxDrawdownPct < 15
              ? "text-emerald-400"
              : metrics.maxDrawdownPct < 30
              ? "text-amber-400"
              : "text-rose-400"
          }
        />
      </div>

      <p className="text-[10px] text-muted-foreground/45 leading-relaxed">
        Based on <span className="text-muted-foreground/65 font-semibold">closed trades only</span>. Ratios are annualised.
        {assetType === "INDIAN_STOCKS" ? " Risk-free: 6.5% RBI." : " Risk-free: 0% (crypto)."}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export interface StatsDashboardProps {
  assetType: "CRYPTO" | "INDIAN_STOCKS";
  /** LinkedIn screenshot layout — FreedomBot branded card only */
  shareView?: boolean;
}

export function StatsDashboard({ assetType, shareView = false }: StatsDashboardProps) {
  const cs = assetType === "INDIAN_STOCKS" ? "₹" : "$";
  const { user } = useUser();
  const firestore = useFirestore();

  // Sim state (Firestore subscription — same source as /simulation).
  const stateRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, "config", getSimStateDocId(assetType));
  }, [firestore, user, assetType]);
  const { data: stateData, isLoading: stateLoading } = useDoc(stateRef);
  const simState = stateData as SimulatorState | null;

  // Full closed-trade history (perf-data API — same source as
  // /freedombot/performance so the chart matches the public page).
  const [allClosedTrades, setAllClosedTrades] = useState<SimTrade[]>([]);
  const [tradesLoading, setTradesLoading] = useState(true);
  useEffect(() => {
    setTradesLoading(true);
    setAllClosedTrades([]);
    fetch(`/api/freedombot/perf-data?assetType=${assetType}`)
      .then((r) => r.json())
      .then((d) => {
        const trades: SimTrade[] = (d.trades ?? []).filter(
          (t: { status?: string }) => t.status === "CLOSED",
        );
        setAllClosedTrades(trades);
      })
      .catch(() => { /* leave empty — UI shows the placeholder */ })
      .finally(() => setTradesLoading(false));
  }, [assetType]);

  // Server stats for the authoritative "running days" reading (uses
  // earliest daily_metrics date rather than the earliest trade).
  const [serverStats, setServerStats] = useState<{ runningDays?: number } | null>(null);
  useEffect(() => {
    if (assetType !== "CRYPTO") { setServerStats(null); return; }
    fetch(`/api/freedombot/stats`)
      .then((r) => r.json())
      .then((d) => { if (d.startingCapital != null) setServerStats(d); })
      .catch(() => {});
  }, [assetType]);

  // Bot-source filter — drives EVERY metric on this page, including the
  // headline cards (counterfactual per-bot view).
  const [botSourceFilter, setBotSourceFilter] = useState<BotSourceFilterValue>("ALL");
  const botSourcePredicate = useMemo(() => matchesBotSource(botSourceFilter), [botSourceFilter]);
  const isBotFiltered = botSourceFilter !== "ALL";

  const filteredClosedTrades = useMemo(
    () => allClosedTrades.filter(botSourcePredicate),
    [allClosedTrades, botSourcePredicate],
  );

  // Shared equity-curve calc → drives chart, headline capital, AND keeps
  // both perfectly reconciled. Same helper used by /simulation,
  // /freedombot/performance, /freedombot/records.
  const equityCurve = useMemo(
    () => buildEquityCurve(filteredClosedTrades, simState?.startingCapital ?? 0),
    [filteredClosedTrades, simState?.startingCapital],
  );
  const { finalCapital: closedEquity } = equityCurve;

  const derivedCapital = useMemo(() => {
    if (!simState) return 0;
    if (tradesLoading || allClosedTrades.length === 0) {
      return simState.capital ?? simState.startingCapital;
    }
    return closedEquity;
  }, [simState, allClosedTrades.length, tradesLoading, closedEquity]);

  const totalReturn = simState
    ? ((derivedCapital - simState.startingCapital) / simState.startingCapital) * 100
    : 0;

  const runningDays = useMemo(() => {
    if (serverStats?.runningDays) return serverStats.runningDays;
    if (!filteredClosedTrades.length) return 0;
    const earliest = filteredClosedTrades.reduce((a, b) =>
      new Date(a.openedAt).getTime() < new Date(b.openedAt).getTime() ? a : b,
    );
    return Math.max(
      1,
      Math.ceil((Date.now() - new Date(earliest.openedAt).getTime()) / 86_400_000),
    );
  }, [serverStats, filteredClosedTrades]);

  // Monthly: actual when >30 days, else compounded projection from CAGR.
  const monthlyPnl = useMemo(() => {
    if (!simState || runningDays === 0) return { pct: 0, isProjected: true };
    if (runningDays >= 30 && filteredClosedTrades.length > 0) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthNet = filteredClosedTrades.reduce((sum, t) => {
        if (!t.closedAt || new Date(t.closedAt) < monthStart) return sum;
        return sum + (t.realizedPnl ?? 0);
      }, 0);
      return { pct: (monthNet / simState.startingCapital) * 100, isProjected: false };
    }
    const totalReturnDecimal = (derivedCapital - simState.startingCapital) / simState.startingCapital;
    return {
      pct: compoundReturnOverPeriod(totalReturnDecimal, runningDays, 30) * 100,
      isProjected: true,
    };
  }, [simState, runningDays, filteredClosedTrades, derivedCapital]);

  // Annualised: actual when >365 days, else CAGR projection.
  const yearlyPnl = useMemo(() => {
    if (!simState || runningDays === 0) {
      return { pct: 0, isProjected: true, isReliable: false };
    }
    const totalReturnDecimal = (derivedCapital - simState.startingCapital) / simState.startingCapital;
    if (runningDays >= 365) {
      return { pct: totalReturnDecimal * 100, isProjected: false, isReliable: true };
    }
    return {
      pct: annualizeReturn(totalReturnDecimal, runningDays) * 100,
      isProjected: true,
      isReliable: runningDays >= MIN_DAYS_FOR_RELIABLE_ANNUALIZATION,
    };
  }, [simState, runningDays, derivedCapital]);

  const riskMetrics: PerformanceMetrics | null = useMemo(
    () =>
      simState && filteredClosedTrades.length > 0
        ? calcPerformanceMetrics(
            filteredClosedTrades,
            simState.startingCapital,
            assetType === "INDIAN_STOCKS" ? 0.065 : 0,
          )
        : null,
    [filteredClosedTrades, simState, assetType],
  );

  const pnlUsd = simState ? derivedCapital - simState.startingCapital : 0;

  const shareBotSubtitle =
    isBotFiltered && botSourceFilter !== "ALL"
      ? botSourceLabel(botSourceFilter)
      : undefined;

  if (stateLoading || tradesLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-6 w-6 animate-spin text-accent/50" />
      </div>
    );
  }

  if (!simState) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
        <Activity className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm font-bold text-muted-foreground/50">Simulator not started yet</p>
        <p className="text-[11px] text-muted-foreground/30 mt-1">
          Stats will appear after the first trade closes.
        </p>
      </div>
    );
  }

  if (shareView) {
    return (
      <div className="flex flex-col items-center gap-8 w-full max-w-[1200px]">
        <StatsBotTabs
          value={botSourceFilter}
          onChange={setBotSourceFilter}
          className="w-full"
        />
        {isBotFiltered && (
          <p className="text-sm font-medium text-amber-400/80 text-center -mt-2">
            Share card: {botSourceLabel(botSourceFilter)} (counterfactual view)
          </p>
        )}
        <StatsSocialShareCard
          runningDays={runningDays}
          startingCapital={simState.startingCapital}
          currentCapital={derivedCapital}
          totalReturnPct={totalReturn}
          pnlUsd={pnlUsd}
          monthlyReturnPct={monthlyPnl.pct}
          monthlyIsProjected={monthlyPnl.isProjected}
          yearlyReturnPct={yearlyPnl.pct}
          yearlyIsProjected={yearlyPnl.isProjected}
          sharpeRatio={riskMetrics?.sharpeRatio ?? null}
          botSubtitle={shareBotSubtitle}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <StatsBotTabs value={botSourceFilter} onChange={setBotSourceFilter} />

      {/* Headline cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <SummaryCard
          label="Running"
          value={`${runningDays} Day${runningDays !== 1 ? "s" : ""}`}
          sub="simulator active"
          icon={<Activity className="w-3.5 h-3.5" />}
          color="text-muted-foreground/70"
          badge={{ text: "Live", variant: "live" }}
        />
        <SummaryCard
          label="Starting Capital"
          value={formatMoney(simState.startingCapital, cs)}
          sub="initial investment"
          icon={assetType === "INDIAN_STOCKS" ? <IndianRupee className="w-3.5 h-3.5" /> : <DollarSign className="w-3.5 h-3.5" />}
          color="text-muted-foreground/70"
        />
        <SummaryCard
          label="Current Capital"
          value={formatMoney(derivedCapital, cs)}
          sub={`${derivedCapital - simState.startingCapital >= 0 ? "+" : ""}${formatMoney(derivedCapital - simState.startingCapital, cs)} overall`}
          icon={assetType === "INDIAN_STOCKS" ? <IndianRupee className="w-3.5 h-3.5" /> : <DollarSign className="w-3.5 h-3.5" />}
          color={derivedCapital >= simState.startingCapital ? "text-positive" : "text-negative"}
        />
        <SummaryCard
          label="Total Return"
          value={formatPct(totalReturn)}
          sub={`across ${runningDays} day${runningDays !== 1 ? "s" : ""}`}
          icon={totalReturn >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          color={totalReturn >= 0 ? "text-positive" : "text-negative"}
        />
        <SummaryCard
          label="Monthly Return"
          value={formatPct(monthlyPnl.pct)}
          sub={monthlyPnl.isProjected ? `compounded from ${runningDays}-day live performance` : "this calendar month"}
          icon={monthlyPnl.pct >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          color={monthlyPnl.pct >= 0 ? "text-positive" : "text-negative"}
          badge={monthlyPnl.isProjected ? { text: "Projected", variant: "projected" } : undefined}
        />
        <SummaryCard
          label="Annualized Return"
          value={formatPct(yearlyPnl.pct)}
          sub={
            yearlyPnl.isProjected
              ? (yearlyPnl.isReliable
                  ? `compounded from ${runningDays}-day live performance`
                  : "Short track record — annualized metrics may be volatile")
              : "actual 12-month"
          }
          subTone={yearlyPnl.isProjected && !yearlyPnl.isReliable ? "warn" : "muted"}
          icon={yearlyPnl.pct >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          color={yearlyPnl.pct >= 0 ? "text-positive" : "text-negative"}
          badge={yearlyPnl.isProjected ? { text: "Projected", variant: "projected" } : { text: "Actual", variant: "actual" }}
        />
      </div>

      {/* Equity curve + risk ratios side-by-side */}
      <div className="flex flex-col lg:flex-row gap-5 items-stretch">
        <div className="flex-1 min-w-0">
          <EquityChart
            trades={filteredClosedTrades}
            startingCapital={simState.startingCapital}
            cs={cs}
            theme="white"
          />
        </div>
        <div className="lg:w-72 xl:w-80 shrink-0 flex flex-col">
          <PerformanceMetricsPanel
            trades={filteredClosedTrades}
            startingCapital={simState.startingCapital}
            assetType={assetType}
          />
        </div>
      </div>

      <RiskRatioDrilldowns
        trades={filteredClosedTrades}
        startingCapital={simState.startingCapital}
        assetType={assetType}
      />
    </div>
  );
}
