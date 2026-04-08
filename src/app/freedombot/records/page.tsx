"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  Loader2,
  Rocket,
  TrendingUp,
  TrendingDown,
  ExternalLink,
} from "lucide-react";
import { useUser, useAuth } from "@/firebase";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { useRouter } from "next/navigation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BotStats {
  runningDays: number;
  currentCapital: number;
  startingCapital: number;
  totalReturnPct: number | null;
  profitPerMonth: number | null;
  profitPerYear: number | null;
}

interface Trade {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  assetType: string;
  timeframe: string | null;
  leverage: number;
  entryPrice: number;
  currentPrice: number | null;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  slHit: boolean;
  status: "OPEN" | "CLOSED";
  realizedPnl: number;
  unrealizedPnl: number;
  positionSize: number | null;
  closeReason: string | null;
  openedAt: string;
  closedAt: string | null;
  blockchainTxHash: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const tfLabels: Record<string, string> = {
  "5": "5m", "15": "15m", "60": "1h", "240": "4h", D: "1D", W: "1W",
};

function fmt(n: number | null, suffix = "%") {
  if (n === null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}${suffix}`;
}

function fmtCapital(n: number | null | undefined) {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPrice(n: number | null, assetType: string) {
  if (n == null) return "—";
  const curr = assetType === "INDIAN_STOCKS" ? "₹" : "$";
  const decimals = n < 1 ? 6 : 2;
  return `${curr}${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date}, ${time}`;
}

function fmtAbsolutePnl(trade: Trade, assetType: string): { display: string; positive: boolean } {
  const curr = assetType === "INDIAN_STOCKS" ? "₹" : "$";
  const val = trade.realizedPnl ?? 0;
  const positive = val >= 0;
  const display = `${positive ? "+" : ""}${curr}${Math.abs(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return { display, positive };
}

function fmtBalance(trade: Trade, assetType: string): string {
  const curr = assetType === "INDIAN_STOCKS" ? "₹" : "$";
  if (trade.capitalAtEntry == null) return "—";
  const balance = trade.capitalAtEntry + (trade.realizedPnl ?? 0);
  return `${curr}${balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}


// ─── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div
      className="flex flex-col px-4 py-3.5 rounded-xl"
      style={{ backgroundColor: "#060d1a", border: "1px solid rgba(90,140,220,0.1)" }}
    >
      <span className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#334155" }}>
        {label}
      </span>
      <span className="text-base font-black font-mono" style={{ color: color ?? "#f0f4ff" }}>
        {value}
      </span>
      {sub && (
        <span
          className="text-[9px] font-black uppercase tracking-wider mt-1.5 px-1.5 py-0.5 rounded self-start"
          style={{ backgroundColor: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}

// ─── Trade Table ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

function TradeTable({ trades, assetType }: { trades: Trade[]; assetType: string }) {
  const [page, setPage] = useState(0);

  // Only closed trades, sorted latest closure first
  const closed = useMemo(() => {
    return trades
      .filter((t) => t.status === "CLOSED" && t.closedAt)
      .sort((a, b) => new Date(b.closedAt!).getTime() - new Date(a.closedAt!).getTime());
  }, [trades]);

  const totalPages = Math.max(1, Math.ceil(closed.length / PAGE_SIZE));
  const pageTrades = closed.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const headers = [
    "Entry / Exit Time",
    "Symbol",
    "Side",
    "Position Size",
    "Leverage",
    "Entry Price",
    "Exit Price",
    "P&L",
    "Fund Balance",
    "Proof of Trade",
  ];

  return (
    <div className="space-y-3">
      <div
        className="rounded-2xl overflow-x-auto"
        style={{ border: "1px solid rgba(90,140,220,0.1)" }}
      >
        <table className="w-full min-w-[1050px]">
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(90,140,220,0.1)", backgroundColor: "#060d1a" }}>
              {headers.map((h) => (
                <th
                  key={h}
                  className="px-4 py-3.5 text-left text-[9px] font-black uppercase tracking-widest whitespace-nowrap"
                  style={{ color: "#1e3a5f" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageTrades.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-14">
                  <p className="text-sm font-bold" style={{ color: "#1e3a5f" }}>No closed trades yet</p>
                </td>
              </tr>
            ) : (
              pageTrades.map((trade) => {
                const curr = assetType === "INDIAN_STOCKS" ? "₹" : "$";
                const posSize = trade.positionSize != null
                  ? `${curr}${trade.positionSize.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : "—";
                const { display: pnlDisplay, positive: pnlPositive } = fmtAbsolutePnl(trade, assetType);

                return (
                  <tr
                    key={trade.id}
                    style={{ borderBottom: "1px solid rgba(90,140,220,0.05)" }}
                    className="hover:bg-white/[0.01] transition-colors"
                  >
                    {/* Entry / Exit Time */}
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] font-mono" style={{ color: "#60a5fa" }}>
                          {fmtDateTime(trade.openedAt)}
                        </span>
                        <span className="text-[11px] font-mono" style={{ color: "#334155" }}>
                          → {fmtDateTime(trade.closedAt)}
                        </span>
                      </div>
                    </td>

                    {/* Symbol */}
                    <td className="px-4 py-4">
                      <span className="text-sm font-black text-white tracking-tight">{trade.symbol}</span>
                    </td>

                    {/* Side */}
                    <td className="px-4 py-4">
                      <span
                        className="text-xs font-black"
                        style={{ color: trade.side === "BUY" ? "#34d399" : "#f87171" }}
                      >
                        {trade.side === "BUY" ? "Long" : "Short"}
                      </span>
                    </td>

                    {/* Position Size */}
                    <td className="px-4 py-4">
                      <span className="text-xs font-mono text-white/70">{posSize}</span>
                    </td>

                    {/* Leverage */}
                    <td className="px-4 py-4">
                      <span
                        className="text-xs font-black px-2 py-0.5 rounded"
                        style={{ backgroundColor: "rgba(96,165,250,0.1)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.15)" }}
                      >
                        {trade.leverage}x
                      </span>
                    </td>

                    {/* Entry Price */}
                    <td className="px-4 py-4">
                      <span className="text-xs font-mono text-white/60">{fmtPrice(trade.entryPrice, assetType)}</span>
                    </td>

                    {/* Exit Price */}
                    <td className="px-4 py-4">
                      <span className="text-xs font-mono text-white">{fmtPrice(trade.currentPrice, assetType)}</span>
                    </td>

                    {/* P&L (absolute) */}
                    <td className="px-4 py-4">
                      <div
                        className="flex items-center gap-1 font-mono text-sm font-black"
                        style={{ color: pnlPositive ? "#34d399" : "#f87171" }}
                      >
                        {pnlPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                        {pnlDisplay}
                      </div>
                    </td>

                    {/* Fund Balance after trade */}
                    <td className="px-4 py-4">
                      <span className="text-xs font-mono font-bold" style={{ color: "#94a3b8" }}>
                        {fmtBalance(trade, assetType)}
                      </span>
                    </td>

                    {/* Proof of Trade */}
                    <td className="px-4 py-4">
                      {trade.blockchainTxHash ? (
                        <a
                          href={`https://solscan.io/tx/${trade.blockchainTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-[10px] font-bold transition-opacity hover:opacity-80"
                          style={{ color: "#34d399" }}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Verified
                          <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                        </a>
                      ) : (
                        <span className="text-[10px] font-medium" style={{ color: "#334155" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-bold" style={{ color: "#334155" }}>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, closed.length)} of {closed.length} trades
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0}
              className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-30"
              style={{ backgroundColor: "#0a1628", color: "#60a5fa", border: "1px solid rgba(90,140,220,0.15)" }}
            >
              ← Prev
            </button>
            <span className="text-xs font-bold" style={{ color: "#475569" }}>
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= totalPages - 1}
              className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-30"
              style={{ backgroundColor: "#0a1628", color: "#60a5fa", border: "1px solid rgba(90,140,220,0.15)" }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const BOTS = [
  { key: "CRYPTO",        emoji: "₿",  label: "Crypto Bot",        live: true  },
  { key: "INDIAN_STOCKS", emoji: "🇮🇳", label: "Indian Stock Bot",  live: false },
  { key: "GOLD",          emoji: "🥇", label: "Gold Bot",           live: false },
  { key: "SILVER",        emoji: "🥈", label: "Silver Bot",         live: false },
] as const;

const CARD_BG = "#0a1628";
const CARD_BORDER = "rgba(90,140,220,0.18)";

export default function RecordsPage() {
  const { user } = useUser();
  const auth = useAuth();
  const router = useRouter();

  const [activeBot, setActiveBot] = useState<string>("CRYPTO");
  const [stats, setStats] = useState<BotStats | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [tradesLoading, setTradesLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    if (user) router.replace("/live");
  }, [user, router]);

  useEffect(() => {
    fetch("/api/freedombot/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setStatsLoading(false));

    fetch("/api/freedombot/trades")
      .then((r) => r.json())
      .then((d) => setTrades(d.trades ?? []))
      .catch(() => {})
      .finally(() => setTradesLoading(false));
  }, []);

  const handleSignIn = useCallback(async () => {
    if (!auth || isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      await initiateGoogleSignIn(auth);
    } catch {
      // silent
    } finally {
      setIsLoggingIn(false);
    }
  }, [auth, isLoggingIn]);

  const activeTrades = useMemo(
    () => trades.filter((t) => t.assetType === activeBot),
    [trades, activeBot]
  );

  const activeIsLive = BOTS.find((b) => b.key === activeBot)?.live ?? false;
  const isLoading = statsLoading || tradesLoading;

  return (
    <div
      className="min-h-screen font-sans antialiased"
      style={{ backgroundColor: "#080f1e", color: "#f0f4ff" }}
    >
      {/* Nav */}
      <nav
        className="sticky top-0 z-40 border-b"
        style={{
          backgroundColor: "rgba(8,15,30,0.92)",
          borderColor: "rgba(90,140,220,0.12)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="transition-opacity hover:opacity-70">
              <Image src="/freedombot/icon.png" alt="FreedomBot.ai" width={32} height={32} className="object-contain" />
            </Link>
            <div className="h-5 w-px" style={{ backgroundColor: "rgba(90,140,220,0.2)" }} />
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" style={{ color: "#34d399" }} />
              <span className="text-sm font-black" style={{ color: "#34d399" }}>On-chain Trade History</span>
            </div>
          </div>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs font-bold transition-colors hover:text-white"
            style={{ color: "#64748b" }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Home
          </Link>
        </div>
      </nav>

      <main className="w-full max-w-[1440px] mx-auto px-4 sm:px-8 py-12">
        {/* Page header */}
        <div className="mb-10 max-w-2xl">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter mb-4 leading-[1.05]">
            Every trade.{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #34d399, #6ee7b7)" }}
            >
              On the blockchain.
            </span>
          </h1>
          <p className="text-base leading-relaxed" style={{ color: "#64748b" }}>
            We don&apos;t hide losses. Every trade our bots close is permanently written to the{" "}
            <span className="text-white font-semibold">Solana blockchain</span> — timestamped,
            immutable, and publicly verifiable by anyone. No edits. No deletions.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#34d399" }} />
          </div>
        ) : (
          <div>
            {/* ── Bot tabs ── */}
            <div className="flex items-end gap-0 overflow-x-auto">
              {BOTS.map((bot) => {
                const isActive = activeBot === bot.key;
                return (
                  <button
                    key={bot.key}
                    onClick={() => setActiveBot(bot.key)}
                    className="flex items-center gap-2 px-5 py-3 text-sm font-bold whitespace-nowrap transition-all relative flex-shrink-0"
                    style={{
                      backgroundColor: isActive ? CARD_BG : "transparent",
                      color: isActive ? "#f0f4ff" : "#334155",
                      borderTop: `2px solid ${isActive ? (bot.live ? "#22c55e" : CARD_BORDER) : "transparent"}`,
                      borderLeft: `1px solid ${isActive ? CARD_BORDER : "transparent"}`,
                      borderRight: `1px solid ${isActive ? CARD_BORDER : "transparent"}`,
                      borderBottom: `1px solid ${isActive ? CARD_BG : "transparent"}`,
                      borderRadius: "10px 10px 0 0",
                      marginBottom: isActive ? "-1px" : "0",
                      zIndex: isActive ? 1 : 0,
                    }}
                  >
                    <span className="text-base">{bot.emoji}</span>
                    <span>{bot.label}</span>
                    {bot.live ? (
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#22c55e" }} />
                      </span>
                    ) : (
                      <span
                        className="text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider"
                        style={{ backgroundColor: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}
                      >
                        Soon
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Stats card + table, connected to active tab ── */}
            <div
              className="rounded-b-2xl rounded-tr-2xl overflow-hidden"
              style={{ border: `1px solid ${CARD_BORDER}`, position: "relative", zIndex: 0 }}
            >
              {/* Stats panel */}
              {activeIsLive ? (
                <>
                  <div
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-5"
                    style={{
                      background: "linear-gradient(90deg, rgba(37,99,235,0.08) 0%, transparent 60%)",
                      borderBottom: `1px solid ${CARD_BORDER}`,
                      backgroundColor: CARD_BG,
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: "#22c55e" }} />
                      <span className="text-xs font-bold" style={{ color: "#22c55e" }}>Live</span>
                      {stats && (
                        <span className="text-xs font-medium ml-1" style={{ color: "#475569" }}>
                          · Running {stats.runningDays} {stats.runningDays === 1 ? "day" : "days"}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={handleSignIn}
                      disabled={isLoggingIn}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition-all hover:scale-105 disabled:opacity-70 self-start sm:self-auto"
                      style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
                    >
                      {isLoggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Rocket className="h-4 w-4" /> Deploy</>}
                    </button>
                  </div>
                  <div
                    className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 p-5"
                    style={{ backgroundColor: CARD_BG }}
                  >
                    <MetricCard label="Start Capital" value={fmtCapital(stats?.startingCapital)} />
                    <MetricCard label="Current Capital" value={fmtCapital(stats?.currentCapital)} color="#60a5fa" />
                    <MetricCard
                      label="Total Return"
                      value={fmt(stats?.totalReturnPct ?? null)}
                      color={(stats?.totalReturnPct ?? 0) >= 0 ? "#34d399" : "#f87171"}
                    />
                    <MetricCard
                      label="Monthly Return"
                      value={fmt(stats?.profitPerMonth ?? null)}
                      color="#60a5fa"
                      sub={stats && stats.runningDays < 30 ? "Projected" : undefined}
                    />
                    <MetricCard
                      label="Annual Return"
                      value={fmt(stats?.profitPerYear ?? null)}
                      color="#a78bfa"
                      sub={stats && stats.runningDays < 365 ? "Projected" : undefined}
                    />
                  </div>
                </>
              ) : (
                <div
                  className="flex items-center justify-center py-14"
                  style={{ backgroundColor: CARD_BG }}
                >
                  <div className="text-center">
                    <span className="text-4xl mb-3 block">{BOTS.find((b) => b.key === activeBot)?.emoji}</span>
                    <p className="text-base font-black text-white mb-2">{BOTS.find((b) => b.key === activeBot)?.label}</p>
                    <span
                      className="text-[9px] font-black px-2.5 py-1 rounded uppercase tracking-wider"
                      style={{ backgroundColor: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}
                    >
                      Coming Soon — No trades yet
                    </span>
                  </div>
                </div>
              )}

              {/* Trade table — sits inside the card panel */}
              {activeIsLive && (
                <div style={{ backgroundColor: "#080f1e", borderTop: `1px solid ${CARD_BORDER}` }}>
                  <TradeTable trades={activeTrades} assetType={activeBot} />
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-8 mt-10" style={{ borderTop: "1px solid rgba(90,140,220,0.08)" }}>
        <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-70">
            <Image src="/freedombot/icon.png" alt="FreedomBot.ai" width={28} height={28} className="object-contain" />
            <span className="text-xs font-bold" style={{ color: "#334155" }}>freedombot.ai</span>
          </Link>
          <p className="text-[11px]" style={{ color: "#1e3a5f" }}>
            &copy; {new Date().getFullYear()} FreedomBot.ai · Simulator data only. Not financial advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
