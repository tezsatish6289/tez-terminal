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
  DollarSign,
  Activity,
  AlertTriangle,
  BarChart3,
  Zap,
  Shield,
} from "lucide-react";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ExchangeSettingsDialog, ExchangeStatusBadge, useExchangeConfig } from "@/components/exchange/ExchangeSettings";
import type { LiveTrade } from "@/lib/trade-engine";
import { format } from "date-fns";

function formatUsd(val: number): string {
  return `$${val.toFixed(2)}`;
}

function formatPrice(val: number | null | undefined): string {
  if (val == null || val === 0) return "—";
  if (val >= 100) return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val >= 1) return val.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return val.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

export default function LiveTradingPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const { config, isLoading: configLoading } = useExchangeConfig(user?.uid);
  const [tab, setTab] = useState<"overview" | "trades">("overview");
  const [balance, setBalance] = useState<{ total: number; available: number } | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/settings/balance?uid=${user.uid}`);
      const data = await res.json();
      if (data.total !== undefined) setBalance(data);
    } catch { /* ignore */ }
  }, [user]);

  useEffect(() => {
    if (user && config?.configured && !config.useTestnet) fetchBalance();
  }, [user, config, fetchBalance]);

  // Auto-refresh balance every 60s
  useEffect(() => {
    if (!user || !config?.configured || config.useTestnet) return;
    const interval = setInterval(fetchBalance, 60000);
    return () => clearInterval(interval);
  }, [user, config, fetchBalance]);

  const liveTradesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "live_trades"),
      where("testnet", "==", false),
      orderBy("openedAt", "desc"),
      limit(100),
    );
  }, [firestore, user]);
  const { data: rawLiveTrades, isLoading: tradesLoading } = useCollection(liveTradesQuery);

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

  const isConfiguredForProd = config?.configured && !config.useTestnet;

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
                    {isConfiguredForProd
                      ? config.autoTradeEnabled
                        ? "Auto-trade is LIVE. Real trades executing on Bybit."
                        : "Connected but auto-trade is off. No trades will execute."
                      : "Not connected. Configure production API keys to start."}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ExchangeStatusBadge config={config} />
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
                <p className="text-[11px] text-muted-foreground/30 mt-1">Click Settings above to connect your Bybit production API keys.</p>
                <p className="text-[10px] text-muted-foreground/20 mt-3">
                  Test your setup first using the{" "}
                  <Link href="/simulation" className="text-blue-400 hover:underline">Bybit Testnet simulator</Link>.
                </p>
              </div>
            ) : (
              <>
                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <StatCard
                    label="Total Balance"
                    value={balance ? formatUsd(balance.total) : "—"}
                    icon={<DollarSign className="w-3.5 h-3.5" />}
                    color="text-amber-400"
                  />
                  <StatCard
                    label="Available"
                    value={balance ? formatUsd(balance.available) : "—"}
                    icon={<Shield className="w-3.5 h-3.5" />}
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
                  {(["overview", "trades"] as const).map((t) => (
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
                      {t === "overview" ? `Open (${openTrades.length})` : `History (${closedTrades.length})`}
                    </button>
                  ))}
                </div>

                {tradesLoading ? (
                  <div className="flex items-center justify-center h-20">
                    <Loader2 className="h-5 w-5 animate-spin text-amber-400/50" />
                  </div>
                ) : tab === "overview" ? (
                  openTrades.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground/30">
                      <Activity className="w-6 h-6 mx-auto mb-2" />
                      <p className="text-xs font-bold">No open positions</p>
                      <p className="text-[10px] text-muted-foreground/20 mt-1">
                        {config.autoTradeEnabled ? "Waiting for signals that pass all filters." : "Enable auto-trade in Settings to start."}
                      </p>
                    </div>
                  ) : (
                    <LiveTradeList trades={openTrades} />
                  )
                ) : (
                  closedTrades.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground/30">
                      <BarChart3 className="w-6 h-6 mx-auto mb-2" />
                      <p className="text-xs font-bold">No trade history yet</p>
                    </div>
                  ) : (
                    <LiveTradeList trades={closedTrades} />
                  )
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

function LiveTradeList({ trades }: { trades: LiveTrade[] }) {
  return (
    <div className="space-y-2">
      {trades.map((trade) => (
        <LiveTradeCard key={trade.id} trade={trade} />
      ))}
    </div>
  );
}

function LiveTradeCard({ trade }: { trade: LiveTrade }) {
  const isBuy = trade.side === "BUY";
  const isOpen = trade.status === "OPEN";

  return (
    <div className={cn(
      "rounded-lg border p-3 space-y-2",
      isOpen ? "border-amber-400/15 bg-white/[0.02]" : "border-white/[0.06] bg-white/[0.01]"
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href={`/chart/${trade.signalId}`} className="text-sm font-black text-foreground uppercase tracking-tight hover:text-accent transition-colors">
            {trade.signalSymbol}
          </Link>
          <Badge className={cn("text-[9px] font-black h-5 px-2", isBuy ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400")}>
            {trade.side}
          </Badge>
          <span className="text-[9px] font-bold text-muted-foreground/40">{trade.leverage}x</span>
          <span className="text-[9px] text-muted-foreground/30">{trade.timeframe}m</span>
        </div>
        <div className="flex items-center gap-2">
          {isOpen ? (
            <Badge className="text-[9px] font-black h-5 px-2 bg-amber-400/15 text-amber-400">Open</Badge>
          ) : (
            <Badge className={cn("text-[9px] font-black h-5 px-2",
              trade.realizedPnl >= 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
            )}>
              {trade.closeReason || "Closed"}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 text-[11px] flex-wrap">
        <div>
          <span className="text-muted-foreground/40 mr-1">Entry</span>
          <span className="font-mono font-bold text-white/60">${formatPrice(trade.entryPrice)}</span>
        </div>
        <div>
          <span className="text-muted-foreground/40 mr-1">Qty</span>
          <span className="font-mono font-bold text-white/60">{trade.quantity}</span>
        </div>
        <div>
          <span className="text-muted-foreground/40 mr-1">Size</span>
          <span className="font-mono font-bold text-white/60">${trade.positionSize.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-muted-foreground/40 mr-1">P&L</span>
          <span className={cn("font-mono font-bold", trade.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
            {trade.realizedPnl >= 0 ? "+" : ""}{formatUsd(trade.realizedPnl)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground/40 mr-1">Fees</span>
          <span className="font-mono font-bold text-muted-foreground/40">{formatUsd(trade.fees)}</span>
        </div>
      </div>

      {/* TP/SL progress */}
      <div className="flex items-center gap-1.5 text-[9px] font-bold">
        {[
          { num: 1, hit: trade.tp1Hit },
          { num: 2, hit: trade.tp2Hit },
          { num: 3, hit: trade.tp3Hit },
        ].map((tp) => (
          <span
            key={tp.num}
            className={cn(
              "px-1.5 py-0.5 rounded",
              tp.hit ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 text-muted-foreground/40"
            )}
          >
            TP{tp.num}{tp.hit ? "✓" : ""}
          </span>
        ))}
        {trade.slHit && (
          <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400">SL✓</span>
        )}
        <span className="text-muted-foreground/30 ml-auto">
          {format(new Date(trade.openedAt), "MMM dd, HH:mm")}
        </span>
      </div>
    </div>
  );
}
