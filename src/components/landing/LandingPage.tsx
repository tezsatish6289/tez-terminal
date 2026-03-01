"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Crown,
  BellRing,
  BarChart3,
  Globe,
  Shield,
  Timer,
  Loader2,
  ChevronRight,
  ScanSearch,
  Filter,
  Crosshair,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Chrome } from "lucide-react";
import { RadarIcon } from "@/components/icons/RadarIcon";

const STATS = [
  { value: "500+", label: "Trades Tracked" },
  { value: "5", label: "Timeframes" },
  { value: "24/7", label: "Market Scanning" },
];

const STEPS = [
  {
    icon: ScanSearch,
    title: "We Scan",
    desc: "Our engine monitors the entire crypto market across 5 timeframes — from 5-minute scalps to daily positions. Nothing slips through.",
    accent: "text-accent",
    bg: "bg-accent/10 border-accent/20",
  },
  {
    icon: Filter,
    title: "We Filter",
    desc: "Market sentiment analysis identifies premium setups — trades aligned with the dominant market force. Only the highest-probability entries surface.",
    accent: "text-amber-400",
    bg: "bg-amber-400/10 border-amber-400/20",
  },
  {
    icon: Crosshair,
    title: "You Trade",
    desc: "Get real-time alerts with chime notifications. Deep-dive into any signal with TradingView charts. Execute on Binance, MEXC, or Pionex.",
    accent: "text-positive",
    bg: "bg-positive/10 border-positive/20",
  },
];

const TIMEFRAMES = [
  { name: "Scalping", chart: "5M", leverage: "10x", window: "24h", desc: "Lightning-fast entries for quick profits", icon: "⚡" },
  { name: "Intraday", chart: "15M", leverage: "5x", window: "48h", desc: "Day trading setups that close before bed", icon: "☀️" },
  { name: "BTST", chart: "1H", leverage: "3x", window: "7d", desc: "Buy today, sell tomorrow — or next week", icon: "🌙" },
  { name: "Swing", chart: "4H", leverage: "3x", window: "30d", desc: "Ride the multi-day trends with precision", icon: "🌊" },
  { name: "Buy & Hold", chart: "Daily", leverage: "1x", window: "90d", desc: "Long-term conviction plays for investors", icon: "💎" },
];

interface TopWinner {
  symbol: string;
  type: "LONG" | "SHORT";
  timeframe: string;
  maxReturn: string;
  leverage: string;
  ago: string;
}

const FEATURES = [
  {
    icon: Crown,
    title: "Premium Signals",
    desc: "Trades aligned with market sentiment — statistically higher probability of success.",
    color: "text-amber-400",
    bg: "bg-amber-400/10 border-amber-400/20",
  },
  {
    icon: BellRing,
    title: "Real-Time Alerts",
    desc: "Chime notifications + browser push when a premium trade drops. Never miss a move.",
    color: "text-accent",
    bg: "bg-accent/10 border-accent/20",
  },
  {
    icon: BarChart3,
    title: "Performance Analytics",
    desc: "Track win rates, avg returns, and max excursions across all timeframes — All vs Premium.",
    color: "text-positive",
    bg: "bg-positive/10 border-positive/20",
  },
  {
    icon: Globe,
    title: "Multi-Exchange",
    desc: "One-click trading on Binance, MEXC, and Pionex. Deep-dive charts powered by TradingView.",
    color: "text-blue-400",
    bg: "bg-blue-400/10 border-blue-400/20",
  },
  {
    icon: Shield,
    title: "Smart Risk Management",
    desc: "Auto stop-loss tracking. SL moves to cost when 2x risk target is hit — locking in gains.",
    color: "text-negative",
    bg: "bg-negative/10 border-negative/20",
  },
  {
    icon: Timer,
    title: "Live Market Pulse",
    desc: "Sentiment engine powered by recency-weighted decay. See who's in control — bulls or bears.",
    color: "text-purple-400",
    bg: "bg-purple-400/10 border-purple-400/20",
  },
];

interface LandingPageProps {
  onLogin: () => void;
  isLoggingIn: boolean;
}

