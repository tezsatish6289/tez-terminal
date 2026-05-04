"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import {
  useUser,
  useFirestore,
  useCollection,
  useDoc,
  useMemoFirebase,
} from "@/firebase";
import { collection, query, orderBy, limit, where, doc } from "firebase/firestore";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  IndianRupee,
  Activity,
  Shield,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Filter,
  X,
  XCircle,
  Link2,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PatternBadge, type PatternType } from "@/components/ui/pattern-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { SimulatorState, SimTrade, SimLog, SimTradeEvent } from "@/lib/simulator";
import { getSimStateDocId } from "@/lib/simulator";
import { SimulatorParamsDialog } from "@/components/simulator/SimulatorParamsDialog";
import { HeatmapAutoSwitch } from "@/components/simulator/HeatmapAutoSwitch";
import { NiftyAutoSwitch } from "@/components/simulator/NiftyAutoSwitch";
import { format, startOfDay, startOfWeek, startOfMonth, isAfter } from "date-fns";
import { calcPerformanceMetrics } from "@/lib/performance-metrics";

function formatMoney(val: number, cs = "$"): string {
  if (cs === "₹") {
    return `₹${val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${val.toFixed(2)}`;
}

function formatPct(val: number): string {
  const sign = val >= 0 ? "+" : "";
  return `${sign}${val.toFixed(2)}%`;
}

function formatTimeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const tfLabelMap: Record<string, string> = { "5": "5m", "15": "15m", "60": "1h", "240": "4h", "D": "1D" };

function formatPrice(val: number | null | undefined): string {
  if (val == null || val === 0) return "—";
  if (val >= 100) return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val >= 1) return val.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return val.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

export default function SimulationPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const [assetType, setAssetType] = useState<"CRYPTO" | "INDIAN_STOCKS">("CRYPTO");
  const [tab, setTab] = useState<"overview" | "trades" | "logs">("overview");
  const [selectedTrade, setSelectedTrade] = useState<SimTrade | null>(null);
  const cs = assetType === "INDIAN_STOCKS" ? "₹" : "$";


  const stateRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, "config", getSimStateDocId(assetType));
  }, [firestore, user, assetType]);
  const { data: stateData, isLoading: stateLoading } = useDoc(stateRef);
  const simState = stateData as SimulatorState | null;

  // OPEN trades — small set (5–20 docs), updated every minute by the cron.
  // No orderBy so no composite index is required; client sorts if needed.
  const openTradesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "simulator_trades"),
      where("status", "==", "OPEN"),
    );
  }, [firestore, user]);
  const { data: rawOpenTrades, isLoading: openTradesLoading } = useCollection(openTradesQuery);

  // CLOSED trades — filtered by assetType server-side so each tab only receives
  // its own trades. No limit: we need the full history to reconstruct the equity
  // curve accurately. Requires composite index: status + assetType + openedAt DESC.
  const closedTradesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "simulator_trades"),
      where("status", "==", "CLOSED"),
      where("assetType", "==", assetType),
      orderBy("openedAt", "desc"),
    );
  }, [firestore, user, assetType]);
  const { data: rawClosedTrades, isLoading: closedTradesLoading } = useCollection(closedTradesQuery);

  const logsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "simulator_logs"),
      orderBy("timestamp", "desc"),
      limit(200),
    );
  }, [firestore, user]);
  const { data: rawLogs, isLoading: logsLoading } = useCollection(logsQuery);

  const openTrades = useMemo(() => {
    return (rawOpenTrades ?? [])
      .map((d: any) => ({ id: d.id, ...d } as SimTrade))
      .filter((t) => (t.assetType || "CRYPTO") === assetType);
  }, [rawOpenTrades, assetType]);

  const closedTrades = useMemo(() => {
    return (rawClosedTrades ?? [])
      .map((d: any) => ({ id: d.id, ...d } as SimTrade))
      .filter((t) => (t.assetType || "CRYPTO") === assetType);
  }, [rawClosedTrades, assetType]);

  const logs = useMemo(() => {
    if (!rawLogs) return [];
    return rawLogs
      .map((d: any) => d as SimLog)
      .filter((l) => (l.assetType || "CRYPTO") === assetType);
  }, [rawLogs, assetType]);

  const isLoading = stateLoading || openTradesLoading || closedTradesLoading || logsLoading;

  const totalReturn = simState ? ((simState.capital - simState.startingCapital) / simState.startingCapital) * 100 : 0;

  // Running days — from first trade's openedAt to today
  const runningDays = useMemo(() => {
    // Combine open + the 200 most-recent closed trades to find the earliest loaded trade.
    // For projections this is accurate enough; simState.startingCapital anchors the P&L math.
    const all = [...openTrades, ...closedTrades];
    if (!all.length) return 0;
    const earliest = all.reduce((a, b) =>
      new Date(a.openedAt).getTime() < new Date(b.openedAt).getTime() ? a : b
    );
    return Math.max(1, Math.ceil((Date.now() - new Date(earliest.openedAt).getTime()) / 86_400_000));
  }, [openTrades, closedTrades]);

  // Monthly P&L % — actual this-calendar-month if running >= 30 days, else projected
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
    // Project from actual daily rate to 30 days
    return { pct: ((netPnl / runningDays) * 30 / simState.startingCapital) * 100, isProjected: true };
  }, [simState, runningDays, closedTrades]);

  // Yearly P&L % — projected if running < 365 days, actual if >= 365
  const yearlyPnl = useMemo(() => {
    if (!simState || runningDays === 0) return { pct: 0, isProjected: true };
    const netPnl = simState.capital - simState.startingCapital;
    const annualPnl = runningDays >= 365 ? netPnl : (netPnl / runningDays) * 365;
    return { pct: (annualPnl / simState.startingCapital) * 100, isProjected: runningDays < 365 };
  }, [simState, runningDays]);

  const [forceClosing, setForceClosing] = useState<string | null>(null);

  const handleForceClose = useCallback(async (trade: SimTrade) => {
    if (!user || !trade.id || forceClosing) return;
    setForceClosing(trade.id);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/sim/force-close", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ simTradeId: trade.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(`Force close failed: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      alert(`Force close failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setForceClosing(null);
    }
  }, [user, forceClosing]);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.replace("/");
    }
  }, [isUserLoading, user, router]);

  if (isUserLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <main className="flex-1 flex flex-col min-w-0">
        <TopBar />

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="max-w-[1400px] mx-auto space-y-4">
            {/* Asset type selector + simulator controls */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              {/* Asset type pills — primary navigation */}
              <div className="flex items-center gap-0 rounded-xl border border-white/[0.08] bg-white/[0.02] p-1 w-fit">
                {([
                  { key: "CRYPTO" as const, label: "Crypto", icon: "₿", fund: "$1,000 USDT" },
                  { key: "INDIAN_STOCKS" as const, label: "Indian Stocks", icon: "₹", fund: "₹1,00,000 INR" },
                ]).map(({ key, label, icon, fund }) => (
                  <button
                    key={key}
                    onClick={() => { setAssetType(key); setTab("overview"); }}
                    className={cn(
                      "relative flex items-center gap-2 px-5 lg:px-6 py-2 lg:py-2.5 rounded-lg text-xs lg:text-sm font-black uppercase tracking-wider transition-all",
                      assetType === key
                        ? "bg-accent text-black shadow-lg shadow-accent/25"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]",
                    )}
                  >
                    <span className="text-sm lg:text-base">{icon}</span>
                    <span className="flex flex-col items-start leading-tight">
                      <span>{label}</span>
                      <span className={cn("text-[9px] font-bold tracking-normal normal-case", assetType === key ? "text-black/60" : "text-muted-foreground/40")}>{fund}</span>
                    </span>
                  </button>
                ))}
              </div>

              {/* Simulator controls */}
              <div className="flex items-center gap-2">
                {assetType === "CRYPTO" && <HeatmapAutoSwitch />}
                {assetType === "INDIAN_STOCKS" && <NiftyAutoSwitch />}
                <SimulatorParamsDialog />
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-6 w-6 animate-spin text-accent/50" />
              </div>
            ) : !simState ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
                  <Activity className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm font-bold text-muted-foreground/50">Simulator not started yet</p>
                  <p className="text-[11px] text-muted-foreground/30 mt-1">The simulator will activate when the next AI-passed signal arrives.</p>
                </div>

                {logs.length > 0 && (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">Decision Logs</span>
                      <span className="text-[9px] text-muted-foreground/30">({logs.length})</span>
                    </div>
                    <div className="space-y-1">
                      {logs.map((log, i) => (
                        <LogRow key={i} log={log} cs={cs} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                {/* Stats Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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
                    value={formatMoney(simState.capital, cs)}
                    sub={`${totalReturn >= 0 ? "+" : ""}${formatMoney(simState.capital - simState.startingCapital, cs)} overall`}
                    icon={assetType === "INDIAN_STOCKS" ? <IndianRupee className="w-3.5 h-3.5" /> : <DollarSign className="w-3.5 h-3.5" />}
                    color={simState.capital >= simState.startingCapital ? "text-positive" : "text-negative"}
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
                    sub={monthlyPnl.isProjected ? `at current ${runningDays}d rate` : "this calendar month"}
                    icon={monthlyPnl.pct >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    color={monthlyPnl.pct >= 0 ? "text-positive" : "text-negative"}
                    badge={monthlyPnl.isProjected ? { text: "Projected", variant: "projected" } : undefined}
                  />
                  <SummaryCard
                    label="Annual Return"
                    value={formatPct(yearlyPnl.pct)}
                    sub={yearlyPnl.isProjected ? `at current ${runningDays}d rate` : "actual 12-month"}
                    icon={yearlyPnl.pct >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    color={yearlyPnl.pct >= 0 ? "text-positive" : "text-negative"}
                    badge={yearlyPnl.isProjected ? { text: "Projected", variant: "projected" } : { text: "Actual", variant: "actual" }}
                  />
                </div>

                {/* Chart + Performance Metrics side by side */}
                <div className="flex flex-col lg:flex-row gap-3 items-stretch">
                  <div className="flex-1 min-w-0">
                    <EquityCurve trades={closedTrades} startingCapital={simState.startingCapital} cs={cs} />
                  </div>
                  <div className="lg:w-72 xl:w-80 shrink-0 flex flex-col">
                    <PerformanceMetricsPanel
                      trades={closedTrades}
                      startingCapital={simState.startingCapital}
                      assetType={assetType}
                    />
                  </div>
                </div>

                {/* Streak scaling indicator */}
                {(simState.consecutiveWins ?? 0) >= 2 && (
                  <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-400/10 border border-emerald-400/20">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span className="text-[11px] font-bold text-emerald-400">
                      Streak active — {simState.consecutiveWins} consecutive {simState.streakSide === "BUY" ? "bull" : "bear"} wins → trading up to {simState.currentMaxTrades} concurrent at 1% risk
                    </span>
                  </div>
                )}

                {/* Tabs */}
                <div className="flex items-center gap-1 border-b border-white/[0.06] pb-0">
                  {(["overview", "trades", "logs"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={cn(
                        "px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer border-b-2",
                        tab === t
                          ? "border-accent text-accent"
                          : "border-transparent text-muted-foreground/40 hover:text-muted-foreground"
                      )}
                    >
                      {t === "overview" ? `Open (${openTrades.length})` : t === "trades" ? `History (${closedTrades.length})` : `Logs (${logs.length})`}
                    </button>
                  ))}
                </div>

                {/* Tab Content */}
                {tab === "overview" && (
                  <TradeList trades={openTrades} emptyIcon={<Activity className="w-6 h-6" />} emptyLabel="No open trades" onSelectTrade={setSelectedTrade} onForceClose={handleForceClose} cs={cs} />
                )}

                {tab === "trades" && (
                  <TradeList trades={closedTrades} emptyIcon={<BarChart3 className="w-6 h-6" />} emptyLabel="No closed trades yet" onSelectTrade={setSelectedTrade} cs={cs} />
                )}

                {tab === "logs" && (
                  <div className="space-y-1">
                    {logs.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground/30">
                        <Activity className="w-6 h-6 mx-auto mb-2" />
                        <p className="text-xs font-bold">No logs yet</p>
                      </div>
                    ) : (
                      logs.map((log, i) => (
                        <LogRow key={i} log={log} cs={cs} />
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Trade Narration Dialog */}
      <TradeNarrationDialog trade={selectedTrade} onClose={() => setSelectedTrade(null)} cs={cs} />
    </div>
  );
}

// ── Performance Metrics Panel ─────────────

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
          value={`-${metrics.maxDrawdownPct.toFixed(2)}%`}
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

// ── Equity Curve ──────────────────────────

type ChartView = "trade" | "day";

function EquityCurve({ trades, startingCapital, cs }: { trades: SimTrade[]; startingCapital: number; cs: string }) {
  const [view, setView] = useState<ChartView>("trade");

  // Trade-by-trade: one point per closed trade
  // Reconstructs capital by replaying each trade's events in time order.
  // Entry fee is at events[0].fee; each exit event's pnl is already net of exit fee.
  const tradeData = useMemo(() => {
    const sorted = [...trades]
      .filter((t) => t.closedAt)
      .sort((a, b) => new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime());
    if (!sorted.length) return [];

    const points: { x: string | number; value: number; tooltip: string }[] = [
      { x: 0, value: startingCapital, tooltip: "Start" },
    ];
    let running = startingCapital;
    sorted.forEach((t, i) => {
      const evts = t.events ?? [];
      // Entry fee is in events[0].fee; subsequent events carry net PnL in .pnl
      const entryFee = evts[0]?.fee ?? 0;
      const exitPnl  = evts.slice(1).reduce((s, e) => s + e.pnl, 0);
      running += exitPnl - entryFee;
      points.push({
        x: i + 1,
        value: parseFloat(running.toFixed(2)),
        tooltip: `${t.symbol} · ${format(new Date(t.closedAt!), "MMM dd HH:mm")}`,
      });
    });
    return points;
  }, [trades, startingCapital]);

  // Day-by-day: one point per calendar day
  const dayData = useMemo(() => {
    const sorted = [...trades]
      .filter((t) => t.closedAt)
      .sort((a, b) => new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime());
    if (!sorted.length) return [];

    const dayCapital = new Map<string, number>();
    let running = startingCapital;
    for (const t of sorted) {
      const evts     = t.events ?? [];
      const entryFee = evts[0]?.fee ?? 0;
      const exitPnl  = evts.slice(1).reduce((s, e) => s + e.pnl, 0);
      running += exitPnl - entryFee;
      dayCapital.set(t.closedAt!.slice(0, 10), parseFloat(running.toFixed(2)));
    }

    const points: { x: string; value: number; tooltip: string }[] = [
      { x: "Start", value: startingCapital, tooltip: "Starting capital" },
    ];
    for (const [day, capital] of dayCapital) {
      points.push({ x: format(new Date(day), "MMM dd"), value: capital, tooltip: day });
    }
    return points;
  }, [trades, startingCapital]);

  if (trades.filter((t) => t.closedAt).length < 2) return null;

  const chartData  = view === "trade" ? tradeData : dayData;
  const allValues  = chartData.map((d) => d.value);
  const yMin       = Math.floor(Math.min(...allValues) * 0.995);
  const yMax       = Math.ceil(Math.max(...allValues) * 1.005);

  // Percentage from the TOP of the chart where startingCapital sits.
  // Used to split the gradient: green above the baseline, red below it.
  const splitPct = Math.max(0, Math.min(100,
    yMax === yMin ? 50 : ((yMax - startingCapital) / (yMax - yMin)) * 100,
  ));

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-accent" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/75">Fund Value</span>
        </div>
        {/* View toggle */}
        <div className="flex items-center gap-0.5 rounded-md bg-white/[0.04] p-0.5">
          {(["trade", "day"] as ChartView[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider transition-all",
                view === v
                  ? "bg-accent/20 text-accent"
                  : "text-muted-foreground/55 hover:text-muted-foreground/80"
              )}
            >
              {v === "trade" ? "Tradewise" : "Daywise"}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {chartData.length < 2 ? (
        <div className="text-center py-6 text-muted-foreground/30">
          <p className="text-[10px] font-bold">Not enough data</p>
        </div>
      ) : (
        <div className="h-[340px] sm:h-[440px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                {/* Stroke: green above baseline, red below */}
                <linearGradient id="equityStroke" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={`${splitPct}%`} stopColor="#34d399" />
                  <stop offset={`${splitPct}%`} stopColor="#f87171" />
                </linearGradient>
                {/* Fill: green fade above, red fade below */}
                <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"              stopColor="#34d399" stopOpacity={0.28} />
                  <stop offset={`${splitPct}%`}  stopColor="#34d399" stopOpacity={0.06} />
                  <stop offset={`${splitPct}%`}  stopColor="#f87171" stopOpacity={0.06} />
                  <stop offset="100%"            stopColor="#f87171" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="x"
                tick={{ fontSize: 9, fill: "rgba(255,255,255,0.45)" }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              />
              <YAxis
                domain={[yMin, yMax]}
                tick={{ fontSize: 9, fill: "rgba(255,255,255,0.45)" }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                tickFormatter={(v: number) => `${cs}${cs === "₹" ? Math.round(v).toLocaleString("en-IN") : v.toFixed(0)}`}
                width={cs === "₹" ? 75 : 55}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1a1a1d",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  fontSize: "11px",
                }}
                labelFormatter={(v) => view === "trade" ? (v === 0 ? "Start" : `Trade #${v}`) : String(v)}
                formatter={(value: number, _name: string, props: any) => [
                  formatMoney(value, cs),
                  props.payload.tooltip,
                ]}
              />
              <ReferenceLine
                y={startingCapital}
                stroke="rgba(255,255,255,0.1)"
                strokeDasharray="4 4"
                label={{ value: formatMoney(startingCapital, cs), position: "right", fontSize: 9, fill: "rgba(255,255,255,0.35)" }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="url(#equityStroke)"
                strokeWidth={2}
                fill="url(#equityFill)"
                dot={false}
                activeDot={{ r: 4, fill: "#ffffff", stroke: "#0f0f11", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Shared Components ──────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  badge,
  color,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
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
        {sub && <span className="text-[10px] text-muted-foreground/50">{sub}</span>}
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

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={cn("opacity-50", color)}>{icon}</span>
        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40">{label}</span>
      </div>
      <div className={cn("text-lg font-black tabular-nums", color)}>{value}</div>
    </div>
  );
}

const CLOSE_REASON_MAP: Record<string, { label: string; color: string }> = {
  SL: { label: "SL", color: "bg-rose-500/15 text-rose-400" },
  TRAILING_SL: { label: "SL→BE", color: "bg-rose-500/15 text-rose-400" },
  MARKET_TURN: { label: "Mkt Turn", color: "bg-amber-500/15 text-amber-400" },
  SCORE_DEGRADED: { label: "Score↓", color: "bg-amber-500/15 text-amber-400" },
  PATTERN_BREAK: { label: "Pattern↓", color: "bg-orange-500/15 text-orange-400" },
  TP1: { label: "TP1", color: "bg-emerald-500/15 text-emerald-400" },
  TP2: { label: "TP2", color: "bg-emerald-500/15 text-emerald-400" },
  TP3: { label: "TP3", color: "bg-emerald-500/15 text-emerald-400" },
  KILL_SWITCH: { label: "Closed", color: "bg-violet-500/15 text-violet-400" },
};

function getCloseDisplay(reason: string | null) {
  if (!reason) return { label: "Closed", color: "bg-white/5 text-muted-foreground" };
  return CLOSE_REASON_MAP[reason] ?? { label: reason, color: "bg-white/5 text-muted-foreground" };
}

function getSlDisplay(trade: SimTrade) {
  if (trade.trailingSl != null) {
    const isBuy = trade.side === "BUY";
    const pastTp3 = trade.tp3 != null && (isBuy ? trade.trailingSl > trade.tp3 : trade.trailingSl < trade.tp3);
    if (pastTp3) return { price: trade.trailingSl, label: "Trailing" };
    if (trade.tp3Hit) return { price: trade.trailingSl, label: "Moved to TP2" };
    if (trade.tp2Hit) return { price: trade.trailingSl, label: "Moved to TP1" };
    if (trade.tp1Hit) return { price: trade.trailingSl, label: "Moved to Entry" };
    return { price: trade.trailingSl, label: "Trailing" };
  }
  if (trade.tp3Hit) return { price: trade.stopLoss, label: "Moved to TP2" };
  if (trade.tp2Hit) return { price: trade.stopLoss, label: "Moved to TP1" };
  if (trade.tp1Hit) return { price: trade.stopLoss, label: "Moved to Entry" };
  return { price: trade.stopLoss, label: "Original" };
}

// ── Column filter types & helpers ──────────────────────────────

type SimFilters = {
  symbol: string;
  sides: string[];
  timeframes: string[];
  algos: string[];
  leverages: string[];
  tpLevel: "any" | "none" | "tp1" | "tp2" | "tp3";
  pnl: "all" | "win" | "loss";
  scoreMin: string;
  scoreMax: string;
  statuses: string[];
};
const DEFAULT_SIM_FILTERS: SimFilters = {
  symbol: "", sides: [], timeframes: [], algos: [], leverages: [],
  tpLevel: "any", pnl: "all", scoreMin: "", scoreMax: "", statuses: [],
};
function simActiveCount(f: SimFilters): number {
  return (f.symbol ? 1 : 0) + f.sides.length + f.timeframes.length +
    f.algos.length + f.leverages.length + (f.tpLevel !== "any" ? 1 : 0) +
    (f.pnl !== "all" ? 1 : 0) + ((f.scoreMin || f.scoreMax) ? 1 : 0) + f.statuses.length;
}
function applySimFilters(trades: SimTrade[], f: SimFilters): SimTrade[] {
  return trades.filter((t) => {
    if (f.symbol && !t.symbol.toLowerCase().includes(f.symbol.toLowerCase())) return false;
    if (f.sides.length && !f.sides.includes(t.side)) return false;
    if (f.timeframes.length && !f.timeframes.includes(String(t.timeframe))) return false;
    if (f.algos.length && !f.algos.includes(t.algo || "—")) return false;
    if (f.leverages.length && !f.leverages.includes(String(t.leverage))) return false;
    if (f.tpLevel === "none" && (t.tp1Hit || t.tp2Hit || t.tp3Hit)) return false;
    if (f.tpLevel === "tp1" && !t.tp1Hit) return false;
    if (f.tpLevel === "tp2" && !t.tp2Hit) return false;
    if (f.tpLevel === "tp3" && !t.tp3Hit) return false;
    if (f.pnl === "win" && t.realizedPnl <= 0) return false;
    if (f.pnl === "loss" && t.realizedPnl > 0) return false;
    if (f.scoreMin && t.confidenceScore < Number(f.scoreMin)) return false;
    if (f.scoreMax && t.confidenceScore > Number(f.scoreMax)) return false;
    if (f.statuses.length && !f.statuses.includes(t.closeReason ?? "")) return false;
    return true;
  });
}

// ── Filter UI primitives ──────────────────────────────────────

function ColFilter({ label, isActive, children, width = "w-52" }: {
  label: string; isActive: boolean; children: React.ReactNode; width?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn(
          "flex items-center gap-1.5 cursor-pointer group font-black uppercase tracking-wider rounded px-1 -ml-1 py-0.5 transition-colors",
          isActive
            ? "text-accent bg-accent/10"
            : "text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.05]"
        )}>
          <span className="text-[10px]">{label}</span>
          <Filter className={cn("h-3 w-3 shrink-0", isActive ? "fill-accent/40" : "opacity-50 group-hover:opacity-100")} />
        </button>
      </PopoverTrigger>
      <PopoverContent className={cn(width, "p-0 bg-[#18181b] border-white/[0.08] shadow-2xl")} align="start">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function CheckFilter({ values, selected, onChange, labelMap }: {
  values: string[]; selected: string[];
  onChange: (v: string[]) => void; labelMap?: Record<string, string>;
}) {
  if (!values.length) return <p className="p-3 text-[10px] text-muted-foreground/40 italic">No values</p>;
  return (
    <div className="py-1">
      <div className="max-h-52 overflow-y-auto">
        {values.map((v) => (
          <label key={v} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-white/[0.04] cursor-pointer">
            <Checkbox checked={selected.includes(v)}
              onCheckedChange={(chk) => onChange(chk ? [...selected, v] : selected.filter((s) => s !== v))}
              className="h-3.5 w-3.5 border-white/20" />
            <span className="text-[11px] font-medium text-foreground/80">{labelMap?.[v] ?? v}</span>
          </label>
        ))}
      </div>
      {selected.length > 0 && (
        <div className="border-t border-white/[0.06] px-3 pt-1.5 pb-1.5">
          <button onClick={() => onChange([])} className="text-[10px] text-muted-foreground/50 hover:text-accent">Clear</button>
        </div>
      )}
    </div>
  );
}

function TextSearchFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="p-2.5">
      <Input placeholder="Search…" value={value} onChange={(e) => onChange(e.target.value)}
        className="h-7 text-xs bg-white/[0.04] border-white/[0.08] placeholder:text-muted-foreground/30" />
      {value && (
        <button onClick={() => onChange("")} className="mt-1.5 w-full text-[10px] text-muted-foreground/50 hover:text-accent">Clear</button>
      )}
    </div>
  );
}

function PnlFilterUI({ value, onChange }: { value: "all" | "win" | "loss"; onChange: (v: "all" | "win" | "loss") => void }) {
  return (
    <div className="py-1">
      {([["all", "All trades"], ["win", "Profitable"], ["loss", "Loss"]] as const).map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)}
          className={cn("w-full text-left px-3 py-1.5 text-[11px] font-medium",
            value === v ? "text-accent bg-accent/10" : "text-foreground/60 hover:bg-white/[0.04]")}>
          {label}
        </button>
      ))}
    </div>
  );
}

function TpFilterUI({ value, onChange }: { value: SimFilters["tpLevel"]; onChange: (v: SimFilters["tpLevel"]) => void }) {
  return (
    <div className="py-1">
      {([["any", "Any"], ["none", "No TP hit"], ["tp1", "TP1+"], ["tp2", "TP2+"], ["tp3", "TP3"]] as const).map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)}
          className={cn("w-full text-left px-3 py-1.5 text-[11px] font-medium",
            value === v ? "text-accent bg-accent/10" : "text-foreground/60 hover:bg-white/[0.04]")}>
          {label}
        </button>
      ))}
    </div>
  );
}

function ScoreRangeFilter({ min, max, onMin, onMax }: { min: string; max: string; onMin: (v: string) => void; onMax: (v: string) => void }) {
  return (
    <div className="p-2.5 space-y-2">
      <div>
        <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider mb-1">Min</p>
        <Input value={min} onChange={(e) => onMin(e.target.value)} placeholder="0" type="number"
          className="h-7 text-xs bg-white/[0.04] border-white/[0.08]" />
      </div>
      <div>
        <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider mb-1">Max</p>
        <Input value={max} onChange={(e) => onMax(e.target.value)} placeholder="80" type="number"
          className="h-7 text-xs bg-white/[0.04] border-white/[0.08]" />
      </div>
      {(min || max) && (
        <button onClick={() => { onMin(""); onMax(""); }}
          className="w-full text-[10px] text-muted-foreground/50 hover:text-accent border-t border-white/[0.06] pt-1.5">Clear</button>
      )}
    </div>
  );
}

const PAGE_SIZE = 50;

function Paginator({ page, total, pageSize, onChange, activeClass = "bg-accent/20 text-accent" }: {
  page: number; total: number; pageSize: number; onChange: (p: number) => void; activeClass?: string;
}) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="text-[10px] text-muted-foreground/40">{from}–{to} of {total}</span>
      <div className="flex items-center gap-0.5">
        <button disabled={page === 1} onClick={() => onChange(page - 1)}
          className="h-7 w-7 flex items-center justify-center rounded text-sm font-bold text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.05] disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
          ‹
        </button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`e${i}`} className="h-7 w-6 flex items-center justify-center text-[10px] text-muted-foreground/30">…</span>
          ) : (
            <button key={p} onClick={() => onChange(p as number)}
              className={cn("h-7 min-w-[28px] px-1.5 flex items-center justify-center rounded text-[11px] font-bold transition-colors",
                page === p ? activeClass : "text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.05]")}>
              {p}
            </button>
          )
        )}
        <button disabled={page === totalPages} onClick={() => onChange(page + 1)}
          className="h-7 w-7 flex items-center justify-center rounded text-sm font-bold text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.05] disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
          ›
        </button>
      </div>
    </div>
  );
}

