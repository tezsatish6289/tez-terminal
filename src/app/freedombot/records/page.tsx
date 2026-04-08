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

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

function tradePnlPct(trade: Trade): number {
  if (trade.status === "OPEN") {
    if (!trade.currentPrice) return 0;
    const delta = trade.side === "BUY"
      ? trade.currentPrice - trade.entryPrice
      : trade.entryPrice - trade.currentPrice;
    return (delta / trade.entryPrice) * 100 * trade.leverage;
  }
  // Closed: use realizedPnl / positionSize for a % of capital allocated
  if (trade.positionSize && trade.positionSize > 0) {
    return (trade.realizedPnl / trade.positionSize) * 100;
  }
  return 0;
}

function outcomeLabel(trade: Trade): { label: string; color: string; bg: string } {
  if (trade.status === "OPEN") return { label: "OPEN", color: "#22c55e", bg: "rgba(34,197,94,0.1)" };
  if (trade.tp3Hit) return { label: "TP3", color: "#34d399", bg: "rgba(52,211,153,0.1)" };
  if (trade.tp2Hit) return { label: "TP2", color: "#4ade80", bg: "rgba(74,222,128,0.1)" };
  if (trade.tp1Hit) return { label: "TP1", color: "#86efac", bg: "rgba(134,239,172,0.08)" };
  if (trade.slHit) return { label: "SL", color: "#f87171", bg: "rgba(248,113,113,0.1)" };
  if (trade.closeReason === "EOD_SQUARE_OFF") return { label: "EOD", color: "#94a3b8", bg: "rgba(148,163,184,0.06)" };
  if (trade.closeReason === "TRAILING_SL") return { label: "Trail SL", color: "#f97316", bg: "rgba(249,115,22,0.08)" };
  if (trade.closeReason === "KILL_SWITCH") return { label: "Killed", color: "#fbbf24", bg: "rgba(251,191,36,0.08)" };
  return { label: "Closed", color: "#94a3b8", bg: "rgba(148,163,184,0.06)" };
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

function TradeTable({ trades, assetType }: { trades: Trade[]; assetType: string }) {
  const filtered = useMemo(() => {
    return trades.slice().sort((a, b) => {
      if (a.status === "OPEN" && b.status !== "OPEN") return -1;
      if (a.status !== "OPEN" && b.status === "OPEN") return 1;
      return new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime();
    });
  }, [trades]);

  const headers = [
    "Entry / Exit Time",
    "Symbol",
    "Side",
    "Position Size",
    "Leverage",
    "Entry Price",
    "Exit Price",
    "P&L",
    "Proof of Trade",
  ];

  return (
    <div
      className="rounded-2xl overflow-x-auto"
      style={{ border: "1px solid rgba(90,140,220,0.1)" }}
    >
      <table className="w-full min-w-[900px]">
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(90,140,220,0.1)", backgroundColor: "#060d1a" }}>
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-3.5 text-left text-[9px] font-black uppercase tracking-widest"
                style={{ color: "#1e3a5f" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={9} className="text-center py-14">
                <p className="text-sm font-bold" style={{ color: "#1e3a5f" }}>No trades yet</p>
              </td>
            </tr>
          ) : (
            filtered.map((trade) => {
              const pct = tradePnlPct(trade);
              const curr = assetType === "INDIAN_STOCKS" ? "₹" : "$";
              const posSize = trade.positionSize != null
                ? `${curr}${trade.positionSize.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : "—";
              const exitPrice = trade.status === "OPEN" ? trade.currentPrice : trade.currentPrice;

              return (
                <tr
                  key={trade.id}
                  style={{ borderBottom: "1px solid rgba(90,140,220,0.06)" }}
                  className="hover:bg-white/[0.01] transition-colors"
                >
                  {/* Entry / Exit Time */}
                  <td className="px-4 py-4">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-mono font-bold" style={{ color: "#60a5fa" }}>
                        {fmtDate(trade.openedAt)}
                      </span>
                      {trade.closedAt ? (
                        <span className="text-[10px] font-mono" style={{ color: "#334155" }}>
                          → {fmtDate(trade.closedAt)}
                        </span>
                      ) : (
                        <span
                          className="text-[9px] font-black uppercase tracking-wider"
                          style={{ color: "#22c55e" }}
                        >
                          Still open
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Symbol */}
                  <td className="px-4 py-4">
                    <span className="text-sm font-black text-white tracking-tight">{trade.symbol}</span>
                  </td>

                  {/* Side */}
                  <td className="px-4 py-4">
                    <span
                      className="text-[10px] font-black"
                      style={{ color: trade.side === "BUY" ? "#34d399" : "#f87171" }}
                    >
                      {trade.side === "BUY" ? "▲ Long" : "▼ Short"}
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
                      style={{ backgroundColor: "rgba(96,165,250,0.1)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.2)" }}
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
                    <span className="text-xs font-mono text-white">{fmtPrice(exitPrice, assetType)}</span>
                  </td>

                  {/* P&L */}
                  <td className="px-4 py-4">
                    <div
                      className="flex items-center gap-1 font-mono text-sm font-black"
                      style={{ color: pct >= 0 ? "#34d399" : "#f87171" }}
                    >
                      {pct >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                    </div>
                  </td>

                  {/* Proof of Trade */}
                  <td className="px-4 py-4">
                    {trade.blockchainTxHash ? (
                      <a
                        href={`https://solscan.io/tx/${trade.blockchainTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[10px] font-bold hover:opacity-80 transition-opacity"
                        style={{ color: "#34d399" }}
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Verified on-chain
                        <ExternalLink className="h-2.5 w-2.5 opacity-50" />
                      </a>
                    ) : (
                      <span className="text-[10px] font-medium" style={{ color: "#1e3a5f" }}>Pending</span>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RecordsPage() {
  const { user } = useUser();
  const auth = useAuth();
  const router = useRouter();

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

  const cryptoTrades = useMemo(
    () => trades.filter((t) => t.assetType === "CRYPTO"),
    [trades]
  );

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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="transition-opacity hover:opacity-70">
              <Image src="/freedombot/icon.png" alt="FreedomBot.ai" width={32} height={32} className="object-contain" />
            </Link>
            <div className="h-5 w-px" style={{ backgroundColor: "rgba(90,140,220,0.2)" }} />
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" style={{ color: "#34d399" }} />
              <span className="text-sm font-black" style={{ color: "#34d399" }}>Live Performance</span>
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

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        {/* Page header */}
        <div className="mb-12">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest mb-5"
            style={{
              backgroundColor: "rgba(16,185,129,0.08)",
              border: "1px solid rgba(16,185,129,0.2)",
              color: "#34d399",
            }}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Transparent · Real Data · No Cherry-picking
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter mb-3">
            Bot{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #34d399, #6ee7b7)" }}
            >
              Performance
            </span>
          </h1>
          <p className="text-base" style={{ color: "#64748b" }}>
            Live stats and every closed trade — unfiltered.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#34d399" }} />
          </div>
        ) : (
          <div className="space-y-12">
            {/* ── Crypto Bot ── */}
            <div>
              {/* Bot header */}
              <div
                className="rounded-2xl mb-6 overflow-hidden"
                style={{ border: "1px solid rgba(90,140,220,0.18)" }}
              >
                <div
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-5"
                  style={{
                    background: "linear-gradient(90deg, rgba(37,99,235,0.1) 0%, transparent 70%)",
                    borderBottom: "1px solid rgba(90,140,220,0.1)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">₿</span>
                    <div>
                      <p className="text-lg font-black text-white">Crypto Bot</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: "#22c55e" }} />
                        <span className="text-xs font-bold" style={{ color: "#22c55e" }}>Live</span>
                        {stats && (
                          <span className="text-xs font-medium ml-1" style={{ color: "#475569" }}>
                            · Running {stats.runningDays} {stats.runningDays === 1 ? "day" : "days"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleSignIn}
                    disabled={isLoggingIn}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:scale-105 disabled:opacity-70 self-start sm:self-auto"
                    style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
                  >
                    {isLoggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Rocket className="h-4 w-4" /> Deploy</>}
                  </button>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 p-5"
                  style={{ backgroundColor: "#0a1628" }}>
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
              </div>

              {/* Trade history */}
              <TradeTable trades={cryptoTrades} assetType="CRYPTO" />
            </div>

            {/* ── Coming soon bots ── */}
            {[
              { emoji: "🇮🇳", name: "Indian Stock Bot" },
              { emoji: "🥇", name: "Gold Bot" },
              { emoji: "🥈", name: "Silver Bot" },
            ].map((bot) => (
              <div key={bot.name} className="opacity-40">
                <div
                  className="rounded-2xl px-6 py-5 flex items-center justify-between"
                  style={{ border: "1px solid rgba(90,140,220,0.1)" }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{bot.emoji}</span>
                    <div>
                      <p className="text-base font-black text-white">{bot.name}</p>
                      <span
                        className="text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider mt-1 inline-block"
                        style={{
                          backgroundColor: "rgba(251,191,36,0.12)",
                          color: "#fbbf24",
                          border: "1px solid rgba(251,191,36,0.2)",
                        }}
                      >
                        Coming Soon
                      </span>
                    </div>
                  </div>
                  <span className="text-xs font-bold" style={{ color: "#1e3a5f" }}>No trades yet</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer note */}
        <p className="text-center text-[11px] mt-14 font-medium" style={{ color: "#1e3a5f" }}>
          Trades marked <span style={{ color: "#34d399" }}>Verified</span> are permanently recorded on-chain.
          All times in your local timezone.
        </p>
      </main>

      {/* Footer */}
      <footer className="py-8 mt-6" style={{ borderTop: "1px solid rgba(90,140,220,0.08)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
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
