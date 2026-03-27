"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import {
  useUser,
  useFirestore,
  useCollection,
  useDoc,
  useMemoFirebase,
} from "@/firebase";
import { collection, query, orderBy, limit, doc } from "firebase/firestore";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Shield,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
} from "lucide-react";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SimulatorState, SimTrade, SimLog, SimTradeEvent } from "@/lib/simulator";
import { format } from "date-fns";

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
  const [tab, setTab] = useState<"overview" | "trades" | "logs">("overview");
  const [selectedTrade, setSelectedTrade] = useState<SimTrade | null>(null);

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
                        <LogRow key={i} log={log} />
                      ))}
                    </div>
                  </>
                )}
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
                    label="Streak / Max Trades"
                    value={`${simState.consecutiveWins ?? 0}W → ${simState.currentMaxTrades ?? 1}`}
                    icon={<Shield className="w-3.5 h-3.5" />}
                    color={(simState.consecutiveWins ?? 0) >= 2 ? "text-positive" : "text-muted-foreground/50"}
                  />
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
                  <TradeList trades={openTrades} emptyIcon={<Activity className="w-6 h-6" />} emptyLabel="No open trades" onSelectTrade={setSelectedTrade} />
                )}

                {tab === "trades" && (
                  <TradeList trades={closedTrades} emptyIcon={<BarChart3 className="w-6 h-6" />} emptyLabel="No closed trades yet" onSelectTrade={setSelectedTrade} />
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

      {/* Trade Narration Dialog */}
      <TradeNarrationDialog trade={selectedTrade} onClose={() => setSelectedTrade(null)} />
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
  TP1: { label: "TP1", color: "bg-emerald-500/15 text-emerald-400" },
  TP2: { label: "TP2", color: "bg-emerald-500/15 text-emerald-400" },
  TP3: { label: "TP3", color: "bg-emerald-500/15 text-emerald-400" },
};

function getCloseDisplay(reason: string | null) {
  if (!reason) return { label: "Closed", color: "bg-white/5 text-muted-foreground" };
  return CLOSE_REASON_MAP[reason] ?? { label: reason, color: "bg-white/5 text-muted-foreground" };
}

function getSlDisplay(trade: SimTrade) {
  if (trade.trailingSl != null) return { price: trade.trailingSl, label: "Moved to Entry" };
  if (trade.tp1Hit) return { price: trade.entryPrice, label: "Moved to Entry" };
  return { price: trade.stopLoss, label: "Original" };
}

function TradeList({ trades, emptyIcon, emptyLabel, onSelectTrade }: { trades: SimTrade[]; emptyIcon: React.ReactNode; emptyLabel: string; onSelectTrade: (t: SimTrade) => void }) {
  if (trades.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground/30">
        {emptyIcon}
        <p className="text-xs font-bold mt-2">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile: Card layout */}
      <div className="lg:hidden space-y-3">
        {trades.map((trade) => (
          <MobileTradeCard key={trade.id ?? trade.signalId} trade={trade} onSelect={onSelectTrade} />
        ))}
      </div>

      {/* Desktop: Table layout */}
      <div className="hidden lg:block bg-card border border-white/5 rounded-lg overflow-x-auto">
        <div className="min-w-[1100px]">
          <Table>
            <TableHeader className="bg-card sticky top-0 z-10 shadow-[0_1px_0_rgba(255,255,255,0.05)]">
              <TableRow className="hover:bg-transparent border-white/5">
                <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 w-[120px]">Symbol</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 w-[48px]">Side</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 w-[36px]">Chart</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 w-[70px]">Algo</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 w-[36px]">Lev.</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Entry</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Current</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">SL</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 w-[72px]">Targets</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Net PNL</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Size</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 w-[50px]">Score</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 w-[64px]">Status</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 w-[90px] text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.map((trade) => (
                <DesktopTradeRow key={trade.id ?? trade.signalId} trade={trade} onSelect={onSelectTrade} />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}

function DesktopTradeRow({ trade, onSelect }: { trade: SimTrade; onSelect: (t: SimTrade) => void }) {
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
      <TableCell className="font-mono text-xs font-bold text-white/60">${formatPrice(trade.entryPrice)}</TableCell>
      <TableCell className="font-mono text-xs font-bold text-white">
        {isOpen && trade.currentPrice != null ? `$${formatPrice(trade.currentPrice)}` : "—"}
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-mono text-xs font-bold text-white">${formatPrice(sl.price)}</span>
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
                {(trade.unrealizedPnl ?? 0) >= 0 ? "+" : ""}{formatUsd(trade.unrealizedPnl ?? 0)}
              </div>
              <span className="text-[9px] text-muted-foreground/30 font-mono">unreal.</span>
              {trade.realizedPnl !== 0 && (
                <span className={cn("text-[9px] font-mono font-bold", trade.realizedPnl >= 0 ? "text-emerald-400/60" : "text-rose-400/60")}>
                  {trade.realizedPnl >= 0 ? "+" : ""}{formatUsd(trade.realizedPnl)} real.
                </span>
              )}
            </>
          ) : (
            <>
              <div className={cn("flex items-center gap-1 font-mono text-xs font-black", trade.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                {trade.realizedPnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {trade.realizedPnl >= 0 ? "+" : ""}{formatUsd(trade.realizedPnl)}
              </div>
              <span className="text-[9px] text-muted-foreground/30 font-mono">fees: {formatUsd(trade.fees)}</span>
            </>
          )}
        </div>
      </TableCell>
      <TableCell className="font-mono text-xs font-bold text-white/60">{formatUsd(trade.positionSize)}</TableCell>
      <TableCell>
        <span className="font-mono text-xs font-bold text-accent">{trade.confidenceScore}</span>
      </TableCell>
      <TableCell>
        {isOpen ? (
          <Badge className="text-[9px] font-black h-5 uppercase px-2 bg-accent/15 text-accent">Open</Badge>
        ) : (
          <Badge className={cn("text-[9px] font-black h-5 uppercase px-2", closeDisplay.color)}>
            {closeDisplay.label}
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-mono font-bold text-white/40">{format(new Date(trade.openedAt), "yyyy-MM-dd")}</span>
          <span className="text-[10px] font-mono font-bold text-accent/40">{format(new Date(trade.openedAt), "HH:mm")}</span>
        </div>
      </TableCell>
    </TableRow>
  );
}

function MobileTradeCard({ trade, onSelect }: { trade: SimTrade; onSelect: (t: SimTrade) => void }) {
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
            {isOpen ? (
              <Badge className="text-[9px] font-black h-5 uppercase px-2 bg-accent/15 text-accent">Open</Badge>
            ) : (
              <Badge className={cn("text-[9px] font-black h-5 uppercase px-2", closeDisplay.color)}>
                {closeDisplay.label}
              </Badge>
            )}
          </div>
          <div className="text-[10px] font-bold text-muted-foreground/30 uppercase mt-1">
            {trade.algo || "—"} · Score: {trade.confidenceScore} · {trade.biasAtEntry}
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
                    {(trade.unrealizedPnl ?? 0) >= 0 ? "+" : ""}{formatUsd(trade.unrealizedPnl ?? 0)}
                    <span className="text-[9px] font-bold text-muted-foreground/30 ml-1">unreal.</span>
                  </div>
                  {trade.realizedPnl !== 0 && (
                    <span className={cn("text-[10px] font-mono font-bold", trade.realizedPnl >= 0 ? "text-emerald-400/60" : "text-rose-400/60")}>
                      {trade.realizedPnl >= 0 ? "+" : ""}{formatUsd(trade.realizedPnl)} realized
                    </span>
                  )}
                </div>
              ) : (
                <div className={cn("flex items-center gap-1.5 font-mono text-lg font-black", trade.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {trade.realizedPnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {trade.realizedPnl >= 0 ? "+" : ""}{formatUsd(trade.realizedPnl)}
                  <span className="text-[9px] font-bold text-muted-foreground/30 ml-1">fees: {formatUsd(trade.fees)}</span>
                </div>
              )}
            </div>
            <span className="text-[10px] font-mono text-muted-foreground/40">{format(new Date(trade.openedAt), "MMM dd, HH:mm")}</span>
          </div>

          {/* Entry / Current / SL */}
          <div className="flex items-center gap-3 text-[11px] flex-wrap">
            <div>
              <span className="text-muted-foreground/40 mr-1.5">Entry</span>
              <span className="font-mono font-bold text-white/50">${formatPrice(trade.entryPrice)}</span>
            </div>
            {isOpen && trade.currentPrice != null && (
              <>
                <span className="text-white/10">→</span>
                <div>
                  <span className="text-muted-foreground/40 mr-1.5">Current</span>
                  <span className="font-mono font-bold text-white">${formatPrice(trade.currentPrice)}</span>
                </div>
              </>
            )}
            <span className="text-white/10">|</span>
            <div>
              <span className="text-muted-foreground/40 mr-1.5">SL</span>
              <span className="font-mono font-bold text-white/50">${formatPrice(sl.price)}</span>
              <span className="text-[9px] text-muted-foreground/40 ml-1">({sl.label})</span>
            </div>
          </div>

          {/* Size */}
          <div className="text-[11px]">
            <span className="text-muted-foreground/40 mr-1.5">Size</span>
            <span className="font-mono font-bold text-white/50">{formatUsd(trade.positionSize)}</span>
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
            <span className="text-[10px] font-mono text-muted-foreground/30">
              {formatTimeAgo(trade.openedAt)}
            </span>
          </div>
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
    MARKET_TURN: "text-amber-400",
    SCORE_DEGRADED: "text-amber-400",
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

const EVENT_DISPLAY: Record<string, { label: string; icon: string; color: string }> = {
  OPEN: { label: "Trade Opened", icon: "🟢", color: "text-accent" },
  SL_TO_BE: { label: "SL → Breakeven", icon: "🛡️", color: "text-accent" },
  TP1: { label: "TP1 Hit", icon: "🎯", color: "text-emerald-400" },
  TP2: { label: "TP2 Hit", icon: "🎯", color: "text-emerald-400" },
  TP3: { label: "TP3 Hit", icon: "🏆", color: "text-emerald-400" },
  SL: { label: "Stop Loss Hit", icon: "🔴", color: "text-rose-400" },
};

function TradeNarrationDialog({ trade, onClose }: { trade: SimTrade | null; onClose: () => void }) {
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
            <span className="font-mono font-bold text-white/70">${formatPrice(trade.entryPrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">Size</span>
            <span className="font-mono font-bold text-white/70">{formatUsd(trade.positionSize)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">SL</span>
            <span className="font-mono font-bold text-rose-400/70">${formatPrice(trade.stopLoss)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">Capital</span>
            <span className="font-mono font-bold text-white/70">{formatUsd(trade.capitalAtEntry)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">TP1</span>
            <span className="font-mono font-bold text-emerald-400/70">${formatPrice(trade.tp1)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">Score</span>
            <span className="font-mono font-bold text-accent">{trade.confidenceScore}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">TP2</span>
            <span className="font-mono font-bold text-emerald-400/70">${formatPrice(trade.tp2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">Bias</span>
            <span className="font-mono font-bold text-white/70">{trade.biasAtEntry}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">TP3</span>
            <span className="font-mono font-bold text-emerald-400/70">${formatPrice(trade.tp3)}</span>
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
                      Entry @ <span className="font-mono text-white/60">${formatPrice(evt.price)}</span>
                      {" · "}Size: <span className="font-mono text-white/60">{formatUsd(trade.positionSize)}</span>
                      {" · "}Fee: <span className="font-mono text-rose-400/50">{formatUsd(evt.fee)}</span>
                    </div>
                  )}

                  {evt.type === "SL_TO_BE" && (
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5">
                      Price crossed 50% of TP1 @ <span className="font-mono text-white/60">${formatPrice(evt.price)}</span>
                      {" · "}SL moved to entry <span className="font-mono text-white/60">${formatPrice(trade.entryPrice)}</span>
                    </div>
                  )}

                  {(evt.type === "TP1" || evt.type === "TP2" || evt.type === "TP3") && (
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5 space-y-0.5">
                      <div>
                        @ <span className="font-mono text-white/60">${formatPrice(evt.price)}</span>
                        {" · "}Closed <span className="font-mono text-white/60">{(evt.closePct * 100).toFixed(0)}%</span> ({formatUsd(trade.positionSize * evt.closePct)})
                      </div>
                      <div>
                        PnL: <span className={cn("font-mono font-bold", evt.pnl >= 0 ? "text-emerald-400" : "text-rose-400")}>{evt.pnl >= 0 ? "+" : ""}{formatUsd(evt.pnl)}</span>
                        {" · "}Fee: <span className="font-mono text-rose-400/50">{formatUsd(evt.fee)}</span>
                        {" · "}Remaining: <span className="font-mono text-white/60">{Math.max(0, runningRemaining * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  )}

                  {evt.type === "SL" && (
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5 space-y-0.5">
                      <div>
                        @ <span className="font-mono text-white/60">${formatPrice(evt.price)}</span>
                        {" · "}Closed <span className="font-mono text-white/60">{(evt.closePct * 100).toFixed(0)}%</span> remaining
                      </div>
                      <div>
                        PnL: <span className={cn("font-mono font-bold", evt.pnl >= 0 ? "text-emerald-400" : "text-rose-400")}>{evt.pnl >= 0 ? "+" : ""}{formatUsd(evt.pnl)}</span>
                        {" · "}Fee: <span className="font-mono text-rose-400/50">{formatUsd(evt.fee)}</span>
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
                {trade.realizedPnl >= 0 ? "+" : ""}{formatUsd(trade.realizedPnl)}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-0.5">Total Fees</div>
              <div className="text-sm font-black font-mono text-rose-400/60">{formatUsd(trade.fees)}</div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-0.5">
                {isOpen ? "Unrealized" : "Net Result"}
              </div>
              {isOpen ? (
                <div className={cn("text-sm font-black font-mono", (trade.unrealizedPnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {(trade.unrealizedPnl ?? 0) >= 0 ? "+" : ""}{formatUsd(trade.unrealizedPnl ?? 0)}
                </div>
              ) : (
                <div className={cn("text-sm font-black font-mono", (trade.realizedPnl - trade.fees) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {(trade.realizedPnl - trade.fees) >= 0 ? "+" : ""}{formatUsd(trade.realizedPnl)}
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
