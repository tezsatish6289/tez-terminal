"use client";

import { useDoc, useFirestore, useMemoFirebase, useUser } from "@/firebase";
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
  ArrowRightLeft,
  ShieldCheck,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BinanceIcon, MexcIcon, PionexIcon, TradingViewIcon } from "@/components/icons/exchange-icons";
import { useEffect, useRef, useState } from "react";
import { format, differenceInMinutes } from "date-fns";
import { getLeverage } from "@/lib/leverage";
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
  const { user, isUserLoading } = useUser();
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(new Date());
  const [showBtc, setShowBtc] = useState(false);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const [leftHeight, setLeftHeight] = useState<number | null>(null);

  useEffect(() => {
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

  if (isUserLoading || isSignalLoading || !signalRef) {
    return <div className="flex h-screen items-center justify-center bg-background"><Loader2 className="h-10 w-10 animate-spin text-accent" /></div>;
  }

  if (error || !signal) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background p-6 gap-6">
        <AlertTriangle className="h-16 w-16 text-destructive" />
        <h2 className="text-2xl font-bold">Signal Not Found</h2>
        <Button onClick={() => router.push("/")} variant="outline">Return to Terminal</Button>
      </div>
    );
  }

  const isBullish = signal?.type === "BUY";
  const leverage = getLeverage(signal?.timeframe);
  const effectivePnlVal = signal ? getEffectivePnl(signal) : 0;
  const leveragedPnl = (effectivePnlVal * leverage).toFixed(2);
  const maxUpPnl = (Number(calculatePercent(signal?.maxUpsidePrice, signal?.price, signal?.type || "BUY")) * leverage).toFixed(2);
  const maxDownPnl = (Number(calculatePercent(signal?.maxDrawdownPrice, signal?.price, signal?.type || "BUY")) * leverage).toFixed(2);
  const hasStopLoss = signal?.stopLoss != null && signal?.stopLoss > 0;
  const hasTp = signal?.tp1 != null && signal?.tp2 != null;
  const pnlLabel = signal?.totalBookedPnl != null ? "Booked PnL" : (signal?.tp2Hit || signal?.tp1Hit) ? "Partial + Live" : "Live PnL";
  
  const tradingViewUrl = `https://www.tradingview.com/chart/?symbol=${signal?.exchange || 'BINANCE'}:${signal?.symbol}&interval=${signal?.timeframe || '15'}`;

  const cleanSymbol = (signal?.symbol || "").replace(/\.P$/i, "");
  const tradeLinks = [
    { name: "Binance", icon: BinanceIcon, url: `https://www.binance.com/en/futures/${cleanSymbol}`, color: "bg-[#F0B90B]/15 text-[#F0B90B] border-[#F0B90B]/30 hover:bg-[#F0B90B]/25" },
    { name: "MEXC", icon: MexcIcon, url: `https://futures.mexc.com/exchange/${cleanSymbol}`, color: "bg-[#2EBD85]/15 text-[#2EBD85] border-[#2EBD85]/30 hover:bg-[#2EBD85]/25" },
    { name: "Pionex", icon: PionexIcon, url: `https://www.pionex.com/en/futures/${cleanSymbol}`, color: "bg-[#E8B342]/15 text-[#E8B342] border-[#E8B342]/30 hover:bg-[#E8B342]/25" },
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
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <TopBar />

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Signal Card */}
        <div ref={leftPanelRef} className="w-[380px] shrink-0 border-r border-white/5 bg-background flex flex-col overflow-y-auto">
          <div className="p-4 pt-2">
            <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-muted-foreground hover:text-foreground gap-1 -ml-2 mb-2">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>

            <div className="bg-gradient-to-b from-[#141416] to-[#101012] rounded-2xl border border-white/5 shadow-2xl shadow-accent/5 flex flex-col">
              {/* Header strip */}
              <div className="px-6 py-4 border-b border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-2xl font-black text-foreground leading-none tracking-tighter uppercase">{signal?.symbol}</h3>
                    <span className="text-white/15">·</span>
                    <span className={cn("text-[10px] font-black uppercase tracking-widest", isBullish ? "text-positive" : "text-negative")}>{isBullish ? "LONG" : "SHORT"}</span>
                    <span className="text-white/15">·</span>
                    <span className="text-[10px] font-black uppercase text-accent tracking-widest">{leverage}x</span>
                    <span className="text-white/15">·</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50">{signal?.algo || "V8 Reversal"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="h-6 w-6 rounded-full border border-white/10 bg-white/[0.03] flex items-center justify-center hover:bg-white/[0.08] hover:border-accent/30 transition-all group">
                          <Info className="h-3 w-3 text-muted-foreground/40 group-hover:text-accent transition-colors" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent side="bottom" align="end" className="w-[340px] p-0 bg-[#141416] border-white/10 shadow-2xl shadow-black/50">
                        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-widest text-accent">Strategy Guide</span>
                        </div>
                        <div className="p-4 space-y-3">
                          {([
                            {
                              icon: Target,
                              color: "text-emerald-400",
                              bg: "bg-emerald-400/10",
                              title: "TP1 Hit — Book 50%",
                              desc: "Close half the position at TP1. Stop loss moves to your entry price — you're now risk-free on the rest.",
                            },
                            {
                              icon: Target,
                              color: "text-emerald-400",
                              bg: "bg-emerald-400/10",
                              title: "TP2 Hit — Book 25%",
                              desc: "Close another quarter at TP2. Stop loss moves up to TP1 — locking in profit on the remaining runner.",
                            },
                            {
                              icon: Target,
                              color: "text-emerald-400",
                              bg: "bg-emerald-400/10",
                              title: "TP3 Hit — Book Final 25%",
                              desc: "The runner reaches its final target. Entire position closed — maximum profit captured.",
                            },
                            {
                              icon: Shield,
                              color: "text-amber-400",
                              bg: "bg-amber-400/10",
                              title: "Stop Loss — Risk Managed",
                              desc: "If SL hits before any TP, the full trade closes at a controlled loss. After TP1, SL is at cost (breakeven). After TP2, SL is at TP1 (profit protected).",
                            },
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
                          <div className="mt-2 pt-3 border-t border-white/5">
                            <div className="flex items-center gap-2 mb-1.5">
                              <ArrowRightLeft className="h-3 w-3 text-accent/60" />
                              <span className="text-[10px] font-bold text-foreground/70">Position Split: 50 / 25 / 25</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <ShieldCheck className="h-3 w-3 text-accent/60" />
                              <span className="text-[10px] font-bold text-foreground/70">SL trails up after each TP hit</span>
                            </div>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              {/* Time strip */}
              <div className="px-6 py-2.5 bg-black/40 flex items-center justify-between border-b border-white/5 text-[10px] font-black text-muted-foreground/50 uppercase tracking-wider">
                <div className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> {mounted ? format(new Date(signal?.receivedAt), 'HH:mm') : "--"}</div>
                <div className="flex items-center gap-1.5"><Timer className="h-3 w-3 text-accent/60" /> {mounted ? getRunningSince(signal?.receivedAt) : "--"}</div>
              </div>

              {/* Hero PnL */}
              <div className="px-6 py-5 text-center border-b border-white/5">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40 block mb-1">{pnlLabel} · {leverage}x Leverage</span>
                <span className={cn("text-4xl font-black font-mono", Number(leveragedPnl) >= 0 ? "text-positive" : "text-negative")}>
                  {Number(leveragedPnl) >= 0 ? "+" : ""}{leveragedPnl}%
                </span>
              </div>

              <div className="p-5 space-y-4">
                {/* Price row */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/40 block">Entry</span>
                    <span className="text-sm font-mono font-bold text-foreground/70">${formatPrice(signal?.price)}</span>
                  </div>
                  <div className={cn("text-lg font-black", isBullish ? "text-positive/30" : "text-negative/30")}>→</div>
                  <div className="text-right">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-accent/60 block">Current</span>
                    <span className={cn("text-sm font-mono font-black", effectivePnlVal >= 0 ? "text-positive" : "text-negative")}>${formatPrice(signal?.currentPrice)}</span>
                  </div>
                </div>

                {/* TP1/TP2/TP3 targets */}
                {hasTp && (
                  <div className="space-y-2">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/30 block">Targets (50/25/25)</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        { label: "TP1", price: signal?.tp1, hit: signal?.tp1Hit, pnl: signal?.tp1BookedPnl, frac: "50%" },
                        { label: "TP2", price: signal?.tp2, hit: signal?.tp2Hit, pnl: signal?.tp2BookedPnl, frac: "25%" },
                        { label: "TP3", price: signal?.tp3, hit: signal?.tp3Hit, pnl: signal?.tp3BookedPnl, frac: "25%" },
                      ] as const).map((tp) => (
                        <div key={tp.label} className={cn("px-2 py-2 rounded-lg border", tp.hit ? "border-positive/20 bg-positive/5" : "border-white/5 bg-white/[0.02]")}>
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">{tp.label}</span>
                            <span className="text-[8px] text-muted-foreground/30 font-bold">{tp.frac}</span>
                          </div>
                          <span className="text-xs font-mono font-bold block">${formatPrice(tp.price)}</span>
                          <span className={cn("text-[9px] font-bold uppercase block mt-0.5", tp.hit ? "text-positive" : "text-muted-foreground/30")}>
                            {tp.hit ? `✓ +${(tp.pnl ?? 0).toFixed(2)}%` : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                    {signal?.slHitAt && !signal?.tp3Hit && (
                      <div className="px-3 py-2 rounded-lg border border-negative/20 bg-negative/5 text-center">
                        <span className="text-[9px] font-bold uppercase text-negative">
                          {signal?.tp2Hit ? "Runner stopped at TP1 — profit preserved" : signal?.tp1Hit ? "SL hit at cost — TP1 profit locked" : "SL hit — trade closed"}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Excursion bars */}
                <div className="space-y-2">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/30 block">Excursion</span>
                  <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-positive/10 shadow-inner shadow-black/20">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 w-[70px] shrink-0">Max Up</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                      <div className="h-full rounded-full bg-positive/40 transition-all duration-500" style={{ width: `${Math.min(Math.max(Number(maxUpPnl), 0), 100)}%` }} />
                    </div>
                    <span className="text-sm font-black font-mono text-positive shrink-0">+{maxUpPnl}%</span>
                  </div>
                  <div className="flex items-center gap-3 px-3 py-2 rounded-lg border border-negative/10 shadow-inner shadow-black/20">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/50 w-[70px] shrink-0">Max Down</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                      <div className="h-full rounded-full bg-negative/40 transition-all duration-500" style={{ width: `${Math.min(Math.abs(Number(maxDownPnl)), 100)}%` }} />
                    </div>
                    <span className="text-sm font-black font-mono text-negative shrink-0">{maxDownPnl}%</span>
                  </div>
                </div>

                {/* Stop Loss */}
                {hasStopLoss && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/5 shadow-inner shadow-black/20">
                    <Shield className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-[9px] uppercase font-bold text-muted-foreground/50 tracking-wider">Stop Loss</span>
                    <span className="ml-auto font-mono text-sm font-bold text-foreground/80">${formatPrice(signal?.stopLoss)}</span>
                  </div>
                )}

                {/* Algo */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/5 shadow-inner shadow-black/20">
                  <Info className="h-3.5 w-3.5 text-accent/60" />
                  <span className="text-[9px] uppercase font-bold text-muted-foreground/50 tracking-wider">Algo</span>
                  <span className="ml-auto text-sm font-bold text-foreground/80 uppercase tracking-wide">{signal?.algo || "V8 Reversal"}</span>
                </div>
              </div>

              {/* Exchange links inside card footer */}
              <div className="px-5 py-4 border-t border-white/5 space-y-2.5">
                <span className="text-[9px] font-black text-muted-foreground/30 uppercase tracking-widest block text-center">Trade on</span>
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
            </div>
          </div>
        </div>

        {/* Right: Chart(s) + controls */}
        <div className="flex-1 bg-background flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 flex flex-col" style={leftHeight ? { maxHeight: `${leftHeight}px` } : undefined}>
            <div className={cn("min-h-0", showBtc ? "h-1/2" : "flex-1")}>
              <ChartPane symbol={signal?.symbol} interval={signal?.timeframe} exchange={signal?.exchange} />
            </div>
            {showBtc && (
              <div className="h-1/2 min-h-0 border-t border-white/10">
                <ChartPane symbol="BTCUSDT.P" interval={signal?.timeframe} exchange={signal?.exchange} />
              </div>
            )}
          </div>
          <div className="px-4 py-2.5 border-t border-white/5 flex items-center justify-between gap-3">
            <button
              onClick={() => setShowBtc(!showBtc)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all",
                showBtc
                  ? "border-accent/30 bg-accent/10 text-accent"
                  : "border-white/10 bg-white/[0.03] text-muted-foreground/50 hover:bg-white/[0.06] hover:text-muted-foreground"
              )}
            >
              <Switch checked={showBtc} onCheckedChange={setShowBtc} className="data-[state=checked]:bg-accent scale-75" />
              Compare with BTC
            </button>
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50">Chart shown in UTC time</span>
            <Button asChild size="sm" className="font-bold text-[10px] uppercase tracking-wider border rounded-lg h-8 gap-2 px-4 border-white/10 bg-white/[0.03] text-muted-foreground/50 hover:bg-white/[0.06] hover:text-muted-foreground">
              <a href={tradingViewUrl} target="_blank" rel="noopener noreferrer">
                <TradingViewIcon className="h-3.5 w-3.5" />
                View on TradingView
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