// ── Force-close dialog with safety phrase ────────────────────
const SAFETY_PHRASE = "I am an idiot";

function ForceCloseDialog({ trade, onForceClose, children }: { trade: SimTrade; onForceClose: (t: SimTrade) => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const confirmed = phrase === SAFETY_PHRASE;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setPhrase(""); }}>
      <DialogTrigger asChild onClick={(e) => e.stopPropagation()}>
        {children}
      </DialogTrigger>
      <DialogContent className="bg-[#1a1a1e] border-white/10 max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <XCircle className="w-4 h-4 text-rose-400" /> Force Close Trade
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <p className="text-[12px] text-muted-foreground">
            You are about to force-close{" "}
            <span className="text-white font-bold">{trade.symbol}</span>{" "}
            ({trade.side}) at market price. This will also close any linked live trade on the exchange.
          </p>
          <div className="space-y-2">
            <p className="text-[11px] text-muted-foreground/60">
              Type <span className="font-mono font-bold text-rose-400">"{SAFETY_PHRASE}"</span> to confirm:
            </p>
            <Input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder={SAFETY_PHRASE}
              className="bg-white/[0.03] border-white/10 text-white placeholder:text-muted-foreground/30 font-mono text-[12px]"
              autoFocus
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { setOpen(false); setPhrase(""); }}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!confirmed}
              onClick={() => { onForceClose(trade); setOpen(false); setPhrase(""); }}
              className="bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-30"
            >
              Force Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── TradeList with column filters + pagination ────────────────

