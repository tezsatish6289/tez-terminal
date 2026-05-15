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
  Zap,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Activity,
  Square,
  RefreshCw,
} from "lucide-react";
import { useUser, useAuth } from "@/firebase";
import { initiateSignOut } from "@/firebase/non-blocking-login";
import { DeployModal } from "../components/DeployModal";
import { toast } from "@/hooks/use-toast";

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

/**
 * Source label for `realizedPnl`, decided server-side in /api/freedombot/my-trades.
 *   - "override" / "exchange"   → verified, solid color
 *   - "events" / "prices" / "internal" → preliminary, muted color + tooltip
 */
type RealizedPnlSource =
  | "override"
  | "exchange"
  | "events"
  | "prices"
  | "internal";

interface Trade {
  id: string;
  exchange?: string | null;
  symbol: string;
  side: string;
  status: string;
  /**
   * Effective P&L resolved by the API in this priority:
   *   override → exchange → events sum → prices estimate → internal.
   */
  realizedPnl: number;
  /** Which input the API picked for `realizedPnl`. Null when the trade is open. */
  realizedPnlSource?: RealizedPnlSource | null;
  /** In-bot / TP–SL model PnL before venue sync (closed trades). */
  realizedPnlInternal?: number;
  /** Exchange-reported realised PnL when synced. */
  realizedPnlExchange?: number | null;
  /** Optional manual correction (USD); wins for display and passbook. */
  exchangeRealizedPnlOverride?: number | null;
  exchangePnlReconciledAt?: string | null;
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

/** Signed USD for P&L lines (uses Unicode minus for losses). */
function formatSignedUsd(n: number): string {
  const abs = Math.abs(n).toFixed(2);
  if (n > 0) return `+$${abs}`;
  if (n < 0) return `\u2212$${abs}`;
  return `$${abs}`;
}

function closedAtMs(t: Trade): number {
  if (!t.closedAt) return 0;
  const ms = new Date(t.closedAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function openedAtMs(t: Trade): number {
  if (!t.openedAt) return 0;
  const ms = new Date(t.openedAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/** When exchange (or override) PnL became authoritative — drives passbook order. */
function pnlBookedAtMs(t: Trade): number {
  if (t.exchangePnlReconciledAt) {
    const ms = new Date(t.exchangePnlReconciledAt).getTime();
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return closedAtMs(t) || openedAtMs(t);
}

/**
 * Open positions first (newest entry first), then all closed rows by **latest exit first**
 * (`closedAt`). Pending venue PnL no longer sinks below older booked closes on page 1.
 */
function sortTradesForDashboard(list: Trade[]): Trade[] {
  const closed = list.filter((t) => t.status === "closed");
  const open = list.filter((t) => t.status === "open");
  const sortedClosedDesc = [...closed].sort((a, b) => {
    const d = closedAtMs(b) - closedAtMs(a);
    if (d !== 0) return d;
    return b.id.localeCompare(a.id);
  });
  const sortedOpenDesc = [...open].sort((a, b) => openedAtMs(b) - openedAtMs(a));
  return [...sortedOpenDesc, ...sortedClosedDesc];
}

/**
 * Best available closed-trade P&L for display, with provenance.
 *
 * The actual resolution happens server-side in /api/freedombot/my-trades
 * via the shared `bestRealizedPnl` helper, which walks:
 *
 *   override → exchange → events sum → prices estimate → internal
 *
 * The dashboard just consumes the resolved value + source label, so the
 * row PnL, cumulative column, total header, and admin lifetime header are
 * guaranteed to use identical math.
 */
function bestClosedPnl(
  t: Trade,
): { value: number; source: RealizedPnlSource } | null {
  if (t.status !== "closed") return null;
  if (!t.realizedPnlSource) return null;
  if (typeof t.realizedPnl !== "number" || Number.isNaN(t.realizedPnl)) return null;
  return { value: t.realizedPnl, source: t.realizedPnlSource };
}

/** Open: live sync. Closed: only until exchange PnL exists (manual override counts as final). */
function tradeShowsResyncControl(t: Trade): boolean {
  if (t.status === "open") return true;
  if (typeof t.exchangeRealizedPnlOverride === "number" && !Number.isNaN(t.exchangeRealizedPnlOverride)) return false;
  return t.realizedPnlExchange == null;
}

/**
 * Passbook cumulative: walks closes in **booking time** order
 * (`exchangePnlReconciledAt` ascending, then trade id) and sums the best
 * available P&L for each (override > exchange > estimated). The table lists
 * closes by exit time (newest first); cumulative values follow booking order,
 * so they may not increase top-to-bottom.
 */
function cumulativeBestPnlByTradeId(list: Trade[]): Map<string, number | null> {
  const closed = list.filter((t) => t.status === "closed");
  const chrono = [...closed].sort((a, b) => {
    const ta = pnlBookedAtMs(a);
    const tb = pnlBookedAtMs(b);
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
  const map = new Map<string, number | null>();
  let sum = 0;
  for (const t of chrono) {
    const best = bestClosedPnl(t);
    if (best != null) sum += best.value;
    map.set(t.id, best != null ? sum : null);
  }
  return map;
}

// ─── Connected State ──────────────────────────────────────────────────────────

const BOTS_NAV = [
  { key: "CRYPTO",        emoji: "₿",  label: "Crypto Bot",       live: true  },
  { key: "INDIAN_STOCKS", emoji: "🇮🇳", label: "Indian Stock Bot", live: false },
  { key: "GOLD",          emoji: "🥇", label: "Gold Bot",         live: false },
  { key: "SILVER",        emoji: "🥈", label: "Silver Bot",       live: false },
];

function Connected({ deployment, deployments, stats, trades, cumulativeByTradeId, tradesSyncing, onStop, onSelectDeployment, onRefreshTrade }: {
  deployment: Deployment;
  deployments: Deployment[];
  stats: BotStats | null;
  trades: Trade[];
  /** Running total after each close (exchange-backed rows only); null until that close has a venue PnL. */
  cumulativeByTradeId: Map<string, number | null>;
  tradesSyncing?: boolean;
  onStop: () => void;
  onSelectDeployment: (id: string) => void;
  onRefreshTrade: (tradeId: string) => Promise<void>;
}) {
  const TRADES_PAGE_SIZE = 25;
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const [tradePage, setTradePage] = useState(1);
  const isPending = deployment.status === "pending";
  const exchangeLabel = EXCHANGE_LABELS[deployment.exchange] ?? deployment.exchange;

  const cryptoActiveDeployments = deployments.filter(
    (d) => d.bot === "CRYPTO" && d.status === "active",
  );
  const showExchangeSwitcher = cryptoActiveDeployments.length > 1;

  // Compute user-specific stats from their actual trades + deployment date
  const runningDays = deployment.createdAt
    ? Math.floor((Date.now() - new Date(deployment.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const closedTrades = trades.filter((t) => t.status === "closed");
  const totalPnl = closedTrades.reduce((sum, t) => {
    const best = bestClosedPnl(t);
    return best != null ? sum + best.value : sum;
  }, 0);
  const hasUnverifiedPnl = closedTrades.some((t) => {
    const best = bestClosedPnl(t);
    if (best == null) return false;
    return (
      best.source === "events" ||
      best.source === "prices" ||
      best.source === "internal"
    );
  });

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
              <div className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: isPending ? "#fbbf24" : "#22c55e", boxShadow: `0 0 6px ${isPending ? "#fbbf24" : "#22c55e"}` }} />
              <span className="text-sm font-black" style={{ color: isPending ? "#fbbf24" : "#22c55e" }}>
                {isPending ? "Setting up" : "Live"}
              </span>
            </div>
            <span className="text-xs" style={{ color: "#334155" }}>·</span>
            <span className="text-xs font-medium" style={{ color: "#475569" }}>{exchangeLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onStop}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all hover:scale-105"
              style={{ backgroundColor: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.15)" }}
            >
              <Square className="h-3 w-3" /> Stop Bot
            </button>
          </div>        </div>

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

      {hasUnverifiedPnl && (
        <div
          className="rounded-2xl px-4 py-3 text-xs font-semibold leading-relaxed flex items-start gap-2"
          style={{
            backgroundColor: "rgba(251,191,36,0.06)",
            border: "1px solid rgba(251,191,36,0.18)",
            color: "#fcd34d",
          }}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: "#fbbf24" }} />
          <span>
            Rows marked with a yellow dot show a preliminary P&L computed from each TP/SL
            fill recorded for that trade (gross of fees). The exchange&apos;s verified
            realised P&L replaces it as soon as the venue indexes those exits — usually
            within a minute. Click the refresh icon on any row to force an immediate sync.
          </span>
        </div>
      )}

      {/* ── Trades table ── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ border: "1px solid rgba(90,140,220,0.12)" }}
      >
        {/* Table header — 8 columns */}
        <div
          className="hidden sm:grid px-4 py-3 gap-1"
          style={{
            gridTemplateColumns: "1.35fr 1.55fr 0.9fr 0.9fr 0.9fr 0.85fr 1fr 0.75fr",
            backgroundColor: "#060d1a",
            borderBottom: "1px solid rgba(90,140,220,0.1)",
          }}
        >
          {[
            { label: "Entry | Exit Time", tip: "" },
            { label: "Side & Symbol", tip: "" },
            { label: "Size & Leverage", tip: "" },
            { label: "Entry Price", tip: "" },
            { label: "Exit Price", tip: "" },
            { label: "P&L", tip: "" },
            { label: "Cumulative", tip: "Running total after each close (oldest first by booking time). Uses the exchange's realised P&L when available, otherwise the bot's preliminary calculation. The table sorts closes by latest exit; cumulative follows booking order, so values may not increase top-to-bottom." },
            { label: "Status", tip: "" },
          ].map(({ label, tip }) => (
            <div
              key={label}
              className="text-[9px] font-bold uppercase tracking-widest min-w-0"
              style={{ color: "#334155" }}
              title={tip || undefined}
            >
              {label}
            </div>
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
        {pagedTrades.map((trade, i, arr) => {
          const isOpen = trade.status === "open";
          const closedBest = !isOpen ? bestClosedPnl(trade) : null;
          const closedPnl = closedBest?.value ?? null;
          // "events" / "prices" / "internal" are all pre-sync values — show
          // the same muted styling so users know venue reconciliation hasn't
          // completed yet for that row.
          const isPreliminary =
            closedBest?.source === "events" ||
            closedBest?.source === "prices" ||
            closedBest?.source === "internal";
          const openPnl = isOpen ? trade.unrealizedPnl : 0;
          const pnlDisplay = isOpen
            ? formatSignedUsd(openPnl)
            : closedPnl != null
              ? formatSignedUsd(closedPnl)
              : "—";
          const isWin = isOpen ? openPnl >= 0 : closedPnl != null && closedPnl >= 0;
          const isBuy = trade.side === "LONG" || trade.side === "BUY";
          const cumulative = !isOpen ? cumulativeByTradeId.get(trade.id) : undefined;
          const showResync = tradeShowsResyncControl(trade);
          const rowStyle = { borderBottom: i < arr.length - 1 ? "1px solid rgba(90,140,220,0.06)" : "none" };
          // Solid colors for verified PnL (override / exchange); muted versions
          // for preliminary (events / prices / internal) so users can tell at
          // a glance which numbers have been reconciled with the venue.
          const winColor = isPreliminary ? "rgba(52,211,153,0.65)" : "#34d399";
          const lossColor = isPreliminary ? "rgba(248,113,113,0.65)" : "#f87171";
          const pnlColor = !isOpen && closedPnl == null
            ? "#475569"
            : isWin
              ? winColor
              : lossColor;
          const pnlTooltip = (() => {
            switch (closedBest?.source) {
              case "override":
                return "Manually corrected P&L.";
              case "exchange":
                return "Realised P&L reported by the exchange (net of fees).";
              case "events":
                return "Preliminary P&L computed from each TP/SL fill recorded for this trade (gross of fees). The exchange's realised P&L will replace this within a minute or so.";
              case "prices":
                return "Preliminary P&L computed from entry, exit, and position size (gross of fees). The exchange's realised P&L will replace this within a minute or so.";
              case "internal":
                return "Preliminary P&L from the bot's TP/SL model. The exchange's realised P&L will replace this once the venue indexes the close.";
              default:
                return undefined;
            }
          })();

          return (
            <div key={trade.id}>
              {/* Mobile */}
              <div
                className="sm:hidden flex items-center justify-between gap-3 px-4 py-3"
                style={{ backgroundColor: "#0a1628", ...rowStyle }}
              >
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded uppercase flex-shrink-0"
                      style={isBuy ? { backgroundColor: "rgba(34,197,94,0.12)", color: "#34d399" } : { backgroundColor: "rgba(248,113,113,0.12)", color: "#f87171" }}>
                      {isBuy ? "Buy" : "Sell"}
                    </span>
                    <span
                      className="text-sm font-black text-white truncate min-w-0"
                      title={trade.symbol}
                    >
                      {trade.symbol}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono" style={{ color: "#475569" }}>
                    {trade.openedAt ? new Date(trade.openedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className="font-mono text-sm font-black inline-flex items-center gap-1"
                    style={{ color: pnlColor }}
                    title={pnlTooltip}
                  >
                    {isPreliminary && (
                      <span
                        className="inline-block h-1 w-1 rounded-full"
                        style={{ backgroundColor: "#fbbf24" }}
                        aria-label="Preliminary P&L"
                      />
                    )}
                    {pnlDisplay}
                  </span>
                  {!isOpen && cumulative != null && (
                    <span className="font-mono text-[10px] font-bold" style={{ color: cumulative >= 0 ? "#34d399" : "#f87171" }}>
                      Σ {formatSignedUsd(cumulative)}
                    </span>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded"
                      style={isOpen ? { backgroundColor: "rgba(34,197,94,0.1)", color: "#22c55e" } : { backgroundColor: "rgba(255,255,255,0.04)", color: "#475569" }}>
                      {isOpen ? "Open" : "Closed"}
                    </span>
                    {showResync && (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        setRefreshingIds((prev) => new Set(prev).add(trade.id));
                        try { await onRefreshTrade(trade.id); }
                        finally { setRefreshingIds((prev) => { const s = new Set(prev); s.delete(trade.id); return s; }); }
                      }}
                      disabled={refreshingIds.has(trade.id)}
                      title={isOpen ? "Sync from exchange" : "Fetch exchange P&L for this close"}
                      className="p-1 rounded"
                      style={{ color: refreshingIds.has(trade.id) ? "#60a5fa" : "#334155" }}
                    >
                      <RefreshCw className={`h-3 w-3 ${refreshingIds.has(trade.id) ? "animate-spin" : ""}`} />
                    </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Desktop */}
              <div
                className="hidden sm:grid px-4 py-3.5 gap-1 items-center hover:bg-white/[0.015] transition-colors"
                style={{ gridTemplateColumns: "1.35fr 1.55fr 0.9fr 0.9fr 0.9fr 0.85fr 1fr 0.75fr", backgroundColor: "#0a1628", ...rowStyle }}
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
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wide flex-shrink-0"
                    style={isBuy
                      ? { backgroundColor: "rgba(34,197,94,0.12)", color: "#34d399" }
                      : { backgroundColor: "rgba(248,113,113,0.12)", color: "#f87171" }
                    }
                  >
                    {isBuy ? "Buy" : "Sell"}
                  </span>
                  <span
                    className="text-sm font-black text-white leading-none truncate min-w-0"
                    title={trade.symbol}
                  >
                    {trade.symbol}
                  </span>
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
                <div className="font-mono text-xs font-black min-w-0 flex flex-col gap-0.5">
                  <span
                    className="inline-flex items-center gap-1"
                    style={{ color: pnlColor }}
                    title={pnlTooltip}
                  >
                    {isPreliminary && (
                      <span
                        className="inline-block h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: "#fbbf24" }}
                        aria-label="Preliminary P&L"
                      />
                    )}
                    {pnlDisplay}
                  </span>
                </div>

                {/* Cumulative (passbook) */}
                <div className="font-mono text-[11px] font-bold min-w-0" style={{ color: "#94a3b8" }}>
                  {isOpen ? (
                    <span style={{ color: "#334155" }} title="Cumulative applies after a trade is closed">—</span>
                  ) : cumulative != null ? (
                    <span style={{ color: cumulative >= 0 ? "#34d399" : "#f87171" }} title="Sum of exchange-reported realised P&L through this close">
                      {formatSignedUsd(cumulative)}
                    </span>
                  ) : (
                    <span style={{ color: "#334155" }}>—</span>
                  )}
                </div>

                {/* Status + per-trade refresh (hidden once exchange PnL is stored, unless open) */}
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-[9px] font-black px-2 py-1 rounded uppercase tracking-wide"
                    style={isOpen
                      ? { backgroundColor: "rgba(34,197,94,0.1)", color: "#22c55e" }
                      : { backgroundColor: "rgba(255,255,255,0.04)", color: "#475569" }
                    }
                  >
                    {isOpen ? "Open" : "Closed"}
                  </span>
                  {showResync && (
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      setRefreshingIds((prev) => new Set(prev).add(trade.id));
                      try {
                        await onRefreshTrade(trade.id);
                      } finally {
                        setRefreshingIds((prev) => { const s = new Set(prev); s.delete(trade.id); return s; });
                      }
                    }}
                    disabled={refreshingIds.has(trade.id)}
                    title={isOpen ? "Sync from exchange" : "Fetch exchange P&L for this close"}
                    className="p-1 rounded transition-all hover:bg-white/[0.06] disabled:cursor-not-allowed"
                    style={{ color: refreshingIds.has(trade.id) ? "#60a5fa" : "#334155" }}
                  >
                    <RefreshCw className={`h-3 w-3 ${refreshingIds.has(trade.id) ? "animate-spin" : ""}`} />
                  </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {trades.length > TRADES_PAGE_SIZE && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            style={{ backgroundColor: "#060d1a", borderTop: "1px solid rgba(90,140,220,0.1)" }}
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
  const [tradesLoading, setTradesLoading] = useState(false);
  const [stopConfirm, setStopConfirm] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  const selectedDeployment = useMemo(() => {
    if (!deployments?.length) return null;
    const hit = selectedDeploymentId
      ? deployments.find((d) => d.id === selectedDeploymentId)
      : null;
    return hit ?? deployments[0] ?? null;
  }, [deployments, selectedDeploymentId]);

  const activeCryptoDeployments = useMemo(
    () => (deployments ?? []).filter((d) => d.bot === "CRYPTO" && d.status === "active"),
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
    return {
      dashboardTrades: sortTradesForDashboard(list),
      cumulativeByTradeId: cumulativeBestPnlByTradeId(list),
    };
  }, [trades, selectedDeployment]);

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

  const fetchUserTrades = useCallback(
    async (exchangeForReconcile: string | null, withReconcile = true) => {
      if (!user) return;
      if (withReconcile) setTradesLoading(true);
      try {
        const idToken = await user.getIdToken();
        const params = new URLSearchParams();
        const exU = exchangeForReconcile?.trim().toUpperCase() ?? "";
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
        setTrades(data.trades ?? []);
      } catch {
        setTrades([]);
      } finally {
        if (withReconcile) setTradesLoading(false);
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

  const handleStopBot = useCallback(async () => {
    if (!user || !selectedDeployment) return;
    setIsStopping(true);
    try {
      const idToken = await user.getIdToken();
      await fetch("/api/freedombot/stop-deployment", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ deploymentId: selectedDeployment.id }),
      });
      setStopConfirm(false);
      fetchDeployment();
    } catch {
      // silently retry on next refresh
    } finally {
      setIsStopping(false);
    }
  }, [user, selectedDeployment, fetchDeployment]);

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
          cumulativeByTradeId={cumulativeByTradeId}
          tradesSyncing={tradesLoading}
          onStop={() => setStopConfirm(true)}
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
            <h3 className="text-lg font-black text-white mb-2">Stop this bot?</h3>
            <p className="text-sm mb-6 leading-relaxed" style={{ color: "#64748b" }}>
              This stops auto-trading for{" "}
              <span className="text-white font-semibold">
                {selectedDeployment
                  ? EXCHANGE_LABELS[selectedDeployment.exchange] ?? selectedDeployment.exchange
                  : "this account"}
              </span>
              . Other connected exchanges keep running. You can add an exchange again anytime from{" "}
              <span className="text-white font-semibold">Add exchange</span>.
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
