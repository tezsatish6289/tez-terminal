"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Zap,
  TrendingUp,
  TrendingDown,
  Crown,
  BarChart3,
  Globe,
  Shield,
  Timer,
  Loader2,
  ChevronRight,
  ScanSearch,
  Filter,
  Crosshair,
  Info,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Chrome } from "lucide-react";
import { RadarIcon } from "@/components/icons/RadarIcon";

interface PlatformStats {
  totalTrades: number;
  days: number;
  hours: number;
}

const STEPS = [
  {
    icon: ScanSearch,
    title: "We Scan",
    desc: "Our engine monitors the entire crypto market across 4 timeframes — from 5-minute scalps to 4-hour swing trades. Nothing slips through.",
    accent: "text-accent",
    bg: "bg-accent/10 border-accent/20",
  },
  {
    icon: Filter,
    title: "We Filter",
    desc: "Our algorithms identify high-probability setups across all timeframes. Only the strongest entries surface — the rest is noise.",
    accent: "text-amber-400",
    bg: "bg-amber-400/10 border-amber-400/20",
  },
  {
    icon: Crosshair,
    title: "You Trade",
    desc: "Deep-dive into any signal with TradingView charts. Execute on Binance, MEXC, or Pionex with full risk management built in.",
    accent: "text-positive",
    bg: "bg-positive/10 border-positive/20",
  },
];

const TIMEFRAMES = [
  { name: "Scalping", chart: "5M", leverage: "10x", window: "24h", desc: "Lightning-fast entries for quick profits", icon: "⚡" },
  { name: "Intraday", chart: "15M", leverage: "5x", window: "48h", desc: "Day trading setups that close before bed", icon: "☀️" },
  { name: "BTST", chart: "1H", leverage: "3x", window: "7d", desc: "Buy today, sell tomorrow — or next week", icon: "🌙" },
  { name: "Swing", chart: "4H", leverage: "3x", window: "30d", desc: "Ride the multi-day trends with precision", icon: "🌊" },
];

interface TopWinner {
  symbol: string;
  type: "LONG" | "SHORT";
  timeframe: string;
  maxReturn: string;
  leverage: string;
  ago: string;
}

interface TfPerformance {
  timeframe: string;
  chart: string;
  leverage: string;
  trades: number;
  winRate: number;
  avgProfit: number;
  avgLoss: number;
  profitFactor: number;
}

interface TfFrequency {
  timeframe: string;
  freqValue: number;
  freqUnit: string;
}