function TradeList({ trades, emptyIcon, emptyLabel, onSelectTrade, onForceClose, cs }: { trades: SimTrade[]; emptyIcon: React.ReactNode; emptyLabel: string; onSelectTrade: (t: SimTrade) => void; onForceClose?: (t: SimTrade) => void; cs: string }) {
  const [filters, setFilters] = useState<SimFilters>(DEFAULT_SIM_FILTERS);
  const [page, setPage] = useState(1);
  const setF = <K extends keyof SimFilters>(k: K, v: SimFilters[K]) => {
    setFilters((prev) => ({ ...prev, [k]: v }));
    setPage(1);
  };

  const uSides  = useMemo(() => [...new Set(trades.map((t) => t.side))].sort(), [trades]);
  const uTfs    = useMemo(() => [...new Set(trades.map((t) => String(t.timeframe)))].sort(), [trades]);
  const uAlgos  = useMemo(() => [...new Set(trades.map((t) => t.algo || "—"))].sort(), [trades]);
  const uLevs   = useMemo(() => [...new Set(trades.map((t) => String(t.leverage)))].sort((a, b) => Number(a) - Number(b)), [trades]);
  const uStats  = useMemo(() => [...new Set(trades.map((t) => t.closeReason).filter(Boolean))].sort() as string[], [trades]);
  const filtered  = useMemo(() => applySimFilters(trades, filters), [trades, filters]);
  const paginated = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  const active    = simActiveCount(filters);

  const statusLabelMap = useMemo(() =>
    Object.fromEntries(Object.entries(CLOSE_REASON_MAP).map(([k, v]) => [k, v.label])), []);
  const levLabelMap = useMemo(() =>
    Object.fromEntries(uLevs.map((l) => [l, `${l}×`])), [uLevs]);
  const tfLabelMapFiltered = useMemo(() =>
    Object.fromEntries(uTfs.map((tf) => [tf, tfLabelMap[tf.toUpperCase()] ?? `${tf}m`])), [uTfs]);

  if (trades.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground/30">
        {emptyIcon}
        <p className="text-xs font-bold mt-2">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Active filter bar */}
      {active > 0 && (
        <div className="flex items-center gap-3 px-1">
          <span className="text-[10px] text-muted-foreground/50">{filtered.length} of {trades.length} shown</span>
          <button onClick={() => { setFilters(DEFAULT_SIM_FILTERS); setPage(1); }}
            className="flex items-center gap-1 text-[10px] text-accent/80 hover:text-accent border border-accent/20 rounded px-2 py-0.5">
            <X className="h-2.5 w-2.5" /> Clear {active} filter{active > 1 ? "s" : ""}
          </button>
        </div>
      )}

      {/* Mobile */}
      <div className="lg:hidden space-y-3">
        {paginated.map((trade) => (
          <MobileTradeCard key={trade.id ?? trade.signalId} trade={trade} onSelect={onSelectTrade} onForceClose={onForceClose} cs={cs} />
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-muted-foreground/30">
            <p className="text-xs font-bold">No trades match filters</p>
          </div>
        )}
        {filtered.length > PAGE_SIZE && (
          <div className="bg-card border border-white/5 rounded-lg">
            <Paginator page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
          </div>
        )}
      </div>

      {/* Desktop */}
      <div className="hidden lg:block">
        <div className="bg-card border border-white/5 rounded-t-lg overflow-x-auto">
          <div className="min-w-[1200px]">
            <Table>
              <TableHeader className="bg-card sticky top-0 z-10 shadow-[0_1px_0_rgba(255,255,255,0.05)]">
                <TableRow className="hover:bg-transparent border-white/5">
                  <TableHead className="h-12 w-[130px]">
                    <ColFilter label="Symbol" isActive={!!filters.symbol}>
                      <TextSearchFilter value={filters.symbol} onChange={(v) => setF("symbol", v)} />
                    </ColFilter>
                  </TableHead>
                  <TableHead className="h-12 w-[56px]">
                    <ColFilter label="Side" isActive={filters.sides.length > 0}>
                      <CheckFilter values={uSides} selected={filters.sides} onChange={(v) => setF("sides", v)} />
                    </ColFilter>
                  </TableHead>
                  <TableHead className="h-12 w-[48px]">
                    <ColFilter label="TF" isActive={filters.timeframes.length > 0}>
                      <CheckFilter values={uTfs} selected={filters.timeframes} onChange={(v) => setF("timeframes", v)} labelMap={tfLabelMapFiltered} />
                    </ColFilter>
                  </TableHead>
                  <TableHead className="h-12 w-[80px]">
                    <ColFilter label="Algo" isActive={filters.algos.length > 0}>
                      <CheckFilter values={uAlgos} selected={filters.algos} onChange={(v) => setF("algos", v)} />
                    </ColFilter>
                  </TableHead>
                  <TableHead className="h-12 w-[44px]">
                    <ColFilter label="Lev." isActive={filters.leverages.length > 0}>
                      <CheckFilter values={uLevs} selected={filters.leverages} onChange={(v) => setF("leverages", v)} labelMap={levLabelMap} />
                    </ColFilter>
                  </TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/50 h-12">Entry</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/50 h-12">Current</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/50 h-12">SL</TableHead>
                  <TableHead className="h-12 w-[80px]">
                    <ColFilter label="Targets" isActive={filters.tpLevel !== "any"} width="w-40">
                      <TpFilterUI value={filters.tpLevel} onChange={(v) => setF("tpLevel", v)} />
                    </ColFilter>
                  </TableHead>
                  <TableHead className="h-12">
                    <ColFilter label="Net PNL" isActive={filters.pnl !== "all"} width="w-44">
                      <PnlFilterUI value={filters.pnl} onChange={(v) => setF("pnl", v)} />
                    </ColFilter>
                  </TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/50 h-12">Size</TableHead>
                  <TableHead className="h-12 w-[130px]">
                    <ColFilter label="Score" isActive={!!(filters.scoreMin || filters.scoreMax)} width="w-44">
                      <ScoreRangeFilter min={filters.scoreMin} max={filters.scoreMax} onMin={(v) => setF("scoreMin", v)} onMax={(v) => setF("scoreMax", v)} />
                    </ColFilter>
                  </TableHead>
                  <TableHead className="h-12 w-[80px]">
                    <ColFilter label="Status" isActive={filters.statuses.length > 0}>
                      <CheckFilter values={uStats} selected={filters.statuses} onChange={(v) => setF("statuses", v)} labelMap={statusLabelMap} />
                    </ColFilter>
                  </TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/50 h-12 w-[90px] text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length > 0 ? (
                  paginated.map((trade) => (
                    <DesktopTradeRow key={trade.id ?? trade.signalId} trade={trade} onSelect={onSelectTrade} onForceClose={onForceClose} cs={cs} />
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center py-10 text-muted-foreground/30">
                      <p className="text-xs font-bold">No trades match the current filters</p>
                      <button onClick={() => { setFilters(DEFAULT_SIM_FILTERS); setPage(1); }} className="mt-2 text-[11px] text-accent/70 hover:text-accent">
                        Clear all filters
                      </button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        <div className="bg-card border-x border-b border-white/5 rounded-b-lg">
          <Paginator page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
        </div>
      </div>
    </div>
  );
}

function DesktopTradeRow({ trade, onSelect, onForceClose, cs }: { trade: SimTrade; onSelect: (t: SimTrade) => void; onForceClose?: (t: SimTrade) => void; cs: string }) {
  const isBuy = trade.side === "BUY";
  const isOpen = trade.status === "OPEN";
  const chartLabel = tfLabelMap[String(trade.timeframe).toUpperCase()] ?? `${trade.timeframe}m`;
  const sl = getSlDisplay(trade);
  const closeDisplay = getCloseDisplay(trade.closeReason ?? null);

  return (
    <TableRow className="border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => onSelect(trade)}>
      <TableCell className="py-4">
        <Link href={`/chart/${trade.signalId}`} target="_blank" className="text-sm font-black text-white leading-none uppercase tracking-tighter hover:text-accent transition-colors" onClick={(e) => e.stopPropagation()}>
          {trade.symbol}
        </Link>
      </TableCell>
      <TableCell>
        <Badge className={cn("text-[9px] font-black h-5 uppercase px-2", isBuy ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400")}>
          {trade.side}
        </Badge>
      </TableCell>
      <TableCell className="text-xs font-bold text-muted-foreground uppercase">{chartLabel}</TableCell>
      <TableCell className="text-[10px] font-bold text-muted-foreground/50 uppercase max-w-[70px] truncate">{trade.algo || "—"}</TableCell>
      <TableCell>
        <Badge variant="outline" className="text-[9px] font-black h-5 px-1.5 border-accent/20 text-accent">{trade.leverage}x</Badge>
      </TableCell>
      <TableCell className="font-mono text-xs font-bold text-white/60">{cs}{formatPrice(trade.entryPrice)}</TableCell>
      <TableCell className="font-mono text-xs font-bold text-white">
        {isOpen && trade.currentPrice != null ? `${cs}${formatPrice(trade.currentPrice)}` : "—"}
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-mono text-xs font-bold text-white">{cs}{formatPrice(sl.price)}</span>
          <span className="text-[9px] text-muted-foreground/60">{sl.label}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase">
          {[
            { num: 1, hit: trade.tp1Hit },
            { num: 2, hit: trade.tp2Hit },
            { num: 3, hit: trade.tp3Hit },
          ].map((tp) => {
            const slKilled = !tp.hit && trade.slHit;
            return (
              <span
                key={tp.num}
                className={cn(
                  "relative px-1.5 py-0.5 rounded",
                  tp.hit
                    ? "bg-emerald-500/20 text-emerald-400"
                    : slKilled
                      ? "bg-rose-500/10 text-rose-400/50 line-through decoration-rose-400/60"
                      : "bg-white/5 text-muted-foreground/40"
                )}
              >
                {tp.num}{tp.hit ? "✓" : ""}
              </span>
            );
          })}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-0.5">
          {isOpen ? (
            <>
              <div className={cn("flex items-center gap-1 font-mono text-xs font-black", (trade.unrealizedPnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                {(trade.unrealizedPnl ?? 0) >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {(trade.unrealizedPnl ?? 0) >= 0 ? "+" : ""}{formatMoney(trade.unrealizedPnl ?? 0, cs)}
              </div>
              <span className="text-[9px] text-muted-foreground/30 font-mono">unreal.</span>
              {trade.realizedPnl !== 0 && (
                <span className={cn("text-[9px] font-mono font-bold", trade.realizedPnl >= 0 ? "text-emerald-400/60" : "text-rose-400/60")}>
                  {trade.realizedPnl >= 0 ? "+" : ""}{formatMoney(trade.realizedPnl, cs)} real.
                </span>
              )}
            </>
          ) : (
            <>
              <div className={cn("flex items-center gap-1 font-mono text-xs font-black", trade.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                {trade.realizedPnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {trade.realizedPnl >= 0 ? "+" : ""}{formatMoney(trade.realizedPnl, cs)}
              </div>
              <span className="text-[9px] text-muted-foreground/30 font-mono">fees: {formatMoney(trade.fees, cs)}</span>
            </>
          )}
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs font-bold text-white/60">{formatMoney(trade.positionSize, cs)}</TableCell>
      <TableCell>
        <div className="flex gap-3">
          {/* Entry — click to see score breakdown */}
          <Popover>
            <PopoverTrigger asChild>
              <div className="flex flex-col gap-0.5 cursor-pointer hover:opacity-80 transition-opacity">
                <span className="font-mono text-[10px] text-muted-foreground/40 uppercase tracking-wider">Entry</span>
                <span className="font-mono text-xs font-bold text-accent underline decoration-dotted underline-offset-2">{trade.confidenceScore}</span>
                {trade.scorePattern && (
                  <PatternBadge pattern={trade.scorePattern as PatternType} score={null} />
                )}
              </div>
            </PopoverTrigger>
            {trade.scoreBreakdownAtEntry && (
              <PopoverContent className="w-72 p-3 text-xs space-y-2" side="right">
                <p className="font-black uppercase tracking-widest text-[10px] text-muted-foreground/50 mb-1">Score at Entry</p>
                {/* Price structure */}
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Price Structure</span>
                  <span className="font-mono font-bold text-white">{trade.scoreBreakdownAtEntry.priceStructure} <span className="text-muted-foreground/50">/ 60</span></span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Pattern</span>
                  <span className="font-mono font-bold text-accent uppercase">{trade.scoreBreakdownAtEntry.pattern}</span>
                </div>
                {trade.scoreBreakdownAtEntry.rrGateFailed && (
                  <div className="text-rose-400 text-[10px]">⚠ RR gate failed</div>
                )}
                {/* Liquidity */}
                {trade.scoreBreakdownAtEntry.liquidityContext && (
                  <>
                    <div className="border-t border-white/[0.06] pt-2 mt-1">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-muted-foreground">Liquidity</span>
                        <span className="font-mono font-bold text-white">{trade.scoreBreakdownAtEntry.liquidityContext.score} <span className="text-muted-foreground/50">/ 40</span></span>
                      </div>
                      <div className="space-y-1">
                        {trade.scoreBreakdownAtEntry.liquidityContext.reasons.map((r, i) => (
                          <div key={i} className={cn(
                            "text-[10px] flex items-start gap-1",
                            r.startsWith("Sweep") || r.startsWith("Fresh") || r.startsWith("Strong") || r.startsWith("Moderate") || r.startsWith("OI rising") || r.startsWith("OI falling") || r.startsWith("Bid") || r.startsWith("Ask pressure") || r.startsWith("Clear") || r.startsWith("Protective") || r.startsWith("Neutral")
                              ? "text-positive/80" : "text-rose-400/80"
                          )}>
                            <span>{r.startsWith("No ") || r.startsWith("Sweep AGAINST") || r.startsWith("Wall") || r.startsWith("Extreme") || r.startsWith("Ask heavy") || r.startsWith("Bid heavy") ? "↓" : "↑"}</span>
                            <span>{r}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                {/* Total */}
                <div className="border-t border-white/[0.06] pt-2 flex justify-between items-center">
                  <span className="font-bold text-white/70">Total</span>
                  <span className="font-mono font-black text-accent">{trade.confidenceScore} / 100</span>
                </div>
              </PopoverContent>
            )}
          </Popover>
          {/* Current / last */}
          {trade.currentScore != null && (
            <div className="flex flex-col gap-0.5 pl-3 border-l border-white/[0.06]">
              <span className="font-mono text-[10px] text-muted-foreground/40 uppercase tracking-wider">{isOpen ? "Now" : "Last"}</span>
              <span className={cn(
                "font-mono text-xs font-bold",
                trade.currentScore === 0 ? "text-rose-400" :
                trade.currentScore < trade.confidenceScore ? "text-amber-400" : "text-positive",
              )}>
                {trade.currentScore}
              </span>
              {trade.currentScorePattern && (
                <PatternBadge pattern={trade.currentScorePattern as PatternType} score={null} />
              )}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        {isOpen ? (
          <div className="flex items-center gap-1.5">
            <Badge className="text-[9px] font-black h-5 uppercase px-2 bg-accent/15 text-accent">Open</Badge>
            {onForceClose && (
              <ForceCloseDialog trade={trade} onForceClose={onForceClose}>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="h-5 w-5 flex items-center justify-center rounded hover:bg-rose-500/20 text-muted-foreground/30 hover:text-rose-400 transition-colors"
                  title="Force close"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </ForceCloseDialog>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <Badge className={cn("text-[9px] font-black h-5 uppercase px-2 w-fit", closeDisplay.color)}>
              {closeDisplay.label}
            </Badge>
            {(trade as any).txHash ? (
              <a
                href={`https://solscan.io/tx/${(trade as any).txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-[8px] font-bold text-purple-400/70 hover:text-purple-400 transition-colors"
                title="View on Solscan"
              >
                <Link2 className="h-2.5 w-2.5" />
                On-chain ↗
              </a>
            ) : (trade as any).blockchainStatus === "pending" || (trade as any).blockchainStatus === "processing" ? (
              <span className="flex items-center gap-1 text-[8px] font-bold text-muted-foreground/30">
                <Link2 className="h-2.5 w-2.5" />
                Publishing…
              </span>
            ) : null}
          </div>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col items-end gap-0.5">
          <div className="flex items-center gap-1 whitespace-nowrap">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/30">In</span>
            <span className="text-[10px] font-mono font-bold text-white/40">{format(new Date(trade.openedAt), "MMM dd")}</span>
            <span className="text-[10px] font-mono font-bold text-accent/40">{format(new Date(trade.openedAt), "HH:mm")}</span>
          </div>
          {trade.closedAt && (
            <div className="flex items-center gap-1 whitespace-nowrap">
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/30">Out</span>
              <span className="text-[10px] font-mono font-bold text-white/25">{format(new Date(trade.closedAt), "MMM dd")}</span>
              <span className="text-[10px] font-mono font-bold text-muted-foreground/30">{format(new Date(trade.closedAt), "HH:mm")}</span>
            </div>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function MobileTradeCard({ trade, onSelect, onForceClose, cs }: { trade: SimTrade; onSelect: (t: SimTrade) => void; onForceClose?: (t: SimTrade) => void; cs: string }) {
  const isBuy = trade.side === "BUY";
  const isOpen = trade.status === "OPEN";
  const isWin = trade.realizedPnl > 0;
  const chartLabel = tfLabelMap[String(trade.timeframe).toUpperCase()] ?? `${trade.timeframe}m`;
  const sl = getSlDisplay(trade);
  const closeDisplay = getCloseDisplay(trade.closeReason ?? null);

  return (
    <div className="block cursor-pointer" onClick={() => onSelect(trade)}>
      <div className={cn(
        "rounded-xl border overflow-hidden hover:border-white/[0.12] transition-all",
        isOpen
          ? "border-accent/15 bg-gradient-to-b from-[#141416] to-[#0f0f11]"
          : isWin
            ? "border-positive/10 bg-gradient-to-b from-[#141416] to-[#0f0f11]"
            : "border-negative/10 bg-gradient-to-b from-[#141416] to-[#0f0f11]"
      )}>
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-black text-foreground uppercase tracking-tight">{trade.symbol}</span>
              <span className={cn("text-[11px] font-bold uppercase", isBuy ? "text-emerald-400/70" : "text-rose-400/70")}>
                {isBuy ? "▲ Long" : "▼ Short"}
              </span>
              <span className="text-white/15">·</span>
              <span className="text-[11px] text-muted-foreground/60 uppercase">{chartLabel}</span>
              <span className="text-[9px] font-bold text-muted-foreground/40">{trade.leverage}x</span>
            </div>
            <div className="flex items-center gap-1.5">
              {isOpen ? (
                <>
                  <Badge className="text-[9px] font-black h-5 uppercase px-2 bg-accent/15 text-accent">Open</Badge>
                  {onForceClose && (
                    <ForceCloseDialog trade={trade} onForceClose={onForceClose}>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="h-5 px-1.5 flex items-center gap-1 rounded text-[9px] font-bold text-rose-400/50 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      >
                        <XCircle className="h-3 w-3" /> Close
                      </button>
                    </ForceCloseDialog>
                  )}
                </>
              ) : (
                <Badge className={cn("text-[9px] font-black h-5 uppercase px-2", closeDisplay.color)}>
                  {closeDisplay.label}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[10px] font-bold text-muted-foreground/30 uppercase">{trade.algo || "—"}</span>
            <span className="text-white/15">·</span>
            <Popover>
              <PopoverTrigger asChild>
                <span className="text-[10px] font-bold text-accent underline decoration-dotted underline-offset-2 cursor-pointer">Entry {trade.confidenceScore}</span>
              </PopoverTrigger>
              {trade.scoreBreakdownAtEntry && (
                <PopoverContent className="w-64 p-3 text-xs space-y-2" side="bottom">
                  <p className="font-black uppercase tracking-widest text-[10px] text-muted-foreground/50 mb-1">Score at Entry</p>
                  <div className="flex justify-between"><span className="text-muted-foreground">Price Structure</span><span className="font-mono font-bold">{trade.scoreBreakdownAtEntry.priceStructure}/60</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Pattern</span><span className="font-mono font-bold text-accent uppercase">{trade.scoreBreakdownAtEntry.pattern}</span></div>
                  {trade.scoreBreakdownAtEntry.liquidityContext && (
                    <>
                      <div className="flex justify-between border-t border-white/[0.06] pt-2"><span className="text-muted-foreground">Liquidity</span><span className="font-mono font-bold">{trade.scoreBreakdownAtEntry.liquidityContext.score}/40</span></div>
                      {trade.scoreBreakdownAtEntry.liquidityContext.reasons.map((r, i) => (
                        <div key={i} className={cn("text-[10px]", r.startsWith("No ") || r.startsWith("Sweep AGAINST") || r.startsWith("Wall") || r.startsWith("Extreme") || r.startsWith("Ask heavy") || r.startsWith("Bid heavy") ? "text-rose-400/80" : "text-positive/80")}>
                          {r.startsWith("No ") || r.startsWith("Sweep AGAINST") || r.startsWith("Wall") || r.startsWith("Extreme") ? "↓ " : "↑ "}{r}
                        </div>
                      ))}
                    </>
                  )}
                  <div className="border-t border-white/[0.06] pt-2 flex justify-between font-bold"><span>Total</span><span className="text-accent font-mono">{trade.confidenceScore}/100</span></div>
                </PopoverContent>
              )}
            </Popover>
            {trade.scorePattern && <PatternBadge pattern={trade.scorePattern as PatternType} score={null} />}
            {trade.currentScore != null && (
              <>
                <span className="text-white/15">→</span>
                <span className={cn(
                  "text-[10px] font-bold",
                  trade.currentScore === 0 ? "text-rose-400" :
                  trade.currentScore < trade.confidenceScore ? "text-amber-400" : "text-positive",
                )}>
                  {isOpen ? "Now" : "Last"} {trade.currentScore}
                </span>
                {trade.currentScorePattern && <PatternBadge pattern={trade.currentScorePattern as PatternType} score={null} />}
              </>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3">
          {/* PNL + Date */}
          <div className="flex items-center justify-between">
            <div>
              {isOpen ? (
                <div className="flex flex-col">
                  <div className={cn("flex items-center gap-1.5 font-mono text-lg font-black", (trade.unrealizedPnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {(trade.unrealizedPnl ?? 0) >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {(trade.unrealizedPnl ?? 0) >= 0 ? "+" : ""}{formatMoney(trade.unrealizedPnl ?? 0, cs)}
                    <span className="text-[9px] font-bold text-muted-foreground/30 ml-1">unreal.</span>
                  </div>
                  {trade.realizedPnl !== 0 && (
                    <span className={cn("text-[10px] font-mono font-bold", trade.realizedPnl >= 0 ? "text-emerald-400/60" : "text-rose-400/60")}>
                      {trade.realizedPnl >= 0 ? "+" : ""}{formatMoney(trade.realizedPnl, cs)} realized
                    </span>
                  )}
                </div>
              ) : (
                <div className={cn("flex items-center gap-1.5 font-mono text-lg font-black", trade.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {trade.realizedPnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {trade.realizedPnl >= 0 ? "+" : ""}{formatMoney(trade.realizedPnl, cs)}
                  <span className="text-[9px] font-bold text-muted-foreground/30 ml-1">fees: {formatMoney(trade.fees, cs)}</span>
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/30">In</span>
                <span className="text-[10px] font-mono text-muted-foreground/40">{format(new Date(trade.openedAt), "MMM dd, HH:mm")}</span>
              </div>
              {trade.closedAt && (
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/30">Out</span>
                  <span className="text-[10px] font-mono text-muted-foreground/30">{format(new Date(trade.closedAt), "MMM dd, HH:mm")}</span>
                </div>
              )}
            </div>
          </div>

          {/* Entry / Current / SL */}
          <div className="flex items-center gap-3 text-[11px] flex-wrap">
            <div>
              <span className="text-muted-foreground/40 mr-1.5">Entry</span>
              <span className="font-mono font-bold text-white/50">{cs}{formatPrice(trade.entryPrice)}</span>
            </div>
            {isOpen && trade.currentPrice != null && (
              <>
                <span className="text-white/10">→</span>
                <div>
                  <span className="text-muted-foreground/40 mr-1.5">Current</span>
                  <span className="font-mono font-bold text-white">{cs}{formatPrice(trade.currentPrice)}</span>
                </div>
              </>
            )}
            <span className="text-white/10">|</span>
            <div>
              <span className="text-muted-foreground/40 mr-1.5">SL</span>
              <span className="font-mono font-bold text-white/50">{cs}{formatPrice(sl.price)}</span>
              <span className="text-[9px] text-muted-foreground/40 ml-1">({sl.label})</span>
            </div>
          </div>

          {/* Size */}
          <div className="text-[11px]">
            <span className="text-muted-foreground/40 mr-1.5">Size</span>
            <span className="font-mono font-bold text-white/50">{formatMoney(trade.positionSize, cs)}</span>
            <span className="text-muted-foreground/40 ml-3 mr-1.5">Remaining</span>
            <span className="font-mono font-bold text-white/50">{(trade.remainingPct * 100).toFixed(0)}%</span>
          </div>

          {/* Targets */}
          <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
            <div className="flex items-center gap-1.5">
              {[
                { num: 1, hit: trade.tp1Hit, price: trade.tp1 },
                { num: 2, hit: trade.tp2Hit, price: trade.tp2 },
                { num: 3, hit: trade.tp3Hit, price: trade.tp3 },
              ].map((tp) => {
                const slKilled = !tp.hit && trade.slHit;
                return (
                  <span
                    key={tp.num}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[9px] font-bold",
                      tp.hit
                        ? "bg-emerald-500/20 text-emerald-400"
                        : slKilled
                          ? "bg-rose-500/10 text-rose-400/50 line-through"
                          : "bg-white/5 text-muted-foreground/40"
                    )}
                  >
                    TP{tp.num}{tp.hit ? "✓" : ""}
                  </span>
                );
              })}
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[9px] font-mono text-muted-foreground/30">
                <span className="uppercase tracking-widest mr-1">In</span>{format(new Date(trade.openedAt), "HH:mm")}
              </span>
              {trade.closedAt && (
                <span className="text-[9px] font-mono text-muted-foreground/25">
                  <span className="uppercase tracking-widest mr-1">Out</span>{format(new Date(trade.closedAt), "HH:mm")}
                </span>
              )}
            </div>
          </div>

          {/* Blockchain verification link (closed trades only) */}
          {!isOpen && (trade as any).txHash && (
            <div className="pt-2 border-t border-white/[0.04]">
              <a
                href={`https://solscan.io/tx/${(trade as any).txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 text-[10px] font-bold text-purple-400/70 hover:text-purple-400 transition-colors"
              >
                <Link2 className="h-3 w-3" />
                Verify on-chain ↗
              </a>
            </div>
          )}
          {!isOpen && ((trade as any).blockchainStatus === "pending" || (trade as any).blockchainStatus === "processing") && (
            <div className="pt-2 border-t border-white/[0.04]">
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground/30">
                <Link2 className="h-3 w-3" />
                Publishing to blockchain…
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LogRow({ log, cs = "$" }: { log: SimLog; cs?: string }) {
  const actionColor: Record<string, string> = {
    TRADE_OPENED: "text-accent",
    TP_HIT: "text-positive",
    SL_HIT: "text-negative",
    MARKET_TURN: "text-amber-400",
    SCORE_DEGRADED: "text-amber-400",
    SIGNAL_SKIPPED: "text-muted-foreground/40",
    INCUBATED_SKIPPED: "text-muted-foreground/40",
    COOLOFF_ACTIVATED: "text-amber-400",
    DAILY_RESET: "text-accent",
    ASSESSMENT_SUMMARY: "text-sky-400",
    PATTERN_BREAK: "text-rose-400",
  };

  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-white/[0.03]">
      <span className="text-[9px] text-muted-foreground/25 tabular-nums shrink-0 pt-0.5 w-14">
        {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className={cn("text-[9px] font-bold uppercase shrink-0 w-24 pt-0.5", actionColor[log.action] ?? "text-muted-foreground/40")}>
        {log.action.replace(/_/g, " ")}
      </span>
      <span className="text-[10px] text-muted-foreground/60 flex-1 min-w-0">
        {log.details}
      </span>
      {log.capital != null && (
        <span className="text-[9px] text-muted-foreground/30 tabular-nums shrink-0">
          {formatMoney(log.capital, cs)}
        </span>
      )}
    </div>
  );
}

const EVENT_DISPLAY: Record<string, { label: string; icon: string; color: string }> = {
  OPEN: { label: "Trade Opened", icon: "🟢", color: "text-accent" },
  SL_TO_BE: { label: "SL → Breakeven", icon: "🛡️", color: "text-accent" },
  TP1: { label: "TP1 Hit", icon: "🎯", color: "text-emerald-400" },
  TP2: { label: "TP2 Hit", icon: "🎯", color: "text-emerald-400" },
  TP3: { label: "TP3 Hit", icon: "🏆", color: "text-emerald-400" },
  SL: { label: "Stop Loss Hit", icon: "🔴", color: "text-rose-400" },
};

function TradeNarrationDialog({ trade, onClose, cs }: { trade: SimTrade | null; onClose: () => void; cs: string }) {
  if (!trade) return null;

  const isBuy = trade.side === "BUY";
  const isOpen = trade.status === "OPEN";
  const chartLabel = tfLabelMap[String(trade.timeframe).toUpperCase()] ?? `${trade.timeframe}m`;
  const closeDisplay = getCloseDisplay(trade.closeReason ?? null);

  const duration = trade.closedAt
    ? Math.round((new Date(trade.closedAt).getTime() - new Date(trade.openedAt).getTime()) / 60000)
    : Math.round((Date.now() - new Date(trade.openedAt).getTime()) / 60000);
  const durationLabel = duration < 60 ? `${duration}m` : duration < 1440 ? `${Math.floor(duration / 60)}h ${duration % 60}m` : `${Math.floor(duration / 1440)}d`;

  let runningPnl = 0;
  let runningFees = 0;
  let runningRemaining = 1.0;

  return (
    <Dialog open={!!trade} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-[#0f0f11] border-white/[0.08]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-lg font-black uppercase tracking-tight">{trade.symbol}</span>
            <Badge className={cn("text-[9px] font-black h-5 uppercase px-2", isBuy ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400")}>
              {trade.side}
            </Badge>
            <span className="text-[11px] text-muted-foreground/60">{chartLabel} · {trade.leverage}x</span>
            {isOpen ? (
              <Badge className="text-[9px] font-black h-5 uppercase px-2 bg-accent/15 text-accent ml-auto">Open</Badge>
            ) : (
              <Badge className={cn("text-[9px] font-black h-5 uppercase px-2 ml-auto", closeDisplay.color)}>
                {closeDisplay.label}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Trade Metadata */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px] border-b border-white/[0.06] pb-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">Entry</span>
            <span className="font-mono font-bold text-white/70">{cs}{formatPrice(trade.entryPrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">Size</span>
            <span className="font-mono font-bold text-white/70">{formatMoney(trade.positionSize, cs)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">SL</span>
            <span className="font-mono font-bold text-rose-400/70">{cs}{formatPrice(trade.stopLoss)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">Capital</span>
            <span className="font-mono font-bold text-white/70">{formatMoney(trade.capitalAtEntry, cs)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">TP1</span>
            <span className="font-mono font-bold text-emerald-400/70">{cs}{formatPrice(trade.tp1)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">Score</span>
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">Entry</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <span className="font-mono font-bold text-accent underline decoration-dotted underline-offset-2 cursor-pointer">{trade.confidenceScore}</span>
                  </PopoverTrigger>
                  {trade.scoreBreakdownAtEntry && (
                    <PopoverContent className="w-64 p-3 text-xs space-y-2" side="left">
                      <p className="font-black uppercase tracking-widest text-[10px] text-muted-foreground/50 mb-1">Score at Entry</p>
                      <div className="flex justify-between"><span className="text-muted-foreground">Price Structure</span><span className="font-mono font-bold">{trade.scoreBreakdownAtEntry.priceStructure}/60</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Pattern</span><span className="font-mono font-bold text-accent uppercase">{trade.scoreBreakdownAtEntry.pattern}</span></div>
                      {trade.scoreBreakdownAtEntry.liquidityContext && (
                        <>
                          <div className="flex justify-between border-t border-white/[0.06] pt-2"><span className="text-muted-foreground">Liquidity</span><span className="font-mono font-bold">{trade.scoreBreakdownAtEntry.liquidityContext.score}/40</span></div>
                          {trade.scoreBreakdownAtEntry.liquidityContext.reasons.map((r, i) => (
                            <div key={i} className={cn("text-[10px]", r.startsWith("No ") || r.startsWith("Sweep AGAINST") || r.startsWith("Wall") || r.startsWith("Extreme") || r.startsWith("Ask heavy") || r.startsWith("Bid heavy") ? "text-rose-400/80" : "text-positive/80")}>
                              {r.startsWith("No ") || r.startsWith("Sweep AGAINST") || r.startsWith("Wall") || r.startsWith("Extreme") ? "↓ " : "↑ "}{r}
                            </div>
                          ))}
                        </>
                      )}
                      <div className="border-t border-white/[0.06] pt-2 flex justify-between font-bold"><span>Total</span><span className="text-accent font-mono">{trade.confidenceScore}/100</span></div>
                    </PopoverContent>
                  )}
                </Popover>
                {trade.scorePattern && <PatternBadge pattern={trade.scorePattern as PatternType} score={null} />}
              </div>
              {trade.currentScore != null && (
                <div className="flex flex-col items-end gap-0.5 border-t border-white/[0.06] pt-1.5">
                  <span className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">{isOpen ? "Now" : "Last"}</span>
                  <span className={cn(
                    "font-mono font-bold",
                    trade.currentScore === 0 ? "text-rose-400" :
                    trade.currentScore < trade.confidenceScore ? "text-amber-400" : "text-positive",
                  )}>
                    {trade.currentScore}
                  </span>
                  {trade.currentScorePattern && <PatternBadge pattern={trade.currentScorePattern as PatternType} score={null} />}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">TP2</span>
            <span className="font-mono font-bold text-emerald-400/70">{cs}{formatPrice(trade.tp2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">Bias</span>
            <span className="font-mono font-bold text-white/70">{trade.biasAtEntry}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">TP3</span>
            <span className="font-mono font-bold text-emerald-400/70">{cs}{formatPrice(trade.tp3)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">Duration</span>
            <span className="font-mono font-bold text-white/70">{durationLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">Live WR</span>
            <span className="font-mono font-bold text-white/70">{(trade.liveWinRateAtEntry * 100).toFixed(0)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">Algo WR</span>
            <span className="font-mono font-bold text-white/70">{(trade.algoWinRateAtEntry * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-2">Trade Timeline</div>
          {(trade.events || []).map((evt, i) => {
            const display = EVENT_DISPLAY[evt.type] ?? { label: evt.type, icon: "•", color: "text-muted-foreground" };

            if (evt.type === "OPEN") {
              runningFees += evt.fee;
            } else if (evt.type === "SL_TO_BE") {
              // no PnL change
            } else {
              runningPnl += evt.pnl;
              runningFees += evt.fee;
              runningRemaining -= evt.closePct;
            }

            return (
              <div key={i} className="flex gap-3 py-2 border-b border-white/[0.03] last:border-0">
                <div className="flex flex-col items-center shrink-0 w-5">
                  <span className="text-sm">{display.icon}</span>
                  {i < trade.events.length - 1 && <div className="w-px flex-1 bg-white/[0.06] mt-1" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={cn("text-[11px] font-bold", display.color)}>{display.label}</span>
                    <span className="text-[9px] text-muted-foreground/30 font-mono">
                      {format(new Date(evt.timestamp), "MMM dd, HH:mm:ss")}
                    </span>
                  </div>

                  {evt.type === "OPEN" && (
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5">
                      Entry @ <span className="font-mono text-white/60">{cs}{formatPrice(evt.price)}</span>
                      {" · "}Size: <span className="font-mono text-white/60">{formatMoney(trade.positionSize, cs)}</span>
                      {" · "}Fee: <span className="font-mono text-rose-400/50">{formatMoney(evt.fee, cs)}</span>
                    </div>
                  )}

                  {evt.type === "SL_TO_BE" && (
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5">
                      Price crossed 50% of TP1 @ <span className="font-mono text-white/60">{cs}{formatPrice(evt.price)}</span>
                      {" · "}SL moved to entry <span className="font-mono text-white/60">{cs}{formatPrice(trade.entryPrice)}</span>
                    </div>
                  )}

                  {(evt.type === "TP1" || evt.type === "TP2" || evt.type === "TP3") && (
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5 space-y-0.5">
                      <div>
                        @ <span className="font-mono text-white/60">{cs}{formatPrice(evt.price)}</span>
                        {" · "}Closed <span className="font-mono text-white/60">{(evt.closePct * 100).toFixed(0)}%</span> ({formatMoney(trade.positionSize * evt.closePct, cs)})
                      </div>
                      <div>
                        PnL: <span className={cn("font-mono font-bold", evt.pnl >= 0 ? "text-emerald-400" : "text-rose-400")}>{evt.pnl >= 0 ? "+" : ""}{formatMoney(evt.pnl, cs)}</span>
                        {" · "}Fee: <span className="font-mono text-rose-400/50">{formatMoney(evt.fee, cs)}</span>
                        {" · "}Remaining: <span className="font-mono text-white/60">{Math.max(0, runningRemaining * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  )}

                  {evt.type === "SL" && (
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5 space-y-0.5">
                      <div>
                        @ <span className="font-mono text-white/60">{cs}{formatPrice(evt.price)}</span>
                        {" · "}Closed <span className="font-mono text-white/60">{(evt.closePct * 100).toFixed(0)}%</span> remaining
                      </div>
                      <div>
                        PnL: <span className={cn("font-mono font-bold", evt.pnl >= 0 ? "text-emerald-400" : "text-rose-400")}>{evt.pnl >= 0 ? "+" : ""}{formatMoney(evt.pnl, cs)}</span>
                        {" · "}Fee: <span className="font-mono text-rose-400/50">{formatMoney(evt.fee, cs)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary Footer */}
        <div className="border-t border-white/[0.06] pt-3 mt-1">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-0.5">Realized PnL</div>
              <div className={cn("text-sm font-black font-mono", trade.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                {trade.realizedPnl >= 0 ? "+" : ""}{formatMoney(trade.realizedPnl, cs)}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-0.5">Total Fees</div>
              <div className="text-sm font-black font-mono text-rose-400/60">{formatMoney(trade.fees, cs)}</div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-0.5">
                {isOpen ? "Unrealized" : "Net Result"}
              </div>
              {isOpen ? (
                <div className={cn("text-sm font-black font-mono", (trade.unrealizedPnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {(trade.unrealizedPnl ?? 0) >= 0 ? "+" : ""}{formatMoney(trade.unrealizedPnl ?? 0, cs)}
                </div>
              ) : (
                <div className={cn("text-sm font-black font-mono", (trade.realizedPnl - trade.fees) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {(trade.realizedPnl - trade.fees) >= 0 ? "+" : ""}{formatMoney(trade.realizedPnl, cs)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Deep dive link */}
        <Link
          href={`/chart/${trade.signalId}`}
          target="_blank"
          className="flex items-center justify-center gap-2 text-[11px] font-bold text-accent hover:text-accent/80 transition-colors pt-1"
        >
          View signal deep dive →
        </Link>
      </DialogContent>
    </Dialog>
  );
}
