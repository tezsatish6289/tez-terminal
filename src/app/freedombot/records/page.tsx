"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Loader2, Rocket } from "lucide-react";
import { useUser, useAuth } from "@/firebase";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BotStats {
  runningSince: string | null;
  runningDays: number;
  currentCapital: number;
  startingCapital: number;
  totalReturnPct: number | null;
  profitPerMonth: number | null;
  profitPerYear: number | null;
  winRate: number | null;
  totalTrades: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null, suffix = "%") {
  if (n === null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}${suffix}`;
}

function fmtCapital(n: number | null | undefined) {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div
      className="flex flex-col px-5 py-4 rounded-2xl"
      style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.12)" }}
    >
      <span
        className="text-[9px] font-bold uppercase tracking-widest mb-2"
        style={{ color: "#475569" }}
      >
        {label}
      </span>
      <span
        className="text-xl font-black font-mono"
        style={{ color: color ?? "#f0f4ff" }}
      >
        {value}
      </span>
      {sub && (
        <span className="text-[10px] font-medium mt-1" style={{ color: "#334155" }}>
          {sub}
        </span>
      )}
    </div>
  );
}

// ─── Coming Soon Bot Row ──────────────────────────────────────────────────────

function ComingSoonBot({ emoji, name }: { emoji: string; name: string }) {
  return (
    <div
      className="rounded-2xl p-6 flex items-center justify-between opacity-50"
      style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.08)" }}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{emoji}</span>
        <div>
          <p className="text-sm font-black text-white">{name}</p>
          <span
            className="text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider mt-1 inline-block"
            style={{
              backgroundColor: "rgba(251,191,36,0.12)",
              color: "#fbbf24",
              border: "1px solid rgba(251,191,36,0.25)",
            }}
          >
            Coming Soon
          </span>
        </div>
      </div>
      <span className="text-xs font-bold" style={{ color: "#1e3a5f" }}>
        No data yet
      </span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RecordsPage() {
  const { user } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<BotStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    if (user) router.replace("/live");
  }, [user, router]);

  useEffect(() => {
    fetch("/api/freedombot/stats")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => {})
      .finally(() => setLoading(false));
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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-70">
              <Image
                src="/freedombot/icon.png"
                alt="FreedomBot.ai"
                width={32}
                height={32}
                className="object-contain"
              />
            </Link>
            <div className="h-5 w-px" style={{ backgroundColor: "rgba(90,140,220,0.2)" }} />
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" style={{ color: "#34d399" }} />
              <span className="text-sm font-black" style={{ color: "#34d399" }}>
                Live Performance
              </span>
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

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-14">
        {/* Header */}
        <div className="text-center mb-14">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest mb-6"
            style={{
              backgroundColor: "rgba(16,185,129,0.08)",
              border: "1px solid rgba(16,185,129,0.2)",
              color: "#34d399",
            }}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Transparent · Real Data · No Cherry-picking
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter mb-4">
            Bot{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #34d399, #6ee7b7)" }}
            >
              Performance
            </span>
          </h1>
          <p className="text-base max-w-lg mx-auto" style={{ color: "#64748b" }}>
            Live stats from our running bots. Updated every few minutes, directly from the simulator.
          </p>
        </div>

        {/* ── Crypto Bot ── */}
        <div
          className="rounded-3xl mb-6 overflow-hidden"
          style={{ border: "1px solid rgba(90,140,220,0.18)" }}
        >
          {/* Bot header */}
          <div
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-5"
            style={{
              background: "linear-gradient(90deg, rgba(37,99,235,0.1) 0%, transparent 70%)",
              borderBottom: "1px solid rgba(90,140,220,0.12)",
            }}
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl">₿</span>
              <div>
                <p className="text-lg font-black text-white">Crypto Bot</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div
                    className="h-2 w-2 rounded-full animate-pulse"
                    style={{ backgroundColor: "#22c55e" }}
                  />
                  <span className="text-xs font-bold" style={{ color: "#22c55e" }}>
                    Live
                  </span>
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
              {isLoggingIn ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Rocket className="h-4 w-4" /> Deploy
                </>
              )}
            </button>
          </div>

          {/* Metrics grid */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#60a5fa" }} />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 p-6">
              <MetricCard
                label="Start Capital"
                value={fmtCapital(stats?.startingCapital)}
              />
              <MetricCard
                label="Current Capital"
                value={fmtCapital(stats?.currentCapital)}
                color="#60a5fa"
              />
              <MetricCard
                label="Total Return"
                value={stats ? fmt(stats.totalReturnPct) : "—"}
                color={stats && (stats.totalReturnPct ?? 0) >= 0 ? "#34d399" : "#f87171"}
              />
              <MetricCard
                label="Monthly Return"
                value={stats ? fmt(stats.profitPerMonth) : "—"}
                color="#60a5fa"
                sub={stats && stats.runningDays < 30 ? "Projected" : undefined}
              />
              <MetricCard
                label="Annual Return"
                value={stats ? fmt(stats.profitPerYear) : "—"}
                color="#a78bfa"
                sub={stats && stats.runningDays < 365 ? "Projected" : undefined}
              />
            </div>
          )}
        </div>

        {/* ── Coming soon bots ── */}
        <div className="space-y-4">
          <ComingSoonBot emoji="🇮🇳" name="Indian Stock Bot" />
          <ComingSoonBot emoji="🥇" name="Gold Bot" />
          <ComingSoonBot emoji="🥈" name="Silver Bot" />
        </div>

        {/* Trust note */}
        <div className="text-center mt-14">
          <p className="text-sm font-medium" style={{ color: "#334155" }}>
            All trades are logged on-chain for full auditability.{" "}
            <span style={{ color: "#34d399" }}>No edits. No deletions.</span>
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-8 mt-6" style={{ borderTop: "1px solid rgba(90,140,220,0.08)" }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-70">
            <Image
              src="/freedombot/icon.png"
              alt="FreedomBot.ai"
              width={28}
              height={28}
              className="object-contain"
            />
            <span className="text-xs font-bold" style={{ color: "#334155" }}>
              freedombot.ai
            </span>
          </Link>
          <p className="text-[11px]" style={{ color: "#1e3a5f" }}>
            &copy; {new Date().getFullYear()} FreedomBot.ai · Simulator data only. Not financial advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
