"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
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
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { useUser, useAuth } from "@/firebase";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { DeployModal } from "./components/DeployModal";
import { COUNTRIES, POPULAR_COUNTRY_CODES } from "@/lib/countries";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BotStats {
  runningSince: string | null;
  runningDays: number;
  startingCapital: number | null;
  currentCapital: number | null;
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
          backgroundColor: "rgba(8,15,30,0.95)",
          borderColor: "rgba(90,140,220,0.1)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <Image src="/freedombot/icon.png" alt="FreedomBot.ai" width={32} height={32} className="rounded-xl object-contain" priority />
            <span className="font-black text-base tracking-tight" style={{ color: "#f0f4ff" }}>
              FreedomBot<span style={{ color: "#60a5fa" }}>.ai</span>
            </span>
          </div>

          {/* Centre nav links */}
          <div className="hidden md:flex items-center gap-1">
            {[
              { label: "Home", href: "/" },
              { label: "Performance", href: "/performance" },
              { label: "Records", href: "/records" },
              { label: "Pricing", href: "#pricing" },
            ].map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:text-white"
                style={{ color: "#64748b" }}
              >
                {l.label}
              </a>
            ))}
          </div>

          {/* Right CTAs */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleSignIn}
              disabled={isSigningIn}
              className="hidden sm:flex items-center px-4 py-2 text-sm font-medium transition-colors hover:text-white disabled:opacity-70"
              style={{ color: "#64748b" }}
            >
              {isSigningIn ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
            </button>
            <button
              onClick={openDeploy}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all hover:scale-105"
              style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)", boxShadow: "0 4px 15px rgba(59,130,246,0.3)" }}
            >
              <Rocket className="h-3.5 w-3.5" /> Deploy a Bot
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

        <div className="relative max-w-3xl mx-auto px-6 pt-28 pb-24 sm:pt-40 sm:pb-32 text-center">
          {/* Live badge */}
          <div className="flex justify-center mb-7">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: "rgba(15,23,42,0.7)", border: "1px solid rgba(90,140,220,0.18)", color: "#64748b" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {stats ? `${stats.runningDays} days live` : "Live now"} · audit on-chain
            </div>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.08] mb-7">
            <span className="block text-white">Don&apos;t trust trading bots.</span>
            <span
              className="block bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #3b82f6 0%, #60a5fa 60%, #93c5fd 100%)" }}
            >
              Verify every trade.
            </span>
          </h1>

          <p className="text-sm sm:text-base max-w-md mx-auto leading-relaxed mb-7" style={{ color: "#64748b" }}>
            FreedomBot is an algorithmic trading system where every trade is recorded on-chain —
            so you can <span className="font-semibold" style={{ color: "#cbd5e1" }}>audit performance yourself</span>, anytime.
          </p>

          {/* Trust bullets — inline */}
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2 mb-9">
            {["Your capital stays in your account", "Stop anytime", "No upfront fees"].map((b) => (
              <div key={b} className="flex items-center gap-1.5 text-sm" style={{ color: "#64748b" }}>
                <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "#34d399" }} />
                {b}
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={openDeploy}
              className="h-11 px-7 rounded-full font-bold text-sm text-white flex items-center gap-2 transition-all hover:scale-105"
              style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)", boxShadow: "0 6px 20px rgba(59,130,246,0.4)" }}
            >
              <Rocket className="h-4 w-4" /> Start with $100 <ArrowRight className="h-4 w-4" />
            </button>
            <a
              href="/records"
              className="h-11 px-7 rounded-full font-bold text-sm flex items-center gap-2 transition-all hover:scale-105"
              style={{ border: "1px solid rgba(90,140,220,0.22)", color: "#93c5fd", backgroundColor: "rgba(37,99,235,0.05)" }}
            >
              <ExternalLink className="h-4 w-4" /> View Live Trades
            </a>
          </div>
          <p className="text-xs mt-7" style={{ color: "#334155" }}>
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
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest mb-5"
              style={{ backgroundColor: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)", color: "#34d399" }}
            >
              <div className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#34d399" }} />
              {stats ? `${stats.runningDays} days live` : "Live now"}
            </div>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tighter mb-4">
              Live performance.{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #93c5fd)" }}
              >
                Not backtests.
              </span>
            </h2>
            <p className="text-base" style={{ color: "#64748b" }}>
              Anyone can show backtests. We show real trades — in real time.
            </p>
          </div>

          {/* ── 4-card grid (works on all screen sizes) ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            {/* Crypto Bot — Live */}
            <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ backgroundColor: "#0d1b2e", border: "1px solid rgba(90,140,220,0.2)" }}>
              <div className="flex items-start justify-between">
                <span className="text-2xl">₿</span>
                <span className="flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }}>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                </span>
              </div>
              <div>
                <p className="text-base font-black text-white">Crypto Bot</p>
                <p className="text-xs mt-0.5" style={{ color: "#475569" }}>Running · {stats ? `${stats.runningDays} days` : "…"}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#334155" }}>Total Return</p>
                  <p className="text-sm font-black" style={{ color: "#34d399" }}>{stats ? fmt(stats.totalReturnPct) : "…"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#334155" }}>Monthly</p>
                  <p className="text-sm font-black" style={{ color: "#60a5fa" }}>
                    {stats ? fmt(stats.profitPerMonth) : "…"}
                    {stats && stats.runningDays < 30 && <span className="ml-1 text-[9px]" style={{ color: "#475569" }}>est.</span>}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#334155" }}>Start</p>
                  <p className="text-sm font-bold text-white">{stats?.startingCapital ? `$${stats.startingCapital.toFixed(0)}` : "…"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#334155" }}>Current</p>
                  <p className="text-sm font-bold text-white">{stats?.currentCapital ? `$${stats.currentCapital.toFixed(2)}` : "…"}</p>
                </div>
              </div>
              <a href="/performance" className="text-xs font-bold mt-auto transition-colors hover:text-blue-300" style={{ color: "#3b82f6" }}>
                See details →
              </a>
            </div>

            {/* Coming Soon cards */}
            {[
              { emoji: "🇮🇳", name: "Indian Stock Bot" },
              { emoji: "🥇", name: "Gold Bot" },
              { emoji: "🥈", name: "Silver Bot" },
            ].map((bot) => (
              <div key={bot.name} className="rounded-2xl p-5 flex flex-col gap-4" style={{ backgroundColor: "#0d1b2e", border: "1px solid rgba(90,140,220,0.12)", opacity: 0.75 }}>
                <div className="flex items-start justify-between">
                  <span className="text-2xl">{bot.emoji}</span>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider" style={{ backgroundColor: "rgba(251,191,36,0.1)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.2)" }}>Coming Soon</span>
                </div>
                <div>
                  <p className="text-base font-black text-white">{bot.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#334155" }}>Launching soon</p>
                </div>
                <button
                  onClick={() => setWaitlistBot(bot.name)}
                  className="mt-auto w-full py-2 rounded-xl text-xs font-bold transition-all hover:scale-105"
                  style={{ border: "1px solid rgba(90,140,220,0.2)", color: "#64748b", backgroundColor: "rgba(15,23,42,0.6)" }}
                >
                  Join waitlist
                </button>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 3 — TRUST / BLOCKCHAIN
      ══════════════════════════════════════════════════════════ */}
      <section className="py-16 sm:py-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div
            className="rounded-3xl p-8 sm:p-12 grid md:grid-cols-2 gap-10 items-center"
            style={{ backgroundColor: "#0b1829", border: "1px solid rgba(90,140,220,0.15)" }}
          >
            {/* Left — text */}
            <div>
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-6"
                style={{ backgroundColor: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", color: "#34d399" }}
              >
                <ShieldCheck className="h-3 w-3" /> Fully transparent
              </div>
              <h2 className="text-3xl sm:text-5xl font-black tracking-tighter leading-[1.0] mb-5">
                Don&apos;t trust us.{" "}
                <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #60a5fa)" }}>
                  Verify everything.
                </span>
              </h2>
              <p className="text-sm leading-relaxed mb-4" style={{ color: "#64748b" }}>
                Every trade is recorded on-chain — entry, exit, and result. No edits. No deletions. Verifiable by anyone, anytime.
              </p>
              <p className="text-sm font-semibold mb-8" style={{ color: "#e2e8f0" }}>
                If you can&apos;t verify it, you shouldn&apos;t trust it.
              </p>
              <a
                href="/records"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:scale-105"
                style={{ backgroundColor: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.3)", color: "#60a5fa" }}
              >
                Verify Records <ArrowRight className="h-4 w-4" />
              </a>
            </div>

            {/* Right — real on-chain transaction */}
            <div
              className="rounded-2xl p-5 font-mono text-xs"
              style={{ backgroundColor: "#060e1a", border: "1px solid rgba(90,140,220,0.12)" }}
            >
              <div className="flex items-center justify-between mb-4 pb-3" style={{ borderBottom: "1px solid rgba(90,140,220,0.08)" }}>
                <div>
                  <span style={{ color: "#475569" }}>tx · solana</span>
                  <span className="ml-3 text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(59,130,246,0.1)", color: "#60a5fa" }}>HPOS10IUSDT · SELL · 5×</span>
                </div>
                <span className="flex items-center gap-1 font-bold" style={{ color: "#34d399" }}>
                  verified <ShieldCheck className="h-3 w-3" />
                </span>
              </div>
              {[
                { label: "entry",    value: "$0.02194",                color: "#e2e8f0" },
                { label: "exit",     value: "$0.020274",               color: "#e2e8f0" },
                { label: "pnl",      value: "+$17.32",                 color: "#34d399" },
                { label: "size",     value: "$51.59",                  color: "#e2e8f0" },
                { label: "exchange", value: "Bybit",                   color: "#e2e8f0" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between py-1.5" style={{ borderBottom: "1px solid rgba(90,140,220,0.05)" }}>
                  <span style={{ color: "#475569" }}>{row.label}</span>
                  <span style={{ color: row.color }}>{row.value}</span>
                </div>
              ))}
              <a
                href="https://solscan.io/tx/d3JzBfLBm75fX57J8MVTjMFQrvYzNQAJ5dQghCFfmjLcoA3EXQmc32v245gsWQW51wvQQMirTqkNYjMMGnu8mCb"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 block break-all text-[10px] hover:opacity-80 transition-opacity"
                style={{ color: "#1d4ed8" }}
              >
                d3JzBfLBm75fX57J8MVTjMFQrvYzNQAJ5dQghCFfmjLcoA3EXQmc32v245gsWQW51wvQQMirTqkNYjMMGnu8mCb
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 3b — RISK DISCLOSURE
      ══════════════════════════════════════════════════════════ */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#3b82f6" }}>Honest about risk</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tighter mb-4">
              Let&apos;s talk about{" "}
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #60a5fa)" }}>risk</span>
            </h2>
            <p className="text-sm max-w-xl mx-auto" style={{ color: "#64748b" }}>
              We believe in being upfront. Trading has risk — here&apos;s what that looks like in practice.
            </p>
          </div>

          {/* 3 cards */}
          <div className="grid sm:grid-cols-3 gap-4 mb-6">
            {[
              { icon: <AlertTriangle className="h-5 w-5" style={{ color: "#f59e0b" }} />, iconBg: "rgba(245,158,11,0.1)", title: "Some weeks will be flat", desc: "Not every week is a winning week. The edge shows over time, not in every single trade." },
              { icon: <TrendingUp className="h-5 w-5" style={{ color: "#3b82f6" }} />, iconBg: "rgba(59,130,246,0.1)", title: "Markets can be unpredictable", desc: "Big news events and sudden moves affect everyone. We manage risk on every trade to limit the impact." },
              { icon: <ShieldCheck className="h-5 w-5" style={{ color: "#f59e0b" }} />, iconBg: "rgba(245,158,11,0.1)", title: "Past results guide, not guarantee", desc: "What you see is real, verified performance — but markets change and we think you should know that." },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-2xl p-6"
                style={{ backgroundColor: "#0b1829", border: "1px solid rgba(90,140,220,0.12)" }}
              >
                <div className="h-9 w-9 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: card.iconBg }}>
                  {card.icon}
                </div>
                <p className="text-sm font-bold text-white mb-2">{card.title}</p>
                <p className="text-xs leading-relaxed" style={{ color: "#64748b" }}>{card.desc}</p>
              </div>
            ))}
          </div>

          {/* Bottom banner */}
          <div
            className="rounded-2xl px-6 py-5"
            style={{ backgroundColor: "#0b1829", border: "1px solid rgba(90,140,220,0.12)" }}
          >
            <p className="text-base font-semibold mb-1" style={{ color: "#e2e8f0" }}>
              What we promise is not profit —{" "}
              <span style={{ color: "#3b82f6" }}>we promise transparency and control.</span>
            </p>
            <p className="text-xs mb-3" style={{ color: "#475569" }}>
              Entry rules, stop-loss logic, position sizing — fully documented.
            </p>
            <Link
              href="/performance"
              className="inline-flex items-center gap-1.5 text-sm font-bold transition-colors hover:opacity-80"
              style={{ color: "#3b82f6" }}
            >
              How it works <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 4 — STATS + SOCIAL PROOF
      ══════════════════════════════════════════════════════════ */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">

          {/* Testimonials */}
          <div className="text-center mb-10">
            <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#3b82f6" }}>Voices</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tighter mb-3">
              Early users.{" "}
              <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #93c5fd)" }}>
                Real feedback.
              </span>
            </h2>
            <p className="text-sm" style={{ color: "#475569" }}>No paid reviews. No hype. Just what they said.</p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 mb-10">
            {[
              { quote: "I started with a small amount just to test — didn't want to commit big capital before seeing it work. Two weeks in, I'm comfortable adding more.", name: "Tharun K.", tag: "Early User", initial: "T" },
              { quote: "The on-chain verification is what convinced me. I checked a few trades against the records myself. Everything matched.", name: "Aakash S.", tag: "Crypto Trader", initial: "A" },
              { quote: "Setup took about 4 minutes. The guided flow is straightforward — just followed the steps. No technical knowledge needed.", name: "Abhijeet P.", tag: "Crypto Trader", initial: "A" },
            ].map((t) => (
              <div key={t.name} className="rounded-2xl p-6 flex flex-col gap-4" style={{ backgroundColor: "#0b1829", border: "1px solid rgba(90,140,220,0.12)" }}>
                <p className="text-sm leading-relaxed flex-1" style={{ color: "#94a3b8" }}>
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0" style={{ background: "linear-gradient(135deg, #1d4ed8, #3b82f6)" }}>
                    {t.initial}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{t.name}</p>
                    <p className="text-[11px]" style={{ color: "#475569" }}>{t.tag}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Stats row — below reviews */}
          <div
            className="grid grid-cols-2 sm:grid-cols-4 rounded-2xl overflow-hidden"
            style={{ border: "1px solid rgba(90,140,220,0.12)", backgroundColor: "#0b1829" }}
          >
            {[
              { value: "500+", label: "Waitlist Members" },
              { value: "24/7", label: "Markets Monitored" },
              { value: "4",    label: "Markets Launching" },
              { value: "100%", label: "On-Chain Verified" },
            ].map((s, i) => (
              <div
                key={s.label}
                className="text-center py-6 px-4"
                style={{
                  borderRight: i < 3 ? "1px solid rgba(90,140,220,0.08)" : "none",
                  borderBottom: i < 2 ? "1px solid rgba(90,140,220,0.08)" : "none",
                }}
              >
                <p className="text-2xl sm:text-3xl font-black" style={{ color: "#60a5fa" }}>{s.value}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest mt-1" style={{ color: "#334155" }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECTION 5 — PRICING
      ══════════════════════════════════════════════════════════ */}
      <section
        id="pricing"
        className="py-16 sm:py-24 px-4 sm:px-6"
      >
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#3b82f6" }}>Pricing</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tighter mb-4">
              We only make money{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #93c5fd)" }}
              >
                when you do
              </span>
            </h2>
            <p className="text-sm" style={{ color: "#64748b" }}>
              No upfront fees, no monthly subscriptions, no hidden charges.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            {/* Self-deploy */}
            <div
              className="rounded-2xl p-7 flex flex-col"
              style={{
                backgroundColor: "#0b1829",
                border: "1px solid rgba(90,140,220,0.18)",
              }}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest mb-5" style={{ color: "#475569" }}>
                Self-Deploy
              </p>
              <div className="mb-6">
                <span className="text-6xl font-black text-white">Free</span>
                <p className="text-sm mt-1.5" style={{ color: "#475569" }}>
                  for your first 30 days
                </p>
              </div>
              <ul className="space-y-2.5 text-sm mb-6 flex-1" style={{ color: "#94a3b8" }}>
                {[
                  "Your capital, always yours",
                  "Guided deployment flow",
                  "Less than 5 min set up",
                  "Disable anytime, instantly",
                  "No credit card required",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" style={{ color: "#22c55e" }} />
                    {item}
                  </li>
                ))}
              </ul>
              <div
                className="rounded-xl px-4 py-3 mb-5 text-xs leading-relaxed"
                style={{ backgroundColor: "rgba(30,41,59,0.8)", border: "1px solid rgba(90,140,220,0.1)", color: "#64748b" }}
              >
                After 30 days, PostPay applies —{" "}
                <span style={{ color: "#94a3b8", fontWeight: 600 }}>10% of net profit</span>
                , only when you earn. You pay nothing if you don&apos;t profit.
              </div>
              <button
                onClick={openDeploy}
                className="w-full py-3 rounded-2xl font-bold text-white text-sm transition-all hover:opacity-90 mt-auto"
                style={{ background: "linear-gradient(90deg, #1d4ed8, #3b82f6)" }}
              >
                Deploy Now
              </button>
            </div>

            {/* PostPay */}
            <div
              className="rounded-2xl p-7 relative overflow-hidden flex flex-col"
              style={{
                backgroundColor: "#0b1829",
                border: "1px solid rgba(59,130,246,0.3)",
              }}
            >
              <div className="flex items-center justify-between mb-5">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#60a5fa" }}>PostPay</p>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(59,130,246,0.15)", color: "#93c5fd", border: "1px solid rgba(59,130,246,0.3)" }}>
                  Pay only on profit
                </span>
              </div>
              <div className="mb-1">
                <span className="text-6xl font-black text-white">10%</span>
              </div>
              <p className="text-sm mb-5" style={{ color: "#475569" }}>
                of net profit, paid after you earn
              </p>
              <div
                className="rounded-xl px-4 py-3 mb-5 text-sm"
                style={{ backgroundColor: "rgba(30,41,59,0.8)", border: "1px solid rgba(90,140,220,0.1)", color: "#94a3b8" }}
              >
                You make{" "}
                <span className="font-bold text-white">$500 profit</span>
                {" → "}you pay us{" "}
                <span className="font-bold" style={{ color: "#60a5fa" }}>$50</span>
              </div>
              {/* Earnings estimate table — live data */}
              {stats && stats.profitPerMonth !== null && stats.profitPerMonth > 0 && (
                <div
                  className="rounded-xl px-4 py-3"
                  style={{ backgroundColor: "rgba(30,41,59,0.8)", border: "1px solid rgba(90,140,220,0.1)" }}
                >
                  <p className="text-xs mb-3" style={{ color: "#475569" }}>
                    Monthly earnings estimate — based on current performance
                  </p>
                  <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: "#475569", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <th className="text-left pb-2 font-medium uppercase tracking-wider">Account</th>
                        <th className="text-right pb-2 font-medium uppercase tracking-wider">Earn/mo</th>
                        <th className="text-right pb-2 font-medium uppercase tracking-wider">Our fee</th>
                        <th className="text-right pb-2 font-medium uppercase tracking-wider" style={{ color: "#22c55e" }}>You keep</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[100, 500, 1000, 5000].map((size, i) => {
                        const gross = size * (stats.profitPerMonth ?? 0) / 100;
                        const fee   = gross < 50 ? 0 : Math.max(gross * 0.10, 10);
                        const net   = Math.max(gross - fee, 0);
                        return (
                          <tr key={size} style={{ borderBottom: i < 3 ? "1px solid rgba(255,255,255,0.04)" : "none", color: "#94a3b8" }}>
                            <td className="py-1.5 font-mono">${size.toLocaleString()}</td>
                            <td className="text-right py-1.5 font-mono">${gross.toFixed(0)}</td>
                            <td className="text-right py-1.5 font-mono" style={{ color: "#60a5fa" }}>${fee.toFixed(0)}</td>
                            <td className="text-right py-1.5 font-mono font-bold text-white">${net.toFixed(0)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="text-xs mt-3" style={{ color: "#334155" }}>
                    Projected · past returns ≠ future results
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
      <section id="faq" className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="text-center mb-10">
            <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#3b82f6" }}>FAQ</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tighter">
              Common{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #93c5fd)" }}
              >
                questions
              </span>
            </h2>
            <p className="mt-4 text-sm" style={{ color: "#64748b" }}>
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
                a: "FreedomBot connects to your exchange account — currently supporting Bybit and CoinDCX, with more coming. Your capital stays in your own exchange account at all times — we never hold, touch, or custody your funds. You connect via a read/trade-only API key; withdrawal permissions are neither required nor accepted.",
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

      {/* ══════════════════════════════════════════════════════════
          FINAL CTA SECTION
      ══════════════════════════════════════════════════════════ */}
      <section className="py-24 sm:py-32 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-5xl font-black tracking-tighter mb-5">
            Start small.{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #3b82f6, #93c5fd)" }}
            >
              Verify everything.
            </span>
          </h2>
          <p className="text-sm sm:text-base mb-10 max-w-md mx-auto" style={{ color: "#475569" }}>
            You don&apos;t need to commit large capital. Start with $100, watch the trades,
            check the on-chain records — and scale only when you&apos;re confident.
          </p>
          <button
            onClick={openDeploy}
            className="h-12 px-10 rounded-full font-bold text-sm text-white inline-flex items-center gap-2 transition-all hover:scale-105"
            style={{
              background: "linear-gradient(135deg, #1d4ed8, #3b82f6)",
              boxShadow: "0 8px 25px rgba(59,130,246,0.4)",
            }}
          >
            <Rocket className="h-4 w-4" />
            Deploy your bot <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          INTEGRATIONS STRIP
      ══════════════════════════════════════════════════════════ */}
      <section className="py-12 px-4 sm:px-6" style={{ borderTop: "1px solid rgba(90,140,220,0.06)" }}>
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest mb-8" style={{ color: "#1e293b" }}>
            Powered by
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
            {/* Bybit */}
            <div className="flex items-center gap-2 opacity-40 hover:opacity-70 transition-opacity">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect width="24" height="24" rx="6" fill="#F7A600"/>
                <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="bold" fill="white">B</text>
              </svg>
              <span className="text-sm font-bold" style={{ color: "#94a3b8" }}>Bybit</span>
            </div>
            {/* CoinDCX */}
            <div className="flex items-center gap-2 opacity-40 hover:opacity-70 transition-opacity">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect width="24" height="24" rx="6" fill="#0052FF"/>
                <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="bold" fill="white">DC</text>
              </svg>
              <span className="text-sm font-bold" style={{ color: "#94a3b8" }}>CoinDCX</span>
            </div>
            {/* Solana */}
            <div className="flex items-center gap-2 opacity-40 hover:opacity-70 transition-opacity">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect width="24" height="24" rx="6" fill="#9945FF"/>
                <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="bold" fill="white">SOL</text>
              </svg>
              <span className="text-sm font-bold" style={{ color: "#94a3b8" }}>Solana</span>
            </div>
            {/* Firebase */}
            <div className="flex items-center gap-2 opacity-40 hover:opacity-70 transition-opacity">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <rect width="24" height="24" rx="6" fill="#FF6D00"/>
                <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="bold" fill="white">FB</text>
              </svg>
              <span className="text-sm font-bold" style={{ color: "#94a3b8" }}>Firebase</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="py-14 px-4 sm:px-6" style={{ borderTop: "1px solid rgba(90,140,220,0.08)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-3 gap-10 mb-12">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <Image src="/freedombot/icon.png" alt="FreedomBot.ai" width={32} height={32} className="rounded-xl object-contain" />
                <span className="font-black text-base tracking-tight" style={{ color: "#f0f4ff" }}>
                  FreedomBot<span style={{ color: "#60a5fa" }}>.ai</span>
                </span>
              </div>
              <p className="text-xs leading-relaxed max-w-xs" style={{ color: "#334155" }}>
                Algorithmic trading you can verify. Every trade recorded on-chain — audit performance yourself, anytime.
              </p>
              <p className="text-[10px] mt-3" style={{ color: "#1e293b" }}>
                Trading involves risk. Past performance does not guarantee future results.
              </p>
            </div>

            {/* Product */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#334155" }}>Product</p>
              <div className="flex flex-col gap-3">
                {[
                  { label: "Performance", href: "/performance" },
                  { label: "On-chain Records", href: "/records" },
                  { label: "Pricing", href: "#pricing" },
                ].map((l) => (
                  <a key={l.label} href={l.href} className="text-sm transition-colors hover:text-white" style={{ color: "#475569" }}>{l.label}</a>
                ))}
              </div>
            </div>

            {/* Company */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#334155" }}>Company</p>
              <div className="flex flex-col gap-3">
                {[
                  { label: "Home", href: "/" },
                  { label: "About", href: "/about" },
                  { label: "Contact", href: "/contact" },
                  { label: "Privacy", href: "/privacy" },
                  { label: "Terms", href: "/terms" },
                ].map((l) => (
                  <a key={l.label} href={l.href} className="text-sm transition-colors hover:text-white" style={{ color: "#475569" }}>{l.label}</a>
                ))}
              </div>
            </div>
          </div>

          <div
            className="pt-6 text-center"
            style={{ borderTop: "1px solid rgba(90,140,220,0.06)" }}
          >
            <p className="text-[11px]" style={{ color: "#1e293b" }}>
              &copy; {new Date().getFullYear()} FreedomBot.ai. All rights reserved.
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
