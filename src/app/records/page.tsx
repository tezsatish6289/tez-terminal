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
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useUser } from "@/firebase";
import { TopBar } from "@/components/dashboard/TopBar";
import { BlockchainTxCell } from "@/lib/blockchain-trade-display";
import { buildEquityCurve } from "@/lib/equity-curve";
import { cn } from "@/lib/utils";
import type { CryptoBotId } from "@/lib/crypto-bots";
import { CRYPTO_BOTS } from "@/lib/crypto-bots";

const ADMIN_EMAIL = "hello@tezterminal.com";
const PAGE_SIZE = 50;

interface BotMeta {
  id: CryptoBotId;
  label: string;
  shortLabel: string;
  publicLive: boolean;
  startingCapital: number;
}

interface RecordTrade {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  botId: CryptoBotId;
  botLabel: string;
  publicLive: boolean;
  entryPrice: number;
  currentPrice: number | null;
  realizedPnl: number;
  positionSize: number | null;
  leverage: number;
  capitalAfter: number | null;
  openedAt: string;
  closedAt: string | null;
  blockchainStatus: string | null;
  blockchainError: string | null;
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

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date}, ${time}`;
}

function fmtBalance(balance: number | undefined | null) {
  if (balance == null) return "—";
  return `$${balance.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtAbsolutePnl(trade: RecordTrade) {
  const val = trade.realizedPnl ?? 0;
  const positive = val >= 0;
  const display = `${positive ? "+" : ""}$${Math.abs(val).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  return { display, positive };
}

function RecordsTradeTable({
  trades,
  balanceAfterMap,
}: {
  trades: RecordTrade[];
  balanceAfterMap: Map<string, number>;
}) {
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [trades]);

  const sorted = useMemo(
    () =>
      [...trades].sort(
        (a, b) =>
          new Date(b.closedAt ?? 0).getTime() -
          new Date(a.closedAt ?? 0).getTime(),
      ),
    [trades],
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageTrades = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const fundBalance = (t: RecordTrade) =>
    t.capitalAfter ?? balanceAfterMap.get(t.id);

  const headers = [
    "Bot",
    "Entry / Exit Time",
    "Symbol",
    "Side",
    "Position Size",
    "Leverage",
    "Entry Price",
    "Exit Price",
    "P&L",
    "Fund Balance",
    "Publish",
    "Proof of Trade",
  ];

  return (
    <div className="space-y-3">
      <div className="sm:hidden space-y-2">
        {pageTrades.length === 0 ? (
          <p className="text-center py-10 text-sm text-muted-foreground">
            No closed trades for this filter
          </p>
        ) : (
          pageTrades.map((t) => {
            const { display: pnlDisplay, positive: pnlPositive } =
              fmtAbsolutePnl(t);
            return (
              <div
                key={t.id}
                className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-[10px] font-bold text-muted-foreground mb-1">
                      {t.botLabel}
                    </div>
                    <span className="text-base font-black">{t.symbol}</span>
                    <span
                      className={cn(
                        "text-xs font-bold ml-2",
                        t.side === "BUY" ? "text-emerald-400" : "text-rose-400",
                      )}
                    >
                      {t.side === "BUY" ? "Long" : "Short"}
                    </span>
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded ml-1.5 bg-blue-500/10 text-blue-400 border border-blue-500/15">
                      {t.leverage}x
                    </span>
                  </div>
                  <div
                    className={cn(
                      "flex items-center gap-1 font-mono text-base font-black",
                      pnlPositive ? "text-emerald-400" : "text-rose-400",
                    )}
                  >
                    {pnlPositive ? (
                      <TrendingUp className="h-4 w-4" />
                    ) : (
                      <TrendingDown className="h-4 w-4" />
                    )}
                    {pnlDisplay}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-3">
                  <div>
                    <span className="text-[9px] uppercase tracking-wider block mb-0.5 text-muted-foreground/50">
                      Entry Price
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {fmtPrice(t.entryPrice)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider block mb-0.5 text-muted-foreground/50">
                      Exit Price
                    </span>
                    <span className="font-mono">{fmtPrice(t.currentPrice)}</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider block mb-0.5 text-muted-foreground/50">
                      Opened
                    </span>
                    <span className="font-mono text-accent">
                      {fmtDateTime(t.openedAt)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider block mb-0.5 text-muted-foreground/50">
                      Closed
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {fmtDateTime(t.closedAt)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider block mb-0.5 text-muted-foreground/50">
                      Position Size
                    </span>
                    <span className="font-mono">
                      {t.positionSize != null
                        ? `$${t.positionSize.toFixed(2)}`
                        : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-wider block mb-0.5 text-muted-foreground/50">
                      Fund Balance
                    </span>
                    <span className="font-mono text-muted-foreground">
                      {fmtBalance(fundBalance(t))}
                    </span>
                  </div>
                </div>
                <BlockchainTxCell trade={t} size="md" />
              </div>
            );
          })
        )}
      </div>

      <div className="hidden sm:block rounded-xl border border-white/[0.08] overflow-x-auto">
        <table className="w-full min-w-[1200px] text-left">
          <thead>
            <tr className="border-b border-white/[0.06] bg-white/[0.02]">
              {headers.map((h) => (
                <th
                  key={h}
                  className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageTrades.length === 0 ? (
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-3 py-12 text-center text-sm text-muted-foreground"
                >
                  No closed trades for this filter
                </td>
              </tr>
            ) : (
              pageTrades.map((t) => {
                const posSize =
                  t.positionSize != null
                    ? `$${t.positionSize.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`
                    : "—";
                const { display: pnlDisplay, positive: pnlPositive } =
                  fmtAbsolutePnl(t);

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
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-mono text-accent">
                          {fmtDateTime(t.openedAt)}
                        </span>
                        <span className="text-[11px] font-mono text-muted-foreground/50">
                          → {fmtDateTime(t.closedAt)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono font-bold">
                      {t.symbol}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2.5 text-[11px] font-bold",
                        t.side === "BUY" ? "text-emerald-400" : "text-rose-400",
                      )}
                    >
                      {t.side === "BUY" ? "Long" : "Short"}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground">
                      {posSize}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/15">
                        {t.leverage}x
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono text-muted-foreground">
                      {fmtPrice(t.entryPrice)}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono">
                      {fmtPrice(t.currentPrice)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div
                        className={cn(
                          "flex items-center gap-1 font-mono text-[11px] font-bold",
                          pnlPositive ? "text-emerald-400" : "text-rose-400",
                        )}
                      >
                        {pnlPositive ? (
                          <TrendingUp className="h-3.5 w-3.5" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5" />
                        )}
                        {pnlDisplay}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[11px] font-mono font-bold text-muted-foreground">
                      {fmtBalance(fundBalance(t))}
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-bold text-muted-foreground/60">
            {page * PAGE_SIZE + 1}–
            {Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}{" "}
            trades
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0}
              className="px-4 py-1.5 rounded-lg text-xs font-bold border border-white/10 bg-white/[0.03] text-accent transition-all disabled:opacity-30"
            >
              ← Prev
            </button>
            <span className="text-xs font-bold text-muted-foreground">
              {page + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages - 1}
              className="px-4 py-1.5 rounded-lg text-xs font-bold border border-white/10 bg-white/[0.03] text-accent transition-all disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
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

  const startingCapitalByBot = useMemo(() => {
    const map = new Map<CryptoBotId, number>();
    for (const b of tabBots) {
      map.set(b.id, b.startingCapital);
    }
    for (const b of CRYPTO_BOTS) {
      if (!map.has(b.id)) map.set(b.id, 1000);
    }
    return map;
  }, [tabBots]);

  const balanceAfterMap = useMemo(() => {
    const map = new Map<string, number>();
    if (botFilter !== "all") {
      const cap = startingCapitalByBot.get(botFilter) ?? 1000;
      return buildEquityCurve(trades, cap).balanceAfterMap;
    }
    for (const bot of CRYPTO_BOTS) {
      const botTrades = trades.filter((t) => t.botId === bot.id);
      const cap = startingCapitalByBot.get(bot.id) ?? 1000;
      for (const [k, v] of buildEquityCurve(botTrades, cap).balanceAfterMap) {
        map.set(k, v);
      }
    }
    return map;
  }, [trades, botFilter, startingCapitalByBot]);

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
                All closed sim trades — published and hidden bots. Same columns
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
                {
                  label: "On-chain",
                  value: summary.confirmed,
                  tone: "text-emerald-400",
                },
                {
                  label: "Publishing",
                  value: summary.pending,
                  tone: "text-amber-300",
                },
                {
                  label: "Failed",
                  value: summary.failed,
                  tone: "text-rose-400",
                },
                {
                  label: "Awaiting queue",
                  value: summary.awaitingQueue,
                  tone: "text-muted-foreground",
                },
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
            <RecordsTradeTable
              trades={trades}
              balanceAfterMap={balanceAfterMap}
            />
          )}
        </div>
      </main>
    </div>
  );
}
