"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import {
  useUser,
  useFirestore,
  useCollection,
  useMemoFirebase,
} from "@/firebase";
import { collection, query, orderBy, limit, where } from "firebase/firestore";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  BarChart3,
  Zap,
  Shield,
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
import { ExchangeSettingsDialog, MultiExchangeStatusBadges, useExchangeConfig } from "@/components/exchange/ExchangeSettings";
import type { LiveTrade, LiveTradeEvent } from "@/lib/trade-engine";
import { format } from "date-fns";

function formatUsd(val: number): string {
  return `$${val.toFixed(2)}`;
}

function formatPct(val: number): string {
  const sign = val >= 0 ? "+" : "";
  return `${sign}${val.toFixed(2)}%`;
}

function formatPrice(val: number | null | undefined): string {
  if (val == null || val === 0) return "—";
  if (val >= 100) return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val >= 1) return val.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return val.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

const tfLabelMap: Record<string, string> = { "5": "5m", "15": "15m", "60": "1h", "240": "4h", "D": "1D" };

const CLOSE_REASON_MAP: Record<string, { label: string; color: string }> = {
  SL: { label: "SL", color: "bg-rose-500/15 text-rose-400" },
  TRAILING_SL: { label: "SL→BE", color: "bg-rose-500/15 text-rose-400" },
  MARKET_TURN: { label: "Mkt Turn", color: "bg-amber-500/15 text-amber-400" },
  SCORE_DEGRADED: { label: "Score↓", color: "bg-amber-500/15 text-amber-400" },
  KILL_SWITCH: { label: "Kill", color: "bg-rose-500/15 text-rose-400" },
  TP1: { label: "TP1", color: "bg-emerald-500/15 text-emerald-400" },
  TP2: { label: "TP2", color: "bg-emerald-500/15 text-emerald-400" },
  TP3: { label: "TP3", color: "bg-emerald-500/15 text-emerald-400" },
};

function getCloseDisplay(reason: string | null) {
  if (!reason) return { label: "Closed", color: "bg-white/5 text-muted-foreground" };
  return CLOSE_REASON_MAP[reason] ?? { label: reason, color: "bg-white/5 text-muted-foreground" };
}

function getSlDisplay(trade: LiveTrade) {
  if (trade.trailingSl != null) return { price: trade.trailingSl, label: "Moved to Entry" };
  if (trade.tp1Hit) return { price: trade.entryPrice, label: "Moved to Entry" };
  return { price: trade.stopLoss, label: "Original" };
}

const EVENT_DISPLAY: Record<string, { label: string; icon: string; color: string }> = {
  OPEN: { label: "Trade Opened", icon: "🟢", color: "text-accent" },
  SL_TO_BE: { label: "SL → Breakeven", icon: "🛡️", color: "text-accent" },
  TP1: { label: "TP1 Hit", icon: "🎯", color: "text-emerald-400" },
  TP2: { label: "TP2 Hit", icon: "🎯", color: "text-emerald-400" },
  TP3: { label: "TP3 Hit", icon: "🏆", color: "text-emerald-400" },
  SL: { label: "Stop Loss Hit", icon: "🔴", color: "text-rose-400" },
  MARKET_TURN: { label: "Market Turn Close", icon: "🔄", color: "text-amber-400" },
  SCORE_DEGRADED: { label: "Score Degraded Close", icon: "📉", color: "text-amber-400" },
  KILL_SWITCH: { label: "Kill Switch Close", icon: "🚨", color: "text-rose-400" },
};

