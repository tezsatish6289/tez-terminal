"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Rocket,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  Loader2,
  BarChart3,
  Zap,
  User,
  LogOut,
  ChevronRight,
  Activity,
  Square,
} from "lucide-react";
import { useUser, useAuth } from "@/firebase";
import { initiateSignOut } from "@/firebase/non-blocking-login";
import { DeployModal } from "../components/DeployModal";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Deployment {
  id: string;
  bot: string;
  exchange: string;
  status: string;
  createdAt: string | null;
}

interface BotStats {
  runningDays: number;
  currentCapital?: number;
  startingCapital?: number;
  totalReturnPct: number | null;
  profitPerMonth: number | null;
  profitPerYear: number | null;
  winRate: number | null;
  totalTrades: number;
}

interface Trade {
  id: string;
  symbol: string;
  side: string;
  status: string;
  realizedPnl: number;
  unrealizedPnl: number;
  positionSize: number | null;
  leverage: number;
  entryPrice: number | null;
  currentPrice: number | null;
  capitalAtEntry: number | null;
  blockchainTxHash: string | null;
  openedAt: string;
  closedAt: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null, suffix = "%") {
  if (n === null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}${suffix}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const BOT_LABELS: Record<string, string> = {
  CRYPTO: "Crypto Bot",
  INDIAN_STOCKS: "Indian Stock Bot",
  GOLD: "Gold Bot",
  SILVER: "Silver Bot",
};

const EXCHANGE_LABELS: Record<string, string> = {
  BYBIT: "Bybit",
  BINANCE: "Binance",
  ZERODHA: "Zerodha",
  UPSTOX: "Upstox",
  ANGEL_ONE: "Angel One",
  DHAN: "Dhan",
};

// ─── TopBar ──────────────────────────────────────────────────────────────────

function DashTopBar({ onDeploy, hasDeployment = false }: { onDeploy: () => void; hasDeployment?: boolean }) {
  const { user } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = () => {
    if (auth) {
      initiateSignOut(auth);
      router.push("/");
    }
  };

  useEffect(() => {
    document.title = "FreedomBot.ai — Dashboard";
    document.querySelectorAll("link[rel~='icon'], link[rel='shortcut icon']").forEach((el) => el.remove());
    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    link.href = `/freedombot/icon.png?v=${Date.now()}`;
    document.head.appendChild(link);
  }, []);

  return (
    <header
      className="sticky top-0 z-40 h-16 flex items-center px-4 sm:px-6 justify-between"
      style={{
        backgroundColor: "rgba(8,15,30,0.92)",
        borderBottom: "1px solid rgba(90,140,220,0.12)",
        backdropFilter: "blur(16px)",
      }}
    >
      <div className="flex items-center gap-2.5">
        <Image src="/freedombot/icon.png" alt="FreedomBot" width={28} height={28} className="rounded-lg object-contain" />
        <span className="font-black text-lg tracking-tight" style={{ color: "#60a5fa" }}>
          FreedomBot.ai
        </span>
      </div>

      <div className="flex items-center gap-3">
        {!hasDeployment && (
          <>
            {/* Desktop label */}
            <button
              onClick={onDeploy}
              className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:scale-105"
              style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
            >
              <Rocket className="h-3.5 w-3.5" /> Deploy Bot
            </button>
            {/* Mobile icon-only */}
            <button
              onClick={onDeploy}
              className="sm:hidden h-9 w-9 rounded-xl flex items-center justify-center text-white transition-all"
              style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
              aria-label="Deploy Bot"
            >
              <Rocket className="h-4 w-4" />
            </button>
          </>
        )}

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="h-9 w-9 rounded-full flex items-center justify-center transition-colors"
            style={{ border: "1px solid rgba(90,140,220,0.25)", backgroundColor: "rgba(37,99,235,0.08)" }}
          >
            <User className="h-4 w-4" style={{ color: "#60a5fa" }} />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-12 w-56 rounded-2xl py-2 z-50"
              style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.2)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}
            >
              <div className="px-4 py-2 border-b" style={{ borderColor: "rgba(90,140,220,0.1)" }}>
                <p className="text-xs font-bold text-white truncate">{user?.displayName ?? "User"}</p>
                <p className="text-[10px] truncate mt-0.5" style={{ color: "#475569" }}>{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-xs font-bold transition-colors hover:text-red-400"
                style={{ color: "#64748b" }}
              >
                <LogOut className="h-3.5 w-3.5" /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// ─── Not Connected State ──────────────────────────────────────────────────────

function NotConnected({ stats, onDeploy }: { stats: BotStats | null; onDeploy: () => void }) {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
      {/* Hero */}
      <div className="text-center mb-16">
        <div
          className="relative p-1 rounded-3xl inline-block mb-8"
          style={{ background: "linear-gradient(135deg, rgba(37,99,235,0.4), rgba(96,165,250,0.2))" }}
        >
          <Image src="/freedombot/icon.png" alt="FreedomBot" width={80} height={80} className="rounded-2xl object-contain h-20 w-20" />
        </div>

        <h1 className="text-3xl sm:text-5xl font-black tracking-tighter mb-4 text-white">
          Connect your bot
        </h1>
        <p className="text-base sm:text-lg max-w-md mx-auto leading-relaxed mb-8" style={{ color: "#64748b" }}>
          You haven&apos;t deployed a bot yet. Connect your broker or exchange and let FreedomBot trade financial markets for you 24/7.
        </p>

        <button
          onClick={onDeploy}
          className="h-14 px-10 rounded-2xl font-bold text-base text-white flex items-center gap-2.5 mx-auto transition-all hover:scale-105 shadow-lg"
          style={{
            background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
            boxShadow: "0 8px 30px rgba(59,130,246,0.35)",
          }}
        >
          <Rocket className="h-5 w-5" />
          Deploy Your Bot
        </button>

        <p className="text-xs mt-4" style={{ color: "#334155" }}>
          Takes less than 5 minutes · No withdrawal access required
        </p>
      </div>

      {/* What to expect */}
      <div
        className="rounded-2xl p-6 sm:p-8 mb-8"
        style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.15)" }}
      >
        <h2 className="text-lg font-black text-white mb-6">How it works</h2>
        <div className="space-y-5">
          {[
            { step: "1", title: "Connect your broker or exchange", desc: "Link your account via API key. Read + trade access only — withdrawals are never enabled." },
            { step: "2", title: "Fund your account", desc: "Deposit capital into your broker or exchange. FreedomBot only trades what's already there — no transfers needed." },
            { step: "3", title: "Bot starts trading", desc: "FreedomBot begins executing trades across markets automatically. Your dashboard updates with live performance." },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-4">
              <div
                className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5"
                style={{ backgroundColor: "rgba(37,99,235,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.2)" }}
              >
                {item.step}
              </div>
              <div>
                <p className="text-sm font-bold text-white">{item.title}</p>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#475569" }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* All bots — live + coming soon */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: "1px solid rgba(90,140,220,0.15)" }}
      >
        {/* Crypto Bot — live */}
        <div style={{ borderBottom: "1px solid rgba(90,140,220,0.1)" }}>
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ background: "linear-gradient(90deg, rgba(37,99,235,0.08), transparent)", borderBottom: "1px solid rgba(90,140,220,0.08)" }}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">₿</span>
              <div>
                <p className="text-sm font-black text-white">Crypto Bot</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#22c55e" }} />
                  <span className="text-[10px] font-bold" style={{ color: "#22c55e" }}>
                    Live · {stats ? `${stats.runningDays} days` : "…"}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onDeploy}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:scale-105"
              style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
            >
              <Rocket className="h-3.5 w-3.5" /> Deploy
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y" style={{ backgroundColor: "#060d1a", borderColor: "rgba(90,140,220,0.06)" }}>
            {[
              { label: "Running", value: stats ? `${stats.runningDays} Days` : "…", color: "#f0f4ff" },
              { label: "Start Capital", value: stats?.startingCapital ? `$${stats.startingCapital.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "…", color: "#f0f4ff" },
              { label: "Current Capital", value: stats?.currentCapital ? `$${stats.currentCapital.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "…", color: "#60a5fa" },
              { label: "Total Return", value: stats ? fmt(stats.totalReturnPct) : "…", color: (stats?.totalReturnPct ?? 0) >= 0 ? "#34d399" : "#f87171" },
              { label: "Monthly Return", value: stats ? fmt(stats.profitPerMonth) : "…", color: "#60a5fa", projected: stats ? (stats.runningDays < 30) : false },
              { label: "Annual Return", value: stats ? fmt(stats.profitPerYear) : "…", color: "#a78bfa", projected: stats ? (stats.runningDays < 365) : false },
            ].map((s) => (
              <div key={s.label} className="p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-0.5 flex-wrap">
                  <p className="text-base font-black" style={{ color: s.color }}>{s.value}</p>
                  {"projected" in s && s.projected && (
                    <span className="text-[9px] font-black uppercase tracking-wider px-1 py-0.5 rounded" style={{ backgroundColor: "rgba(251,191,36,0.12)", color: "#fbbf24" }}>Proj.</span>
                  )}
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#334155" }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Coming soon bots */}
        {[
          { emoji: "🇮🇳", name: "Indian Stock Bot", desc: "NSE / BSE automated trading" },
          { emoji: "🥇", name: "Gold Bot", desc: "Precious metals trading" },
          { emoji: "🥈", name: "Silver Bot", desc: "Precious metals trading" },
        ].map((bot, i, arr) => (
          <div
            key={bot.name}
            className="flex items-center justify-between px-5 py-4"
            style={{
              backgroundColor: "#060d1a",
              borderBottom: i < arr.length - 1 ? "1px solid rgba(90,140,220,0.06)" : "none",
              opacity: 0.6,
            }}
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">{bot.emoji}</span>
              <div>
                <p className="text-sm font-black text-white">{bot.name}</p>
                <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>{bot.desc}</p>
              </div>
            </div>
            <span
              className="text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider"
              style={{ backgroundColor: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)" }}
            >
              Coming Soon
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Price formatter ─────────────────────────────────────────────────────────

function formatPrice(v: number | null | undefined): string {
  if (v == null || v === 0) return "—";
  if (v >= 100) return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 1)   return v.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return v.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

// ─── Connected State ──────────────────────────────────────────────────────────

const BOTS_NAV = [
  { key: "CRYPTO",        emoji: "₿",  label: "Crypto Bot",       live: true  },
  { key: "INDIAN_STOCKS", emoji: "🇮🇳", label: "Indian Stock Bot", live: false },
  { key: "GOLD",          emoji: "🥇", label: "Gold Bot",         live: false },
  { key: "SILVER",        emoji: "🥈", label: "Silver Bot",       live: false },
];

function Connected({ deployment, trades, onStop }: {
  deployment: Deployment;
  stats: BotStats | null;
  trades: Trade[];
  onStop: () => void;
}) {
  const isPending = deployment.status === "pending";
  const exchangeLabel = EXCHANGE_LABELS[deployment.exchange] ?? deployment.exchange;

  // Compute user-specific stats from their actual trades + deployment date
  const runningDays = deployment.createdAt
    ? Math.floor((Date.now() - new Date(deployment.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const closedTrades = trades.filter((t) => t.status === "closed");
  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.realizedPnl ?? 0), 0);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">

      {/* ── Bot tabs ── */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {BOTS_NAV.map((bot) => {
          const isActive = bot.key === deployment.bot;
          return (
            <div
              key={bot.key}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl flex-shrink-0 text-xs font-black"
              style={{
                backgroundColor: isActive ? "rgba(37,99,235,0.15)" : "rgba(10,22,40,0.6)",
                border: `1px solid ${isActive ? "rgba(59,130,246,0.35)" : "rgba(90,140,220,0.08)"}`,
                color: isActive ? "#f0f4ff" : "#334155",
              }}
            >
              <span>{bot.emoji}</span>
              <span>{bot.label}</span>
              {!bot.live && (
                <span className="text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider" style={{ backgroundColor: "rgba(251,191,36,0.12)", color: "#fbbf24" }}>
                  Soon
                </span>
              )}
              {bot.live && isActive && (
                <div className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#22c55e" }} />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Status + stats bar ── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.12)" }}
      >
        {/* Status row */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: "1px solid rgba(90,140,220,0.08)" }}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: isPending ? "#fbbf24" : "#22c55e", boxShadow: `0 0 6px ${isPending ? "#fbbf24" : "#22c55e"}` }} />
              <span className="text-sm font-black" style={{ color: isPending ? "#fbbf24" : "#22c55e" }}>
                {isPending ? "Setting up" : "Live"}
              </span>
            </div>
            <span className="text-xs" style={{ color: "#334155" }}>·</span>
            <span className="text-xs font-medium" style={{ color: "#475569" }}>{exchangeLabel}</span>
          </div>
          <button
            onClick={onStop}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all hover:scale-105"
            style={{ backgroundColor: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.15)" }}
          >
            <Square className="h-3 w-3" /> Stop Bot
          </button>
        </div>

        {/* 3-stat strip */}
        <div className="grid grid-cols-3">
          {[
            {
              label: "Running",
              value: `${runningDays} ${runningDays === 1 ? "Day" : "Days"}`,
              color: "#f0f4ff",
            },
            {
              label: "Trades",
              value: trades.length.toString(),
              color: "#60a5fa",
            },
            {
              label: "Realised P&L",
              value: `${totalPnl >= 0 ? "+" : ""}$${Math.abs(totalPnl).toFixed(2)}`,
              color: totalPnl >= 0 ? "#34d399" : "#f87171",
            },
          ].map((s, i) => (
            <div
              key={s.label}
              className="px-5 py-4"
              style={{ borderRight: i < 2 ? "1px solid rgba(90,140,220,0.08)" : "none" }}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#334155" }}>{s.label}</p>
              <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Trades table ── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: "1px solid rgba(90,140,220,0.12)" }}
      >
        {/* Table header — 7 columns */}
        <div
          className="hidden sm:grid px-4 py-3"
          style={{
            gridTemplateColumns: "1.4fr 1.8fr 1fr 1fr 1fr 1fr 0.8fr",
            backgroundColor: "#060d1a",
            borderBottom: "1px solid rgba(90,140,220,0.1)",
          }}
        >
          {["Entry | Exit Time", "Side & Symbol", "Size & Leverage", "Entry Price", "Exit Price", "P&L", "Status"].map((h) => (
            <div key={h} className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "#334155" }}>{h}</div>
          ))}
        </div>

        {/* Empty state */}
        {trades.length === 0 && (
          <div className="py-16 text-center" style={{ backgroundColor: "#0a1628" }}>
            <Zap className="h-8 w-8 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.2)" }}>No trades yet</p>
            <p className="text-xs mt-1" style={{ color: "#334155" }}>Trades will appear here once your bot starts placing orders</p>
          </div>
        )}

        {/* Rows */}
        {trades.slice(0, 50).map((trade, i) => {
          const pnl = trade.status === "open" ? trade.unrealizedPnl : trade.realizedPnl;
          const isWin = pnl >= 0;
          const isOpen = trade.status === "open";
          const isBuy = trade.side === "LONG" || trade.side === "BUY";
          const rowStyle = { borderBottom: i < trades.length - 1 ? "1px solid rgba(90,140,220,0.06)" : "none" };

          return (
            <div key={trade.id}>
              {/* Mobile */}
              <div
                className="sm:hidden flex items-center justify-between px-4 py-3"
                style={{ backgroundColor: "#0a1628", ...rowStyle }}
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase"
                      style={isBuy ? { backgroundColor: "rgba(34,197,94,0.12)", color: "#34d399" } : { backgroundColor: "rgba(248,113,113,0.12)", color: "#f87171" }}>
                      {isBuy ? "Buy" : "Sell"}
                    </span>
                    <span className="text-sm font-black text-white">{trade.symbol}</span>
                  </div>
                  <span className="text-[10px] font-mono" style={{ color: "#475569" }}>
                    {trade.openedAt ? new Date(trade.openedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-mono text-sm font-black" style={{ color: isWin ? "#34d399" : "#f87171" }}>
                    {pnl >= 0 ? "+" : ""}${Math.abs(pnl).toFixed(2)}
                  </span>
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                    style={isOpen ? { backgroundColor: "rgba(34,197,94,0.1)", color: "#22c55e" } : { backgroundColor: "rgba(255,255,255,0.04)", color: "#475569" }}>
                    {isOpen ? "Open" : "Closed"}
                  </span>
                </div>
              </div>

              {/* Desktop */}
              <div
                className="hidden sm:grid px-4 py-3.5 items-center hover:bg-white/[0.015] transition-colors"
                style={{ gridTemplateColumns: "1.4fr 1.8fr 1fr 1fr 1fr 1fr 0.8fr", backgroundColor: "#0a1628", ...rowStyle }}
              >
                {/* Entry | Exit Time */}
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] uppercase tracking-widest font-bold" style={{ color: "#334155" }}>In</span>
                    <span className="text-[10px] font-mono font-bold" style={{ color: "#60a5fa" }}>
                      {trade.openedAt ? new Date(trade.openedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </span>
                  </div>
                  {trade.closedAt && (
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] uppercase tracking-widest font-bold" style={{ color: "#334155" }}>Out</span>
                      <span className="text-[10px] font-mono" style={{ color: "#475569" }}>
                        {new Date(trade.closedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Side & Symbol (merged) */}
                <div className="flex items-center gap-2">
                  <span
                    className="text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wide flex-shrink-0"
                    style={isBuy
                      ? { backgroundColor: "rgba(34,197,94,0.12)", color: "#34d399" }
                      : { backgroundColor: "rgba(248,113,113,0.12)", color: "#f87171" }
                    }
                  >
                    {isBuy ? "Buy" : "Sell"}
                  </span>
                  <span className="text-sm font-black text-white leading-none truncate">{trade.symbol}</span>
                </div>

                {/* Size & Leverage (merged) */}
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-xs font-bold" style={{ color: "#94a3b8" }}>
                    {trade.positionSize ? `$${trade.positionSize.toFixed(2)}` : "—"}
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded inline-flex w-fit"
                    style={{ backgroundColor: "rgba(96,165,250,0.08)", color: "#60a5fa" }}>
                    {trade.leverage}x
                  </span>
                </div>

                {/* Entry Price */}
                <div className="font-mono text-xs font-bold" style={{ color: "rgba(255,255,255,0.45)" }}>
                  ${formatPrice(trade.entryPrice)}
                </div>

                {/* Exit Price */}
                <div className="font-mono text-xs font-bold" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {isOpen ? <span style={{ color: "#334155" }}>—</span> : `$${formatPrice(trade.currentPrice)}`}
                </div>

                {/* P&L */}
                <div className="font-mono text-xs font-black" style={{ color: isWin ? "#34d399" : "#f87171" }}>
                  {pnl >= 0 ? "+" : ""}${Math.abs(pnl).toFixed(2)}
                </div>

                {/* Status */}
                <div>
                  <span
                    className="text-[9px] font-black px-2 py-1 rounded uppercase tracking-wide"
                    style={isOpen
                      ? { backgroundColor: "rgba(34,197,94,0.1)", color: "#22c55e" }
                      : { backgroundColor: "rgba(255,255,255,0.04)", color: "#475569" }
                    }
                  >
                    {isOpen ? "Open" : "Closed"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function FreedomBotDashboard() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const [deployOpen, setDeployOpen] = useState(false);
  const [deployment, setDeployment] = useState<Deployment | null | undefined>(undefined);
  const [stats, setStats] = useState<BotStats | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [stopConfirm, setStopConfirm] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  // Redirect unauthenticated users back to landing
  useEffect(() => {
    if (!isUserLoading && !user) {
      router.replace("/");
    }
  }, [user, isUserLoading, router]);

  const fetchDeployment = useCallback(async () => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/freedombot/my-deployment", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      setDeployment(data.deployment ?? null);
    } catch {
      setDeployment(null);
    }
  }, [user]);

  const fetchUserTrades = useCallback(async () => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/freedombot/my-trades", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      setTrades(data.trades ?? []);
    } catch {
      setTrades([]);
    }
  }, [user]);

  useEffect(() => {
    fetchDeployment();
    fetch("/api/freedombot/stats").then((r) => r.json()).then(setStats).catch(() => {});
    fetchUserTrades();
  }, [fetchDeployment, fetchUserTrades]);

  // After deploying, re-check deployment status and reload trades
  const handleDeployClose = useCallback(() => {
    setDeployOpen(false);
    fetchDeployment();
    fetchUserTrades();
  }, [fetchDeployment, fetchUserTrades]);

  const handleStopBot = useCallback(async () => {
    if (!user || !deployment) return;
    setIsStopping(true);
    try {
      const idToken = await user.getIdToken();
      await fetch("/api/freedombot/stop-deployment", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ deploymentId: deployment.id }),
      });
      setStopConfirm(false);
      fetchDeployment();
    } catch {
      // silently retry on next refresh
    } finally {
      setIsStopping(false);
    }
  }, [user, deployment, fetchDeployment]);

  if (isUserLoading || deployment === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#080f1e" }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#3b82f6" }} />
      </div>
    );
  }

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#080f1e" }}>
      <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#3b82f6" }} />
    </div>
  );

  return (
    <div className="min-h-screen font-sans antialiased" style={{ backgroundColor: "#080f1e", color: "#f0f4ff" }}>
      <DashTopBar onDeploy={() => setDeployOpen(true)} hasDeployment={!!deployment} />

      {deployment === null ? (
        <NotConnected stats={stats} onDeploy={() => setDeployOpen(true)} />
      ) : (
        <Connected
          deployment={deployment}
          stats={stats}
          trades={trades}
          onStop={() => setStopConfirm(true)}
        />
      )}

      {/* Stop Bot confirmation dialog */}
      {stopConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)" }}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-6 text-center"
            style={{ backgroundColor: "#0a1628", border: "1px solid rgba(239,68,68,0.25)" }}
          >
            <div
              className="h-14 w-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
            >
              <Square className="h-7 w-7" style={{ color: "#f87171" }} />
            </div>
            <h3 className="text-lg font-black text-white mb-2">Stop your bot?</h3>
            <p className="text-sm mb-6 leading-relaxed" style={{ color: "#64748b" }}>
              This will disable auto-trading immediately. No new trades will be placed.
              You can deploy a new bot at any time after stopping.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setStopConfirm(false)}
                className="flex-1 py-3 rounded-2xl text-sm font-bold transition-colors"
                style={{ backgroundColor: "rgba(90,140,220,0.08)", color: "#64748b", border: "1px solid rgba(90,140,220,0.12)" }}
              >
                Keep running
              </button>
              <button
                onClick={handleStopBot}
                disabled={isStopping}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-white transition-all disabled:opacity-50"
                style={{ backgroundColor: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}
              >
                {isStopping ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Yes, stop it"}
              </button>
            </div>
          </div>
        </div>
      )}

      <DeployModal
        isOpen={deployOpen}
        onClose={handleDeployClose}
        user={user}
        auth={auth}
      />
    </div>
  );
}
