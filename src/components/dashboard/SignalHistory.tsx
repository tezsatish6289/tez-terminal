
"use client";

import { useState, useEffect } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, LineChart, Activity, Server, Clock, ArrowUpRight, ArrowDownRight, ExternalLink, Timer } from "lucide-react";
import { format, differenceInMinutes, differenceInHours, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useCollection, useUser, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, limit, orderBy, where } from "firebase/firestore";
import { useRouter } from "next/navigation";

export function SignalHistory() {
  const router = useRouter();
  const { user } = useUser();
  const firestore = useFirestore();
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(new Date());
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const signalsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    const baseQuery = collection(firestore, "signals");
    if (activeFilter) {
      return query(baseQuery, where("timeframe", "==", activeFilter), orderBy("receivedAt", "desc"), limit(50));
    }
    return query(baseQuery, orderBy("receivedAt", "desc"), limit(50));
  }, [user, firestore, activeFilter]);

  const { data: signals, isLoading, error } = useCollection(signalsQuery);

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

  if (error) {
    return (
      <div className="p-10 text-center">
        <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-2" />
        <p className="text-[10px] text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card/30">
      <div className="p-4 border-b border-border bg-background/50 flex items-center justify-between">
        <div className="flex gap-1">
          {["All", "5", "15", "60", "D"].map(tf => (
            <button
              key={tf}
              onClick={() => setActiveFilter(tf === "All" ? null : tf)}
              className={cn(
                "px-3 py-1 text-[10px] font-black rounded uppercase transition-all",
                (tf === "All" ? !activeFilter : activeFilter === tf) 
                  ? "bg-accent text-accent-foreground shadow-lg shadow-accent/20" 
                  : "bg-secondary/30 text-muted-foreground hover:bg-secondary/50"
              )}
            >
              {tf === "All" ? "All" : tf === "D" ? "Daily" : `${tf}m`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[9px] h-5 border-emerald-500/20 text-emerald-400 gap-1.5 bg-emerald-500/5 px-2 font-black">
            <Server className="h-2.5 w-2.5" /> 24/7 SYNC ACTIVE
          </Badge>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="bg-secondary/20 sticky top-0 z-10 backdrop-blur-md">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-[10px] uppercase font-black py-3 pl-4 w-[110px]">Alert Time</TableHead>
              <TableHead className="text-[10px] uppercase font-black py-3 w-[120px]">Running Since</TableHead>
              <TableHead className="text-[10px] uppercase font-black py-3 w-[140px]">Asset Name</TableHead>
              <TableHead className="text-[10px] uppercase font-black py-3 w-[90px]">Exchange</TableHead>
              <TableHead className="text-[10px] uppercase font-black py-3 text-center w-[100px]">Deep Dive</TableHead>
              <TableHead className="text-[10px] uppercase font-black py-3 text-center w-[80px]">Side</TableHead>
              <TableHead className="text-[10px] uppercase font-black py-3 text-right w-[110px]">Alert Price</TableHead>
              <TableHead className="text-[10px] uppercase font-black text-accent py-3 text-right w-[110px]">Latest Price</TableHead>
              <TableHead className="text-[10px] uppercase font-black text-emerald-400 py-3 text-right w-[110px]">Max Upside</TableHead>
              <TableHead className="text-[10px] uppercase font-black text-rose-400 py-3 text-right pr-4 w-[110px]">Max Drawdown</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (!signals || signals.length === 0) ? (
              <TableRow><TableCell colSpan={10} className="text-center py-20 text-[11px] animate-pulse text-accent uppercase tracking-widest font-bold">Establishing Node Bridge...</TableCell></TableRow>
            ) : signals?.length === 0 ? (
              <TableRow><TableCell colSpan={10} className="text-center py-20 text-[11px] text-muted-foreground uppercase tracking-widest font-bold">No active signals found in the stream</TableCell></TableRow>
            ) : (
              signals?.map((signal) => {
                const alertPrice = Number(signal.price || 0);
                const currentPrice = signal.currentPrice ? Number(signal.currentPrice) : null;
                
                const upsidePercent = calculatePercent(signal.maxUpsidePrice, alertPrice, signal.type);
                const drawdownPercent = calculatePercent(signal.maxDrawdownPrice, alertPrice, signal.type);

                return (
                  <TableRow 
                    key={signal.id} 
                    className="group border-border hover:bg-accent/5 transition-all"
                  >
                    <TableCell className="text-[11px] font-mono text-muted-foreground/60 py-4 pl-4 whitespace-nowrap">
                      {mounted ? format(new Date(signal.receivedAt), 'HH:mm:ss') : "--"}
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Timer className="h-3 w-3 text-accent/50" />
                        <span className="text-[11px] font-mono font-bold whitespace-nowrap">
                          {mounted ? getRunningSince(signal.receivedAt) : "--"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <span className="font-black text-[13px] text-white tracking-tight">{signal.symbol}</span>
                    </TableCell>
                    <TableCell className="py-4">
                      <Badge className="bg-primary/40 text-accent border-accent/20 text-[9px] font-bold tracking-tighter h-5 px-1.5">
                        {signal.exchange || "BINANCE"}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="flex items-center justify-center gap-2">
                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-white/10 font-mono bg-white/5 opacity-60">
                          {signal.timeframe}
                        </Badge>
                        <button 
                          onClick={() => router.push(`/chart/${signal.id}`)}
                          className="p-1.5 rounded-lg hover:bg-accent/20 text-muted-foreground hover:text-accent transition-all group-hover:scale-110"
                        >
                          <LineChart className="h-4 w-4" />
                        </button>
                      </div>
                    </TableCell>
                    <TableCell className="text-center py-4">
                      <Badge className={cn(
                        "text-[10px] font-black border-none h-6 px-3 shadow-sm",
                        signal.type === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                      )}>
                        {signal.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-[11px] text-white/40 py-4">
                      ${formatPrice(alertPrice)}
                    </TableCell>
                    <TableCell className="text-right py-4">
                      {currentPrice ? (
                        <div className={cn(
                          "font-mono text-[13px] font-black",
                          (signal.type === 'BUY' && currentPrice >= alertPrice) || (signal.type === 'SELL' && currentPrice <= alertPrice) 
                          ? "text-emerald-400" : "text-rose-400"
                        )}>
                          ${formatPrice(currentPrice)}
                        </div>
                      ) : (
                        <span className="text-muted-foreground font-mono text-[11px]">--</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right py-4">
                       <div className="flex flex-col items-end">
                         <span className="text-emerald-400 font-black text-[12px] font-mono flex items-center gap-1">
                           {upsidePercent && Number(upsidePercent) !== 0 ? (
                             <>
                               <ArrowUpRight className="h-3 w-3" />
                               {Number(upsidePercent) > 0 ? '+' : ''}{upsidePercent}%
                             </>
                           ) : "0.00%"}
                         </span>
                         <span className="text-[9px] text-muted-foreground/60 font-mono">
                           ${formatPrice(signal.maxUpsidePrice || alertPrice)}
                         </span>
                       </div>
                    </TableCell>
                    <TableCell className="text-right py-4 pr-4">
                       <div className="flex flex-col items-end">
                         <span className="text-rose-400 font-black text-[12px] font-mono flex items-center gap-1">
                           {drawdownPercent && Number(drawdownPercent) !== 0 ? (
                             <>
                               <ArrowDownRight className="h-3 w-3" />
                               {drawdownPercent}%
                             </>
                           ) : "0.00%"}
                         </span>
                         <span className="text-[9px] text-muted-foreground/60 font-mono">
                           ${formatPrice(signal.maxDrawdownPrice || alertPrice)}
                         </span>
                       </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
