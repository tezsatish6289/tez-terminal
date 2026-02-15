
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
  Activity, 
  Clock, 
  TrendingUp, 
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
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (error || (!signal && !isSignalLoading)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background p-6 text-center gap-4">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-bold">Signal Not Found</h2>
        <p className="text-muted-foreground">This market alert may have been purged or the link is invalid.</p>
        <Button onClick={() => router.push("/")} variant="outline" className="gap-2">
          <ChevronLeft className="h-4 w-4" /> Return to Terminal
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
      <div className="h-16 bg-card/80 border-b border-white/10 flex items-center px-6 justify-between shrink-0 backdrop-blur-md">
        <div className="flex items-center gap-6">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => router.push("/")}
            className="hover:bg-accent/10 text-muted-foreground gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-3">
             <div className="bg-primary/20 p-2 rounded-lg border border-accent/20">
                <BarChart3 className="h-5 w-5 text-accent" />
             </div>
             <div>
                <h2 className="text-lg font-black tracking-tighter text-white leading-none">
                  {signal?.symbol}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                   <Badge variant="outline" className="text-[9px] h-4 border-white/10 uppercase tracking-widest font-black opacity-60">
                     {signal?.exchange}
                   </Badge>
                   <Badge className={cn(
                     "text-[9px] h-4 font-black border-none px-1.5",
                     signal?.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                   )}>
                     {signal?.type}
                   </Badge>
                   <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-accent/20 text-accent font-black gap-1">
                     <Timer className="h-2.5 w-2.5" />
                     {mounted && signal ? getRunningSince(signal.receivedAt) : "--"}
                   </Badge>
                </div>
             </div>
          </div>

          <div className="h-8 w-px bg-white/5" />

          <div className="flex gap-8">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Entry</span>
              <span className="text-sm font-mono font-bold text-white/80">${formatPrice(alertPrice)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-accent tracking-widest">Live</span>
              <span className={cn(
                "text-sm font-mono font-bold",
                (signal?.type === 'BUY' && currentPrice >= alertPrice) || (signal?.type === 'SELL' && currentPrice <= alertPrice) 
                ? "text-emerald-400" : "text-rose-400"
              )}>
                ${formatPrice(currentPrice)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-10">
           <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase font-bold text-emerald-500/60 tracking-widest">Max Upside</span>
              <div className="flex items-center gap-2">
                 <span className="text-sm font-black text-emerald-400 font-mono flex items-center gap-1">
                   <ArrowUpRight className="h-3 w-3" />
                   {upsidePercent}%
                 </span>
                 <span className="text-[10px] text-muted-foreground font-mono opacity-40">${formatPrice(signal?.maxUpsidePrice)}</span>
              </div>
           </div>
           
           <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase font-bold text-rose-500/60 tracking-widest">Max Drawdown</span>
              <div className="flex items-center gap-2">
                 <span className="text-sm font-black text-rose-400 font-mono flex items-center gap-1">
                   <ArrowDownRight className="h-3 w-3" />
                   {drawdownPercent}%
                 </span>
                 <span className="text-[10px] text-muted-foreground font-mono opacity-40">${formatPrice(signal?.maxDrawdownPrice)}</span>
              </div>
           </div>

           <div className="h-8 w-px bg-white/5" />

           <div className="flex flex-col items-end">
             <div className="flex items-center gap-1.5 bg-emerald-500/5 px-2 py-1 rounded-full border border-emerald-500/10">
               <Zap className="h-3 w-3 text-emerald-400 fill-emerald-400 animate-pulse" />
               <span className="text-[10px] font-black text-emerald-400 uppercase">Live Feed</span>
             </div>
             <span className="text-[9px] text-muted-foreground font-mono mt-0.5">
               Refreshed: {mounted ? format(new Date(), 'HH:mm:ss') : "--"}
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
