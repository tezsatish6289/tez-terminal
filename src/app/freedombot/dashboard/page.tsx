"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import {
  Rocket,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  Loader2,
  BarChart3,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Activity,
  Settings,
} from "lucide-react";
import { useUser, useAuth } from "@/firebase";
import { initiateSignOut } from "@/firebase/non-blocking-login";
import { DeployModal } from "../components/DeployModal";
import {
  BotSettings,
  type DeploymentWallet,
  type SettingsDeployment,
} from "../components/BotSettings";
import type { TradingPrefs } from "@/lib/freedombot/trading-prefs-shared";
import { toast } from "@/hooks/use-toast";
import { TradesPanel } from "@/components/freedombot/TradesPanel";
import {
  type Trade,
  anyTradeIsPreliminary,
  cumulativeBestPnlByTradeId,
  sortTradesForDashboard,
  totalClosedPnl,
} from "@/lib/freedombot/trade-display";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Deployment {
  id: string;
  bot: string;
  exchange: string;
  /** "active" or "paused" — legacy "stopped" rows are normalized to "paused"
   *  server-side. The dashboard only sees these two values now. */
  status: "active" | "paused";
  keyLastFour?: string | null;
  createdAt: string | null;
  pausedAt?: string | null;
  /** Cached wallet snapshot from the last successful balance fetch. Null
   *  while we're waiting for the first test-connection call to land or
   *  when the deployment pre-dates wallet tracking. */
  wallet?: DeploymentWallet | null;
  tradingPrefs?: TradingPrefs;
}

