"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useUser } from "@/firebase";
import { TopBar } from "@/components/dashboard/TopBar";
import { BlockchainTxCell } from "@/lib/blockchain-trade-display";
import { cn } from "@/lib/utils";
import type { CryptoBotId } from "@/lib/crypto-bots";

const ADMIN_EMAIL = "hello@tezterminal.com";

interface BotMeta {
  id: CryptoBotId;
  label: string;
  shortLabel: string;
  publicLive: boolean;
}

interface RecordTrade {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  botLabel: string;
  publicLive: boolean;
  entryPrice: number;
  currentPrice: number | null;
  realizedPnl: number;
  blockchainStatus: string | null;
  blockchainError: string | null;
  closedAt: string | null;
  txHash: string | null;
}

interface Summary {
  total: number;
  confirmed: number;
  pending: number;
  failed: number;
  awaitingQueue: number;
}

function fmtPrice(n: number | null) {
  if (n == null) return "—";
  const decimals = n < 1 ? 4 : 2;
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function fmtDt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function InternalRecordsPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const isAdmin = user?.email === ADMIN_EMAIL;

  const [botFilter, setBotFilter] = useState<CryptoBotId | "all">("all");
  const [bots, setBots] = useState<BotMeta[]>([]);
  const [trades, setTrades] = useState<RecordTrade[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isUserLoading && !user) router.replace("/");
    if (!isUserLoading && user && !isAdmin) router.replace("/simulation");
  }, [isUserLoading, user, isAdmin, router]);

  const fetchRecords = useCallback(async () => {
    if (!user || !isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const idToken = await user.getIdToken();
      const q = botFilter === "all" ? "" : `?bot=${botFilter}`;
      const res = await fetch(`/api/admin/blockchain-records${q}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setBots(data.bots ?? []);
      setTrades(data.trades ?? []);
      setSummary(data.summary ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load records");
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, botFilter]);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  const tabBots = useMemo(() => (bots.length ? bots : []), [bots]);

  if (isUserLoading || !user || !isAdmin) {
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
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 max-w-[1400px] mx-auto w-full">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <Link
                href="/simulation"
                className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-accent transition-colors"
              >
                <ArrowLeft className="h-3 w-3" />
                Simulator
              </Link>
              <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-accent" />
                Blockchain records
              </h1>
              <p className="text-[11px] text-muted-foreground max-w-xl">
                All closed sim trades — published and hidden bots. Same pipeline
                as{" "}
                <a
                  href="https://freedombot.ai/records"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  freedombot.ai/records
                </a>
                , without the public filter.
              </p>
            </div>
            <a
              href="https://freedombot.ai/records"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-accent transition-colors"
            >
              Public records
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                { label: "Closed", value: summary.total },
                { label: "On-chain", value: summary.confirmed, tone: "text-emerald-400" },
                { label: "Publishing", value: summary.pending, tone: "text-amber-300" },
                { label: "Failed", value: summary.failed, tone: "text-rose-400" },
                { label: "Awaiting queue", value: summary.awaitingQueue, tone: "text-muted-foreground" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5"
                >
                  <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                    {s.label}
                  </div>
                  <div className={cn("text-lg font-black tabular-nums", s.tone)}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setBotFilter("all")}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-colors",
                botFilter === "all"
                  ? "bg-accent text-black border-accent"
                  : "border-white/10 text-muted-foreground hover:text-foreground",
              )}
            >
              All
            </button>
            {tabBots.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBotFilter(b.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-colors",
                  botFilter === b.id
                    ? "bg-accent text-black border-accent"
                    : "border-white/10 text-muted-foreground hover:text-foreground",
                )}
              >
                {b.shortLabel}
                {b.publicLive ? (
                  <Eye className="h-3 w-3 opacity-70" aria-label="Published" />
                ) : (
                  <EyeOff className="h-3 w-3 opacity-50" aria-label="Hidden" />
                )}
              </button>
            ))}
          </div>

          {error ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading records…
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.08] overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead>
                  <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                    {[
                      "Bot",
                      "Symbol",
                      "Side",
                      "Entry",
                      "Exit",
                      "PnL",
                      "Closed",
                      "Publish",
                      "On-chain",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground/50"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trades.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-12 text-center text-sm text-muted-foreground">
                        No closed trades for this filter
                      </td>
                    </tr>
                  ) : (
                    trades.map((t) => {
                      const pnlPos = t.realizedPnl >= 0;
                      return (
                        <tr
                          key={t.id}
                          className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                        >
                          <td className="px-3 py-2.5">
                            <div className="text-[11px] font-bold">{t.botLabel}</div>
                            <div className="text-[9px] text-muted-foreground/50 flex items-center gap-1">
                              {t.publicLive ? (
                                <>
                                  <Eye className="h-2.5 w-2.5" /> Published
                                </>
                              ) : (
                                <>
                                  <EyeOff className="h-2.5 w-2.5" /> Hidden
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-[11px] font-mono">{t.symbol}</td>
                          <td
                            className={cn(
                              "px-3 py-2.5 text-[11px] font-bold",
                              t.side === "BUY" ? "text-emerald-400" : "text-rose-400",
                            )}
                          >
                            {t.side}
                          </td>
                          <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground">
                            {fmtPrice(t.entryPrice)}
                          </td>
                          <td className="px-3 py-2.5 text-[11px] font-mono">
                            {fmtPrice(t.currentPrice)}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2.5 text-[11px] font-mono font-bold",
                              pnlPos ? "text-emerald-400" : "text-rose-400",
                            )}
                          >
                            {pnlPos ? "+" : ""}${t.realizedPnl.toFixed(2)}
                          </td>
                          <td className="px-3 py-2.5 text-[10px] font-mono text-muted-foreground">
                            {fmtDt(t.closedAt)}
                          </td>
                          <td className="px-3 py-2.5 text-[10px] font-mono uppercase text-muted-foreground/70">
                            {t.blockchainStatus ?? "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <BlockchainTxCell trade={t} size="md" />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
