"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { useUser } from "@/firebase";
import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  ShieldAlert,
  Wallet,
  RefreshCw,
  Copy,
  CheckCheck,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Zap,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ── Types ─────────────────────────────────────────────────────

interface WalletData {
  wallet: {
    address: string;
    balanceSol: number;
    minBalanceSol: number;
    isLow: boolean;
    solscanUrl: string;
    depositInstruction: string;
  };
  stats: {
    confirmed: number;
    pending: number;
    failed: number;
  };
  recentTrades: {
    id: string;
    symbol: string;
    side: string;
    assetType: string;
    realizedPnl: number;
    txHash: string;
    blockchainConfirmedAt: string;
    closedAt: string;
  }[];
}

// ── Helpers ───────────────────────────────────────────────────

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

function shortHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}

// ── Page ──────────────────────────────────────────────────────

export default function BlockchainWalletPage() {
  const { user, loading: userLoading } = useUser();
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"address" | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/blockchain/wallet");
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Failed to load");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load wallet data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const copyAddress = () => {
    if (!data) return;
    navigator.clipboard.writeText(data.wallet.address);
    setCopied("address");
    setTimeout(() => setCopied(null), 2000);
  };

  // ── Guards ────────────────────────────────────────────────
  if (userLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
        <ShieldAlert className="h-8 w-8 text-rose-400" />
        <p className="text-sm font-bold text-muted-foreground">Sign in required</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <Link2 className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white tracking-tight">Blockchain Publisher</h1>
              <p className="text-xs text-muted-foreground">Solana mainnet · Memo program · Finalized commitment</p>
            </div>
          </div>
          <button
            onClick={load}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/8 border border-white/5 text-xs font-bold text-muted-foreground hover:text-white transition-all"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            Refresh
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
            <p className="text-sm text-rose-400">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <>
            {/* Low balance warning */}
            {data.wallet.isLow && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-400">Low Balance Warning</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Balance is below the {data.wallet.minBalanceSol} SOL minimum threshold.
                    New trades will not be published until the wallet is funded.
                  </p>
                  <p className="text-xs font-mono text-amber-400/70 mt-1">{data.wallet.depositInstruction}</p>
                </div>
              </div>
            )}

            {/* Wallet card */}
            <div className={cn(
              "rounded-2xl border p-6 space-y-4",
              data.wallet.isLow
                ? "border-amber-500/20 bg-gradient-to-b from-amber-500/5 to-transparent"
                : "border-purple-500/20 bg-gradient-to-b from-purple-500/5 to-transparent"
            )}>
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-purple-400" />
                <span className="text-xs font-black uppercase tracking-wider text-purple-400">Signing Wallet</span>
              </div>

              {/* Address */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">Wallet Address</span>
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono font-bold text-white/80 break-all">{data.wallet.address}</code>
                  <button
                    onClick={copyAddress}
                    className="shrink-0 h-7 w-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-colors"
                    title="Copy address"
                  >
                    {copied === "address"
                      ? <CheckCheck className="h-3.5 w-3.5 text-emerald-400" />
                      : <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    }
                  </button>
                  <a
                    href={data.wallet.solscanUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 h-7 w-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-colors"
                    title="View on Solscan"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-purple-400" />
                  </a>
                </div>
              </div>

              {/* Balance */}
              <div className="flex items-end gap-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 block mb-1">SOL Balance</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className={cn(
                      "text-3xl font-black tabular-nums",
                      data.wallet.isLow ? "text-amber-400" : "text-white"
                    )}>
                      {data.wallet.balanceSol.toFixed(4)}
                    </span>
                    <span className="text-sm font-bold text-muted-foreground">SOL</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground/40 mt-0.5 block">
                    ≈ {Math.floor(data.wallet.balanceSol / 0.000005).toLocaleString()} trade publications remaining
                  </span>
                </div>
                {data.wallet.isLow && (
                  <div className="ml-auto">
                    <span className="text-[10px] font-bold text-amber-400/60 uppercase tracking-wide">Min required</span>
                    <p className="text-sm font-bold text-amber-400">{data.wallet.minBalanceSol} SOL</p>
                  </div>
                )}
              </div>

              {/* Explorer links */}
              <div className="flex items-center gap-2 pt-1 border-t border-white/[0.04]">
                <span className="text-[10px] text-muted-foreground/40 font-bold uppercase tracking-wide">View on:</span>
                <a
                  href={data.wallet.solscanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-bold text-purple-400/70 hover:text-purple-400 transition-colors flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" /> Solscan
                </a>
                <span className="text-white/10">·</span>
                <a
                  href={`https://explorer.solana.com/address/${data.wallet.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-bold text-purple-400/70 hover:text-purple-400 transition-colors flex items-center gap-1"
                >
                  <ExternalLink className="h-3 w-3" /> Solana Explorer
                </a>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                label="Published"
                value={data.stats.confirmed.toLocaleString()}
                sub="on-chain confirmed"
                color="emerald"
              />
              <StatCard
                icon={<Clock className="h-4 w-4 text-amber-400" />}
                label="Pending"
                value={data.stats.pending.toLocaleString()}
                sub="awaiting publish"
                color="amber"
              />
              <StatCard
                icon={<AlertTriangle className="h-4 w-4 text-rose-400" />}
                label="Failed"
                value={data.stats.failed.toLocaleString()}
                sub="will auto-retry"
                color="rose"
              />
            </div>

            {/* Recent transactions */}
            {data.recentTrades.length > 0 && (
              <div className="rounded-2xl border border-white/[0.06] bg-card overflow-hidden">
                <div className="px-5 py-4 border-b border-white/[0.05] flex items-center gap-2">
                  <Zap className="h-4 w-4 text-purple-400" />
                  <span className="text-sm font-black text-white">Recent On-Chain Trades</span>
                  <span className="ml-auto text-[10px] text-muted-foreground/40 font-bold uppercase">Last {data.recentTrades.length}</span>
                </div>
                <div className="divide-y divide-white/[0.04]">
                  {data.recentTrades.map((trade) => (
                    <div key={trade.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                      {/* Side indicator */}
                      <div className={cn(
                        "h-7 w-7 rounded-lg flex items-center justify-center shrink-0 text-[9px] font-black",
                        trade.side === "BUY"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-rose-500/10 text-rose-400"
                      )}>
                        {trade.side === "BUY" ? "B" : "S"}
                      </div>

                      {/* Symbol + asset */}
                      <div className="min-w-0">
                        <p className="text-sm font-black text-white uppercase tracking-tight leading-none">{trade.symbol}</p>
                        <p className="text-[9px] text-muted-foreground/40 font-bold uppercase mt-0.5">{trade.assetType?.replace("_", " ")}</p>
                      </div>

                      {/* PnL */}
                      <div className={cn(
                        "flex items-center gap-1 font-mono text-xs font-black ml-auto",
                        trade.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                      )}>
                        {trade.realizedPnl >= 0
                          ? <TrendingUp className="h-3 w-3" />
                          : <TrendingDown className="h-3 w-3" />
                        }
                        {trade.realizedPnl >= 0 ? "+" : ""}{trade.realizedPnl.toFixed(2)}
                      </div>

                      {/* Date */}
                      <div className="text-right shrink-0">
                        <p className="text-[9px] font-mono text-muted-foreground/40">
                          {trade.blockchainConfirmedAt
                            ? format(new Date(trade.blockchainConfirmedAt), "MMM dd, HH:mm")
                            : "—"}
                        </p>
                      </div>

                      {/* Explorer links */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={`https://solscan.io/tx/${trade.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-6 px-2 rounded-md bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-[9px] font-bold text-purple-400 flex items-center gap-1 transition-colors"
                          title={trade.txHash}
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                          {shortHash(trade.txHash)}
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.recentTrades.length === 0 && (
              <div className="rounded-2xl border border-white/[0.06] bg-card px-6 py-10 text-center">
                <Link2 className="h-8 w-8 text-muted-foreground/20 mx-auto mb-3" />
                <p className="text-sm font-bold text-muted-foreground/40">No confirmed trades yet</p>
                <p className="text-xs text-muted-foreground/25 mt-1">Trades will appear here after the blockchain-publish cron runs</p>
              </div>
            )}

            {/* Info footer */}
            <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40">How it works</p>
              <p className="text-xs text-muted-foreground/50">
                Every closed simulator trade is written to Solana mainnet via the Memo program.
                Each transaction contains the trade data as a compact JSON string.
                Transactions use <span className="text-white/60 font-bold">finalized</span> commitment — permanently irreversible.
                Failed publishes auto-retry with exponential backoff (1m → 30m cap).
              </p>
              <p className="text-xs text-muted-foreground/30 pt-0.5">
                Cost: ~0.000005 SOL per trade · Program: MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: "emerald" | "amber" | "rose";
}) {
  const colors = {
    emerald: "border-emerald-500/15 bg-emerald-500/5",
    amber: "border-amber-500/15 bg-amber-500/5",
    rose: "border-rose-500/15 bg-rose-500/5",
  };
  return (
    <div className={cn("rounded-xl border p-4 space-y-2", colors[color])}>
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/60">{label}</span>
      </div>
      <p className="text-2xl font-black text-white tabular-nums">{value}</p>
      <p className="text-[10px] text-muted-foreground/40 font-bold">{sub}</p>
    </div>
  );
}
