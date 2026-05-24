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
  BarChart3,
  DollarSign,
  IndianRupee,
  Loader2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFirestore, useUser, useDoc, useMemoFirebase } from "@/firebase";
import { doc } from "firebase/firestore";
import { EquityChart } from "@/components/charts/EquityChart";
import { MonthlyReturnCharts } from "@/components/charts/MonthlyReturnCharts";
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
import { botSourceLabel } from "@/lib/bot-source-filter";
import { StatsSocialShareCard } from "@/components/stats/StatsSocialShareCard";
import { RiskRatioDrilldowns } from "@/components/stats/RiskRatioDrilldowns";
import { PerformanceMetricsPanel } from "@/components/stats/PerformanceMetricsPanel";
import {
  DASHBOARD_SECTION_INNER,
  DASHBOARD_SECTION_STACK,
} from "@/components/stats/dashboard-section-spacing";
import {
  brandMetricColor,
  BRAND_LIVE_BADGE,
} from "@/lib/chart-brand-colors";
import {
  runningDaysForStatsFilter,
  startingCapitalForStatsFilter,
  type ZoneSimStatesMap,
} from "@/lib/stats-dashboard-capital";
import type { PublicBotFlags } from "@/lib/public-bot-flags";

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
            badge.variant === "live"      ? BRAND_LIVE_BADGE :
                                            "bg-white/[0.05] text-muted-foreground/60"
          )}>
            {badge.text}
          </span>
        )}
      </div>
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
  const [zoneSimStates, setZoneSimStates] = useState<ZoneSimStatesMap>({});
  const [publicBotFlags, setPublicBotFlags] = useState<PublicBotFlags | null>(null);
  const [tradesLoading, setTradesLoading] = useState(true);
  useEffect(() => {
    if (!user) return;
    setTradesLoading(true);
    setAllClosedTrades([]);
    void (async () => {
      try {
        const token = await user.getIdToken();
        const r = await fetch(`/api/freedombot/perf-data?assetType=${assetType}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await r.json();
        const trades: SimTrade[] = (d.trades ?? []).filter(
          (t: { status?: string }) => t.status === "CLOSED",
        );
        setAllClosedTrades(trades);
        if (d.zoneSimStates) setZoneSimStates(d.zoneSimStates);
        if (d.publicBotFlags) setPublicBotFlags(d.publicBotFlags);
      } catch {
        /* leave empty — UI shows the placeholder */
      } finally {
        setTradesLoading(false);
      }
    })();
  }, [assetType, user]);

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

  const effectiveStartingCapital = useMemo(
    () => startingCapitalForStatsFilter(botSourceFilter, simState, zoneSimStates),
    [botSourceFilter, simState, zoneSimStates],
  );

  // Shared equity-curve calc → drives chart, headline capital, AND keeps
  // both perfectly reconciled. Same helper used by /simulation,
  // /freedombot/performance, /freedombot/records.
  const equityCurve = useMemo(
    () => buildEquityCurve(filteredClosedTrades, effectiveStartingCapital),
    [filteredClosedTrades, effectiveStartingCapital],
  );
  const { finalCapital: closedEquity } = equityCurve;

  const derivedCapital = useMemo(() => {
    if (!simState) return 0;
    if (tradesLoading) return effectiveStartingCapital;
    if (isBotFiltered) return closedEquity;
    if (allClosedTrades.length === 0) {
      return simState.capital ?? simState.startingCapital;
    }
    return closedEquity;
  }, [
    simState,
    allClosedTrades.length,
    tradesLoading,
    closedEquity,
    isBotFiltered,
    effectiveStartingCapital,
  ]);

  const totalReturn =
    effectiveStartingCapital > 0
      ? ((derivedCapital - effectiveStartingCapital) / effectiveStartingCapital) * 100
      : 0;

  const runningDays = useMemo(
    () =>
      runningDaysForStatsFilter(
        botSourceFilter,
        serverStats?.runningDays,
        filteredClosedTrades,
      ),
    [botSourceFilter, serverStats?.runningDays, filteredClosedTrades],
  );

  const closedTradeCount = filteredClosedTrades.length;
  const lowSample = isBotFiltered && closedTradeCount < 8;

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
      return { pct: (monthNet / effectiveStartingCapital) * 100, isProjected: false };
    }
    const totalReturnDecimal =
      (derivedCapital - effectiveStartingCapital) / effectiveStartingCapital;
    return {
      pct: compoundReturnOverPeriod(totalReturnDecimal, runningDays, 30) * 100,
      isProjected: true,
    };
  }, [simState, runningDays, filteredClosedTrades, derivedCapital, effectiveStartingCapital]);

  // Annualised: actual when >365 days, else CAGR projection.
  const yearlyPnl = useMemo(() => {
    if (!simState || runningDays === 0) {
      return { pct: 0, isProjected: true, isReliable: false };
    }
    const totalReturnDecimal =
      (derivedCapital - effectiveStartingCapital) / effectiveStartingCapital;
    if (runningDays >= 365) {
      return { pct: totalReturnDecimal * 100, isProjected: false, isReliable: true };
    }
    return {
      pct: annualizeReturn(totalReturnDecimal, runningDays) * 100,
      isProjected: true,
      isReliable: runningDays >= MIN_DAYS_FOR_RELIABLE_ANNUALIZATION,
    };
  }, [simState, runningDays, derivedCapital, effectiveStartingCapital]);

  const riskMetrics: PerformanceMetrics | null = useMemo(
    () =>
      simState && filteredClosedTrades.length > 0
        ? calcPerformanceMetrics(
            filteredClosedTrades,
            effectiveStartingCapital,
            assetType === "INDIAN_STOCKS" ? 0.065 : 0,
          )
        : null,
    [filteredClosedTrades, effectiveStartingCapital, assetType],
  );

  const pnlUsd = derivedCapital - effectiveStartingCapital;

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
          publicBotFlags={publicBotFlags ?? undefined}
        />
        {isBotFiltered && (
          <p className="text-sm font-medium text-amber-400/80 text-center -mt-2">
            Share card: {botSourceLabel(botSourceFilter)} (internal simulator view)
          </p>
        )}
        <StatsSocialShareCard
          runningDays={runningDays}
          startingCapital={effectiveStartingCapital}
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
    <div className="space-y-6 sm:space-y-8">
      <StatsBotTabs
        value={botSourceFilter}
        onChange={setBotSourceFilter}
        publicBotFlags={publicBotFlags ?? undefined}
      />

      {isBotFiltered && (
        <div className="text-center space-y-1 -mt-2">
          <p className="text-[11px] text-muted-foreground/50">
            Internal only — {botSourceLabel(botSourceFilter)} is not published on freedombot.ai yet.
          </p>
          {lowSample && (
            <p className="text-[11px] text-amber-400/85 font-medium">
              Early track record — {closedTradeCount} closed trade
              {closedTradeCount !== 1 ? "s" : ""} so far
              {runningDays > 0 ? ` · ${runningDays} day${runningDays !== 1 ? "s" : ""} of history` : ""}.
              Charts show each closed trade, not every calendar day.
            </p>
          )}
        </div>
      )}

      <div className={DASHBOARD_SECTION_STACK}>
      <section className={DASHBOARD_SECTION_INNER}>
      {/* Headline cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <SummaryCard
          label="Running"
          value={`${runningDays} Day${runningDays !== 1 ? "s" : ""}`}
          sub={
            isBotFiltered
              ? `${closedTradeCount} closed trade${closedTradeCount !== 1 ? "s" : ""}`
              : "simulator active"
          }
          icon={<Activity className="w-3.5 h-3.5" />}
          color="text-muted-foreground/70"
          badge={{ text: "Live", variant: "live" }}
        />
        <SummaryCard
          label="Starting Capital"
          value={formatMoney(effectiveStartingCapital, cs)}
          sub="initial investment"
          icon={assetType === "INDIAN_STOCKS" ? <IndianRupee className="w-3.5 h-3.5" /> : <DollarSign className="w-3.5 h-3.5" />}
          color="text-muted-foreground/70"
        />
        <SummaryCard
          label="Current Capital"
          value={formatMoney(derivedCapital, cs)}
          sub={`${pnlUsd >= 0 ? "+" : ""}${formatMoney(pnlUsd, cs)} overall`}
          icon={assetType === "INDIAN_STOCKS" ? <IndianRupee className="w-3.5 h-3.5" /> : <DollarSign className="w-3.5 h-3.5" />}
          color={brandMetricColor(derivedCapital >= effectiveStartingCapital)}
        />
        <SummaryCard
          label="Total Return"
          value={formatPct(totalReturn)}
          sub={`across ${runningDays} day${runningDays !== 1 ? "s" : ""}`}
          icon={totalReturn >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          color={brandMetricColor(totalReturn >= 0)}
        />
        <SummaryCard
          label="Monthly Return"
          value={formatPct(monthlyPnl.pct)}
          sub={monthlyPnl.isProjected ? `compounded from ${runningDays}-day live performance` : "this calendar month"}
          icon={monthlyPnl.pct >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          color={brandMetricColor(monthlyPnl.pct >= 0)}
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
          color={brandMetricColor(yearlyPnl.pct >= 0)}
          badge={yearlyPnl.isProjected ? { text: "Projected", variant: "projected" } : { text: "Actual", variant: "actual" }}
        />
      </div>

      {/* Equity curve + risk ratios side-by-side */}
      <div className="flex flex-col lg:flex-row gap-5 items-stretch">
        <div className="flex-1 min-w-0">
          {closedTradeCount >= 2 ? (
            <EquityChart
              trades={filteredClosedTrades}
              startingCapital={effectiveStartingCapital}
              cs={cs}
              theme="white"
            />
          ) : (
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-8 text-center h-full min-h-[280px] flex flex-col items-center justify-center gap-2">
              <BarChart3 className="w-8 h-8 text-muted-foreground/25" />
              <p className="text-sm font-bold text-muted-foreground/55">Fund value chart</p>
              <p className="text-[11px] text-muted-foreground/45 max-w-sm">
                {closedTradeCount === 0
                  ? "No closed trades for this bot yet. Stats will populate after the first position fully closes."
                  : "Need at least 2 closed trades to draw the equity curve. Tradewise view plots one point per close."}
              </p>
            </div>
          )}
        </div>
        <div className="lg:w-72 xl:w-80 shrink-0 flex flex-col">
          <PerformanceMetricsPanel
            trades={filteredClosedTrades}
            startingCapital={effectiveStartingCapital}
            assetType={assetType}
          />
        </div>
      </div>
      </section>

      <MonthlyReturnCharts
        trades={filteredClosedTrades}
        startingCapital={effectiveStartingCapital}
        cs={cs}
        theme="white"
      />

      <RiskRatioDrilldowns
        trades={filteredClosedTrades}
        startingCapital={effectiveStartingCapital}
        assetType={assetType}
      />
      </div>
    </div>
  );
}