export default function LiveTradingPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const bybit = useExchangeConfig(user?.uid, "BYBIT");
  const binance = useExchangeConfig(user?.uid, "BINANCE");
  const mexc = useExchangeConfig(user?.uid, "MEXC");
  const allConfigs = [bybit, binance, mexc];
  const anyConfigured = allConfigs.some((c) => c.config?.configured && !c.config.useTestnet);
  const anyAutoTradeOn = allConfigs.some((c) => c.config?.configured && !c.config.useTestnet && c.config.autoTradeEnabled);
  const configLoading = allConfigs.some((c) => c.isLoading);

  const [tab, setTab] = useState<"overview" | "trades" | "logs">("overview");
  const [selectedTrade, setSelectedTrade] = useState<LiveTrade | null>(null);

  const liveTradesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "live_trades"),
      where("userId", "==", user.uid),
      where("testnet", "==", false),
      orderBy("openedAt", "desc"),
      limit(100),
    );
  }, [firestore, user]);
  const { data: rawLiveTrades, isLoading: tradesLoading } = useCollection(liveTradesQuery);

  const logsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "live_trade_logs"),
      orderBy("timestamp", "desc"),
      limit(200),
    );
  }, [firestore, user]);
  const { data: rawLogs, isLoading: logsLoading } = useCollection(logsQuery);

  interface LiveLog {
    timestamp: string;
    action: string;
    details: string;
    symbol?: string;
    signalId?: string;
  }

  const logs = useMemo(() => {
    if (!rawLogs) return [];
    return rawLogs.map((d: any) => d as LiveLog);
  }, [rawLogs]);

  const liveTrades = useMemo(() => {
    if (!rawLiveTrades) return [];
    return rawLiveTrades.map((d: any) => ({ id: d.id, ...d } as LiveTrade));
  }, [rawLiveTrades]);

  const openTrades = useMemo(() => liveTrades.filter((t) => t.status === "OPEN"), [liveTrades]);
  const closedTrades = useMemo(() => liveTrades.filter((t) => t.status === "CLOSED"), [liveTrades]);

  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.realizedPnl || 0), 0);
  const wins = closedTrades.filter((t) => t.realizedPnl > 0).length;
  const losses = closedTrades.filter((t) => t.realizedPnl < 0).length;
  const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;

  useEffect(() => {
    if (!isUserLoading && !user) router.replace("/");
  }, [isUserLoading, user, router]);

  if (isUserLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  const isConfiguredForProd = anyConfigured;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <main className="flex-1 flex flex-col min-w-0">
        <TopBar />

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="max-w-[1400px] mx-auto space-y-4">
            {/* Header */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-amber-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Production</span>
              </div>
              <h1 className="text-xl font-black tracking-tight">Live Trading</h1>
            </div>

            {/* Production banner + settings */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-amber-400/[0.06] border-2 border-amber-400/20">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-400">PRODUCTION — REAL MONEY</p>
                  <p className="text-[10px] text-amber-400/60">
                    {anyAutoTradeOn
                      ? "Auto-trade is LIVE. Real trades executing on your exchanges."
                      : anyConfigured
                        ? "Exchanges connected but auto-trade is off. No trades will execute."
                        : "No exchanges connected. Configure API keys in Settings to start."}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <MultiExchangeStatusBadges uid={user.uid} />
                <ExchangeSettingsDialog uid={user.uid} mode="production" />
              </div>
            </div>

            {configLoading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="h-6 w-6 animate-spin text-amber-400/50" />
              </div>
            ) : !isConfiguredForProd ? (
              <div className="rounded-xl border border-amber-400/10 bg-white/[0.02] p-8 text-center">
                <Zap className="w-8 h-8 text-amber-400/30 mx-auto mb-3" />
                <p className="text-sm font-bold text-muted-foreground/50">Production trading not configured</p>
                <p className="text-[11px] text-muted-foreground/30 mt-1">Click Settings above to connect your exchange API keys.</p>
              </div>
            ) : (
              <>
                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <StatCard
                    label="Open Positions"
                    value={`${openTrades.length}`}
                    icon={<Activity className="w-3.5 h-3.5" />}
                    color="text-amber-400"
                  />
                  <StatCard
                    label="Total Trades"
                    value={`${liveTrades.length}`}
                    icon={<BarChart3 className="w-3.5 h-3.5" />}
                    color="text-foreground/70"
                  />
                  <StatCard
                    label="Realized P&L"
                    value={formatUsd(totalPnl)}
                    icon={totalPnl >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    color={totalPnl >= 0 ? "text-positive" : "text-negative"}
                  />
                  <StatCard
                    label="Win Rate"
                    value={`${winRate.toFixed(0)}%`}
                    icon={<BarChart3 className="w-3.5 h-3.5" />}
                    color={winRate >= 60 ? "text-positive" : winRate >= 45 ? "text-amber-400" : "text-negative"}
                  />
                  <StatCard
                    label="Trades"
                    value={`${wins}W / ${losses}L`}
                    icon={<Activity className="w-3.5 h-3.5" />}
                    color="text-foreground/70"
                  />
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 border-b border-white/[0.06] pb-0">
                  {(["overview", "trades", "logs"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      className={cn(
                        "px-3 py-2 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer border-b-2",
                        tab === t
                          ? "border-amber-400 text-amber-400"
                          : "border-transparent text-muted-foreground/40 hover:text-muted-foreground"
                      )}
                    >
                      {t === "overview" ? `Open (${openTrades.length})` : t === "trades" ? `History (${closedTrades.length})` : `Logs (${logs.length})`}
                    </button>
                  ))}
                </div>

                {tradesLoading || logsLoading ? (
                  <div className="flex items-center justify-center h-20">
                    <Loader2 className="h-5 w-5 animate-spin text-amber-400/50" />
                  </div>
                ) : tab === "overview" ? (
                  <TradeListView
                    trades={openTrades}
                    emptyIcon={<Activity className="w-6 h-6" />}
                    emptyLabel="No open positions"
                    emptyHint={anyAutoTradeOn ? "Waiting for signals that pass all filters." : "Enable auto-trade on at least one exchange in Settings."}
                    onSelectTrade={setSelectedTrade}
                  />
                ) : tab === "trades" ? (
                  <TradeListView
                    trades={closedTrades}
                    emptyIcon={<BarChart3 className="w-6 h-6" />}
                    emptyLabel="No trade history yet"
                    onSelectTrade={setSelectedTrade}
                  />
                ) : (
                  <div className="space-y-1">
                    {logs.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground/30">
                        <Activity className="w-6 h-6 mx-auto mb-2" />
                        <p className="text-xs font-bold">No logs yet</p>
                        <p className="text-[10px] text-muted-foreground/20 mt-1">Logs appear when signals are evaluated, trades open/close, or errors occur.</p>
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

      <LiveTradeNarrationDialog trade={selectedTrade} onClose={() => setSelectedTrade(null)} />
    </div>
  );
}

// ── Stat Card ──────────────────────────

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

// ── Trade List (Desktop Table + Mobile Cards) ──────────────────────────

function TradeListView({ trades, emptyIcon, emptyLabel, emptyHint, onSelectTrade }: {
  trades: LiveTrade[];
  emptyIcon: React.ReactNode;
  emptyLabel: string;
  emptyHint?: string;
  onSelectTrade: (t: LiveTrade) => void;
}) {
  if (trades.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground/30">
        <div className="mx-auto mb-2">{emptyIcon}</div>
        <p className="text-xs font-bold">{emptyLabel}</p>
        {emptyHint && <p className="text-[10px] text-muted-foreground/20 mt-1">{emptyHint}</p>}
      </div>
    );
  }

  return (
    <>
      {/* Mobile: Card layout */}
      <div className="lg:hidden space-y-3">
        {trades.map((trade) => (
          <MobileTradeCard key={trade.id} trade={trade} onSelect={onSelectTrade} />
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
                <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">SL</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 w-[72px]">Targets</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">P&L</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Size</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 w-[50px]">Score</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 w-[64px]">Status</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 w-[90px] text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.map((trade) => (
                <DesktopTradeRow key={trade.id} trade={trade} onSelect={onSelectTrade} />
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}

function DesktopTradeRow({ trade, onSelect }: { trade: LiveTrade; onSelect: (t: LiveTrade) => void }) {
  const isBuy = trade.side === "BUY";
  const isOpen = trade.status === "OPEN";
  const chartLabel = tfLabelMap[String(trade.timeframe).toUpperCase()] ?? `${trade.timeframe}m`;
  const sl = getSlDisplay(trade);
  const closeDisplay = getCloseDisplay(trade.closeReason ?? null);

  return (
    <TableRow className="border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => onSelect(trade)}>
      <TableCell className="py-4">
        <Link href={`/chart/${trade.signalId}`} target="_blank" className="text-sm font-black text-white leading-none uppercase tracking-tighter hover:text-accent transition-colors" onClick={(e) => e.stopPropagation()}>
          {trade.signalSymbol}
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
        <div className={cn("flex items-center gap-1 font-mono text-xs font-black", trade.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
          {trade.realizedPnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {trade.realizedPnl >= 0 ? "+" : ""}{formatUsd(trade.realizedPnl)}
        </div>
        <span className="text-[9px] text-muted-foreground/30 font-mono">fees: {formatUsd(trade.fees)}</span>
      </TableCell>
      <TableCell className="font-mono text-xs font-bold text-white/60">{formatUsd(trade.positionSize)}</TableCell>
      <TableCell>
        <span className="font-mono text-xs font-bold text-accent">{trade.confidenceScore}</span>
      </TableCell>
      <TableCell>
        {isOpen ? (
          <Badge className="text-[9px] font-black h-5 uppercase px-2 bg-amber-400/15 text-amber-400">Open</Badge>
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

function MobileTradeCard({ trade, onSelect }: { trade: LiveTrade; onSelect: (t: LiveTrade) => void }) {
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
          ? "border-amber-400/15 bg-gradient-to-b from-[#141416] to-[#0f0f11]"
          : isWin
            ? "border-positive/10 bg-gradient-to-b from-[#141416] to-[#0f0f11]"
            : "border-negative/10 bg-gradient-to-b from-[#141416] to-[#0f0f11]"
      )}>
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-black text-foreground uppercase tracking-tight">{trade.signalSymbol}</span>
              <span className={cn("text-[11px] font-bold uppercase", isBuy ? "text-emerald-400/70" : "text-rose-400/70")}>
                {isBuy ? "▲ Long" : "▼ Short"}
              </span>
              <span className="text-white/15">·</span>
              <span className="text-[11px] text-muted-foreground/60 uppercase">{chartLabel}</span>
              <span className="text-[9px] font-bold text-muted-foreground/40">{trade.leverage}x</span>
            </div>
            {isOpen ? (
              <Badge className="text-[9px] font-black h-5 uppercase px-2 bg-amber-400/15 text-amber-400">Open</Badge>
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
            <div className={cn("flex items-center gap-1.5 font-mono text-lg font-black", trade.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
              {trade.realizedPnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {trade.realizedPnl >= 0 ? "+" : ""}{formatUsd(trade.realizedPnl)}
              <span className="text-[9px] font-bold text-muted-foreground/30 ml-1">fees: {formatUsd(trade.fees)}</span>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground/40">{format(new Date(trade.openedAt), "MMM dd, HH:mm")}</span>
          </div>

          {/* Entry / SL */}
          <div className="flex items-center gap-3 text-[11px] flex-wrap">
            <div>
              <span className="text-muted-foreground/40 mr-1.5">Entry</span>
              <span className="font-mono font-bold text-white/50">${formatPrice(trade.entryPrice)}</span>
            </div>
            <span className="text-white/10">|</span>
            <div>
              <span className="text-muted-foreground/40 mr-1.5">SL</span>
              <span className="font-mono font-bold text-white/50">${formatPrice(sl.price)}</span>
              <span className="text-[9px] text-muted-foreground/40 ml-1">({sl.label})</span>
            </div>
          </div>

          {/* Size + Qty */}
          <div className="text-[11px]">
            <span className="text-muted-foreground/40 mr-1.5">Size</span>
            <span className="font-mono font-bold text-white/50">{formatUsd(trade.positionSize)}</span>
            <span className="text-muted-foreground/40 ml-3 mr-1.5">Qty</span>
            <span className="font-mono font-bold text-white/50">{trade.quantity}</span>
          </div>

          {/* Targets */}
          <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
            <div className="flex items-center gap-1.5">
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
                      "text-[9px] font-bold px-1.5 py-0.5 rounded",
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
              {trade.slHit && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400">SL✓</span>
              )}
            </div>
            <span className="text-[9px] font-bold text-muted-foreground/40">
              {trade.events?.length || 0} events
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Trade Narration Dialog ──────────────────────────

function LiveTradeNarrationDialog({ trade, onClose }: { trade: LiveTrade | null; onClose: () => void }) {
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
            <span className="text-lg font-black uppercase tracking-tight">{trade.signalSymbol}</span>
            <Badge className={cn("text-[9px] font-black h-5 uppercase px-2", isBuy ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400")}>
              {trade.side}
            </Badge>
            <span className="text-[11px] text-muted-foreground/60">{chartLabel} · {trade.leverage}x</span>
            {isOpen ? (
              <Badge className="text-[9px] font-black h-5 uppercase px-2 bg-amber-400/15 text-amber-400 ml-auto">Open</Badge>
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
            <span className="text-muted-foreground/40">Qty</span>
            <span className="font-mono font-bold text-white/70">{trade.quantity}</span>
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
            <span className="text-muted-foreground/40">Balance</span>
            <span className="font-mono font-bold text-white/70">{formatUsd(trade.capitalAtEntry)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">Order IDs</span>
            <span className="font-mono font-bold text-white/40 text-[9px] truncate max-w-[100px]">{trade.entryOrderId?.slice(-8) || "—"}</span>
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
                      {evt.orderId && <span className="text-muted-foreground/30"> · ID: {evt.orderId.slice(-8)}</span>}
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

                  {(evt.type === "MARKET_TURN" || evt.type === "SCORE_DEGRADED" || evt.type === "KILL_SWITCH") && (
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5 space-y-0.5">
                      <div>
                        Emergency close @ <span className="font-mono text-white/60">${formatPrice(evt.price)}</span>
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
              <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-0.5">Net Result</div>
              <div className={cn("text-sm font-black font-mono", (trade.realizedPnl - trade.fees) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                {(trade.realizedPnl - trade.fees) >= 0 ? "+" : ""}{formatUsd(trade.realizedPnl)}
              </div>
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

// ── Log Row ──────────────────────────

const LOG_ACTION_STYLES: Record<string, { color: string; bg: string }> = {
  TRADE_OPENED: { color: "text-emerald-400", bg: "bg-emerald-400/10" },
  TRADE_FAILED: { color: "text-rose-400", bg: "bg-rose-400/10" },
  ERROR: { color: "text-rose-400", bg: "bg-rose-400/10" },
  EVALUATING: { color: "text-accent", bg: "bg-accent/10" },
  SKIPPED: { color: "text-muted-foreground/60", bg: "bg-white/5" },
  SL_HIT: { color: "text-rose-400", bg: "bg-rose-400/10" },
  TP1_HIT: { color: "text-emerald-400", bg: "bg-emerald-400/10" },
  TP2_HIT: { color: "text-emerald-400", bg: "bg-emerald-400/10" },
  TP3_HIT: { color: "text-emerald-400", bg: "bg-emerald-400/10" },
  SL_TO_BREAKEVEN: { color: "text-accent", bg: "bg-accent/10" },
  MARKET_TURN_CLOSE: { color: "text-amber-400", bg: "bg-amber-400/10" },
  SCORE_DEGRADED_CLOSE: { color: "text-amber-400", bg: "bg-amber-400/10" },
  AUTO_KILL_SWITCH: { color: "text-rose-400", bg: "bg-rose-400/15" },
  WARNING: { color: "text-amber-400", bg: "bg-amber-400/10" },
};

function LogRow({ log }: { log: { timestamp: string; action: string; details: string; symbol?: string } }) {
  const style = LOG_ACTION_STYLES[log.action] ?? { color: "text-muted-foreground/50", bg: "bg-white/5" };
  const ts = log.timestamp ? format(new Date(log.timestamp), "MMM dd, HH:mm:ss") : "—";

  return (
    <div className="flex items-start gap-3 py-2 px-3 rounded-lg hover:bg-white/[0.02] transition-colors">
      <Badge className={cn("text-[8px] font-black h-5 px-2 uppercase shrink-0 mt-0.5", style.bg, style.color)}>
        {log.action.replace(/_/g, " ")}
      </Badge>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-foreground/70 leading-relaxed break-words">{log.details}</p>
        {log.symbol && (
          <span className="text-[9px] font-bold text-muted-foreground/30 uppercase">{log.symbol}</span>
        )}
      </div>
      <span className="text-[9px] font-mono text-muted-foreground/30 shrink-0 mt-0.5">{ts}</span>
    </div>
  );
}
