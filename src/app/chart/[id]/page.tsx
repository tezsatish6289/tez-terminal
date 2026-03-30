"use client";

import { useDoc, useFirestore, useAuth, useMemoFirebase, useUser } from "@/firebase";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import { doc } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";
import { ChartPane } from "@/components/dashboard/ChartPane";
import { TopBar } from "@/components/dashboard/TopBar";
import { Button } from "@/components/ui/button";
import { 
  ChevronLeft,
  Loader2,
  AlertTriangle,
  Timer,
  Shield,
  Clock,
  Info,
  Target,
  X,
  BookOpen,
  Sparkles,
  ArrowLeftRight,
  LogIn,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BinanceIcon, MexcIcon, PionexIcon, TradingViewIcon } from "@/components/icons/exchange-icons";
import { useEffect, useRef, useState } from "react";
import { format, differenceInMinutes } from "date-fns";
import { getLeverage } from "@/lib/leverage";
import { trackChartViewed } from "@/firebase/analytics";

const TIMEFRAME_NAMES: Record<string, string> = {
  "5": "Scalping",
  "15": "Intraday",
  "60": "BTST",
  "240": "Swing",
  D: "Positional",
};
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getEffectivePnl } from "@/lib/pnl";

/**
 * Deep Dive Analysis Page.
 * Focus: Centralized TradingView CTA and AI Technical Insights.
 */
