
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
import { AlertCircle, LineChart, Server, ArrowUpRight, ArrowDownRight, Timer, TrendingUp } from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
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

  const calculatePercent = (targetPrice: number | undefined | null, entry: number, type: string) => {
    if (targetPrice === undefined || targetPrice === null || !entry || entry === 0) return null;
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
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card/30">
      <div className="p-4 border-b border-border bg-background/50 flex items-center justify-between">
        <div className="flex gap-2">
          {["All", "5", "15", "60", "D"].map(tf => (
            <button
              key={tf}
              onClick={() => setActiveFilter(tf === "All" ? null : tf)}
              className={cn(
                "px-6 py-2 text-sm font-black rounded uppercase transition-all",
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
          <Badge variant="outline" className="text-[12px] h-8 border-emerald-500/20 text-emerald-400 gap-1.5 bg-emerald-500/5 px-4 font-black uppercase">
            <Server className="h-4 w-4" /> 24/7 SYNC ACTIVE
          </Badge>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="bg-secondary/20 sticky top-0 z-10 backdrop-blur-md">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-xs uppercase font-black py-5 pl-6 w-[120px]">Time</TableHead>
              <TableHead className="text-xs uppercase font-black py-5 w-[140px]">Age</TableHead>
              <TableHead className="text-xs uppercase font-black py-5 w-[180px]">Asset</TableHead>
              <TableHead className="text-xs uppercase font-black py-5 w-[110px]">Exch</TableHead>
              <TableHead className="text-xs uppercase font-black py-5 text-center w-[120px]">TF / Deep</TableHead>
              <TableHead className="text-xs uppercase font-black py-5 text-center w-[100px]">Side</TableHead>
              <TableHead className="text-xs uppercase font-black py-5 text-right w-[140px]">Entry</TableHead>
              <TableHead className="text-xs uppercase font-black text-accent py-5 text-right w-[140px]">Live</TableHead>
              <TableHead className="text-xs uppercase font-black text-accent-foreground py-5 text-right w-[120px]">Live PNL</TableHead>
              <TableHead className="text-xs uppercase font-black text-emerald-400 py-5 text-right w-[140px]">Max Up</TableHead>
              <TableHead className="text-xs uppercase font-black text-rose-400 py-5 text-right pr-6 w-[140px]">Max DD</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (!signals || signals.length === 0) ? (
              <TableRow><TableCell colSpan={11} className="text-center py-24 text-lg animate-pulse text-accent uppercase tracking-widest font-black">Connecting Node...</TableCell></TableRow>
            ) : signals?.length === 0 ? (
              <TableRow><TableCell colSpan={11} className="text-center py-24 text-lg text-muted-foreground uppercase tracking-widest font-black">No active signals</TableCell></TableRow>
            ) : (
              signals?.map((signal) => {
                const alertPrice = Number(signal.price || 0);
                const currentPrice = signal.currentPrice ? Number(signal.currentPrice) : null;
                
                const livePnl = calculatePercent(currentPrice, alertPrice, signal.type);
                const upsidePercent = calculatePercent(signal.maxUpsidePrice, alertPrice, signal.type);
                const drawdownPercent = calculatePercent(signal.maxDrawdownPrice, alertPrice, signal.type);

                const isPnlPositive = livePnl ? Number(livePnl) > 0 : false;

                return (
                  <TableRow 
                    key={signal.id} 
                    onClick={() => router.push(`/chart/${signal.id}`)}
                    className="group border-border hover:bg-accent/5 transition-all cursor-pointer"
                  >
                    <TableCell className="text-sm font-mono text-muted-foreground py-6 pl-6 whitespace-nowrap">
                      {mounted ? format(new Date(signal.receivedAt), 'HH:mm') : "--"}
                    </TableCell>
                    <TableCell className="py-6">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Timer className="h-4 w-4 text-accent/50" />
                        <span className="text-sm font-mono font-bold whitespace-nowrap">
                          {mounted ? getRunningSince(signal.receivedAt) : "--"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-6">
                      <span className="font-black text-xl text-white tracking-tighter uppercase">{signal.symbol}</span>
                    </TableCell>
                    <TableCell className="py-6">
                      <Badge className="bg-primary/30 text-accent border-accent/20 text-[10px] font-black h-6 px-2">
                        {signal.exchange || "BINANCE"}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-6">
                      <div className="flex items-center justify-center gap-3">
                        <Badge variant="outline" className="text-[11px] h-6 px-2 border-white/10 font-black bg-white/5 opacity-80 uppercase">
                          {signal.timeframe}
                        </Badge>
                        <div className="p-2.5 rounded-xl bg-accent/5 group-hover:bg-accent/20 text-muted-foreground group-hover:text-accent transition-all">
                          <LineChart className="h-6 w-6" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center py-6">
                      <Badge className={cn(
                        "text-[12px] font-black border-none h-8 px-5 shadow-sm uppercase",
                        signal.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                      )}>
                        {signal.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-base text-white/50 py-6">
                      ${formatPrice(alertPrice)}
                    </TableCell>
                    <TableCell className="text-right py-6">
                      {currentPrice ? (
                        <div className={cn(
                          "font-mono text-lg font-black",
                          (signal.type === 'BUY' && currentPrice >= alertPrice) || (signal.type === 'SELL' && currentPrice <= alertPrice) 
                          ? "text-emerald-400" : "text-rose-400"
                        )}>
                          ${formatPrice(currentPrice)}
                        </div>
                      ) : (
                        <span className="text-muted-foreground font-mono text-base">--</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right py-6">
                      {livePnl ? (
                        <div className={cn(
                          "font-mono text-lg font-black flex items-center justify-end gap-1",
                          isPnlPositive ? "text-emerald-400" : "text-rose-400"
                        )}>
                          <TrendingUp className={cn("h-4 w-4", !isPnlPositive && "rotate-180")} />
                          {livePnl}%
                        </div>
                      ) : (
                        <span className="text-muted-foreground font-mono text-base">--</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right py-6">
                       <div className="flex flex-col items-end">
                         <span className="text-emerald-400 font-black text-base font-mono flex items-center gap-1">
                           {upsidePercent && Number(upsidePercent) !== 0 ? (
                             <>
                               <ArrowUpRight className="h-4 w-4" />
                               {upsidePercent}%
                             </>
                           ) : "0.00%"}
                         </span>
                         <span className="text-[11px] text-muted-foreground font-mono">
                           ${formatPrice(signal.maxUpsidePrice || alertPrice)}
                         </span>
                       </div>
                    </TableCell>
                    <TableCell className="text-right py-6 pr-6">
                       <div className="flex flex-col items-end">
                         <span className="text-rose-400 font-black text-base font-mono flex items-center gap-1">
                           {drawdownPercent && Number(drawdownPercent) !== 0 ? (
                             <>
                               <ArrowDownRight className="h-4 w-4" />
                               {drawdownPercent}%
                             </>
                           ) : "0.00%"}
                         </span>
                         <span className="text-[11px] text-muted-foreground font-mono">
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
