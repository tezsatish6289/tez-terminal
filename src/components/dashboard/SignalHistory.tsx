
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
import { AlertCircle, LineChart, Activity, Server, Clock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useCollection, useUser, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, limit, orderBy, where } from "firebase/firestore";

interface SignalHistoryProps {
  onSignalSelect?: (signal: { symbol: string; timeframe?: string; exchange?: string }) => void;
}

export function SignalHistory({ onSignalSelect }: SignalHistoryProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const [mounted, setMounted] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
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
    // BUY: (current - entry) / entry
    // SELL: (entry - current) / entry
    const diff = type === 'BUY' ? targetPrice - entry : entry - targetPrice;
    return ((diff / entry) * 100).toFixed(2);
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
                "px-2 py-1 text-[9px] font-bold rounded uppercase transition-colors",
                (tf === "All" ? !activeFilter : activeFilter === tf) 
                  ? "bg-accent text-accent-foreground" 
                  : "bg-secondary/30 text-muted-foreground hover:bg-secondary/50"
              )}
            >
              {tf === "All" ? "All" : tf === "D" ? "Daily" : `${tf}m`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[8px] h-4 border-emerald-500/20 text-emerald-400 gap-1 bg-emerald-500/5 uppercase font-bold">
            <Clock className="h-2 w-2" /> 5m SYNC ACTIVE
          </Badge>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="bg-secondary/20 sticky top-0 z-10 backdrop-blur-sm">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-[9px] uppercase font-black py-2">Alert Time</TableHead>
              <TableHead className="text-[9px] uppercase font-black py-2">Asset Name</TableHead>
              <TableHead className="text-[9px] uppercase font-black py-2 text-center">Chart</TableHead>
              <TableHead className="text-[9px] uppercase font-black py-2 text-center">Side</TableHead>
              <TableHead className="text-[9px] uppercase font-black py-2 text-right">Alert Price</TableHead>
              <TableHead className="text-[9px] uppercase font-black text-accent py-2 text-right">Latest Price</TableHead>
              <TableHead className="text-[9px] uppercase font-black text-emerald-400 py-2 text-right">Max Upside</TableHead>
              <TableHead className="text-[9px] uppercase font-black text-rose-400 py-2 text-right">Max Drawdown</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (!signals || signals.length === 0) ? (
              <TableRow><TableCell colSpan={8} className="text-center py-20 text-[10px] animate-pulse text-accent">Listening to Global Feed...</TableCell></TableRow>
            ) : signals?.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-20 text-[10px] text-muted-foreground">Waiting for fresh signals...</TableCell></TableRow>
            ) : (
              signals?.map((signal) => {
                const alertPrice = Number(signal.price || 0);
                const currentPrice = signal.currentPrice ? Number(signal.currentPrice) : null;
                
                const upsidePercent = calculatePercent(signal.maxUpsidePrice, alertPrice, signal.type);
                const drawdownPercent = calculatePercent(signal.maxDrawdownPrice, alertPrice, signal.type);

                return (
                  <TableRow 
                    key={signal.id} 
                    className="group border-border hover:bg-accent/5 cursor-pointer transition-colors"
                    onClick={() => onSignalSelect?.({ symbol: signal.symbol, timeframe: signal.timeframe })}
                  >
                    <TableCell className="text-[10px] font-mono text-muted-foreground py-3">
                      {mounted ? format(new Date(signal.receivedAt), 'HH:mm:ss') : "--"}
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-black text-[11px] text-white tracking-tight">{signal.symbol}</span>
                        <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-white/10 font-mono">{signal.timeframe}m</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-center py-3">
                      <LineChart className="h-3.5 w-3.5 mx-auto text-muted-foreground group-hover:text-accent transition-colors" />
                    </TableCell>
                    <TableCell className="text-center py-3">
                      <Badge className={cn(
                        "text-[9px] font-black border-none h-5 px-2",
                        signal.type === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                      )}>
                        {signal.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-[10px] text-white/50 py-3">
                      ${alertPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right py-3">
                      {currentPrice ? (
                        <div className={cn(
                          "font-mono text-[11px] font-bold",
                          (signal.type === 'BUY' && currentPrice >= alertPrice) || (signal.type === 'SELL' && currentPrice <= alertPrice) 
                          ? "text-emerald-400" : "text-rose-400"
                        )}>
                          ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      ) : (
                        <span className="text-muted-foreground font-mono text-[10px]">--</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right py-3">
                       <div className="flex flex-col items-end">
                         <span className="text-emerald-400 font-black text-[10px] font-mono">
                           {upsidePercent && Number(upsidePercent) !== 0 ? `${Number(upsidePercent) > 0 ? '+' : ''}${upsidePercent}%` : "0.00%"}
                         </span>
                         <span className="text-[8px] text-muted-foreground font-mono">
                           ${(signal.maxUpsidePrice || alertPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                         </span>
                       </div>
                    </TableCell>
                    <TableCell className="text-right py-3">
                       <div className="flex flex-col items-end">
                         <span className="text-rose-400 font-black text-[10px] font-mono">
                           {drawdownPercent && Number(drawdownPercent) !== 0 ? `${drawdownPercent}%` : "0.00%"}
                         </span>
                         <span className="text-[8px] text-muted-foreground font-mono">
                           ${(signal.maxDrawdownPrice || alertPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