export default function DeepDiveChartPage() {
  const { id } = useParams();
  const router = useRouter();
  const firestore = useFirestore();
  const auth = useAuth();
  const { user, isUserLoading } = useUser();
  const [mounted, setMounted] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [now, setNow] = useState(new Date());
  const [showBtc, setShowBtc] = useState(false);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const [leftHeight, setLeftHeight] = useState<number | null>(null);

  useEffect(() => {
    if (id) trackChartViewed(id as string);
    setMounted(true);
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const el = leftPanelRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setLeftHeight(entries[0].contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const signalRef = useMemoFirebase(() => {
    if (!firestore || !id) return null;
    return doc(firestore, "signals", id as string);
  }, [firestore, id]);

  const { data: signal, isLoading: isSignalLoading, error } = useDoc(signalRef);

  const calculatePercent = (target: any, entry: any, type: string) => {
    const e = Number(entry);
    const t = Number(target);
    if (!e || isNaN(t)) return "0.00";
    const diff = type === 'BUY' ? t - e : e - t;
    return ((diff / e) * 100).toFixed(2);
  };

  const formatPrice = (p: number | null | undefined) => {
    if (p === null || p === undefined) return "--";
    const decimals = p < 1 ? 6 : 2;
    return p.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  if (isUserLoading) {
    return <div className="flex h-screen items-center justify-center bg-background"><Loader2 className="h-10 w-10 animate-spin text-accent" /></div>;
  }

  if (!user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background p-6 gap-6">
        <div className="flex flex-col items-center gap-3 max-w-sm text-center">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-accent" />
          </div>
          <h2 className="text-2xl font-black tracking-tight">View Trade Details</h2>
          <p className="text-sm text-muted-foreground/60">Sign in to access AI-powered trade analysis, live charts, and real-time updates.</p>
        </div>
        <Button
          onClick={async () => {
            if (!auth) return;
            setIsLoggingIn(true);
            try {
              await initiateGoogleSignIn(auth);
            } catch {
              setIsLoggingIn(false);
            }
          }}
          disabled={isLoggingIn}
          className="gap-2 px-6 py-3 text-sm font-bold"
        >
          {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
          Sign in with Google
        </Button>
      </div>
    );
  }

  if (isSignalLoading || !signalRef) {
    return <div className="flex h-screen items-center justify-center bg-background"><Loader2 className="h-10 w-10 animate-spin text-accent" /></div>;
  }

  if (error || !signal) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background p-6 gap-6">
        <AlertTriangle className="h-16 w-16 text-destructive" />
        <h2 className="text-2xl font-bold">Signal Not Found</h2>
        <Button onClick={() => router.push("/signals")} variant="outline">Return to Signals</Button>
      </div>
    );
  }

  const isBullish = signal?.type === "BUY";
  const isStock = signal?.assetType === "INDIAN_STOCKS";
  const curr = isStock ? "₹" : "$";
  const leverage = getLeverage(signal?.timeframe, signal?.assetType);
  const effectivePnlVal = signal ? getEffectivePnl(signal) : 0;
  const leveragedPnl = (effectivePnlVal * leverage).toFixed(2);
  const maxUpPnl = (Number(calculatePercent(signal?.maxUpsidePrice, signal?.price, signal?.type || "BUY")) * leverage).toFixed(2);
  const maxDownPnl = (Number(calculatePercent(signal?.maxDrawdownPrice, signal?.price, signal?.type || "BUY")) * leverage).toFixed(2);
  const hasStopLoss = signal?.stopLoss != null && signal?.stopLoss > 0;
  const hasTp = signal?.tp1 != null && signal?.tp2 != null;
  const pnlLabel = signal?.totalBookedPnl != null ? "Booked PnL" : (signal?.tp2Hit || signal?.tp1Hit) ? "Partial + Live" : "Live PnL";
  
  const tradingViewUrl = `https://www.tradingview.com/chart/?symbol=${signal?.exchange || 'BINANCE'}:${signal?.symbol}&interval=${signal?.timeframe || '15'}`;

  const cleanSymbol = (signal?.symbol || "").replace(/\.P$/i, "");
  // MEXC expects BASE_QUOTE format (e.g. BTC_USDT)
  const mexcSymbol = cleanSymbol.replace(/USDT$/, "_USDT");
  // Map our timeframes to exchange interval params
  const tfMap: Record<string, { binance: string; pionex: string }> = {
    "5": { binance: "5", pionex: "5" },
    "15": { binance: "15", pionex: "15" },
    "60": { binance: "60", pionex: "60" },
    "240": { binance: "240", pionex: "240" },
    "D": { binance: "1D", pionex: "1D" },
  };
  const tf = String(signal?.timeframe || "15");
  const intervals = tfMap[tf] || tfMap["15"];
  const tradeLinks = [
    { name: "Binance", icon: BinanceIcon, url: `https://www.binance.com/en/futures/${cleanSymbol}?timeInterval=${intervals.binance}`, color: "bg-[#F0B90B]/15 text-[#F0B90B] border-[#F0B90B]/30 hover:bg-[#F0B90B]/25" },
    { name: "MEXC", icon: MexcIcon, url: `https://futures.mexc.com/exchange/${mexcSymbol}`, color: "bg-[#2EBD85]/15 text-[#2EBD85] border-[#2EBD85]/30 hover:bg-[#2EBD85]/25" },
    { name: "Pionex", icon: PionexIcon, url: `https://www.pionex.com/en/futures/${cleanSymbol.replace(/USDT$/, "")}.PERP_USDT/Manual`, color: "bg-[#E8B342]/15 text-[#E8B342] border-[#E8B342]/30 hover:bg-[#E8B342]/25" },
  ];

  const getRunningSince = (receivedAt: string) => {
    const diffMins = differenceInMinutes(now, new Date(receivedAt));
    const days = Math.floor(diffMins / 1440);
    const hours = Math.floor((diffMins % 1440) / 60);
    const mins = diffMins % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <div className="flex flex-col min-h-screen lg:h-screen bg-background text-foreground lg:overflow-hidden">
      <TopBar />

      <div className="overflow-hidden bg-white/[0.02] border-b border-white/[0.06]">
        <div className="animate-marquee whitespace-nowrap py-1.5">
          <span className="text-[10px] text-muted-foreground/50 mx-8">
            TezTerminal does not manage funds, provide portfolio management services, or guarantee profits. Any trading signals or market insights are based on available data and should not be relied upon as a sole basis for trading.
          </span>
          <span className="text-[10px] text-muted-foreground/50 mx-8">
            TezTerminal does not manage funds, provide portfolio management services, or guarantee profits. Any trading signals or market insights are based on available data and should not be relied upon as a sole basis for trading.
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-3 lg:p-4 overflow-y-auto lg:overflow-hidden">
        {/* Left: Signal Card */}
        <div ref={leftPanelRef} className="w-full lg:w-[380px] shrink-0 rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] shadow-xl shadow-black/30 flex flex-col lg:overflow-y-auto">
          {/* Header */}
          <div className="px-5 pt-4 pb-3 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent">
            <Button variant="ghost" size="sm" onClick={() => router.push("/signals")} className="text-muted-foreground hover:text-foreground gap-1 -ml-3 mb-3">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2.5">
                  <h3 className="text-2xl font-black text-foreground leading-none tracking-tighter uppercase truncate">{signal?.symbol}</h3>
                  {signal?.confidenceScore != null && (
                    <div
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded-lg border shrink-0",
                        signal.confidenceScore >= 80
                          ? "bg-positive/10 border-positive/25 text-positive"
                          : signal.confidenceScore >= 65
                            ? "bg-accent/10 border-accent/25 text-accent"
                            : signal.confidenceScore >= 50
                              ? "bg-amber-400/10 border-amber-400/25 text-amber-400"
                              : "bg-orange-400/10 border-orange-400/25 text-orange-400"
                      )}
                    >
                      <Sparkles className="w-3 h-3" />
                      <span className="text-[11px] font-black tabular-nums">{signal.confidenceScore}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 mt-1.5">
                  <span className={cn("text-[11px] font-black uppercase", isBullish ? "text-positive" : "text-negative")}>{isBullish ? "▲ Long" : "▼ Short"}</span>
                  <span className="text-white/15">·</span>
                  <span className="text-[11px] font-bold text-accent/70">{leverage}x</span>
                  <span className="text-white/15">·</span>
                  <span className="text-[11px] font-bold text-muted-foreground/50 uppercase">{TIMEFRAME_NAMES[signal?.timeframe] ?? signal?.timeframe}</span>
                  <span className="text-white/15">·</span>
                  <span className="text-[11px] font-bold text-muted-foreground/40">{signal?.timeframe === "D" ? "1D" : `${signal?.timeframe}m`}</span>
                  <span className="text-white/15">·</span>
                  <span className="text-[11px] font-bold text-muted-foreground/40">{mounted ? getRunningSince(signal?.receivedAt) : "--"} ago</span>
                </div>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center justify-center w-8 h-8 rounded-full border border-white/10 bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground transition-all cursor-pointer shrink-0" title="Guide">
                    <BookOpen className="w-3.5 h-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="end" className="w-[340px] p-0 bg-[#141416] border-white/10 shadow-2xl shadow-black/50">
                  <div className="px-4 py-3 border-b border-white/[0.06]">
                    <span className="text-[10px] font-black uppercase tracking-widest text-accent">Strategy Guide</span>
                  </div>
                  <div className="p-4 space-y-3">
                    {([
                      { icon: Target, color: "text-emerald-400", bg: "bg-emerald-400/10", title: "TP1 Hit — Book 50%", desc: "Close half at TP1. SL moves to entry — risk-free." },
                      { icon: Target, color: "text-emerald-400", bg: "bg-emerald-400/10", title: "TP2 Hit — Book 25%", desc: "Close another quarter at TP2. SL moves to TP1." },
                      { icon: Target, color: "text-emerald-400", bg: "bg-emerald-400/10", title: "TP3 Hit — Book Final 25%", desc: "Runner reaches final target. Position fully closed." },
                      { icon: Shield, color: "text-amber-400", bg: "bg-amber-400/10", title: "Stop Loss — Risk Managed", desc: "SL trails up after each TP hit to lock in gains." },
                    ]).map((step, i) => (
                      <div key={i} className="flex gap-3">
                        <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5", step.bg)}>
                          <step.icon className={cn("h-3.5 w-3.5", step.color)} />
                        </div>
                        <div>
                          <div className="text-[11px] font-bold text-foreground/90">{step.title}</div>
                          <div className="text-[10px] text-muted-foreground/60 leading-relaxed mt-0.5">{step.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Hero PnL */}
          <div className="px-5 py-5 text-center border-b border-white/[0.06]">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40 block mb-1">{pnlLabel} · {leverage}x Leverage</span>
            <span className={cn("text-4xl font-black font-mono", Number(leveragedPnl) >= 0 ? "text-positive" : "text-negative")}>
              {Number(leveragedPnl) >= 0 ? "+" : ""}{leveragedPnl}%
            </span>
          </div>

          {/* Details */}
          <div className="px-5 py-4 space-y-5 flex-1">
            {/* Entry → Current */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 block">Entry</span>
                <span className="text-sm font-mono font-bold text-foreground/70">{curr}{formatPrice(signal?.price)}</span>
              </div>
              <div className={cn("text-lg font-black", isBullish ? "text-positive/20" : "text-negative/20")}>→</div>
              <div className="text-right">
                <span className="text-[9px] font-bold uppercase tracking-widest text-accent/60 block">Current</span>
                <span className={cn("text-sm font-mono font-black", effectivePnlVal >= 0 ? "text-positive" : "text-negative")}>{curr}{formatPrice(signal?.currentPrice)}</span>
              </div>
            </div>

            {/* Targets as rows */}
            {hasTp && (
              <div className="space-y-1.5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/30 block mb-2">Targets</span>
                {([
                  { label: "TP1", price: signal?.tp1, hit: signal?.tp1Hit, pnl: signal?.tp1BookedPnl, frac: "50%" },
                  { label: "TP2", price: signal?.tp2, hit: signal?.tp2Hit, pnl: signal?.tp2BookedPnl, frac: "25%" },
                  { label: "TP3", price: signal?.tp3, hit: signal?.tp3Hit, pnl: signal?.tp3BookedPnl, frac: "25%" },
                ] as const).map((tp) => {
                  const tpPct = (Number(calculatePercent(tp.price, signal?.price, signal?.type || "BUY")) * leverage).toFixed(2);
                  return (
                    <div key={tp.label} className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                      <div className="flex items-center gap-2">
                        <span className={cn("text-[11px] font-black", tp.hit ? "text-positive" : "text-muted-foreground/50")}>{tp.hit ? "✓" : "○"}</span>
                        <span className="text-[12px] font-bold text-foreground/80">{tp.label}</span>
                        <span className="text-[10px] text-muted-foreground/30">{tp.frac}</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-[12px] font-mono text-foreground/60">{curr}{formatPrice(tp.price)}</span>
                        <span className="text-[10px] font-bold text-positive">(+{tpPct}%)</span>
                      </div>
                    </div>
                  );
                })}
                {signal?.slHitAt && !signal?.tp3Hit && (
                  <p className="text-[10px] font-bold text-negative/70 mt-2">
                    {signal?.tp2Hit ? "Runner stopped at TP1 — profit preserved" : signal?.tp1Hit ? "SL hit at cost — TP1 profit locked" : "SL hit — trade closed"}
                  </p>
                )}
              </div>
            )}

            {/* Excursion — simple rows */}
            <div className="space-y-1.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/30 block mb-2">Excursion</span>
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-[12px] font-bold text-muted-foreground/50">Max Up</span>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                    <div className="h-full rounded-full bg-positive/40" style={{ width: `${Math.min(Math.max(Number(maxUpPnl), 0), 100)}%` }} />
                  </div>
                  <span className="text-[12px] font-black font-mono text-positive">+{maxUpPnl}%</span>
                </div>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-[12px] font-bold text-muted-foreground/50">Max Down</span>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                    <div className="h-full rounded-full bg-negative/40" style={{ width: `${Math.min(Math.abs(Number(maxDownPnl)), 100)}%` }} />
                  </div>
                  <span className="text-[12px] font-black font-mono text-negative">{maxDownPnl}%</span>
                </div>
              </div>
            </div>

            {/* SL + Algo as simple rows */}
            <div className="space-y-1.5">
              {hasStopLoss && (() => {
                const slPct = (Number(calculatePercent(signal?.stopLoss, signal?.price, signal?.type || "BUY")) * leverage).toFixed(2);
                return (
                  <div className="flex items-center justify-between py-1.5 border-b border-white/[0.03]">
                    <div className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5 text-amber-400/60" />
                      <span className="text-[12px] font-bold text-muted-foreground/50">Stop Loss</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[12px] font-mono font-bold text-foreground/70">{curr}{formatPrice(signal?.stopLoss)}</span>
                      <span className="text-[10px] font-bold text-negative">({slPct}%)</span>
                    </div>
                  </div>
                );
              })()}
              <div className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <Info className="h-3.5 w-3.5 text-accent/40" />
                  <span className="text-[12px] font-bold text-muted-foreground/50">Algo</span>
                </div>
                <span className="text-[11px] font-bold text-muted-foreground/50 uppercase">{signal?.algo || "V8 Reversal"}</span>
              </div>
            </div>
          </div>

          {/* Exchange links (crypto only) */}
          {!isStock && (
            <div className="px-5 py-4 border-t border-white/[0.06] mt-auto">
              <span className="text-[9px] font-black text-muted-foreground/30 uppercase tracking-widest block text-center mb-2.5">Trade on</span>
              <div className="flex gap-2">
                {tradeLinks.map((exchange) => (
                  <Button
                    key={exchange.name}
                    asChild
                    size="sm"
                    className={cn("flex-1 font-bold text-xs uppercase tracking-wide border rounded-lg h-9 gap-2", exchange.color)}
                  >
                    <a href={exchange.url} target="_blank" rel="noopener noreferrer">
                      <exchange.icon className="h-3.5 w-3.5" />
                      {exchange.name}
                    </a>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Chart(s) + controls */}
        <div className="h-[70vh] lg:h-auto lg:flex-1 shrink-0 rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] shadow-xl shadow-black/30 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 flex flex-col" style={leftHeight && mounted && typeof window !== 'undefined' && window.innerWidth >= 1024 ? { maxHeight: `${leftHeight}px` } : undefined}>
            <div className={cn("min-h-0", showBtc ? "h-1/2" : "flex-1")}>
              <ChartPane symbol={signal?.symbol} interval={signal?.timeframe} exchange={signal?.exchange} />
            </div>
            {showBtc && (
              <div className="h-1/2 min-h-0 border-t border-white/[0.06]">
                <ChartPane symbol="BTCUSDT.P" interval={signal?.timeframe} exchange={signal?.exchange} />
              </div>
            )}
          </div>
          <div className="px-3 lg:px-4 py-2 lg:py-2.5 border-t border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent flex items-center justify-between gap-2 lg:gap-3">
            {!isStock && (
              <button
                onClick={() => setShowBtc(!showBtc)}
                className={cn(
                  "flex items-center gap-2 px-2.5 lg:px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all shrink-0",
                  showBtc
                    ? "border-accent/30 bg-accent/10 text-accent"
                    : "border-white/10 bg-white/[0.03] text-muted-foreground/50 hover:bg-white/[0.06] hover:text-muted-foreground"
                )}
              >
                <Switch checked={showBtc} onCheckedChange={setShowBtc} className="data-[state=checked]:bg-accent scale-75" />
                <span className="hidden sm:inline">Compare with BTC</span>
                <ArrowLeftRight className="w-3.5 h-3.5 sm:hidden" />
              </button>
            )}
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 hidden lg:inline">Chart shown in UTC time</span>
            <Button asChild size="sm" className="font-bold text-[10px] uppercase tracking-wider border rounded-lg h-8 gap-2 px-3 lg:px-4 border-white/10 bg-white/[0.03] text-muted-foreground/50 hover:bg-white/[0.06] hover:text-muted-foreground shrink-0">
              <a href={tradingViewUrl} target="_blank" rel="noopener noreferrer">
                <TradingViewIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">View on TradingView</span>
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
