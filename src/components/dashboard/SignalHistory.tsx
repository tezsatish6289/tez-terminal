
"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Loader2, ArrowUpRight, ArrowDownRight, RefreshCw, Timer, Target, TrendingDown } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useCollection, useUser, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, limit, orderBy, where, doc } from "firebase/firestore";
import { updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";

interface SignalHistoryProps {
  onSignalSelect?: (signal: { symbol: string; timeframe?: string; exchange?: string }) => void;
}

const FILTERS = [
  { label: "All", value: null },
  { label: "5 min", value: "5" },
  { label: "15 min", value: "15" },
  { label: "1h", value: "60" },
  { label: "4h", value: "240" },
  { label: "Daily", value: "D" },
];

const REFRESH_INTERVAL_SEC = 60; 

export function SignalHistory({ onSignalSelect }: SignalHistoryProps) {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [mounted, setMounted] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [latestPrices, setLatestPrices] = useState<Record<string, number>>({});
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_SEC);

  const isAdmin = user?.email === "hello@tezterminal.com";

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

  const { data: signals, isLoading: isCollectionLoading, error } = useCollection(signalsQuery);

  // Core Price Update Logic
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const response = await fetch('/api/prices');
        if (response.ok) {
          const priceMap = await response.json();
          setLatestPrices(priceMap);

          // If Admin, update the Max Upside/Drawdown in the DB
          if (isAdmin && signals && signals.length > 0 && firestore) {
            signals.forEach(signal => {
              const cleanSym = resolveBinanceSymbol(signal.symbol);
              const currentPrice = priceMap[cleanSym];
              const alertPrice = Number(signal.price || 0);
              
              if (!currentPrice || !alertPrice) return;

              let updatePayload: any = {};
              const isBuy = signal.type === 'BUY';

              // Logic for tracking Max High and Max Low relative to entry
              if (isBuy) {
                // Upside: Price goes HIGHER than entry
                if (!signal.maxUpsidePrice || currentPrice > signal.maxUpsidePrice) {
                  updatePayload.maxUpsidePrice = currentPrice;
                }
                // Drawdown: Price goes LOWER than entry
                if (!signal.maxDrawdownPrice || currentPrice < signal.maxDrawdownPrice) {
                  updatePayload.maxDrawdownPrice = currentPrice;
                }
              } else if (signal.type === 'SELL') {
                // Upside: Price goes LOWER than entry
                if (!signal.maxUpsidePrice || currentPrice < signal.maxUpsidePrice) {
                  updatePayload.maxUpsidePrice = currentPrice;
                }
                // Drawdown: Price goes HIGHER than entry
                if (!signal.maxDrawdownPrice || currentPrice > signal.maxDrawdownPrice) {
                  updatePayload.maxDrawdownPrice = currentPrice;
                }
              }

              if (Object.keys(updatePayload).length > 0) {
                const signalRef = doc(firestore, "signals", signal.id);
                updateDocumentNonBlocking(signalRef, updatePayload);
              }
            });
          }
        }
      } catch (e) {
        console.error("[SignalHistory] Price fetch failed:", e);
      }
    };

    fetchPrices();

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchPrices();
          return REFRESH_INTERVAL_SEC;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [signals, isAdmin, firestore]);

  const isLoading = isUserLoading || isCollectionLoading;

  const getFormattedDate = (receivedAt: string) => {
    if (!mounted) return "...";
    try {
      const date = new Date(receivedAt);
      return !isNaN(date.getTime()) ? format(date, 'HH:mm:ss') : receivedAt;
    } catch (e) { return receivedAt; }
  };

  const resolveBinanceSymbol = (rawSymbol: string) => {
    if (!rawSymbol) return "";
    const clean = rawSymbol.split(':').pop()?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || "";
    return clean;
  };

  const calculatePercent = (target: number, entry: number, type: 'BUY' | 'SELL', isUpside: boolean) => {
    if (!target || !entry) return null;
    let diffPercent = 0;
    
    if (type === 'BUY') {
      diffPercent = ((target - entry) / entry) * 100;
      // For BUY: Upside should be positive (gain), Drawdown should be negative (loss)
      return diffPercent.toFixed(2);
    } else {
      diffPercent = ((entry - target) / entry) * 100;
      // For SELL: Upside should be positive (gain when price drops), Drawdown should be negative
      return diffPercent.toFixed(2);
    }
  };

  if (error) {
    return (
      <div className="p-6 flex flex-col items-center text-center space-y-4">
        <div className="bg-destructive/10 p-3 rounded-full"><AlertCircle className="h-6 w-6 text-destructive" /></div>
        <h3 className="text-sm font-bold text-white">Stream Sync Error</h3>
        <p className="text-[10px] text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col h-full">
      <div className="px-4 py-3 bg-background/20 border-b border-border flex items-center gap-1 overflow-x-auto no-scrollbar">
        {FILTERS.map((filter) => (
          <button
            key={filter.label}
            onClick={() => setActiveFilter(filter.value)}
            className={cn(
              "h-7 px-2.5 text-[10px] font-bold rounded-md transition-all whitespace-nowrap",
              activeFilter === filter.value ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary"
            )}
          >
            {filter.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 bg-accent/20 border border-accent/40 px-2 py-1 rounded-md text-[9px] font-mono text-accent">
          <Timer className="h-3 w-3" />
          <span>SYNC: {countdown}s</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <Table>
          <TableHeader className="bg-secondary/10 sticky top-0 z-10">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="w-[80px] px-2 text-[9px] uppercase font-bold text-accent/80">Time</TableHead>
              <TableHead className="w-[100px] px-2 text-[9px] uppercase font-bold text-accent/80">Asset</TableHead>
              <TableHead className="w-[50px] px-1 text-[9px] uppercase font-bold text-center text-accent/80">Side</TableHead>
              <TableHead className="w-[80px] px-2 text-[9px] uppercase font-bold text-right text-accent/80">Alert</TableHead>
              <TableHead className="w-[80px] px-2 text-[9px] uppercase font-bold text-right text-accent/80">Latest</TableHead>
              <TableHead className="w-[80px] px-2 text-[9px] uppercase font-bold text-right text-emerald-400">Max Upside</TableHead>
              <TableHead className="w-[80px] px-2 text-[9px] uppercase font-bold text-right text-rose-400">Max Draw</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (!signals || signals.length === 0) ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 animate-pulse text-[10px]">Syncing Terminal...</TableCell></TableRow>
            ) : !signals || signals.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-[10px] opacity-20">No active signals.</TableCell></TableRow>
            ) : (
              signals.map((signal) => {
                const cleanSym = resolveBinanceSymbol(signal.symbol);
                const latestPrice = latestPrices[cleanSym];
                const alertPrice = Number(signal.price || 0);
                
                const upsidePercent = calculatePercent(signal.maxUpsidePrice, alertPrice, signal.type as any, true);
                const drawdownPercent = calculatePercent(signal.maxDrawdownPrice, alertPrice, signal.type as any, false);

                let priceColorClass = "text-muted-foreground";
                if (latestPrice && alertPrice) {
                  const isBuy = signal.type === 'BUY';
                  if (isBuy) {
                    priceColorClass = latestPrice >= alertPrice ? "text-emerald-400" : "text-rose-400";
                  } else {
                    priceColorClass = latestPrice <= alertPrice ? "text-emerald-400" : "text-rose-400";
                  }
                }

                return (
                  <TableRow key={signal.id} className="transition-colors group border-border hover:bg-accent/5 cursor-pointer" onClick={() => onSignalSelect?.({ symbol: signal.symbol, timeframe: signal.timeframe })}>
                    <TableCell className="text-[10px] font-mono py-3 px-2 text-white/50">{getFormattedDate(signal.receivedAt)}</TableCell>
                    <TableCell className="px-2">
                      <div className="font-bold text-[11px] text-white truncate max-w-[80px]">{signal.symbol}</div>
                      <div className="text-[8px] text-muted-foreground uppercase">{signal.timeframe}m</div>
                    </TableCell>
                    <TableCell className="px-1 text-center">
                      <Badge variant="outline" className={cn("text-[8px] uppercase font-bold border-none h-4 px-1", signal.type === 'BUY' ? 'text-emerald-400 bg-emerald-400/10' : 'text-rose-400 bg-rose-400/10')}>
                        {signal.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-[10px] px-2 text-white/70 text-right">
                      ${alertPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className={cn("font-mono text-[10px] px-2 font-bold text-right", priceColorClass)}>
                      {latestPrice ? `$${latestPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "--"}
                    </TableCell>
                    <TableCell className="px-2 text-right">
                       <div className="text-emerald-400 font-bold text-[10px] font-mono">
                         {upsidePercent ? `+${upsidePercent}%` : "--"}
                       </div>
                       <div className="text-[8px] text-muted-foreground">
                         {signal.maxUpsidePrice ? `$${Number(signal.maxUpsidePrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ""}
                       </div>
                    </TableCell>
                    <TableCell className="px-2 text-right">
                       <div className="text-rose-400 font-bold text-[10px] font-mono">
                         {drawdownPercent && Number(drawdownPercent) < 0 ? `${drawdownPercent}%` : drawdownPercent ? `-${drawdownPercent}%` : "--"}
                       </div>
                       <div className="text-[8px] text-muted-foreground">
                         {signal.maxDrawdownPrice ? `$${Number(signal.maxDrawdownPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ""}
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
