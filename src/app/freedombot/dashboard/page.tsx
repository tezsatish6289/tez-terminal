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
  openedAt: string;
  closedAt: string | null;
  leverage: number;
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

function DashTopBar({ onDeploy }: { onDeploy: () => void }) {
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
        <button
          onClick={onDeploy}
          className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:scale-105"
          style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
        >
          <Rocket className="h-3.5 w-3.5" /> Deploy Bot
        </button>

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

      {/* Global performance teaser */}
      {stats && (
        <div
          className="rounded-2xl p-6"
          style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.15)" }}
        >
          <div className="flex items-center gap-2 mb-5">
            <Activity className="h-4 w-4" style={{ color: "#60a5fa" }} />
            <p className="text-sm font-black text-white">FreedomBot&apos;s live performance</p>
            <div className="h-1.5 w-1.5 rounded-full animate-pulse ml-auto" style={{ backgroundColor: "#22c55e" }} />
            <span className="text-[10px] font-bold" style={{ color: "#22c55e" }}>Live</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Total Return", value: fmt(stats.totalReturnPct), color: (stats.totalReturnPct ?? 0) >= 0 ? "#34d399" : "#f87171" },
              { label: "Monthly Return", value: fmt(stats.profitPerMonth), color: "#60a5fa" },
              { label: "Win Rate", value: stats.winRate ? `${stats.winRate}%` : "—", color: "#a78bfa" },
              { label: "Total Trades", value: stats.totalTrades.toString(), color: "#f0f4ff" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-xl font-black" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: "#475569" }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Connected State ──────────────────────────────────────────────────────────

function Connected({ deployment, stats, trades, onDeploy }: {
  deployment: Deployment;
  stats: BotStats | null;
  trades: Trade[];
  onDeploy: () => void;
}) {
  const isPending = deployment.status === "pending";
  const botLabel = BOT_LABELS[deployment.bot] ?? deployment.bot;
  const exchangeLabel = EXCHANGE_LABELS[deployment.exchange] ?? deployment.exchange;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Bot status card */}
      <div
        className="rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        style={{
          backgroundColor: "#0a1628",
          border: `1px solid ${isPending ? "rgba(251,191,36,0.2)" : "rgba(34,197,94,0.2)"}`,
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="h-12 w-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{ backgroundColor: isPending ? "rgba(251,191,36,0.08)" : "rgba(34,197,94,0.08)" }}
          >
            {deployment.bot === "CRYPTO" ? "₿" : deployment.bot === "INDIAN_STOCKS" ? "🇮🇳" : "🤖"}
          </div>
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <p className="text-base font-black text-white">{botLabel}</p>
              <span
                className="text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider"
                style={isPending
                  ? { backgroundColor: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)" }
                  : { backgroundColor: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }
                }
              >
                {isPending ? "Setting up" : "Active"}
              </span>
            </div>
            <p className="text-xs" style={{ color: "#475569" }}>
              {exchangeLabel} · Deployed {fmtDate(deployment.createdAt)}
            </p>
          </div>
        </div>

        {isPending && (
          <div
            className="flex items-start gap-3 px-4 py-3 rounded-xl sm:max-w-xs"
            style={{ backgroundColor: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)" }}
          >
            <Clock className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: "#fbbf24" }} />
            <p className="text-xs leading-relaxed" style={{ color: "#94a3b8" }}>
              Our team is reviewing your deployment. You&apos;ll be notified once your bot goes live.
            </p>
          </div>
        )}
      </div>

      {/* Performance stats */}
      {stats && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#475569" }}>
            Bot Performance {isPending && <span style={{ color: "#334155" }}>· Updates once your bot is active</span>}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Return", value: fmt(stats.totalReturnPct), color: (stats.totalReturnPct ?? 0) >= 0 ? "#34d399" : "#f87171", icon: TrendingUp },
              { label: "Monthly Return", value: fmt(stats.profitPerMonth), color: "#60a5fa", icon: BarChart3 },
              { label: "Win Rate", value: stats.winRate ? `${stats.winRate}%` : "—", color: "#a78bfa", icon: Zap },
              { label: "Total Trades", value: stats.totalTrades.toString(), color: "#f0f4ff", icon: Activity },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-2xl p-4"
                style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.1)" }}
              >
                <p className="text-2xl font-black mb-1" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#475569" }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent trades */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#475569" }}>
          Recent Trades
        </p>
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: "1px solid rgba(90,140,220,0.12)" }}
        >
          {trades.length === 0 ? (
            <div className="py-14 text-center" style={{ backgroundColor: "#0a1628" }}>
              <Zap className="h-8 w-8 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-bold text-white/30">No trades yet</p>
              <p className="text-xs mt-1" style={{ color: "#334155" }}>
                Trades will appear here once your bot is active
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr style={{ backgroundColor: "#060d1a", borderBottom: "1px solid rgba(90,140,220,0.1)" }}>
                    {["Symbol", "Side", "Status", "PnL", "Opened"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest"
                        style={{ color: "#475569" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody style={{ backgroundColor: "#0a1628" }}>
                  {trades.slice(0, 20).map((trade, i) => {
                    const pnl = trade.status === "open" ? trade.unrealizedPnl : trade.realizedPnl;
                    const isWin = pnl >= 0;
                    return (
                      <tr
                        key={trade.id}
                        style={{ borderBottom: i < trades.length - 1 ? "1px solid rgba(90,140,220,0.06)" : "none" }}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {trade.side === "LONG"
                              ? <TrendingUp className="h-3.5 w-3.5" style={{ color: "#34d399" }} />
                              : <TrendingDown className="h-3.5 w-3.5" style={{ color: "#f87171" }} />
                            }
                            <span className="text-sm font-black text-white">{trade.symbol}</span>
                            {trade.leverage > 1 && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(96,165,250,0.1)", color: "#60a5fa" }}>
                                {trade.leverage}x
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded"
                            style={trade.side === "LONG"
                              ? { backgroundColor: "rgba(34,197,94,0.1)", color: "#34d399" }
                              : { backgroundColor: "rgba(248,113,113,0.1)", color: "#f87171" }
                            }
                          >
                            {trade.side}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {trade.status === "open"
                              ? <div className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#22c55e" }} />
                              : <CheckCircle2 className="h-3 w-3" style={{ color: "#475569" }} />
                            }
                            <span className="text-xs font-bold capitalize" style={{ color: trade.status === "open" ? "#22c55e" : "#64748b" }}>
                              {trade.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-black" style={{ color: isWin ? "#34d399" : "#f87171" }}>
                            {fmt(pnl, "%")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "#475569" }}>
                          {fmtDate(trade.openedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
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

  useEffect(() => {
    fetchDeployment();
    fetch("/api/freedombot/stats").then((r) => r.json()).then(setStats).catch(() => {});
    fetch("/api/freedombot/trades").then((r) => r.json()).then((d) => setTrades(d.trades ?? [])).catch(() => {});
  }, [fetchDeployment]);

  // After deploying, re-check deployment status
  const handleDeployClose = useCallback(() => {
    setDeployOpen(false);
    fetchDeployment();
  }, [fetchDeployment]);

  if (isUserLoading || deployment === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#080f1e" }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#3b82f6" }} />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen font-sans antialiased" style={{ backgroundColor: "#080f1e", color: "#f0f4ff" }}>
      <DashTopBar onDeploy={() => setDeployOpen(true)} />

      {deployment === null ? (
        <NotConnected stats={stats} onDeploy={() => setDeployOpen(true)} />
      ) : (
        <Connected
          deployment={deployment}
          stats={stats}
          trades={trades}
          onDeploy={() => setDeployOpen(true)}
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
