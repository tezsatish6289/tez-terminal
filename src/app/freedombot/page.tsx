"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Send,
  Bot,
  TrendingUp,
  Clock,
  Calendar,
  CalendarDays,
  Rocket,
  Loader2,
  CheckCircle2,
  X,
  ChevronRight,
} from "lucide-react";
import { useUser, useAuth } from "@/firebase";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BotStats {
  runningSince: string | null;
  runningDays: number;
  totalReturnPct: number | null;
  profitPerDay: number | null;
  profitPerMonth: number | null;
  profitPerYear: number | null;
  winRate: number | null;
  totalTrades: number;
}

interface ChatMessage {
  role: "user" | "model";
  content: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null, suffix = "%") {
  if (n === null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}${suffix}`;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Waitlist Modal ───────────────────────────────────────────────────────────

function WaitlistModal({
  bot,
  onClose,
}: {
  bot: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/freedombot/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, bot }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl p-8"
        style={{ backgroundColor: "#0f2044", border: "1px solid rgba(90,140,220,0.3)" }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {success ? (
          <div className="text-center py-4">
            <CheckCircle2 className="h-14 w-14 mx-auto mb-4" style={{ color: "#60a5fa" }} />
            <h3 className="text-xl font-bold text-white mb-2">You&apos;re on the list!</h3>
            <p className="text-slate-400 text-sm">
              We&apos;ll notify you the moment {bot} launches. Stay tuned.
            </p>
            <button
              onClick={onClose}
              className="mt-6 px-6 py-2 rounded-xl text-sm font-bold text-white transition-all"
              style={{ backgroundColor: "#2563eb" }}
            >
              Got it
            </button>
          </div>
        ) : (
          <>
            <h3 className="text-xl font-bold text-white mb-1">Join the waitlist</h3>
            <p className="text-slate-400 text-sm mb-6">
              Be first to know when <span className="text-blue-400 font-semibold">{bot}</span> goes live.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="email"
                required
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-white placeholder-slate-500 outline-none transition-all text-sm"
                style={{
                  backgroundColor: "#162444",
                  border: "1px solid rgba(90,140,220,0.25)",
                }}
              />
              {error && <p className="text-red-400 text-xs">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all"
                style={{ backgroundColor: "#2563eb" }}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Notify me <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatChip({
  icon: Icon,
  label,
  value,
  positive,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-xl p-4"
      style={{ backgroundColor: "#162444", border: "1px solid rgba(90,140,220,0.18)" }}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" style={{ color: "#93c5fd" }} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#64748b" }}>
          {label}
        </span>
      </div>
      <span
        className="text-xl font-black tracking-tight"
        style={{ color: positive !== false ? "#60a5fa" : "#f0f4ff" }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Coming Soon Bot Card ─────────────────────────────────────────────────────

function ComingSoonCard({
  emoji,
  name,
  onJoinWaitlist,
}: {
  emoji: string;
  name: string;
  onJoinWaitlist: (bot: string) => void;
}) {
  return (
    <div
      className="rounded-2xl p-6 flex flex-col gap-4 h-full"
      style={{
        backgroundColor: "#0f2044",
        border: "1px solid rgba(90,140,220,0.15)",
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl">{emoji}</span>
        <div>
          <h3 className="text-lg font-black text-white">{name}</h3>
          <span
            className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
            style={{ backgroundColor: "rgba(251,191,36,0.12)", color: "#fbbf24" }}
          >
            Coming Soon
          </span>
        </div>
      </div>
      <p className="text-sm" style={{ color: "#64748b" }}>
        We&apos;re building something special. Join the waitlist and be the first to deploy when it goes live.
      </p>
      <button
        onClick={() => onJoinWaitlist(name)}
        className="mt-auto w-full py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
        style={{
          border: "1px solid rgba(90,140,220,0.3)",
          color: "#93c5fd",
          backgroundColor: "rgba(37,99,235,0.08)",
        }}
      >
        Join the waitlist <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FreedomBotPage() {
  const { user } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Redirect already-logged-in users straight to the app
  useEffect(() => {
    if (user) router.replace("/signals");
  }, [user, router]);

  const handleSignIn = useCallback(async () => {
    if (!auth || isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      await initiateGoogleSignIn(auth);
    } catch {
      // silent — user cancelled or error
    } finally {
      setIsLoggingIn(false);
    }
  }, [auth, isLoggingIn]);

  const [stats, setStats] = useState<BotStats | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "model",
      content:
        "Hey there! 👋 I'm FreedomBot. Got questions about how I trade, what bots are available, or how to get started? Ask me anything!",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [waitlistBot, setWaitlistBot] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/freedombot/stats")
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const sendMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || isChatLoading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput("");
    setIsChatLoading(true);

    try {
      const res = await fetch("/api/freedombot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      setChatMessages((prev) => [
        ...prev,
        { role: "model", content: data.reply || "Sorry, I couldn't process that." },
      ]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "model", content: "Hmm, something went wrong. Try again?" },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  }, [chatInput, chatMessages, isChatLoading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      className="min-h-screen font-sans antialiased"
      style={{ backgroundColor: "#080f1e", color: "#f0f4ff" }}
    >
      {/* ── Waitlist Modal ── */}
      {waitlistBot && (
        <WaitlistModal bot={waitlistBot} onClose={() => setWaitlistBot(null)} />
      )}

      {/* ── Nav ── */}
      <nav
        className="sticky top-0 z-40 border-b"
        style={{
          backgroundColor: "rgba(8,15,30,0.85)",
          borderColor: "rgba(90,140,220,0.12)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Image
            src="/freedombot/logo.png"
            alt="FreedomBot.ai"
            width={160}
            height={48}
            className="object-contain h-9 w-auto"
            priority
          />
          <a
            href="https://t.me/FreedomBotAI"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-bold transition-colors"
            style={{ color: "#93c5fd" }}
          >
            <Send className="h-3.5 w-3.5" />
            Telegram
          </a>
        </div>
      </nav>

      {/* ══════════════════════════════════════════════════════════
          SECTION 1 — HERO
      ══════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden">
        {/* Animated blobs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div
            className="absolute -top-[20%] -left-[10%] w-[55%] h-[65%] rounded-full blur-[130px] animate-pulse"
            style={{ backgroundColor: "rgba(37,99,235,0.08)" }}
          />
          <div
            className="absolute top-[10%] -right-[15%] w-[45%] h-[55%] rounded-full blur-[110px]"
            style={{
              backgroundColor: "rgba(96,165,250,0.06)",
              animation: "pulse 4s ease-in-out infinite 1.5s",
            }}
          />
          <div
            className="absolute top-[40%] left-[25%] w-[35%] h-[45%] rounded-full blur-[90px]"
            style={{
              backgroundColor: "rgba(147,197,253,0.04)",
              animation: "pulse 5s ease-in-out infinite 3s",
            }}
          />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-16 sm:pt-32 sm:pb-24 text-center">
          {/* Icon */}
          <div className="flex justify-center mb-8">
            <div
              className="relative p-1 rounded-3xl"
              style={{ background: "linear-gradient(135deg, rgba(37,99,235,0.4), rgba(96,165,250,0.2))" }}
            >
              <Image
                src="/freedombot/icon.png"
                alt="FreedomBot"
                width={96}
                height={96}
                className="rounded-2xl object-contain h-24 w-24"
                priority
              />
            </div>
          </div>

          {/* Greeting */}
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest mb-6"
            style={{
              backgroundColor: "rgba(37,99,235,0.12)",
              border: "1px solid rgba(96,165,250,0.2)",
              color: "#93c5fd",
            }}
          >
            <span>👋</span> Hola
          </div>

          <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tighter leading-[0.9] mb-6">
            I am{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, #3b82f6 0%, #60a5fa 50%, #93c5fd 100%)",
              }}
            >
              FreedomBot
            </span>
          </h1>

          <p
            className="text-lg sm:text-2xl font-medium max-w-2xl mx-auto leading-relaxed"
            style={{ color: "#94a3b8" }}
          >
            I trade financial markets to{" "}
            <span className="text-white font-bold">fastrack</span> your{" "}
            <span
              className="font-bold bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #60a5fa, #93c5fd)" }}
            >
              financial freedom
            </span>
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <button
              onClick={handleSignIn}
              disabled={isLoggingIn}
              className="h-14 px-10 rounded-2xl font-bold text-base text-white flex items-center gap-2 transition-all hover:scale-105 shadow-lg disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{
                background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
                boxShadow: "0 8px 30px rgba(59,130,246,0.35)",
              }}
            >
              {isLoggingIn ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Rocket className="h-5 w-5" />
                  Deploy a Bot
                </>
              )}
            </button>
            <a
              href="#chat"
              className="h-14 px-10 rounded-2xl font-bold text-base flex items-center gap-2 transition-all hover:scale-105"
              style={{
                border: "1px solid rgba(90,140,220,0.3)",
                color: "#93c5fd",
                backgroundColor: "rgba(37,99,235,0.08)",
              }}
            >
              <Bot className="h-5 w-5" />
              Ask me anything
            </a>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 2 — BOTS
      ══════════════════════════════════════════════════════════ */}
      <section
        id="bots"
        className="py-20 sm:py-28"
        style={{ borderTop: "1px solid rgba(90,140,220,0.1)" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-5xl font-black tracking-tighter mb-4">
              Our{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #93c5fd)" }}
              >
                Trading Bots
              </span>
            </h2>
            <p className="text-base" style={{ color: "#64748b" }}>
              Set it, forget it, and watch your capital work for you — 24/7.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* ── Crypto Bot (LIVE) ── */}
            <div
              className="sm:col-span-2 rounded-2xl p-6 flex flex-col gap-6"
              style={{
                background:
                  "linear-gradient(145deg, #0f2044 0%, #0d1c3d 100%)",
                border: "1px solid rgba(59,130,246,0.3)",
                boxShadow: "0 0 40px rgba(37,99,235,0.1)",
              }}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-4xl">₿</span>
                  <div>
                    <h3 className="text-xl font-black text-white">Crypto Bot</h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div
                        className="h-2 w-2 rounded-full animate-pulse"
                        style={{ backgroundColor: "#22c55e" }}
                      />
                      <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#22c55e" }}>
                        Live
                      </span>
                    </div>
                  </div>
                </div>
                <span
                  className="text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider"
                  style={{
                    backgroundColor: "rgba(34,197,94,0.1)",
                    border: "1px solid rgba(34,197,94,0.2)",
                    color: "#22c55e",
                  }}
                >
                  Active
                </span>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-3">
                <StatChip
                  icon={Calendar}
                  label="Running since"
                  value={stats ? formatDate(stats.runningSince) : "…"}
                  positive={false}
                />
                <StatChip
                  icon={TrendingUp}
                  label="Profit / day"
                  value={stats ? fmt(stats.profitPerDay) : "…"}
                />
                <StatChip
                  icon={CalendarDays}
                  label="Profit / month"
                  value={stats ? fmt(stats.profitPerMonth) : "…"}
                />
                <StatChip
                  icon={Clock}
                  label="Profit / year"
                  value={stats ? fmt(stats.profitPerYear) : "…"}
                />
              </div>

              {/* Win rate bar */}
              {stats?.winRate !== null && stats?.winRate !== undefined && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>
                      Win Rate
                    </span>
                    <span className="text-sm font-black" style={{ color: "#60a5fa" }}>
                      {stats.winRate}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ backgroundColor: "rgba(37,99,235,0.15)" }}>
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: `${stats.winRate}%`,
                        background: "linear-gradient(90deg, #1d4ed8, #60a5fa)",
                      }}
                    />
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: "#475569" }}>
                    Based on {stats.totalTrades} completed trades
                  </p>
                </div>
              )}

              {/* CTA */}
              <button
                onClick={handleSignIn}
                disabled={isLoggingIn}
                className="w-full py-3.5 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
                style={{
                  background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
                  boxShadow: "0 4px 20px rgba(59,130,246,0.3)",
                }}
              >
                {isLoggingIn ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <><Rocket className="h-4 w-4" /> Deploy Now</>
                )}
              </button>
            </div>

            {/* ── Coming Soon Bots ── */}
            <ComingSoonCard
              emoji="📈"
              name="Indian Stock Bot"
              onJoinWaitlist={setWaitlistBot}
            />
            <ComingSoonCard
              emoji="🥇"
              name="Gold Bot"
              onJoinWaitlist={setWaitlistBot}
            />
          </div>

          {/* Silver Bot — full width on its own row on mobile, fits grid on lg */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-5">
            <div className="sm:col-start-1 lg:col-start-3">
              <ComingSoonCard
                emoji="🥈"
                name="Silver Bot"
                onJoinWaitlist={setWaitlistBot}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 3 — CHATBOT
      ══════════════════════════════════════════════════════════ */}
      <section
        id="chat"
        className="py-20 sm:py-28"
        style={{ borderTop: "1px solid rgba(90,140,220,0.1)" }}
      >
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-4"
              style={{
                backgroundColor: "rgba(37,99,235,0.1)",
                border: "1px solid rgba(96,165,250,0.2)",
                color: "#93c5fd",
              }}
            >
              <Bot className="h-3 w-3" /> AI Chat
            </div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tighter">
              Got{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #93c5fd)" }}
              >
                questions?
              </span>
            </h2>
            <p className="mt-3 text-sm" style={{ color: "#64748b" }}>
              Ask me anything about how I work, what I trade, or how to get started.
            </p>
          </div>

          {/* Chat window */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              backgroundColor: "#0a1628",
              border: "1px solid rgba(90,140,220,0.2)",
              boxShadow: "0 0 60px rgba(37,99,235,0.08)",
            }}
          >
            {/* Messages */}
            <div className="h-96 overflow-y-auto p-5 space-y-4 scrollbar-thin">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  {msg.role === "model" && (
                    <div
                      className="h-8 w-8 rounded-xl flex-shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: "rgba(37,99,235,0.2)" }}
                    >
                      <Bot className="h-4 w-4" style={{ color: "#60a5fa" }} />
                    </div>
                  )}
                  <div
                    className="max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed"
                    style={
                      msg.role === "user"
                        ? {
                            background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
                            color: "#fff",
                            borderBottomRightRadius: "4px",
                          }
                        : {
                            backgroundColor: "#0f2044",
                            color: "#cbd5e1",
                            border: "1px solid rgba(90,140,220,0.15)",
                            borderBottomLeftRadius: "4px",
                          }
                    }
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex gap-3">
                  <div
                    className="h-8 w-8 rounded-xl flex-shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: "rgba(37,99,235,0.2)" }}
                  >
                    <Bot className="h-4 w-4" style={{ color: "#60a5fa" }} />
                  </div>
                  <div
                    className="rounded-2xl px-4 py-3 flex items-center gap-1.5"
                    style={{
                      backgroundColor: "#0f2044",
                      border: "1px solid rgba(90,140,220,0.15)",
                      borderBottomLeftRadius: "4px",
                    }}
                  >
                    {[0, 1, 2].map((d) => (
                      <div
                        key={d}
                        className="h-2 w-2 rounded-full animate-bounce"
                        style={{
                          backgroundColor: "#60a5fa",
                          animationDelay: `${d * 0.15}s`,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div
              className="p-4"
              style={{ borderTop: "1px solid rgba(90,140,220,0.12)" }}
            >
              <div className="flex gap-3">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask me anything…"
                  className="flex-1 px-4 py-3 rounded-xl text-sm text-white placeholder-slate-500 outline-none"
                  style={{
                    backgroundColor: "#0f2044",
                    border: "1px solid rgba(90,140,220,0.2)",
                  }}
                />
                <button
                  onClick={sendMessage}
                  disabled={!chatInput.trim() || isChatLoading}
                  className="h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-40 hover:scale-105"
                  style={{
                    background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
                    boxShadow: "0 4px 15px rgba(59,130,246,0.3)",
                  }}
                >
                  <Send className="h-4 w-4 text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer
        className="py-12"
        style={{ borderTop: "1px solid rgba(90,140,220,0.1)" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">
            <div>
              <Image
                src="/freedombot/logo.png"
                alt="FreedomBot.ai"
                width={140}
                height={42}
                className="object-contain h-8 w-auto mb-3"
              />
              <p className="text-xs max-w-xs" style={{ color: "#475569" }}>
                AI-powered trading bots that work 24/7 so you can focus on living freely.
              </p>
            </div>

            <nav className="flex flex-col sm:flex-row gap-4 sm:gap-8">
              <Link
                href="/about"
                className="text-sm font-medium transition-colors hover:text-white"
                style={{ color: "#64748b" }}
              >
                About Us
              </Link>
              <Link
                href="/privacy"
                className="text-sm font-medium transition-colors hover:text-white"
                style={{ color: "#64748b" }}
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="text-sm font-medium transition-colors hover:text-white"
                style={{ color: "#64748b" }}
              >
                Terms of Use
              </Link>
            </nav>
          </div>

          <div
            className="mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3"
            style={{ borderTop: "1px solid rgba(90,140,220,0.08)" }}
          >
            <p className="text-[11px]" style={{ color: "#334155" }}>
              &copy; {new Date().getFullYear()} FreedomBot.ai. All rights reserved.
            </p>
            <p className="text-[11px]" style={{ color: "#334155" }}>
              Trading involves risk. Past performance does not guarantee future results.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