const FEATURES = [
  {
    icon: BarChart3,
    title: "Trade Analytics",
    desc: "Track win rates, net PNL, avg returns, and max excursions across all timeframes with full transparency.",
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
    desc: "Auto stop-loss tracking with a 50/25/25 position split. SL moves to cost at TP1, to TP1 at TP2.",
    color: "text-negative",
    bg: "bg-negative/10 border-negative/20",
  },
  {
    icon: Timer,
    title: "4 Timeframes",
    desc: "From 5-minute scalps to 4-hour swing trades — every active trade style covered with optimized leverage.",
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
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [performance, setPerformance] = useState<TfPerformance[]>([]);
  const [frequency, setFrequency] = useState<TfFrequency[]>([]);

  useEffect(() => {
    fetch("/api/top-winners")
      .then((r) => r.json())
      .then((data) => {
        setTopWinners(data.winners || []);
        setStats(data.stats || null);
        setPerformance(data.performance || []);
        setFrequency(data.frequency || []);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
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
        {/* Fluid animated background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[70%] rounded-full bg-accent/[0.07] blur-[120px] animate-blob-1" />
          <div className="absolute -top-[10%] -right-[15%] w-[50%] h-[60%] rounded-full bg-emerald-500/[0.05] blur-[120px] animate-blob-2" />
          <div className="absolute top-[20%] left-[20%] w-[40%] h-[50%] rounded-full bg-cyan-500/[0.04] blur-[100px] animate-blob-3" />
          <div className="absolute top-[40%] right-[10%] w-[35%] h-[40%] rounded-full bg-accent/[0.05] blur-[100px] animate-blob-4" />
          <div className="absolute -bottom-[10%] left-[30%] w-[45%] h-[50%] rounded-full bg-teal-400/[0.03] blur-[120px] animate-blob-5" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/30 to-background pointer-events-none" />

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
              We scan the entire crypto market 24/7, filter the noise, and deliver 
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
            {[
              { value: stats ? `${stats.totalTrades}` : "—", label: "Trades" },
              { value: "4", label: "Timeframes" },
              { value: "24/7", label: "Scanning" },
            ].map((s) => (
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

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {TIMEFRAMES.map((tf) => {
              const freq = frequency.find(f => f.timeframe === tf.name);
              return (
                <div
                  key={tf.name}
                  className="rounded-2xl border border-white/5 bg-card p-5 hover:border-accent/20 transition-all hover:scale-[1.02] group"
                >
                  <div className="text-2xl mb-3">{tf.icon}</div>
                  <h3 className="text-lg font-black tracking-tight">{tf.name}</h3>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{tf.desc}</p>
                  {freq && (
                    <p className="text-[11px] font-bold text-accent mt-2">
                      Avg ~{freq.freqValue} trades/{freq.freqUnit}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-3">
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
              );
            })}
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

      {/* Live Performance */}
      {(() => {
        const qualified = performance.filter(p => p.trades >= 30);
        if (qualified.length === 0) return null;
        return (
          <section className="py-16 sm:py-24 border-t border-white/5 bg-white/[0.01]">
            <div className="max-w-4xl mx-auto px-4">
              <div className="text-center mb-10">
                <h2 className="text-3xl sm:text-4xl font-black tracking-tighter">
                  Live <span className="text-accent">Performance</span>
                </h2>
                <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto">
                  Real results from closed trades. No cherry-picking — every retired signal counts. Timeframes shown after 30+ trades.
                </p>
              </div>

              <TooltipProvider delayDuration={200}>
                <div className="rounded-2xl border border-white/5 bg-card overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-white/5 bg-white/[0.02]">
                        <th className="px-5 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Timeframe</th>
                        {[
                          { label: "Trades", tip: "Total number of closed (retired) trades in this timeframe", align: "text-center" },
                          { label: "Win Rate", tip: "Percentage of trades that closed in profit. Low win rate is by design — our algorithm targets high R:R setups", align: "text-center" },
                          { label: "Avg Profit", tip: "Average return on winning trades (with leverage). Shows how much each winner delivers", align: "text-center" },
                          { label: "Avg Loss", tip: "Average return on losing trades (with leverage). Small avg loss + large avg profit = positive expectancy", align: "text-center" },
                          { label: "Profit Factor", tip: "Gross profits ÷ gross losses. Above 1.0 = profitable system. Above 2.0 = strong edge. The higher, the better", align: "text-right" },
                        ].map((col) => (
                          <th key={col.label} className={cn("px-5 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground", col.align)}>
                            <span className="inline-flex items-center gap-1.5">
                              {col.label}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3 w-3 text-muted-foreground/30 cursor-help hover:text-muted-foreground/60 transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[240px] font-normal normal-case tracking-normal leading-relaxed px-3 py-2 text-xs">
                                  {col.tip}
                                </TooltipContent>
                              </Tooltip>
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {qualified.map((p) => (
                        <tr key={p.timeframe} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-black text-white tracking-tight">{p.timeframe}</span>
                              <span className="text-[10px] font-bold text-muted-foreground/40">{p.chart} · {p.leverage}</span>
                              {p.trades < 50 && (
                                <span className="text-[9px] font-bold text-amber-400/60 border border-amber-400/20 rounded px-1.5 py-0.5">Early data</span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className="text-sm font-black font-mono text-white">{p.trades}</span>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className={cn("text-sm font-black font-mono", p.winRate >= 50 ? "text-emerald-400" : "text-amber-400")}>
                              {p.winRate.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className="text-sm font-black font-mono text-emerald-400">
                              +{p.avgProfit.toFixed(2)}%
                            </span>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className="text-sm font-black font-mono text-rose-400">
                              {p.avgLoss.toFixed(2)}%
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <span className={cn("text-sm font-black font-mono", p.profitFactor >= 2 ? "text-emerald-400" : p.profitFactor >= 1 ? "text-amber-400" : "text-rose-400")}>
                              {p.profitFactor >= 999 ? "∞" : `${p.profitFactor.toFixed(1)}x`}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TooltipProvider>

              {/* Why it works explainer */}
              <div className="mt-8 rounded-2xl border border-accent/10 bg-accent/[0.03] p-6 sm:p-8">
                <h3 className="text-base font-black tracking-tight text-white mb-3">
                  Low win rate. Big winners. <span className="text-accent">Here's why.</span>
                </h3>
                <p className="text-[12px] text-muted-foreground leading-relaxed mb-4">
                  Our proprietary trend-reversal algorithm doesn't chase every move — it waits for high-conviction inflection points 
                  where the risk-reward is heavily skewed in your favour. Most trades won't hit, but when they do, 
                  the move is explosive.
                </p>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <div className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1">Asymmetric R:R</div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Winners outsize losers 3-5x. One winning trade covers multiple small losses — by design.
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <div className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1">Smart Exit Strategy</div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      50/25/25 profit booking with auto stop-loss trailing. Locks in gains progressively while letting winners run.
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <div className="text-[10px] font-bold text-accent uppercase tracking-widest mb-1">Custom Market Filters</div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Proprietary condition filters reduce noise and only surface setups when market structure aligns with the signal.
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground/40 text-center mt-4">
                Based on closed (retired) trades only. Returns shown at leveraged values. Updated every 5 minutes.
              </p>
            </div>
          </section>
        );
      })()}

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

          <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
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