interface BotStats {
  runningDays: number;
  currentCapital?: number;
  startingCapital?: number;
  totalReturnPct: number | null;
  profitPerMonth: number | null;
  profitPerYear: number | null;
  isAnnualizationReliable?: boolean;
  winRate: number | null;
  totalTrades: number;
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

/** Live trades before `exchange` was denormalized are treated as Bybit. */
function tradeMatchesDeployment(t: Trade, dep: Deployment): boolean {
  if (t.exchange) return t.exchange === dep.exchange;
  return dep.exchange === "BYBIT";
}

const BOT_LABELS: Record<string, string> = {
  CRYPTO: "Crypto Bot",
  INDIAN_STOCKS: "Indian Stock Bot",
  GOLD: "Gold Bot",
  SILVER: "Silver Bot",
};

/** Crypto exchanges supported for FreedomBot deploy (must match deploy route). */
const FREEDOMBOT_CRYPTO_EXCHANGES = ["BYBIT", "COINDCX", "HYPERLIQUID"] as const;

const EXCHANGE_LABELS: Record<string, string> = {
  BYBIT: "Bybit",
  COINDCX: "CoinDCX",
  HYPERLIQUID: "Hyperliquid",
  BINANCE: "Binance",
  ZERODHA: "Zerodha",
  UPSTOX: "Upstox",
  ANGEL_ONE: "Angel One",
  DHAN: "Dhan",
};

// ─── TopBar ──────────────────────────────────────────────────────────────────

function DashTopBar({
  onDeploy,
  showDeployButton,
  deployButtonLabel = "Deploy Bot",
}: {
  onDeploy: () => void;
  showDeployButton: boolean;
  deployButtonLabel?: string;
}) {
  const { user } = useUser();
  const auth = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    if (auth) {
      await initiateSignOut(auth);
      window.location.href = "/";
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
        <Image src="/freedombot/icon.png" alt="FreedomBot" width={32} height={32} className="rounded-xl object-contain" />
        <span className="font-black text-lg tracking-tight" style={{ color: "#60a5fa" }}>
          FreedomBot.ai
        </span>
      </div>

      <div className="flex items-center gap-3">
        {showDeployButton && (
          <>
            {/* Desktop label */}
            <button
              onClick={onDeploy}
              className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:scale-105"
              style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
            >
              <Rocket className="h-3.5 w-3.5" /> {deployButtonLabel}
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
          <Image src="/freedombot/icon.png" alt="FreedomBot" width={80} height={80} className="rounded-2xl object-contain" />
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
              {
                label: "Annualized Return",
                value: stats ? fmt(stats.profitPerYear) : "…",
                color: "#a78bfa",
                projected: stats ? (stats.runningDays < 365) : false,
                warn: stats ? (stats.isAnnualizationReliable === false || stats.runningDays < 7) : false,
              },
            ].map((s) => (
              <div key={s.label} className="p-4 text-center">
                <div className="flex items-center justify-center gap-1.5 mb-0.5 flex-wrap">
                  <p className="text-base font-black" style={{ color: s.color }}>{s.value}</p>
                  {"projected" in s && s.projected && (
                    <span className="text-[9px] font-black uppercase tracking-wider px-1 py-0.5 rounded" style={{ backgroundColor: "rgba(251,191,36,0.12)", color: "#fbbf24" }}>Proj.</span>
                  )}
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#334155" }}>{s.label}</p>
                {"warn" in s && s.warn && (
                  <p
                    className="text-[9px] font-semibold mt-1 leading-snug"
                    style={{ color: "#fbbf24" }}
                    title="Annualised metrics are statistically noisy under a week of live trading"
                  >
                    Short track record — may be volatile
                  </p>
                )}
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

// ─── Connected State ──────────────────────────────────────────────────────────

const BOTS_NAV = [
  { key: "CRYPTO",        emoji: "₿",  label: "Crypto Bot",       live: true  },
  { key: "INDIAN_STOCKS", emoji: "🇮🇳", label: "Indian Stock Bot", live: false },
  { key: "GOLD",          emoji: "🥇", label: "Gold Bot",         live: false },
  { key: "SILVER",        emoji: "🥈", label: "Silver Bot",       live: false },
];

function Connected({ deployment, deployments, stats, trades, aggregates, cumulativeByTradeId, tradesSyncing, onOpenSettings, onSelectDeployment, onRefreshTrade }: {
  deployment: Deployment;
  deployments: Deployment[];
  stats: BotStats | null;
  trades: Trade[];
  /** Server-cached aggregates for the selected exchange (null until first my-trades response). */
  aggregates: { lifetimeRealizedPnl: number; openTradeCount: number; closedTradeCount: number } | null;
  /** Running total after each close (exchange-backed rows only); null until that close has a venue PnL. */
  cumulativeByTradeId: Map<string, number | null>;
  tradesSyncing?: boolean;
  onOpenSettings: () => void;
  onSelectDeployment: (id: string) => void;
  onRefreshTrade: (tradeId: string) => Promise<void>;
}) {
  const TRADES_PAGE_SIZE = 25;
  const [tradePage, setTradePage] = useState(1);
  const isPaused = deployment.status === "paused";
  const exchangeLabel = EXCHANGE_LABELS[deployment.exchange] ?? deployment.exchange;

  const cryptoActiveDeployments = deployments.filter(
    (d) => d.bot === "CRYPTO" && d.status === "active",
  );
  const showExchangeSwitcher = cryptoActiveDeployments.length > 1;

  // Compute user-specific stats from their actual trades + deployment date.
  // Prefer the server-cached lifetime PnL (covers EVERY trade for this
  // exchange, regardless of pagination); fall back to a local sum.
  const runningDays = deployment.createdAt
    ? Math.floor((Date.now() - new Date(deployment.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const totalPnl = aggregates?.lifetimeRealizedPnl ?? totalClosedPnl(trades);
  const hasUnverifiedPnl = anyTradeIsPreliminary(trades);

  const tradePageCount = Math.max(1, Math.ceil(trades.length / TRADES_PAGE_SIZE));
  const currentTradePage = Math.min(tradePage, tradePageCount);
  const pagedTrades = trades.slice(
    (currentTradePage - 1) * TRADES_PAGE_SIZE,
    currentTradePage * TRADES_PAGE_SIZE,
  );

  const depIdRef = useRef(deployment.id);
  useEffect(() => {
    if (depIdRef.current !== deployment.id) {
      depIdRef.current = deployment.id;
      setTradePage(1);
    }
  }, [deployment.id]);

  useEffect(() => {
    setTradePage((p) => Math.min(Math.max(1, p), tradePageCount));
  }, [tradePageCount]);

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

      {/* ── Multi-exchange switch (e.g. Bybit + CoinDCX) ── */}
      {showExchangeSwitcher && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#475569" }}>
            Account
          </span>
          <div className="flex gap-1.5 flex-wrap">
            {cryptoActiveDeployments.map((d) => {
              const selected = d.id === deployment.id;
              const label = EXCHANGE_LABELS[d.exchange] ?? d.exchange;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onSelectDeployment(d.id)}
                  className="px-3 py-1.5 rounded-xl text-xs font-black transition-all"
                  style={{
                    backgroundColor: selected ? "rgba(37,99,235,0.2)" : "rgba(10,22,40,0.6)",
                    border: `1px solid ${selected ? "rgba(59,130,246,0.45)" : "rgba(90,140,220,0.1)"}`,
                    color: selected ? "#f0f4ff" : "#64748b",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

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
              <div
                className="h-2 w-2 rounded-full animate-pulse"
                style={{
                  backgroundColor: isPaused ? "#fbbf24" : "#22c55e",
                  boxShadow: `0 0 6px ${isPaused ? "#fbbf24" : "#22c55e"}`,
                }}
              />
              <span
                className="text-sm font-black"
                style={{ color: isPaused ? "#fbbf24" : "#22c55e" }}
              >
                {isPaused ? "Paused" : "Live"}
              </span>
            </div>
            <span className="text-xs" style={{ color: "#334155" }}>·</span>
            <span className="text-xs font-medium" style={{ color: "#475569" }}>{exchangeLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:scale-105"
              style={{
                backgroundColor: "rgba(90,140,220,0.08)",
                color: "#94a3b8",
                border: "1px solid rgba(90,140,220,0.18)",
              }}
              title="Bot settings — wallet, pause, update keys, delete"
              aria-label="Open bot settings"
            >
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          </div>
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
              <p className="text-2xl font-black flex items-center gap-2" style={{ color: s.color }}>
                {i === 2 && tradesSyncing && trades.length === 0 ? (
                  <Loader2 className="h-6 w-6 animate-spin shrink-0" style={{ color: "#64748b" }} />
                ) : null}
                {s.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <TradesPanel
        trades={pagedTrades}
        cumulativeByTradeId={cumulativeByTradeId}
        showWarningBanner={hasUnverifiedPnl}
        isInitiallyLoading={tradesSyncing}
        onRefreshTrade={onRefreshTrade}
        emptyTitle="No trades yet"
        emptySubtitle="Trades will appear here once your bot starts placing orders"
      />

      {/* Client-side pagination — drives the slice fed into TradesPanel above. */}
      {trades.length > TRADES_PAGE_SIZE && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl"
          style={{
            backgroundColor: "#060d1a",
            border: "1px solid rgba(90,140,220,0.12)",
          }}
        >
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#475569" }}>
            Showing {(currentTradePage - 1) * TRADES_PAGE_SIZE + 1}
            {"–"}
            {Math.min(currentTradePage * TRADES_PAGE_SIZE, trades.length)} of {trades.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentTradePage <= 1}
              onClick={() => setTradePage((p) => Math.max(1, p - 1))}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/[0.06]"
              style={{ color: "#94a3b8", border: "1px solid rgba(90,140,220,0.15)" }}
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>
            <span className="text-xs font-mono font-bold tabular-nums" style={{ color: "#64748b" }}>
              {currentTradePage} / {tradePageCount}
            </span>
            <button
              type="button"
              disabled={currentTradePage >= tradePageCount}
              onClick={() => setTradePage((p) => Math.min(tradePageCount, p + 1))}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/[0.06]"
              style={{ color: "#94a3b8", border: "1px solid rgba(90,140,220,0.15)" }}
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function FreedomBotDashboard() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const [deployOpen, setDeployOpen] = useState(false);
  const [deployments, setDeployments] = useState<Deployment[] | undefined>(undefined);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null);
  const [stats, setStats] = useState<BotStats | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradesAggregates, setTradesAggregates] = useState<{
    lifetimeRealizedPnl: number;
    openTradeCount: number;
    closedTradeCount: number;
  } | null>(null);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const selectedDeployment = useMemo(() => {
    if (!deployments?.length) return null;
    const hit = selectedDeploymentId
      ? deployments.find((d) => d.id === selectedDeploymentId)
      : null;
    return hit ?? deployments[0] ?? null;
  }, [deployments, selectedDeploymentId]);

  // Includes paused — a paused deployment still occupies its exchange
  // slot (the user can resume from Settings), so "Add exchange" must
  // not offer it as available.
  const activeCryptoDeployments = useMemo(
    () =>
      (deployments ?? []).filter(
        (d) => d.bot === "CRYPTO" && (d.status === "active" || d.status === "paused"),
      ),
    [deployments],
  );

  const usedCryptoExchanges = useMemo(
    () => new Set(activeCryptoDeployments.map((d) => d.exchange)),
    [activeCryptoDeployments],
  );

  const canDeployMoreCrypto = useMemo(
    () => FREEDOMBOT_CRYPTO_EXCHANGES.some((ex) => !usedCryptoExchanges.has(ex)),
    [usedCryptoExchanges],
  );

  const showDeployButton = (deployments?.length ?? 0) === 0 || canDeployMoreCrypto;

  const deployButtonLabel =
    deployments && deployments.length > 0 ? "Add exchange" : "Deploy Bot";

  const { dashboardTrades, cumulativeByTradeId } = useMemo(() => {
    const list = !selectedDeployment
      ? trades
      : trades.filter((t) => tradeMatchesDeployment(t, selectedDeployment));
    // Anchor the cumulative sum at the server-cached lifetime so it stays
    // correct when the user has only loaded a subset of pages. Falls back to
    // the local forward sum when the server didn't return aggregates.
    const anchor = tradesAggregates
      ? { lifetimeRealizedPnl: tradesAggregates.lifetimeRealizedPnl }
      : undefined;
    return {
      dashboardTrades: sortTradesForDashboard(list),
      cumulativeByTradeId: cumulativeBestPnlByTradeId(list, anchor),
    };
  }, [trades, selectedDeployment, tradesAggregates]);

  // Redirect unauthenticated users back to landing (hard nav — reliable after sign-out)
  useEffect(() => {
    if (!isUserLoading && !user) {
      window.location.href = "/";
    }
  }, [user, isUserLoading]);

  // Set page title and favicon
  useEffect(() => {
    document.title = "FreedomBot.ai — Dashboard";
    document.querySelectorAll("link[rel~='icon'], link[rel='shortcut icon']").forEach((el) => el.remove());
    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    link.href = `/freedombot/icon.png?v=${Date.now()}`;
    document.head.appendChild(link);
  }, []);

  const fetchDeployment = useCallback(async () => {
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/freedombot/my-deployment", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      const list: Deployment[] = Array.isArray(data.deployments)
        ? data.deployments
        : data.deployment
          ? [data.deployment]
          : [];
      setDeployments(list);
      setSelectedDeploymentId((prev) => {
        if (prev && list.some((d) => d.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch {
      setDeployments([]);
      setSelectedDeploymentId(null);
    }
  }, [user]);

  // Tracks deployments we've already fired an auto test-connection for in
  // this session. Without this, every re-fetch of deployments (e.g. after
  // pause/resume) would trigger another round of venue API calls. The
  // server's 60s throttle would short-circuit them but it's still wasteful
  // network. Manual Test (inside Settings) ignores this ref and always
  // forces a fresh fetch.
  const autoTestedDeploymentsRef = useRef<Set<string>>(new Set());

  const applyWalletPatch = useCallback(
    (deploymentId: string, wallet: DeploymentWallet | null) => {
      setDeployments((prev) =>
        prev?.map((d) => (d.id === deploymentId ? { ...d, wallet } : d)),
      );
    },
    [],
  );

  const refreshWalletForDeployment = useCallback(
    async (deploymentId: string, force: boolean) => {
      if (!user) return;
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/freedombot/test-connection", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ deploymentId, force }),
        });
        const data = await res.json();
        if (typeof data.status === "string") {
          applyWalletPatch(deploymentId, {
            total: typeof data.total === "number" ? data.total : null,
            available: typeof data.available === "number" ? data.available : null,
            currency: typeof data.currency === "string" ? data.currency : null,
            status: data.status === "valid" ? "valid" : "invalid",
            error: typeof data.error === "string" ? data.error : null,
            checkedAt: typeof data.checkedAt === "string" ? data.checkedAt : null,
          });
        }
      } catch {
        // Network errors are non-fatal — the cached wallet stays visible.
      }
    },
    [user, applyWalletPatch],
  );

  // Fire one background test-connection per deployment on dashboard load.
  // Server-side 60s throttle prevents hammering the venue if the cron
  // checked recently. The session-level ref prevents firing twice for the
  // same deployment within one dashboard mount.
  useEffect(() => {
    if (!user || !deployments?.length) return;
    for (const dep of deployments) {
      if (autoTestedDeploymentsRef.current.has(dep.id)) continue;
      autoTestedDeploymentsRef.current.add(dep.id);
      void refreshWalletForDeployment(dep.id, false);
    }
  }, [user, deployments, refreshWalletForDeployment]);

  // Tracks the exchange the most recently dispatched fetch is for. Each
  // in-flight fetch checks this on land — if it no longer matches the tab
  // the user is currently looking at (because they switched), the response
  // is silently discarded. Without this, a slow reconcile fetch from the
  // previous tab can stomp the freshly-loaded data on the current tab,
  // causing rows to flash in then disappear.
  const lastFetchExchangeRef = useRef<string | null>(null);

  const fetchUserTrades = useCallback(
    async (exchangeForReconcile: string | null, withReconcile = true) => {
      if (!user) return;
      const exU = exchangeForReconcile?.trim().toUpperCase() ?? "";
      lastFetchExchangeRef.current = exU || null;
      if (withReconcile) setTradesLoading(true);
      try {
        const idToken = await user.getIdToken();
        const params = new URLSearchParams();
        const isCryptoTab =
          exU.length > 0 &&
          FREEDOMBOT_CRYPTO_EXCHANGES.includes(
            exU as (typeof FREEDOMBOT_CRYPTO_EXCHANGES)[number],
          );
        if (isCryptoTab) {
          params.set("exchange", exU);
        }
        if (withReconcile && isCryptoTab) {
          params.set("reconcile", "1");
        }
        const qs = params.toString();
        const res = await fetch(`/api/freedombot/my-trades${qs ? `?${qs}` : ""}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json();
        // Drop stale responses — user has already moved to a different tab.
        if (lastFetchExchangeRef.current !== (exU || null)) return;
        setTrades(data.trades ?? []);
        setTradesAggregates(
          data.aggregates && typeof data.aggregates.lifetimeRealizedPnl === "number"
            ? {
                lifetimeRealizedPnl: data.aggregates.lifetimeRealizedPnl,
                openTradeCount: data.aggregates.openTradeCount ?? 0,
                closedTradeCount: data.aggregates.closedTradeCount ?? 0,
              }
            : null,
        );
      } catch {
        // Preserve last known-good state on error — wiping `trades` here is
        // what causes the table to suddenly empty out when a reconcile fetch
        // fails (Bybit timeout, rate limit, etc.). Failing silently is the
        // right UX: the next successful fetch refreshes the data.
        if (lastFetchExchangeRef.current !== (exU || null)) return;
      } finally {
        if (withReconcile && lastFetchExchangeRef.current === (exU || null)) {
          setTradesLoading(false);
        }
      }
    },
    [user],
  );

  useEffect(() => {
    fetchDeployment();
  }, [fetchDeployment]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/freedombot/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (deployments === undefined) return;
    if (!deployments.length) {
      void fetchUserTrades(null, false);
      return;
    }
    const ex = selectedDeployment?.exchange ?? null;
    const crypto =
      ex &&
      FREEDOMBOT_CRYPTO_EXCHANGES.includes(
        ex.toUpperCase() as (typeof FREEDOMBOT_CRYPTO_EXCHANGES)[number],
      );
    // Fast list from Firestore first; exchange reconcile hits APIs and can be slow.
    void fetchUserTrades(ex, false);
    if (!crypto) return;
    const id = requestAnimationFrame(() => {
      void fetchUserTrades(ex, true);
    });
    return () => cancelAnimationFrame(id);
  }, [user, deployments, selectedDeployment?.id, selectedDeployment?.exchange, fetchUserTrades]);

  // After deploying, re-check deployment status (trades reload via effect)
  const handleDeployClose = useCallback(() => {
    setDeployOpen(false);
    fetchDeployment();
  }, [fetchDeployment]);

  const handleSettingsMutated = useCallback(() => {
    // Allow the auto-test effect to re-fire for the mutated deployment
    // (e.g. after Update API key the wallet snapshot is fresh server-side
    // but we want to ensure local state reflects it). The set is keyed
    // on deploymentId, so clearing it forces every visible row to be
    // re-checked on the next render cycle.
    autoTestedDeploymentsRef.current.clear();
    fetchDeployment();
    // Trades panel may have been mutated by delete (positions closed),
    // re-pull on the currently-selected exchange.
    const ex = selectedDeployment?.exchange ?? null;
    void fetchUserTrades(ex, false);
  }, [fetchDeployment, fetchUserTrades, selectedDeployment?.exchange]);

  if (isUserLoading || deployments === undefined) {
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
      {!deployments?.length ? (
        <NotConnected stats={stats} onDeploy={() => setDeployOpen(true)} />
      ) : (
        <Connected
          deployment={selectedDeployment!}
          deployments={deployments}
          stats={stats}
          trades={dashboardTrades}
          aggregates={tradesAggregates}
          cumulativeByTradeId={cumulativeByTradeId}
          tradesSyncing={tradesLoading}
          onOpenSettings={() => setSettingsOpen(true)}
          onSelectDeployment={setSelectedDeploymentId}
          onRefreshTrade={async (tradeId) => {
            const idToken = await user?.getIdToken();
            if (!idToken) return;
            const res = await fetch("/api/freedombot/sync-trade", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
              body: JSON.stringify({ tradeId }),
            });
            const data = (await res.json()) as {
              error?: string;
              pnlReconciled?: boolean;
              reason?: string;
              status?: string;
              exchangeRealizedPnl?: number;
              residualOrdersPendingCleanup?: boolean;
            };
            if (!res.ok) {
              toast({
                variant: "destructive",
                title: "Sync failed",
                description: data.error ?? `HTTP ${res.status}`,
              });
            } else if (data.status === "closed_now" && data.pnlReconciled === true) {
              toast({
                title: "Trade closed & P&L synced",
                description: `The exchange position was already closed. We've cleaned up any leftover orders and pulled the realized P&L.${data.residualOrdersPendingCleanup ? " (Some leftover orders will be cleared on the next cycle.)" : ""}`,
              });
            } else if (data.status === "closed_now" && data.pnlReconciled === false) {
              toast({
                title: "Trade closed — P&L pending",
                description: "The exchange position was closed and any leftover orders were cancelled. The realized P&L is not yet indexed by the exchange and will be filled in automatically within a minute.",
              });
            } else if (data.pnlReconciled === false && data.reason) {
              toast({
                variant: "destructive",
                title: "Exchange P&L not available yet",
                description:
                  data.reason === "no_closed_pnl_rows_in_window"
                    ? "The exchange hasn't returned a realized-P&L row for this exit yet (typical lag is a few seconds, sometimes a minute). It will fill in automatically — or click refresh again shortly."
                    : String(data.reason),
              });
            } else if (data.pnlReconciled === true) {
              toast({ title: "P&L synced", description: "Updated from the exchange." });
            }
            const ex = selectedDeployment?.exchange ?? null;
            await fetchUserTrades(ex, false);
          }}
        />
      )}

      {selectedDeployment && (
        <BotSettings
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          user={user}
          deployment={
            {
              id: selectedDeployment.id,
              exchange: selectedDeployment.exchange,
              status: selectedDeployment.status,
              keyLastFour: selectedDeployment.keyLastFour ?? null,
              wallet: selectedDeployment.wallet ?? null,
              tradingPrefs: selectedDeployment.tradingPrefs,
            } satisfies SettingsDeployment
          }
          exchangeLabel={
            EXCHANGE_LABELS[selectedDeployment.exchange] ?? selectedDeployment.exchange
          }
          openTradesCount={
            tradesAggregates?.openTradeCount ??
            trades.filter(
              (t) =>
                tradeMatchesDeployment(t, selectedDeployment) &&
                (t.status === "OPEN" || t.status === "open"),
            ).length
          }
          onMutated={handleSettingsMutated}
        />
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