export function LandingPage({ onLogin, isLoggingIn }: LandingPageProps) {
  const [topWinners, setTopWinners] = useState<TopWinner[]>([]);

  useEffect(() => {
    fetch("/api/top-winners")
      .then((r) => r.json())
      .then((data) => setTopWinners(data))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RadarIcon className="h-5 w-5 text-accent" />
            <span className="font-black text-lg text-accent tracking-tight">TezTerminal</span>
          </div>
          <Button
            onClick={onLogin}
            disabled={isLoggingIn}
            size="sm"
            className="bg-accent text-accent-foreground hover:bg-accent/90 font-bold text-xs uppercase tracking-wider h-8 px-4"
          >
            {isLoggingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-accent/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-4 pt-16 pb-12 sm:pt-24 sm:pb-20">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent/20 bg-accent/5 text-xs font-bold text-accent uppercase tracking-widest">
              <Zap className="h-3 w-3" />
              Crypto-Only Trading Terminal
            </div>

            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tighter leading-[0.9]">
              Your Edge in{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-accent to-positive">
                Crypto Trading
              </span>
            </h1>

            <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
              We scan the entire crypto market 24/7, filter the noise with sentiment analysis, and deliver 
              high-probability trade setups — so you can focus on stacking gains.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Button
                onClick={onLogin}
                disabled={isLoggingIn}
                className="w-full sm:w-auto h-12 sm:h-14 px-8 gap-3 bg-accent text-accent-foreground hover:bg-accent/90 text-base font-bold rounded-xl shadow-lg shadow-accent/20"
              >
                {isLoggingIn ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Chrome className="h-5 w-5" />
                    Sign in with Google — It's Free
                  </>
                )}
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground/50">
              No credit card required. Instant access after sign-in.
            </p>
          </div>

          {/* Stats Bar */}
          <div className="mt-12 sm:mt-16 grid grid-cols-3 gap-4 max-w-xl mx-auto">
            {STATS.map((s) => (
              <div key={s.label} className="text-center px-4 py-3 rounded-xl border border-white/5 bg-white/[0.02]">
                <p className="text-2xl sm:text-3xl font-black text-accent tracking-tight">{s.value}</p>
                <p className="text-[10px] sm:text-xs font-bold text-muted-foreground uppercase tracking-widest mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 sm:py-24 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tighter">
              How It <span className="text-accent">Works</span>
            </h2>
            <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto">
              From raw market data to actionable trade setups — in real time.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {STEPS.map((step, i) => (
              <div key={step.title} className="relative group">
                <div className={cn("rounded-2xl border p-6 h-full transition-all hover:scale-[1.02]", step.bg)}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black", step.bg)}>
                      {i + 1}
                    </div>
                    <step.icon className={cn("h-5 w-5", step.accent)} />
                  </div>
                  <h3 className="text-xl font-black tracking-tight mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
                </div>
                {i < 2 && (
                  <div className="hidden sm:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10">
                    <ChevronRight className="h-5 w-5 text-muted-foreground/30" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Built for Every Trader */}
      <section className="py-16 sm:py-24 border-t border-white/5 bg-white/[0.01]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tighter">
              Built for <span className="text-accent">Every</span> Crypto Trader
            </h2>
            <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto">
              Whether you scalp 5-minute candles or hold for months — we've got your timeframe covered.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {TIMEFRAMES.map((tf) => (
              <div
                key={tf.name}
                className="rounded-2xl border border-white/5 bg-card p-5 hover:border-accent/20 transition-all hover:scale-[1.02] group"
              >
                <div className="text-2xl mb-3">{tf.icon}</div>
                <h3 className="text-lg font-black tracking-tight">{tf.name}</h3>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{tf.desc}</p>
                <div className="flex items-center gap-2 mt-4">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-accent/10 text-accent border border-accent/20">
                    {tf.chart}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/5 text-muted-foreground border border-white/10">
                    {tf.leverage}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/5 text-muted-foreground border border-white/10">
                    {tf.window}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Top Winners */}
      <section className="py-16 sm:py-24 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tighter">
              Top <span className="text-positive">Winning</span> Trades
            </h2>
            <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto">
              Real trades identified by TezTerminal across all timeframes. Max returns at leverage.
            </p>
          </div>

          {topWinners.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
              {topWinners.map((w) => (
                <div
                  key={w.symbol}
                  className="rounded-2xl border border-white/5 bg-card p-5 hover:border-positive/20 transition-all"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {w.type === "LONG" ? (
                        <TrendingUp className="h-4 w-4 text-positive" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-negative" />
                      )}
                      <span className="text-lg font-black uppercase tracking-tight">{w.symbol}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground/50">{w.ago}</span>
                      <Crown className="h-3.5 w-3.5 text-amber-400" />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black text-positive tracking-tighter">{w.maxReturn}</span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">peak return</span>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-md border",
                      w.type === "LONG" ? "bg-positive/10 text-positive border-positive/20" : "bg-negative/10 text-negative border-negative/20"
                    )}>
                      {w.type}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-accent/10 text-accent border border-accent/20">
                      {w.timeframe}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/5 text-muted-foreground border border-white/10">
                      {w.leverage}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-accent" />
            </div>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="py-16 sm:py-24 border-t border-white/5 bg-white/[0.01]">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tighter">
              Everything You <span className="text-accent">Need</span>
            </h2>
            <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto">
              A complete trading terminal — from signal discovery to execution.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className={cn("rounded-2xl border p-5 transition-all hover:scale-[1.02]", f.bg)}
              >
                <f.icon className={cn("h-6 w-6 mb-3", f.color)} />
                <h3 className="text-base font-black tracking-tight mb-1">{f.title}</h3>
                <p className="text-[12px] text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 sm:py-28 border-t border-white/5 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-accent/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative max-w-2xl mx-auto px-4 text-center space-y-6">
          <h2 className="text-3xl sm:text-5xl font-black tracking-tighter">
            Start Trading{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-positive">
              Smarter
            </span>
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto">
            Join traders who use TezTerminal to find high-probability crypto setups across every timeframe.
          </p>
          <Button
            onClick={onLogin}
            disabled={isLoggingIn}
            className="h-14 px-10 gap-3 bg-accent text-accent-foreground hover:bg-accent/90 text-base font-bold rounded-xl shadow-lg shadow-accent/20"
          >
            {isLoggingIn ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <Chrome className="h-5 w-5" />
                Sign in with Google — It's Free
              </>
            )}
          </Button>
          <p className="text-[11px] text-muted-foreground/50">
            No credit card. No setup. Instant access.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-6">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <RadarIcon className="h-4 w-4 text-accent" />
            <span className="font-bold text-sm text-accent">TezTerminal</span>
          </div>
          <p className="text-[11px] text-muted-foreground/50">
            Built for crypto traders. Powered by real-time market intelligence.
          </p>
        </div>
      </footer>
    </div>
  );
}
