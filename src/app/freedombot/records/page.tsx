"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Loader2,
  ShieldCheck,
  ExternalLink,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Trade {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  assetType: string;
  exchange: string | null;
  timeframe: string | null;
  algo: string | null;
  leverage: number;
  entryPrice: number;
  currentPrice: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  stopLoss: number | null;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  slHit: boolean;
  status: "OPEN" | "CLOSED";
  realizedPnl: number;
  unrealizedPnl: number;
  positionSize: number | null;
  capitalAtEntry: number | null;
  closeReason: string | null;
  openedAt: string;
  closedAt: string | null;
  blockchainTxHash: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const tfLabels: Record<string, string> = {
  "5": "5m", "15": "15m", "60": "1h", "240": "4h", D: "1D", W: "1W",
};

function fmtPrice(n: number | null, assetType: string) {
  if (n === null || n === undefined) return "—";
  const curr = assetType === "INDIAN_STOCKS" ? "₹" : "$";
  const decimals = n < 1 ? 6 : 2;
  return `${curr}${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function pnlPct(trade: Trade): number {
  if (trade.status === "OPEN") {
    if (!trade.currentPrice || !trade.entryPrice) return 0;
    const delta = trade.side === "BUY"
      ? trade.currentPrice - trade.entryPrice
      : trade.entryPrice - trade.currentPrice;
    return (delta / trade.entryPrice) * 100 * trade.leverage;
  }
  // For closed: derive from realizedPnl + positionSize
  if (trade.positionSize && trade.positionSize > 0) {
    return (trade.realizedPnl / trade.positionSize) * 100;
  }
  // Fallback: price-based
  const exitPrice = trade.currentPrice ?? trade.entryPrice;
  const delta = trade.side === "BUY"
    ? exitPrice - trade.entryPrice
    : trade.entryPrice - exitPrice;
  return (delta / trade.entryPrice) * 100 * trade.leverage;
}

function outcomeLabel(trade: Trade): { label: string; color: string; bg: string } {
  if (trade.status === "OPEN") return { label: "OPEN", color: "#22c55e", bg: "rgba(34,197,94,0.1)" };
  if (trade.tp3Hit) return { label: "TP3 ✓", color: "#34d399", bg: "rgba(52,211,153,0.1)" };
  if (trade.tp2Hit) return { label: "TP2 ✓", color: "#4ade80", bg: "rgba(74,222,128,0.1)" };
  if (trade.tp1Hit) return { label: "TP1 ✓", color: "#86efac", bg: "rgba(134,239,172,0.1)" };
  if (trade.slHit) return { label: "SL ✗", color: "#f87171", bg: "rgba(248,113,113,0.1)" };
  if (trade.closeReason === "EOD_SQUARE_OFF") return { label: "EOD", color: "#94a3b8", bg: "rgba(148,163,184,0.08)" };
  if (trade.closeReason === "KILL_SWITCH") return { label: "Killed", color: "#fbbf24", bg: "rgba(251,191,36,0.1)" };
  if (trade.closeReason === "TRAILING_SL") return { label: "Trail SL", color: "#f97316", bg: "rgba(249,115,22,0.1)" };
  return { label: "Closed", color: "#94a3b8", bg: "rgba(148,163,184,0.08)" };
}

// ─── Summary Bar ──────────────────────────────────────────────────────────────

function SummaryBar({ trades }: { trades: Trade[] }) {
  const closed = trades.filter((t) => t.status === "CLOSED");
  const open = trades.filter((t) => t.status === "OPEN");
  const wins = closed.filter((t) => t.tp1Hit || t.tp2Hit || t.tp3Hit).length;
  const winRate = closed.length > 0 ? (wins / closed.length) * 100 : null;
  const pnls = closed.map((t) => pnlPct(t));
  const avgPnl = pnls.length > 0 ? pnls.reduce((a, b) => a + b, 0) / pnls.length : null;

  const stats = [
    { label: "Total Trades", value: closed.length.toString(), sub: `${open.length} open` },
    { label: "Win Rate", value: winRate !== null ? `${winRate.toFixed(1)}%` : "—", color: winRate !== null && winRate >= 50 ? "#34d399" : "#f87171" },
    { label: "Avg P&L", value: avgPnl !== null ? `${avgPnl >= 0 ? "+" : ""}${avgPnl.toFixed(2)}%` : "—", color: avgPnl !== null && avgPnl >= 0 ? "#34d399" : "#f87171" },
    { label: "TP Hits", value: closed.filter((t) => t.tp1Hit || t.tp2Hit || t.tp3Hit).toString() },
    { label: "SL Hits", value: closed.filter((t) => t.slHit && !t.tp1Hit).length.toString() },
  ];

  return (
    <div className="flex flex-wrap gap-3 mb-8">
      {stats.map((s) => (
        <div
          key={s.label}
          className="flex flex-col px-5 py-3 rounded-xl"
          style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.12)" }}
        >
          <span className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: "#475569" }}>
            {s.label}
          </span>
          <span className="text-lg font-black font-mono" style={{ color: s.color ?? "#f0f4ff" }}>
            {s.value}
          </span>
          {s.sub && <span className="text-[10px] font-medium mt-0.5" style={{ color: "#334155" }}>{s.sub}</span>}
        </div>
      ))}
    </div>
  );
}

// ─── Trade Row ────────────────────────────────────────────────────────────────

function TradeRow({ trade }: { trade: Trade }) {
  const pct = pnlPct(trade);
  const outcome = outcomeLabel(trade);
  const tf = tfLabels[trade.timeframe ?? ""] ?? trade.timeframe ?? "—";
  const displayPrice = trade.status === "OPEN" ? trade.currentPrice : trade.currentPrice;

  return (
    <tr
      style={{ borderBottom: "1px solid rgba(90,140,220,0.07)" }}
      className="hover:bg-white/[0.01] transition-colors"
    >
      {/* Symbol + Side */}
      <td className="py-3.5 px-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-black text-white tracking-tight">{trade.symbol}</span>
          <span className="text-[10px] font-bold" style={{ color: trade.side === "BUY" ? "#34d399" : "#f87171" }}>
            {trade.side === "BUY" ? "▲ Long" : "▼ Short"}
          </span>
        </div>
      </td>

      {/* Timeframe + Leverage */}
      <td className="py-3.5 px-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-bold text-white/60">{tf}</span>
          <span className="text-[10px] font-bold" style={{ color: "#60a5fa" }}>{trade.leverage}x</span>
        </div>
      </td>

      {/* Entry */}
      <td className="py-3.5 px-4">
        <span className="text-xs font-mono text-white/70">{fmtPrice(trade.entryPrice, trade.assetType)}</span>
      </td>

      {/* Current / Exit */}
      <td className="py-3.5 px-4">
        <span className="text-xs font-mono text-white">{fmtPrice(displayPrice, trade.assetType)}</span>
      </td>

      {/* P&L */}
      <td className="py-3.5 px-4">
        <div className={`flex items-center gap-1 font-mono text-sm font-black ${pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          {pct >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
        </div>
      </td>

      {/* Outcome */}
      <td className="py-3.5 px-4">
        <span
          className="text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider"
          style={{ color: outcome.color, backgroundColor: outcome.bg, border: `1px solid ${outcome.color}30` }}
        >
          {outcome.label}
        </span>
      </td>

      {/* Targets */}
      <td className="py-3.5 px-4">
        <div className="flex items-center gap-1">
          {[
            { n: 1, hit: trade.tp1Hit },
            { n: 2, hit: trade.tp2Hit },
            { n: 3, hit: trade.tp3Hit },
          ].map((tp) => (
            <span
              key={tp.n}
              className="text-[9px] font-bold px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: tp.hit ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.03)",
                color: tp.hit ? "#34d399" : "#334155",
              }}
            >
              TP{tp.n}{tp.hit ? "✓" : ""}
            </span>
          ))}
        </div>
      </td>

      {/* Date */}
      <td className="py-3.5 px-4 text-right">
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-[10px] font-mono" style={{ color: "#475569" }}>{fmtDate(trade.openedAt)}</span>
          {trade.closedAt && (
            <span className="text-[10px] font-mono" style={{ color: "#334155" }}>→ {fmtDate(trade.closedAt)}</span>
          )}
        </div>
      </td>

      {/* Blockchain */}
      <td className="py-3.5 px-4">
        {trade.blockchainTxHash ? (
          <a
            href={`https://solscan.io/tx/${trade.blockchainTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-bold transition-colors hover:opacity-80"
            style={{ color: "#34d399" }}
          >
            <ShieldCheck className="h-3 w-3" />
            Verified
            <ExternalLink className="h-2.5 w-2.5 opacity-60" />
          </a>
        ) : (
          <span className="text-[10px] font-medium" style={{ color: "#1e3a5f" }}>Pending</span>
        )}
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ASSET_TABS = [
  { key: "CRYPTO", label: "Crypto", emoji: "₿" },
  { key: "INDIAN_STOCKS", label: "Indian Stocks", emoji: "🇮🇳" },
];

export default function RecordsPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("CRYPTO");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("all");
  const [sideFilter, setSideFilter] = useState<"all" | "BUY" | "SELL">("all");

  useEffect(() => {
    fetch("/api/freedombot/trades")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setTrades(d.trades ?? []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Which tabs have data
  const availableTabs = useMemo(() => {
    const types = new Set(trades.map((t) => t.assetType));
    return ASSET_TABS.filter((tab) => types.has(tab.key));
  }, [trades]);

  // Set default tab to first available
  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.find((t) => t.key === activeTab)) {
      setActiveTab(availableTabs[0].key);
    }
  }, [availableTabs, activeTab]);

  const filtered = useMemo(() => {
    return trades
      .filter((t) => t.assetType === activeTab)
      .filter((t) => statusFilter === "all" || (statusFilter === "open" ? t.status === "OPEN" : t.status === "CLOSED"))
      .filter((t) => sideFilter === "all" || t.side === sideFilter)
      .sort((a, b) => {
        // Open trades first, then by openedAt desc
        if (a.status === "OPEN" && b.status !== "OPEN") return -1;
        if (a.status !== "OPEN" && b.status === "OPEN") return 1;
        return new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime();
      });
  }, [trades, activeTab, statusFilter, sideFilter]);

  const tabTrades = useMemo(() => trades.filter((t) => t.assetType === activeTab), [trades, activeTab]);

  return (
    <div className="min-h-screen font-sans antialiased" style={{ backgroundColor: "#080f1e", color: "#f0f4ff" }}>
      {/* Nav */}
      <nav
        className="sticky top-0 z-40 border-b"
        style={{
          backgroundColor: "rgba(8,15,30,0.92)",
          borderColor: "rgba(90,140,220,0.12)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-70">
              <Image src="/freedombot/icon.png" alt="FreedomBot.ai" width={32} height={32} className="object-contain" />
            </Link>
            <div className="h-5 w-px" style={{ backgroundColor: "rgba(90,140,220,0.2)" }} />
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" style={{ color: "#34d399" }} />
              <span className="text-sm font-black tracking-tight" style={{ color: "#34d399" }}>Trade Records</span>
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-4"
            style={{
              backgroundColor: "rgba(16,185,129,0.08)",
              border: "1px solid rgba(16,185,129,0.2)",
              color: "#34d399",
            }}
          >
            <ShieldCheck className="h-3 w-3" />
            Fully Transparent · All trades logged
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter mb-3">
            Simulator{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #34d399, #6ee7b7)" }}
            >
              Trade Records
            </span>
          </h1>
          <p className="text-base" style={{ color: "#64748b" }}>
            Every trade our bots have ever taken. No cherry-picking, no edits — raw history.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#34d399" }} />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-32 text-rose-400 text-sm font-bold">
            Failed to load trades: {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Asset type tabs */}
            {availableTabs.length > 1 && (
              <div className="flex gap-2 mb-8">
                {availableTabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => { setActiveTab(tab.key); setStatusFilter("all"); setSideFilter("all"); }}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all"
                    style={
                      activeTab === tab.key
                        ? { backgroundColor: "rgba(52,211,153,0.12)", color: "#34d399", border: "1px solid rgba(52,211,153,0.3)" }
                        : { backgroundColor: "#0a1628", color: "#475569", border: "1px solid rgba(90,140,220,0.12)" }
                    }
                  >
                    <span>{tab.emoji}</span>
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* Summary bar */}
            <SummaryBar trades={tabTrades} />

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-6">
              {/* Status */}
              <div
                className="flex items-center rounded-xl p-1"
                style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.12)" }}
              >
                {(["all", "open", "closed"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                    style={
                      statusFilter === s
                        ? { backgroundColor: "rgba(52,211,153,0.12)", color: "#34d399" }
                        : { color: "#475569" }
                    }
                  >
                    {s === "all" ? "All" : s === "open" ? "Live" : "Closed"}
                  </button>
                ))}
              </div>

              {/* Side */}
              <div
                className="flex items-center rounded-xl p-1"
                style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.12)" }}
              >
                {(["all", "BUY", "SELL"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSideFilter(s)}
                    className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all"
                    style={
                      sideFilter === s
                        ? {
                            backgroundColor: s === "BUY" ? "rgba(52,211,153,0.12)" : s === "SELL" ? "rgba(248,113,113,0.12)" : "rgba(96,165,250,0.12)",
                            color: s === "BUY" ? "#34d399" : s === "SELL" ? "#f87171" : "#60a5fa",
                          }
                        : { color: "#475569" }
                    }
                  >
                    {s === "all" ? "All Sides" : s === "BUY" ? "▲ Long" : "▼ Short"}
                  </button>
                ))}
              </div>

              <span className="self-center text-xs font-bold ml-auto" style={{ color: "#334155" }}>
                {filtered.length} trades
              </span>
            </div>

            {/* Table */}
            <div
              className="rounded-2xl overflow-x-auto"
              style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.12)" }}
            >
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(90,140,220,0.12)", backgroundColor: "#060d1a" }}>
                    {["Symbol / Side", "Timeframe", "Entry", "Current / Exit", "P&L", "Outcome", "Targets", "Date", "Blockchain"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3.5 text-left text-[9px] font-black uppercase tracking-widest"
                        style={{ color: "#334155" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-20">
                        <p className="text-sm font-bold" style={{ color: "#334155" }}>No trades found</p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((trade) => <TradeRow key={trade.id} trade={trade} />)
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer note */}
            <p className="text-center text-[11px] mt-8 font-medium" style={{ color: "#1e3a5f" }}>
              Trades marked <span style={{ color: "#34d399" }}>Verified</span> are permanently recorded on-chain.
              All times shown in your local timezone.
            </p>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="py-8 mt-8" style={{ borderTop: "1px solid rgba(90,140,220,0.08)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
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
