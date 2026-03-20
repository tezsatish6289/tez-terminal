"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import {
  useUser,
  useFirestore,
  useCollection,
  useDoc,
  useMemoFirebase,
} from "@/firebase";
import { collection, query, orderBy, limit, doc, where } from "firebase/firestore";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Shield,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Pause,
  BarChart3,
} from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { SimulatorState, SimTrade, SimLog } from "@/lib/simulator";

function formatUsd(val: number): string {
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

export default function SimulationPage() {
  const user = useUser();
  const firestore = useFirestore();
  const [tab, setTab] = useState<"overview" | "trades" | "logs">("overview");

  const stateRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, "config", "simulator_state");
  }, [firestore, user]);
  const { data: stateData, isLoading: stateLoading } = useDoc(stateRef);
  const simState = stateData as SimulatorState | null;

  const tradesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "simulator_trades"),
      orderBy("openedAt", "desc"),
      limit(100),
    );
  }, [firestore, user]);
  const { data: rawTrades, isLoading: tradesLoading } = useCollection(tradesQuery);

  const logsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "simulator_logs"),
      orderBy("timestamp", "desc"),
      limit(200),
    );
  }, [firestore, user]);
  const { data: rawLogs, isLoading: logsLoading } = useCollection(logsQuery);

  const trades = useMemo(() => {
    if (!rawTrades) return [];
    return rawTrades.map((d: any) => ({ id: d.id, ...d } as SimTrade));
  }, [rawTrades]);

  const logs = useMemo(() => {
    if (!rawLogs) return [];
    return rawLogs.map((d: any) => d as SimLog);
  }, [rawLogs]);

  const openTrades = useMemo(() => trades.filter((t) => t.status === "OPEN"), [trades]);
  const closedTrades = useMemo(() => trades.filter((t) => t.status === "CLOSED"), [trades]);

  const isLoading = stateLoading || tradesLoading || logsLoading;

  const totalReturn = simState ? ((simState.capital - simState.startingCapital) / simState.startingCapital) * 100 : 0;
  const winRate = simState && (simState.totalWins + simState.totalLosses) > 0
    ? (simState.totalWins / (simState.totalWins + simState.totalLosses)) * 100
    : 0;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <main className="flex-1 flex flex-col min-w-0">
        <TopBar />

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="max-w-[1400px] mx-auto space-y-4">
            {/* Header */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Activity className="w-4 h-4 text-accent" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-accent">Model Simulation</span>
              </div>
              <h1 className="text-xl font-black tracking-tight">Trade Simulator</h1>
              <p className="text-[11px] text-muted-foreground/50 mt-1">
                Live forward simulation starting with $1,000 USDT — trades automatically based on AI signals and market bias.
              </p>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-6 w-6 animate-spin text-accent/50" />
              </div>
            ) : !simState ? (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center">
                <Activity className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-bold text-muted-foreground/50">Simulator not started yet</p>
                <p className="text-[11px] text-muted-foreground/30 mt-1">The simulator will activate when the next AI-passed signal arrives.</p>
              </div>
            ) : (
              <>
                {/* Stats Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <StatCard
                    label="Capital"
                    value={formatUsd(simState.capital)}
                    icon={<DollarSign className="w-3.5 h-3.5" />}
                    color={simState.capital >= simState.startingCapital ? "text-positive" : "text-negative"}
                  />
                  <StatCard
                    label="Total Return"
                    value={formatPct(totalReturn)}
                    icon={totalReturn >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    color={totalReturn >= 0 ? "text-positive" : "text-negative"}
                  />
                  <StatCard
                    label="Win Rate"
                    value={`${winRate.toFixed(0)}%`}
                    icon={<BarChart3 className="w-3.5 h-3.5" />}
                    color={winRate >= 60 ? "text-positive" : winRate >= 45 ? "text-amber-400" : "text-negative"}
                  />
                  <StatCard
                    label="Trades"
                    value={`${simState.totalWins}W / ${simState.totalLosses}L`}
                    icon={<Activity className="w-3.5 h-3.5" />}
                    color="text-foreground/70"
                  />
                  <StatCard
                    label="Daily P&L"
                    value={formatUsd(simState.dailyPnl)}
                    icon={simState.dailyPnl >= 0 ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                    color={simState.dailyPnl >= 0 ? "text-positive" : "text-negative"}
                  />
                  <StatCard
                    label="Fees Paid"
                    value={formatUsd(simState.totalFeesPaid)}
                    icon={<Shield className="w-3.5 h-3.5" />}
                    color="text-muted-foreground/50"
                  />
                </div>

                {/* Cool-off warning */}
                {simState.coolOffUntil && new Date(simState.coolOffUntil) > new Date() && (
                  <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-400/10 border border-amber-400/20">
                    <Pause className="w-4 h-4 text-amber-400" />
                    <span className="text-[11px] font-bold text-amber-400">
                      Cool-off active — no new trades until midnight UTC (3% daily drawdown reached)
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
                  <div className="space-y-2">
                    {openTrades.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground/30">
                        <Activity className="w-6 h-6 mx-auto mb-2" />
                        <p className="text-xs font-bold">No open trades</p>
                      </div>
                    ) : (
                      openTrades.map((trade) => (
                        <TradeRow key={trade.id ?? trade.signalId} trade={trade} />
                      ))
                    )}
                  </div>
                )}

                {tab === "trades" && (
                  <div className="space-y-2">
                    {closedTrades.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground/30">
                        <BarChart3 className="w-6 h-6 mx-auto mb-2" />
                        <p className="text-xs font-bold">No closed trades yet</p>
                      </div>
                    ) : (
                      closedTrades.map((trade) => (
                        <TradeRow key={trade.id ?? trade.signalId} trade={trade} />
                      ))
                    )}
                  </div>
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
                        <LogRow key={i} log={log} />
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
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

function TradeRow({ trade }: { trade: SimTrade }) {
  const isBuy = trade.side === "BUY";
  const isOpen = trade.status === "OPEN";
  const isWin = trade.realizedPnl > 0;

  return (
    <div className={cn(
      "rounded-lg border p-3 flex items-center gap-3",
      isOpen
        ? "border-accent/15 bg-accent/[0.03]"
        : isWin
          ? "border-positive/10 bg-positive/[0.02]"
          : "border-negative/10 bg-negative/[0.02]"
    )}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[11px] font-black">{trade.symbol}</span>
          <span className={cn(
            "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
            isBuy ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative"
          )}>
            {trade.side}
          </span>
          <span className="text-[9px] text-muted-foreground/40">{trade.timeframe} · {trade.leverage}x</span>
          {isOpen && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-bold">OPEN</span>
          )}
          {!isOpen && trade.closeReason && (
            <span className={cn(
              "text-[9px] px-1.5 py-0.5 rounded font-bold",
              trade.closeReason === "SL" ? "bg-negative/15 text-negative" : "bg-positive/15 text-positive"
            )}>
              {trade.closeReason}
            </span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground/40">
          Size: {formatUsd(trade.positionSize)} · Score: {trade.confidenceScore} · {trade.biasAtEntry} · {formatTimeAgo(trade.openedAt)}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className={cn(
          "text-sm font-black tabular-nums",
          trade.realizedPnl >= 0 ? "text-positive" : "text-negative"
        )}>
          {trade.realizedPnl >= 0 ? "+" : ""}{formatUsd(trade.realizedPnl)}
        </div>
        <div className="text-[9px] text-muted-foreground/30">
          fees: {formatUsd(trade.fees)}
        </div>
      </div>
    </div>
  );
}

function LogRow({ log }: { log: SimLog }) {
  const actionColor: Record<string, string> = {
    TRADE_OPENED: "text-accent",
    TP_HIT: "text-positive",
    SL_HIT: "text-negative",
    SIGNAL_SKIPPED: "text-muted-foreground/40",
    COOLOFF_ACTIVATED: "text-amber-400",
    DAILY_RESET: "text-accent",
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
          {formatUsd(log.capital)}
        </span>
      )}
    </div>
  );
}
