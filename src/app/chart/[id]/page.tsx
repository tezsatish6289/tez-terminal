"use client";

import { useDoc, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { doc } from "firebase/firestore";
import { useParams, useRouter } from "next/navigation";
import { ChartPane } from "@/components/dashboard/ChartPane";
import { TopBar } from "@/components/dashboard/TopBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ChevronLeft, 
  Loader2,
  AlertTriangle,
  Timer,
  Shield,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BinanceIcon, MexcIcon, PionexIcon, TradingViewIcon } from "@/components/icons/exchange-icons";
import { useEffect, useState } from "react";
import { format, differenceInMinutes } from "date-fns";
import { getLeverage } from "@/lib/leverage";

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

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
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

  if (isUserLoading || (isSignalLoading && !signal)) {
    return <div className="flex h-screen items-center justify-center bg-background"><Loader2 className="h-10 w-10 animate-spin text-accent" /></div>;
  }

  if (error || (!signal && !isSignalLoading)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background p-6 gap-6">
        <AlertTriangle className="h-16 w-16 text-destructive" />
        <h2 className="text-2xl font-bold">Signal Not Found</h2>
        <Button onClick={() => router.push("/")} variant="outline">Return to Terminal</Button>
      </div>
    );
  }

  const isBullish = signal?.type === "BUY";
  const livePnl = calculatePercent(signal?.currentPrice, signal?.price, signal?.type || "BUY");
  const leverage = getLeverage(signal?.timeframe);
  const leveragedPnl = (Number(livePnl) * leverage).toFixed(2);
  const maxUpPnl = (Number(calculatePercent(signal?.maxUpsidePrice, signal?.price, signal?.type || "BUY")) * leverage).toFixed(2);
  const maxDownPnl = (Number(calculatePercent(signal?.maxDrawdownPrice, signal?.price, signal?.type || "BUY")) * leverage).toFixed(2);
  const hasStopLoss = signal?.stopLoss != null && signal?.stopLoss > 0;
  
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
    <div className="flex flex-col h-screen bg-[#0a0a0c] text-foreground overflow-hidden">
      <TopBar />

      <div className="flex-1 flex overflow-hidden">
        {/* Left: Signal Card */}
        <div className="w-[380px] shrink-0 border-r border-white/5 bg-[#0a0a0c] flex flex-col overflow-y-auto">
          <div className="p-4">
            <Button variant="ghost" size="sm" onClick={() => router.back()} className="text-muted-foreground hover:text-foreground gap-1 -ml-2 mb-4">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>

            <div className="bg-[#121214] rounded-2xl border border-white/5 flex flex-col">
              <div className="p-6 border-b border-white/5 bg-white/[0.02] rounded-t-2xl">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col">
                    <h3 className="text-2xl font-black text-foreground leading-none tracking-tighter uppercase mb-2">{signal?.symbol}</h3>
                    <span className="text-[10px] font-black text-accent uppercase tracking-widest">CRYPTO</span>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge className={cn("text-[10px] font-black border-none px-4 h-7 uppercase", isBullish ? 'bg-positive/20 text-positive' : 'bg-negative/20 text-negative')}>
                      {isBullish ? 'BULLISH' : 'BEARISH'}
                    </Badge>
                    <Badge className="text-[10px] font-black border-none px-3 h-7 uppercase bg-accent/15 text-accent">
                      {leverage}x
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="px-6 py-3 bg-black/40 flex items-center justify-between border-b border-white/5 text-[10px] font-black text-muted-foreground/40 uppercase">
                <div className="flex items-center gap-2"><Clock className="h-4 w-4" /> {mounted ? format(new Date(signal?.receivedAt), 'HH:mm') : "--"}</div>
                <div className="flex items-center gap-2"><Timer className="h-4 w-4 text-accent" /> {mounted ? getRunningSince(signal?.receivedAt) : "--"}</div>
              </div>

              <div className="p-6 space-y-5">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Alert price</p>
                    <p className="text-lg font-mono font-bold text-foreground">${formatPrice(signal?.price)}</p>
                  </div>
                  <div className="space-y-2 text-right">
                    <p className="text-[10px] font-black text-accent uppercase tracking-widest">Current price</p>
                    <p className={cn("text-lg font-mono font-black", Number(livePnl) >= 0 ? "text-positive" : "text-negative")}>${formatPrice(signal?.currentPrice)}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-accent/15 bg-accent/[0.03] p-3 space-y-3">
                  <span className="text-[9px] uppercase font-black tracking-widest text-accent block text-center">Returns at {leverage}x Leverage</span>
                  <div className="w-full rounded-lg border bg-white/5 border-white/10 px-4 py-2 flex items-center justify-between gap-4">
                    <span className="text-[10px] uppercase font-black tracking-widest text-muted-foreground">Live PNL</span>
                    <span className={cn("text-base font-mono font-bold", Number(leveragedPnl) >= 0 ? "text-positive" : "text-negative")}>{Number(leveragedPnl) >= 0 ? "+" : ""}{leveragedPnl}%</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 w-full">
                    <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg bg-positive/10 border border-positive/20">
                      <span className="text-[9px] uppercase font-black text-positive/90 tracking-widest">Max Positive</span>
                      <span className="text-base font-mono font-black text-positive leading-none">+{maxUpPnl}%</span>
                    </div>
                    <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg bg-negative/10 border border-negative/20">
                      <span className="text-[9px] uppercase font-black text-negative/90 tracking-widest">Max Negative</span>
                      <span className="text-base font-mono font-black text-negative leading-none">{maxDownPnl}%</span>
                    </div>
                  </div>
                </div>

                {hasStopLoss && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.03]">
                    <Shield className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Stop Loss</span>
                    <span className="ml-auto font-mono text-sm font-bold">${formatPrice(signal?.stopLoss)}</span>
                  </div>
                )}
              </div>

            </div>
          </div>

          <div className="px-4 pt-2 pb-4 space-y-3">
            <span className="text-[9px] font-black text-muted-foreground/50 uppercase tracking-widest block text-center">Trade on</span>
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
            <Button asChild size="sm" className="w-full font-bold text-xs uppercase tracking-wide border rounded-lg h-9 gap-2 bg-[#2962FF]/15 text-[#2962FF] border-[#2962FF]/30 hover:bg-[#2962FF]/25">
              <a href={tradingViewUrl} target="_blank" rel="noopener noreferrer">
                <TradingViewIcon className="h-4 w-4" />
                View on TradingView
              </a>
            </Button>
          </div>
        </div>

        {/* Right: Chart */}
        <div className="flex-1 relative bg-[#13111a] flex flex-col">
          <div className="flex-1 min-h-0">
            <ChartPane symbol={signal?.symbol} interval={signal?.timeframe} exchange={signal?.exchange} />
          </div>
        </div>
      </div>
    </div>
  );
}
