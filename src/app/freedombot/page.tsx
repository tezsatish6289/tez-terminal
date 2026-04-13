"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bot,
  Rocket,
  Loader2,
  CheckCircle2,
  X,
  ShieldCheck,
  ExternalLink,
  ChevronDown,
  Search,
  Plus,
  Minus,
} from "lucide-react";
import { useUser, useAuth } from "@/firebase";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { DeployModal } from "./components/DeployModal";
import { COUNTRIES, POPULAR_COUNTRY_CODES } from "@/lib/countries";

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | null, suffix = "%") {
  if (n === null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}${suffix}`;
}

// ─── Waitlist Modal ───────────────────────────────────────────────────────────

const ASSET_TYPES = [
  { id: "Crypto",        label: "Crypto",         emoji: "₿" },
  { id: "IndianStock",   label: "Indian Stock",    emoji: "🇮🇳" },
  { id: "Gold",          label: "Gold",            emoji: "🥇" },
  { id: "Silver",        label: "Silver",          emoji: "🥈" },
  { id: "Commodities",   label: "Commodities",     emoji: "🛢️" },
];

const popularCountries = COUNTRIES.filter((c) => POPULAR_COUNTRY_CODES.includes(c.code));
const otherCountries   = COUNTRIES.filter((c) => !POPULAR_COUNTRY_CODES.includes(c.code));

function WaitlistModal({
  bot,
  onClose,
}: {
  bot: string;
  onClose: () => void;
}) {
  const [name,       setName]       = useState("");
  const [email,      setEmail]      = useState("");
  const [mobile,     setMobile]     = useState("");
  const [country,    setCountry]    = useState("");
  const [countryQ,   setCountryQ]   = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [assetTypes, setAssetTypes] = useState<string[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [success,    setSuccess]    = useState(false);
  const [error,      setError]      = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setCountryOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filteredCountries = useMemo(() => {
    const q = countryQ.toLowerCase();
    if (!q) return null; // show sections when no search
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q));
  }, [countryQ]);

  const selectedCountry = COUNTRIES.find((c) => c.code === country);

  const toggleAsset = (id: string) => {
    setAssetTypes((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!assetTypes.length) { setError("Please select at least one asset type"); return; }
    if (!country)           { setError("Please select your country"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/freedombot/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), mobile: mobile.trim(), country, assetTypes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    backgroundColor: "#162444",
    border: "1px solid rgba(90,140,220,0.25)",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl p-8 max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: "#0f2044", border: "1px solid rgba(90,140,220,0.3)" }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-400 hover:text-white transition-colors p-1.5"
        >
          <X className="h-5 w-5" />
        </button>

        {success ? (
          <div className="text-center py-6">
            <CheckCircle2 className="h-16 w-16 mx-auto mb-4" style={{ color: "#60a5fa" }} />
            <h3 className="text-2xl font-bold text-white mb-2">You&apos;re on the list!</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              We will send you an invite once we go live.<br />
              Keep an eye on your inbox — this one will be worth the wait.
            </p>
            <button
              onClick={onClose}
              className="mt-6 px-8 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
              style={{ backgroundColor: "#2563eb" }}
            >
              Got it
            </button>
          </div>
        ) : (
          <>
            <h3 className="text-xl font-bold text-white mb-1">Join the Waitlist</h3>
            <p className="text-slate-400 text-sm mb-6">
              Be first to know when{" "}
              <span className="text-blue-400 font-semibold">{bot}</span> goes live.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Asset Type — multi-select chips */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-widest">
                  Asset Type <span className="text-red-400">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {ASSET_TYPES.map((a) => {
                    const active = assetTypes.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => toggleAsset(a.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={{
                          backgroundColor: active ? "#2563eb" : "#162444",
                          border: `1px solid ${active ? "#3b82f6" : "rgba(90,140,220,0.25)"}`,
                          color: active ? "#fff" : "#94a3b8",
                        }}
                      >
                        <span>{a.emoji}</span> {a.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Country — searchable dropdown */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-widest">
                  Country <span className="text-red-400">*</span>
                </label>
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => { setCountryOpen((o) => !o); setCountryQ(""); }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm text-left transition-all"
                    style={inputStyle}
                  >
                    <span className={selectedCountry ? "text-white" : "text-slate-500"}>
                      {selectedCountry ? `${selectedCountry.flag}  ${selectedCountry.name}` : "Select your country…"}
                    </span>
                    <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${countryOpen ? "rotate-180" : ""}`} />
                  </button>

                  {countryOpen && (
                    <div
                      className="absolute z-50 w-full mt-1 rounded-xl overflow-hidden shadow-2xl"
                      style={{ backgroundColor: "#0d1b35", border: "1px solid rgba(90,140,220,0.3)", maxHeight: "240px" }}
                    >
                      {/* Search input */}
                      <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: "rgba(90,140,220,0.2)" }}>
                        <Search className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                        <input
                          autoFocus
                          type="text"
                          placeholder="Search country…"
                          value={countryQ}
                          onChange={(e) => setCountryQ(e.target.value)}
                          className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none"
                        />
                      </div>

                      <div className="overflow-y-auto" style={{ maxHeight: "192px" }}>
                        {filteredCountries ? (
                          filteredCountries.length === 0 ? (
                            <p className="px-4 py-3 text-xs text-slate-500">No results</p>
                          ) : (
                            filteredCountries.map((c) => (
                              <button
                                key={c.code} type="button"
                                onClick={() => { setCountry(c.code); setCountryOpen(false); setCountryQ(""); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors hover:bg-white/5"
                                style={{ color: c.code === country ? "#60a5fa" : "#cbd5e1" }}
                              >
                                <span className="text-base">{c.flag}</span>
                                <span>{c.name}</span>
                              </button>
                            ))
                          )
                        ) : (
                          <>
                            <p className="px-4 pt-2 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Popular</p>
                            {popularCountries.map((c) => (
                              <button
                                key={c.code} type="button"
                                onClick={() => { setCountry(c.code); setCountryOpen(false); }}
                                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors hover:bg-white/5"
                                style={{ color: c.code === country ? "#60a5fa" : "#cbd5e1" }}
                              >
                                <span className="text-base">{c.flag}</span>
                                <span>{c.name}</span>
                              </button>
                            ))}
                            <p className="px-4 pt-2 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-t" style={{ borderColor: "rgba(90,140,220,0.15)" }}>All Countries</p>
                            {otherCountries.map((c) => (
                              <button
                                key={c.code} type="button"
                                onClick={() => { setCountry(c.code); setCountryOpen(false); }}
                                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors hover:bg-white/5"
                                style={{ color: c.code === country ? "#60a5fa" : "#cbd5e1" }}
                              >
                                <span className="text-base">{c.flag}</span>
                                <span>{c.name}</span>
                              </button>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-widest">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-white placeholder-slate-500 outline-none transition-all text-sm"
                  style={inputStyle}
                />
              </div>

              {/* Mobile */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-widest">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-white placeholder-slate-500 outline-none transition-all text-sm"
                  style={inputStyle}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-widest">
                  Email ID <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-white placeholder-slate-500 outline-none transition-all text-sm"
                  style={inputStyle}
                />
              </div>

              {/* Privacy notice */}
              <p className="flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed pt-1">
                <ShieldCheck className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-blue-500/60" />
                Your name, mobile & email are encrypted with AES-256-GCM and stored securely. We only use them to send your invite.
              </p>

              {error && <p className="text-red-400 text-xs font-medium">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all"
                style={{ backgroundColor: "#2563eb" }}
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
                ) : (
                  <>Notify me when live <ArrowRight className="h-4 w-4" /></>
                )}
              </button>

            </form>
          </>
        )}
      </div>
    </div>
  );
}


// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FreedomBotPage() {
  const { user } = useUser();
  const auth = useAuth();
  const router = useRouter();
  const [deployOpen, setDeployOpen] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Redirect logged-in users to the FreedomBot dashboard
  useEffect(() => {
    if (user && !deployOpen) router.replace("/dashboard");
  }, [user, deployOpen, router]);

  const openDeploy = useCallback(() => setDeployOpen(true), []);

  // Direct sign-in (no deploy modal) — redirects to /dashboard via useEffect above
  const handleSignIn = useCallback(async () => {
    setIsSigningIn(true);
    try {
      await initiateGoogleSignIn(auth);
    } finally {
      setIsSigningIn(false);
    }
  }, [auth]);

  const [stats, setStats] = useState<BotStats | null>(null);
  const [waitlistBot, setWaitlistBot] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/freedombot/stats")
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() => {});
  }, []);

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
          backgroundColor: "rgba(8,15,30,0.92)",
          borderColor: "rgba(90,140,220,0.12)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Image
              src="/freedombot/icon.png"
              alt="FreedomBot.ai"
              width={32}
              height={32}
              className="rounded-xl object-contain"
              priority
            />
            <span className="font-black text-lg tracking-tight" style={{ color: "#60a5fa" }}>
              FreedomBot.ai
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={openDeploy}
              className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all hover:scale-105"
              style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
            >
              <Rocket className="h-3.5 w-3.5" /> Deploy a Bot
            </button>
            <button
              onClick={handleSignIn}
              disabled={isSigningIn}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all hover:scale-105 disabled:opacity-70"
              style={{
                border: "1px solid rgba(90,140,220,0.3)",
                color: "#93c5fd",
                backgroundColor: "rgba(37,99,235,0.08)",
              }}
            >
              {isSigningIn ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Sign In"}
            </button>
          </div>
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

          <div className="relative inline-block mb-2">
            {/* Hi badge — hidden on very small phones */}
            <div
              className="hidden xs:flex absolute -left-2 -top-7 items-center gap-1.5 text-[13px] font-bold sm:flex"
              style={{
                color: "#93c5fd",
                transform: "rotate(-4deg)",
                transformOrigin: "left center",
                whiteSpace: "nowrap",
              }}
            >
              <span>👋</span> Hi
            </div>

          <h1 className="text-4xl sm:text-6xl lg:text-8xl font-black tracking-tighter leading-[0.9] mb-6">
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
          </div>

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

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 mt-10 w-full sm:w-auto">
            <button
              onClick={openDeploy}
              className="h-14 px-10 rounded-2xl font-bold text-base text-white flex items-center justify-center gap-2 transition-all hover:scale-105 shadow-lg"
              style={{
                background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
                boxShadow: "0 8px 30px rgba(59,130,246,0.35)",
              }}
            >
              <Rocket className="h-5 w-5" />
              Deploy a Bot
            </button>
            <a
              href="/performance"
              className="h-14 px-10 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-all hover:scale-105"
              style={{
                border: "1px solid rgba(90,140,220,0.3)",
                color: "#93c5fd",
                backgroundColor: "rgba(37,99,235,0.08)",
              }}
            >
              <Bot className="h-5 w-5" />
              How it works
            </a>
          </div>
          <p className="text-xs mt-6" style={{ color: "#334155" }}>
            Trading involves risk. Past performance does not guarantee future results.
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 2 — BOTS TABLE
      ══════════════════════════════════════════════════════════ */}
      <section
        id="bots"
        className="py-20 sm:py-28"
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

          {/* ── Mobile: card layout (< sm) ── */}
          <div className="sm:hidden space-y-3">
            {/* Crypto Bot card */}
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(90,140,220,0.15)", backgroundColor: "#0a1628" }}>
              <div className="flex items-center justify-between px-4 py-3.5" style={{ background: "linear-gradient(90deg, rgba(37,99,235,0.08), transparent)", borderBottom: "1px solid rgba(90,140,220,0.1)" }}>
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">₿</span>
                  <p className="text-sm font-black text-white">Crypto Bot</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: "#22c55e" }} />
                  <span className="text-xs font-bold" style={{ color: "#22c55e" }}>Live</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-0 px-0" style={{ borderBottom: "1px solid rgba(90,140,220,0.08)" }}>
                {[
                  { label: "Running",        value: stats ? `${stats.runningDays} Days` : "…",  color: "#f0f4ff" },
                  { label: "Total Return",   value: stats ? fmt(stats.totalReturnPct) : "…",    color: "#34d399" },
                  { label: "Start Capital",  value: stats?.startingCapital ? `$${stats.startingCapital.toFixed(2)}` : "…", color: "#f0f4ff" },
                  { label: "Current Capital",value: stats?.currentCapital ? `$${stats.currentCapital.toFixed(2)}` : "…",   color: "#60a5fa" },
                ].map((s, i, arr) => (
                  <div key={s.label} className="p-4" style={{ borderRight: i % 2 === 0 ? "1px solid rgba(90,140,220,0.06)" : "none", borderBottom: i < 2 ? "1px solid rgba(90,140,220,0.06)" : "none" }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#334155" }}>{s.label}</p>
                    <p className="text-base font-black" style={{ color: s.color }}>{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 space-y-2">
                <button onClick={openDeploy} className="w-full py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-1.5 transition-all" style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}>
                  <Rocket className="h-4 w-4" /> Deploy Now
                </button>
                <a href="/performance" className="block text-center text-xs font-bold transition-colors hover:text-blue-300 py-1" style={{ color: "#475569" }}>
                  See Performance Details →
                </a>
              </div>
            </div>

            {/* Coming soon cards */}
            {[{ emoji: "🇮🇳", name: "Indian Stock Bot" }, { emoji: "🥇", name: "Gold Bot" }, { emoji: "🥈", name: "Silver Bot" }].map((bot) => (
              <div key={bot.name} className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(90,140,220,0.1)", backgroundColor: "#0a1628", opacity: 0.75 }}>
                <div className="flex items-center justify-between px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{bot.emoji}</span>
                    <p className="text-sm font-black text-white">{bot.name}</p>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider" style={{ backgroundColor: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)" }}>Coming Soon</span>
                </div>
                <div className="px-4 pb-3">
                  <button onClick={() => setWaitlistBot(bot.name)} className="w-full py-2.5 rounded-xl text-sm font-bold transition-all" style={{ border: "1px solid rgba(90,140,220,0.25)", color: "#93c5fd", backgroundColor: "rgba(37,99,235,0.06)" }}>Join Waitlist</button>
                </div>
              </div>
            ))}
          </div>

          {/* ── Desktop: table (sm+) ── */}
          <div className="hidden sm:block overflow-x-auto rounded-2xl" style={{ border: "1px solid rgba(90,140,220,0.15)" }}>
          <div className="min-w-[780px]">
            {/* Header row */}
            <div
              className="grid grid-cols-9 gap-0 px-5 py-4"
              style={{ backgroundColor: "#0a1628", borderBottom: "1px solid rgba(90,140,220,0.12)" }}
            >
              {[["Bot",""],["Status",""],["Running",""],["Start","Capital"],["Current","Capital"],["Total","Return"],["Monthly","Return"],["Annual","Return"],["",""]].map(([l1,l2],i) => (
                <div key={i} className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest leading-tight" style={{ color: "#475569" }}>{l1}</span>
                  {l2 && <span className="text-[10px] font-bold uppercase tracking-widest leading-tight" style={{ color: "#475569" }}>{l2}</span>}
                </div>
              ))}
            </div>

            {/* Crypto Bot row */}
            <div
              className="grid grid-cols-9 gap-0 px-5 py-4 items-center"
              style={{ background: "linear-gradient(90deg, rgba(37,99,235,0.06) 0%, transparent 60%)", borderBottom: "1px solid rgba(90,140,220,0.1)" }}
            >
              <div className="flex items-center gap-2.5"><span className="text-2xl">₿</span><p className="text-sm font-black text-white">Crypto Bot</p></div>
              <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: "#22c55e" }} /><span className="text-xs font-bold" style={{ color: "#22c55e" }}>Live</span></div>
              <div><span className="text-sm font-bold text-white">{stats ? `${stats.runningDays} Days` : "…"}</span></div>
              <div><span className="text-sm font-bold text-white">{stats?.startingCapital ? `$${stats.startingCapital.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "…"}</span></div>
              <div><span className="text-sm font-bold text-white">{stats?.currentCapital ? `$${stats.currentCapital.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "…"}</span></div>
              <div><span className="text-sm font-black" style={{ color: "#34d399" }}>{stats ? fmt(stats.totalReturnPct) : "…"}</span></div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-black" style={{ color: "#60a5fa" }}>{stats ? fmt(stats.profitPerMonth) : "…"}</span>
                {stats && stats.runningDays < 30 && <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded self-start" style={{ backgroundColor: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>Projected</span>}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-black" style={{ color: "#a78bfa" }}>{stats ? fmt(stats.profitPerYear) : "…"}</span>
                {stats && stats.runningDays < 365 && <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded self-start" style={{ backgroundColor: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>Projected</span>}
              </div>
              <div className="flex flex-col gap-1.5">
                <button onClick={openDeploy} className="px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-all hover:scale-105" style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}>
                  <Rocket className="h-3.5 w-3.5" /> Deploy
                </button>
              </div>
            </div>

            {/* Coming soon rows */}
            {[{ emoji: "🇮🇳", name: "Indian Stock Bot" }, { emoji: "🥇", name: "Gold Bot" }, { emoji: "🥈", name: "Silver Bot" }].map((bot, i) => (
              <div key={bot.name} className="grid grid-cols-9 gap-0 px-5 py-4 items-center" style={{ borderBottom: i < 2 ? "1px solid rgba(90,140,220,0.08)" : "none", opacity: 0.7 }}>
                <div className="flex items-center gap-2.5"><span className="text-2xl">{bot.emoji}</span><p className="text-sm font-black text-white">{bot.name}</p></div>
                <div><span className="text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider" style={{ backgroundColor: "rgba(251,191,36,0.12)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.25)" }}>Coming Soon</span></div>
                {["—","—","—","—","—","—"].map((d,j) => <div key={j} className="text-sm font-medium" style={{ color: "#334155" }}>{d}</div>)}
                <div><button onClick={() => setWaitlistBot(bot.name)} className="px-4 py-2 rounded-xl text-xs font-bold transition-all hover:scale-105" style={{ border: "1px solid rgba(90,140,220,0.25)", color: "#93c5fd", backgroundColor: "rgba(37,99,235,0.06)" }}>Join Waitlist</button></div>
              </div>
            ))}
          </div>
          </div>

        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 3 — TRUST / BLOCKCHAIN
      ══════════════════════════════════════════════════════════ */}
      <section
        className="relative py-20 sm:py-28 overflow-hidden"
      >
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full blur-[120px]"
            style={{ backgroundColor: "rgba(16,185,129,0.05)" }}
          />
        </div>

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest mb-8"
            style={{
              backgroundColor: "rgba(16,185,129,0.08)",
              border: "1px solid rgba(16,185,129,0.2)",
              color: "#34d399",
            }}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Fully Transparent
          </div>

          {/* Headline */}
          <h2 className="text-4xl sm:text-6xl font-black tracking-tighter leading-[0.95] mb-6">
            We are built on{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #34d399 0%, #6ee7b7 100%)" }}
            >
              trust
            </span>
          </h2>

          {/* Subtext */}
          <p className="text-base sm:text-lg leading-relaxed mb-10 max-w-xl mx-auto" style={{ color: "#94a3b8" }}>
            All our trades are recorded on blockchain to ensure{" "}
            <span className="text-white font-semibold">full transparency</span>.
            Every entry, every exit — verifiable by anyone, anytime.
          </p>

          {/* Decorative chain nodes */}
          <div className="flex items-center justify-center gap-3 mb-10">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{
                    backgroundColor: i % 2 === 0 ? "rgba(52,211,153,0.5)" : "rgba(52,211,153,0.2)",
                    boxShadow: i % 2 === 0 ? "0 0 10px rgba(52,211,153,0.4)" : "none",
                  }}
                />
                {i < 4 && (
                  <div
                    className="h-px w-8"
                    style={{ backgroundColor: "rgba(52,211,153,0.2)" }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* CTA */}
          <a
            href="/records"
            className="inline-flex items-center gap-2.5 h-14 px-10 rounded-2xl font-bold text-base transition-all hover:scale-105"
            style={{
              border: "1px solid rgba(52,211,153,0.35)",
              color: "#34d399",
              backgroundColor: "rgba(16,185,129,0.06)",
              boxShadow: "0 0 30px rgba(16,185,129,0.08)",
            }}
          >
            <ShieldCheck className="h-5 w-5" />
            Verify Records
            <ExternalLink className="h-4 w-4 opacity-60" />
          </a>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 4 — SOCIAL PROOF
      ══════════════════════════════════════════════════════════ */}
      <section
        className="py-20 sm:py-28"
        style={{ borderTop: "1px solid rgba(90,140,220,0.08)" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-5xl font-black tracking-tighter mb-4">
              Backed by early{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #93c5fd)" }}
              >
                believers
              </span>
            </h2>
            <p className="text-base" style={{ color: "#64748b" }}>
              Traders who saw the vision before the numbers did.
            </p>
          </div>

          {/* Stat pills */}
          <div className="flex flex-wrap justify-center gap-5 mb-14">
            {[
              { value: "500+", label: "Waitlist members" },
              { value: "24/7", label: "Markets monitored" },
              { value: "4", label: "Markets launching" },
              { value: "100%", label: "On-chain verified" },
            ].map((s) => (
              <div
                key={s.label}
                className="text-center px-8 py-5 rounded-2xl"
                style={{ border: "1px solid rgba(90,140,220,0.12)", backgroundColor: "#0a1628" }}
              >
                <p className="text-3xl font-black text-white">{s.value}</p>
                <p
                  className="text-[10px] font-bold uppercase tracking-widest mt-1"
                  style={{ color: "#475569" }}
                >
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          {/* Testimonial placeholder cards */}
          <div className="grid sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {[
              {
                quote: "FreedomBot changed how I think about passive income. Set it once and the bot handles the rest.",
                name: "Tharun K.",
                tag: "Early Backer",
              },
              {
                quote: "The on-chain transparency sold me. No other trading bot lets you verify every single trade.",
                name: "Aakash S.",
                tag: "Crypto Trader",
              },
              {
                quote: "Up and running in under 5 minutes. Can't wait to see the long-term performance.",
                name: "Abhijeet P.",
                tag: "Crypto Trader",
              },
            ].map((t) => (
              <div
                key={t.name}
                className="rounded-2xl p-6"
                style={{
                  backgroundColor: "#0a1628",
                  border: "1px solid rgba(90,140,220,0.12)",
                }}
              >
                <p className="text-sm leading-relaxed mb-5" style={{ color: "#94a3b8" }}>
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div>
                  <p className="text-sm font-bold text-white">{t.name}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "#475569" }}>
                    {t.tag}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 5 — PRICING
      ══════════════════════════════════════════════════════════ */}
      <section
        className="py-20 sm:py-28"
        style={{ borderTop: "1px solid rgba(90,140,220,0.08)" }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest mb-6"
              style={{
                backgroundColor: "rgba(37,99,235,0.1)",
                border: "1px solid rgba(96,165,250,0.2)",
                color: "#93c5fd",
              }}
            >
              Pricing
            </div>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tighter mb-4">
              Simple,{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #93c5fd)" }}
              >
                transparent
              </span>
            </h2>
            <p className="text-base" style={{ color: "#64748b" }}>
              We only make money when you do. No hidden fees, no monthly subscriptions.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
            {/* Self-deploy */}
            <div
              className="rounded-2xl p-8 flex flex-col"
              style={{
                backgroundColor: "#0a1628",
                border: "1px solid rgba(90,140,220,0.2)",
              }}
            >
              <p
                className="text-xs font-bold uppercase tracking-widest mb-5"
                style={{ color: "#64748b" }}
              >
                Self-Deploy
              </p>
              <div className="mb-6">
                <span className="text-5xl font-black text-white">Free</span>
                <p className="text-sm mt-2" style={{ color: "#64748b" }}>
                  to get started
                </p>
              </div>
              <ul className="space-y-3 text-sm mb-8 flex-1" style={{ color: "#94a3b8" }}>
                {[
                  "Your capital, always yours",
                  "Guided deployment flow",
                  "Less than 5 min set up",
                  "Disable anytime, instantly",
                  "No credit card required",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" style={{ color: "#60a5fa" }} />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={openDeploy}
                className="w-full py-3 rounded-xl font-bold text-white text-sm transition-all hover:scale-105 mt-auto"
                style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}
              >
                Deploy Now
              </button>
            </div>

            {/* PostPay — coming soon */}
            <div
              className="rounded-2xl p-8 relative overflow-hidden flex flex-col"
              style={{
                backgroundColor: "#0a1628",
                border: "1px solid rgba(251,191,36,0.2)",
              }}
            >
              <p
                className="text-xs font-bold uppercase tracking-widest mb-5"
                style={{ color: "#64748b" }}
              >
                PostPay
              </p>
              <div className="mb-2">
                <span className="text-5xl font-black text-white">10%</span>
              </div>
              <p className="text-sm mb-6" style={{ color: "#64748b" }}>
                of net profit, paid after you earn
              </p>
              <div
                className="rounded-xl px-4 py-3 mb-6 text-sm"
                style={{
                  backgroundColor: "rgba(251,191,36,0.06)",
                  border: "1px solid rgba(251,191,36,0.15)",
                  color: "#94a3b8",
                }}
              >
                You make{" "}
                <span className="font-bold text-white">$100 profit</span>
                {" → "}you pay us{" "}
                <span className="font-bold" style={{ color: "#fbbf24" }}>$10</span>
              </div>
              <ul className="space-y-3 text-sm mb-6 flex-1" style={{ color: "#94a3b8" }}>
                {[
                  "Pay only after you profit — zero risk to get started",
                  "Calculated monthly on net profit after exchange fees",
                  "Minimum billing $10/month — only when you're in profit",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" style={{ color: "#fbbf24" }} />
                    {item}
                  </li>
                ))}
              </ul>

              {/* Earnings estimate table — live data */}
              {stats && stats.profitPerMonth !== null && stats.profitPerMonth > 0 && (
                <div
                  className="rounded-xl px-4 py-3 mb-6"
                  style={{ backgroundColor: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.10)" }}
                >
                  <p className="text-xs mb-3" style={{ color: "#64748b" }}>
                    Earnings estimate — based on live{" "}
                    <span style={{ color: "#94a3b8" }}>{stats.runningDays}d</span> performance
                  </p>
                  <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: "#64748b", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <th className="text-left pb-2 font-medium">Account</th>
                        <th className="text-right pb-2 font-medium">Earn/mo</th>
                        <th className="text-right pb-2 font-medium">Our fee</th>
                        <th className="text-right pb-2 font-medium" style={{ color: "#34d399" }}>You keep</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[100, 500, 1000, 5000].map((size, i) => {
                        const gross = size * (stats.profitPerMonth ?? 0) / 100;
                        const fee   = Math.max(gross * 0.10, 10);
                        const net   = Math.max(gross - fee, 0);
                        return (
                          <tr
                            key={size}
                            style={{
                              borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.04)" : "none",
                              color: "#94a3b8",
                            }}
                          >
                            <td className="py-1.5 font-mono">${size.toLocaleString()}</td>
                            <td className="text-right py-1.5 font-mono">${gross.toFixed(0)}</td>
                            <td className="text-right py-1.5 font-mono" style={{ color: "#fbbf24" }}>${fee.toFixed(0)}</td>
                            <td className="text-right py-1.5 font-mono font-bold text-white">${net.toFixed(0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="text-xs mt-3" style={{ color: "#475569" }}>
                    Projected · past returns ≠ future results ·{" "}
                    <Link href="/performance" style={{ color: "#60a5fa" }}>view full data →</Link>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Concierge row */}
          <div
            className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 rounded-2xl"
            style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.15)" }}
          >
            <div className="flex items-center gap-3 text-sm">
              <span className="text-xl">🤝</span>
              <span style={{ color: "#94a3b8" }}>
                Need a hand?{" "}
                <span style={{ color: "#e2e8f0", fontWeight: 600 }}>We'll set it up for you.</span>
                {" "}One-time concierge setup —{" "}
                <span style={{ color: "#60a5fa", fontWeight: 700 }}>$29</span>
              </span>
            </div>
            <a
              href="https://wa.me/message/YOUR_WHATSAPP_LINK"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-105 whitespace-nowrap"
              style={{ backgroundColor: "rgba(37,211,102,0.12)", color: "#22c55e", border: "1px solid rgba(37,211,102,0.25)" }}
            >
              <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.117.549 4.107 1.51 5.843L.057 23.486a.5.5 0 00.614.633l5.77-1.507A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.944 9.944 0 01-5.072-1.38l-.362-.215-3.757.981.999-3.648-.236-.375A9.944 9.944 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
              Chat with us
            </a>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 6 — FAQ
      ══════════════════════════════════════════════════════════ */}
      <section id="faq" className="py-20 sm:py-28">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          {/* Header */}
          <div className="text-center mb-14">
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-4"
              style={{
                backgroundColor: "rgba(37,99,235,0.1)",
                border: "1px solid rgba(96,165,250,0.2)",
                color: "#93c5fd",
              }}
            >
              FAQ
            </div>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tighter">
              Common{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #93c5fd)" }}
              >
                questions
              </span>
            </h2>
            <p className="mt-4 text-base" style={{ color: "#94a3b8" }}>
              Everything you need to know before you deploy.
            </p>
          </div>

          {/* Accordion */}
          <div className="space-y-3">
            {[
              {
                q: "How does the bot decide when to enter a trade?",
                a: "Every entry is rule-based — no discretion, no emotions. The bot identifies high-probability setups using order blocks (zones where institutional orders were previously filled) and filters signals using funding rate data and liquidation heatmaps. The specific indicator combinations are our core IP, but the full risk framework is documented on the Performance page.",
              },
              {
                q: "What exchange does it trade on? Is my capital with FreedomBot?",
                a: "The Crypto Bot trades on Bybit. Your capital stays in your own Bybit account at all times — we never hold, touch, or custody your funds. You connect the bot via a read/trade-only API key; withdrawal permissions are neither required nor accepted.",
              },
              {
                q: "How much capital do I need to get started?",
                a: "There is no hard minimum enforced by us, but we recommend at least 500 USDT (around ₹50,000) so position sizing stays meaningful and fees don't eat returns. The bot scales position sizes as a percentage of your balance, so it works across a wide range of account sizes.",
              },
              {
                q: "What's the maximum I can lose on a single trade?",
                a: "By default the bot risks 1% of your current balance per trade (1.5% during a confirmed win streak). With leverage capped at 10×, a stop-loss hit means a small, defined loss — never a wipeout. It would take roughly 460 consecutive losing trades to approach zero, a scenario that has never come close to occurring.",
              },
              {
                q: "Am I at risk of liquidation?",
                a: "No. We use isolated margin on every trade — set automatically before each order — so your full account balance is never at risk from a single position. The stop-loss is always triggered well before the liquidation price is reached, structurally eliminating liquidation risk under normal market conditions.",
              },
              {
                q: "What happens during a flash crash or extreme volatility?",
                a: "The stop-loss closes the position at the next available price. In extreme gaps, slippage may occur, but because we use isolated margin and small position sizes, the worst-case outcome on a single trade remains a fraction of your account — not a catastrophic loss.",
              },
              {
                q: "Can I withdraw my capital anytime?",
                a: "Yes. Your capital is in your Bybit account and is always accessible to you. You can withdraw or pause the bot at any time. If a trade is open when you pause, you can choose to let it run to completion or close it manually.",
              },
              {
                q: "Does FreedomBot charge fees?",
                a: "Self-deploy is completely free — no upfront fees, no subscription. A PostPay plan (10% of net profit, paid only after you earn) is coming soon. The bot incurs standard Bybit trading fees on each trade, which are already factored into the performance numbers shown on the Performance page.",
              },
            ].map((item, i) => {
              const isOpen = openFaq === i;
              return (
                <div
                  key={i}
                  className="rounded-2xl overflow-hidden transition-all"
                  style={{
                    backgroundColor: "#0a1628",
                    border: `1px solid ${isOpen ? "rgba(96,165,250,0.3)" : "rgba(90,140,220,0.12)"}`,
                  }}
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
                  >
                    <span className="text-sm sm:text-base font-semibold leading-snug" style={{ color: "#e2e8f0" }}>
                      {item.q}
                    </span>
                    <span
                      className="flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center transition-colors"
                      style={{
                        backgroundColor: isOpen ? "rgba(37,99,235,0.25)" : "rgba(90,140,220,0.1)",
                        color: isOpen ? "#60a5fa" : "#475569",
                      }}
                    >
                      {isOpen ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                  {isOpen && (
                    <div
                      className="px-6 pb-5 text-sm leading-relaxed"
                      style={{ color: "#94a3b8", borderTop: "1px solid rgba(90,140,220,0.08)" }}
                    >
                      <div className="pt-4">{item.a}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* CTA below */}
          <p className="text-center mt-10 text-sm" style={{ color: "#475569" }}>
            Want a deeper look?{" "}
            <a href="/performance" className="font-semibold hover:text-blue-300 transition-colors" style={{ color: "#60a5fa" }}>
              See the full performance breakdown →
            </a>
          </p>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">
            <div>
              <Image
                src="/freedombot/icon.png"
                alt="FreedomBot.ai"
                width={40}
                height={40}
                className="rounded-xl object-contain mb-3"
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
                href="/contact"
                className="text-sm font-medium transition-colors hover:text-white"
                style={{ color: "#64748b" }}
              >
                Contact
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

      {/* ── Deploy Bot modal ── */}
      <DeployModal
        isOpen={deployOpen}
        onClose={() => setDeployOpen(false)}
        user={user ?? null}
        auth={auth}
      />

    </div>
  );
}
