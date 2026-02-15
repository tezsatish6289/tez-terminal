
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
  ArrowUpRight, 
  ArrowDownRight, 
  BarChart3, 
  Zap,
  Loader2,
  AlertTriangle,
  Timer
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, differenceInMinutes } from "date-fns";
import { useEffect, useState } from "react";

export default function DeepDiveChartPage() {
  const { id } = useParams();
  const router = useRouter();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    setMounted(true);
    // Refresh loop for 'Running Since' counter and overall state
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const signalRef = useMemoFirebase(() => {
    if (!firestore || !id) return null;
    return doc(firestore, "signals", id as string);
  }, [firestore, id]);

  const { data: signal, isLoading: isSignalLoading, error } = useDoc(signalRef);

  const calculatePercent = (targetPrice: number | undefined, entry: number, type: string) => {
    if (!targetPrice || !entry || entry === 0) return null;
    const diff = type === 'BUY' ? targetPrice - entry : entry - targetPrice;
    return ((diff / entry) * 100).toFixed(2);
  };

  const formatPrice = (price: number | null | undefined) => {
    if (price === null || price === undefined) return "--";
    const decimals = price < 1 ? 6 : 2;
    return price.toLocaleString(undefined, { 
      minimumFractionDigits: decimals, 
      maximumFractionDigits: decimals 
    });
  };

  const getRunningSince = (receivedAt: string) => {
    const start = new Date(receivedAt);
    const diffMins = differenceInMinutes(now, start);
    
    const days = Math.floor(diffMins / 1440);
    const hours = Math.floor((diffMins % 1440) / 60);
    const mins = diffMins % 60;

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    parts.push(`${mins}m`);
    
    return parts.join(" ");
  };

  if (isUserLoading || (isSignalLoading && !signal)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-accent" />
      </div>
    );
  }

  if (error || (!signal && !isSignalLoading)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background p-6 text-center gap-6">
        <AlertTriangle className="h-16 w-16 text-destructive" />
        <h2 className="text-3xl font-bold">Signal Not Found</h2>
        <p className="text-muted-foreground text-lg">This market alert may have been purged or the link is invalid.</p>
        <Button onClick={() => router.push("/")} variant="outline" size="lg" className="gap-2">
          <ChevronLeft className="h-5 w-5" /> Return to Terminal
        </Button>
      </div>
    );
  }

  const alertPrice = Number(signal?.price || 0);
  const currentPrice = Number(signal?.currentPrice || 0);
  const upsidePercent = calculatePercent(signal?.maxUpsidePrice, alertPrice, signal?.type || "BUY");
  const drawdownPercent = calculatePercent(signal?.maxDrawdownPrice, alertPrice, signal?.type || "BUY");

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0c] text-foreground overflow-hidden">
      <TopBar />
      
      {/* Performance Data Strip */}
      <div className="h-20 bg-card/90 border-b border-white/10 flex items-center px-8 justify-between shrink-0 backdrop-blur-xl z-20 shadow-2xl">
        <div className="flex items-center gap-8">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => router.push("/")}
            className="hover:bg-accent/10 text-muted-foreground h-12 w-12"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>

          <div className="flex items-center gap-4">
             <div className="bg-primary/30 p-2.5 rounded-xl border border-accent/20">
                <BarChart3 className="h-6 w-6 text-accent" />
             </div>
             <div>
                <h2 className="text-2xl font-black tracking-tighter text-white leading-none">
                  {signal?.symbol}
                </h2>
                <div className="flex items-center gap-3 mt-2">
                   <Badge variant="outline" className="text-[10px] h-5 border-white/10 uppercase tracking-widest font-black opacity-70">
                     {signal?.exchange}
                   </Badge>
                   <Badge className={cn(
                     "text-[10px] h-5 font-black border-none px-2",
                     signal?.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                   )}>
                     {signal?.type}
                   </Badge>
                   <Badge variant="outline" className="text-[10px] h-5 px-2 border-accent/20 text-accent font-black gap-1.5">
                     <Timer className="h-3 w-3" />
                     {mounted && signal ? getRunningSince(signal.receivedAt) : "--"}
                   </Badge>
                </div>
             </div>
          </div>

          <div className="h-10 w-px bg-white/5" />

          <div className="flex gap-10">
            <div className="flex flex-col">
              <span className="text-[11px] uppercase font-bold text-muted-foreground tracking-widest mb-1">Entry</span>
              <span className="text-lg font-mono font-bold text-white/90">${formatPrice(alertPrice)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] uppercase font-bold text-accent tracking-widest mb-1">Live</span>
              <span className={cn(
                "text-lg font-mono font-bold",
                (signal?.type === 'BUY' && currentPrice >= alertPrice) || (signal?.type === 'SELL' && currentPrice <= alertPrice) 
                ? "text-emerald-400" : "text-rose-400"
              )}>
                ${formatPrice(currentPrice)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-12">
           <div className="flex flex-col items-end">
              <span className="text-[11px] uppercase font-bold text-emerald-500/60 tracking-widest mb-1">Max Upside</span>
              <div className="flex items-center gap-3">
                 <span className="text-xl font-black text-emerald-400 font-mono flex items-center gap-1.5">
                   <ArrowUpRight className="h-5 w-5" />
                   {upsidePercent}%
                 </span>
                 <span className="text-[11px] text-muted-foreground font-mono opacity-50">${formatPrice(signal?.maxUpsidePrice)}</span>
              </div>
           </div>
           
           <div className="flex flex-col items-end">
              <span className="text-[11px] uppercase font-bold text-rose-500/60 tracking-widest mb-1">Max Drawdown</span>
              <div className="flex items-center gap-3">
                 <span className="text-xl font-black text-rose-400 font-mono flex items-center gap-1.5">
                   <ArrowDownRight className="h-5 w-5" />
                   {drawdownPercent}%
                 </span>
                 <span className="text-[11px] text-muted-foreground font-mono opacity-50">${formatPrice(signal?.maxDrawdownPrice)}</span>
              </div>
           </div>

           <div className="h-10 w-px bg-white/5" />

           <div className="flex flex-col items-end">
             <div className="flex items-center gap-2 bg-emerald-500/5 px-3 py-1.5 rounded-full border border-emerald-500/10">
               <Zap className="h-4 w-4 text-emerald-400 fill-emerald-400 animate-pulse" />
               <span className="text-[11px] font-black text-emerald-400 uppercase">Live Node</span>
             </div>
             <span className="text-[10px] text-muted-foreground font-mono mt-1">
               {mounted ? format(now, 'HH:mm:ss') : "--"} UTC
             </span>
           </div>
        </div>
      </div>

      {/* Main Chart Area */}
      <div className="flex-1 w-full bg-[#13111a] relative">
        <ChartPane 
          symbol={signal?.symbol} 
          interval={signal?.timeframe} 
          exchange={signal?.exchange}
        />
      </div>
    </div>
  );
}
