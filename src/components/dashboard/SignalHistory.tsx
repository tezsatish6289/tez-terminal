
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
import { AlertCircle, Timer, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useCollection, useUser, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, limit, orderBy, where } from "firebase/firestore";

interface SignalHistoryProps {
  onSignalSelect?: (signal: { symbol: string; timeframe?: string; exchange?: string }) => void;
}

const REFRESH_INTERVAL_SEC = 60; 

export function SignalHistory({ onSignalSelect }: SignalHistoryProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const [mounted, setMounted] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [latestPrices, setLatestPrices] = useState<Record<string, number>>({});
  const [historyStats, setHistoryStats] = useState<Record<string, { maxHigh: number; minLow: number }>>({});
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_SEC);

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

  const resolveBinanceSymbol = (rawSymbol: string) => {
    if (!rawSymbol) return "";
    return rawSymbol.split(':').pop()?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || "";
  };

  // 1. Live Price Polling (60s)
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const response = await fetch('/api/prices?type=price');
        if (response.ok) {
          const priceMap = await response.json();
          setLatestPrices(priceMap);
        }
      } catch (e) {
        console.error("Price fetch failed", e);
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
  }, []);

  // 2. Historical Backfill (When signals load)
  useEffect(() => {
    if (!signals || signals.length === 0) return;

    const fetchHistoryForNewSignals = async () => {
      const newStats = { ...historyStats };
      let changed = false;

      for (const signal of signals) {
        if (!newStats[signal.id]) {
          const cleanSym = resolveBinanceSymbol(signal.symbol);
          const startTime = new Date(signal.receivedAt).getTime();
          
          try {
            const res = await fetch(`/api/prices?type=history&symbol=${cleanSym}&startTime=${startTime}`);
            if (res.ok) {
              const data = await res.json();
              newStats[signal.id] = data;
              changed = true;
            }
          } catch (e) {
            console.error(`History backfill failed for ${cleanSym}`, e);
          }
        }
      }

      if (changed) setHistoryStats(newStats);
    };

    fetchHistoryForNewSignals();
  }, [signals]);

  const calculatePercent = (current: number | null, entry: number, type: string) => {
    if (!current || !entry) return null;
    const diff = type === 'BUY' ? current - entry : entry - current;
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
                  ? "bg-accent text-accent-foreground shadow-sm shadow-accent/20" 
                  : "bg-secondary/30 text-muted-foreground hover:bg-secondary/50"
              )}
            >
              {tf === "All" ? "All" : tf === "D" ? "Daily" : `${tf}m`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="bg-secondary/20 sticky top-0 z-10 backdrop-blur-sm">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-[9px] uppercase font-black text-muted-foreground py-2">Alert Time</TableHead>
              <TableHead className="text-[9px] uppercase font-black text-muted-foreground py-2">Asset Name</TableHead>
              <TableHead className="text-[9px] uppercase font-black text-muted-foreground py-2 text-center">Side</TableHead>
              <TableHead className="text-[9px] uppercase font-black text-muted-foreground py-2 text-right">Alert Price</TableHead>
              <TableHead className="text-[9px] uppercase font-black text-accent py-2 text-right">
                <div className="flex flex-col items-end">
                   <span>Latest Price</span>
                   <span className="text-[8px] font-mono opacity-60">Refresh: {countdown}s</span>
                </div>
              </TableHead>
              <TableHead className="text-[9px] uppercase font-black text-emerald-400 py-2 text-right">Max Upside</TableHead>
              <TableHead className="text-[9px] uppercase font-black text-rose-400 py-2 text-right">Max Drawdown</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (!signals || signals.length === 0) ? (
              <TableRow><TableCell colSpan={7} className="text-center py-20 text-[10px] animate-pulse text-accent">Establishing Binance Link...</TableCell></TableRow>
            ) : signals?.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-20 text-[10px] text-muted-foreground">No signals detected.</TableCell></TableRow>
            ) : (
              signals?.map((signal) => {
                const cleanSym = resolveBinanceSymbol(signal.symbol);
                const latestPrice = latestPrices[cleanSym];
                const stats = historyStats[signal.id];
                const alertPrice = Number(signal.price || 0);
                
                // Combine history with live feed for "Best Achieved"
                const actualMaxHigh = stats ? Math.max(stats.maxHigh, latestPrice || 0) : latestPrice;
                const actualMinLow = stats ? Math.min(stats.minLow, latestPrice || Infinity) : latestPrice;

                const maxUpside = signal.type === 'BUY' ? actualMaxHigh : actualMinLow;
                const maxDraw = signal.type === 'BUY' ? actualMinLow : actualMaxHigh;

                const upsidePercent = calculatePercent(maxUpside, alertPrice, signal.type);
                const drawdownPercent = calculatePercent(maxDraw, alertPrice, signal.type);

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
                      <div className={cn(
                        "font-mono text-[11px] font-bold",
                        latestPrice && alertPrice ? (
                          (signal.type === 'BUY' && latestPrice >= alertPrice) || (signal.type === 'SELL' && latestPrice <= alertPrice) 
                          ? "text-emerald-400" : "text-rose-400"
                        ) : "text-muted-foreground"
                      )}>
                        {latestPrice ? `$${latestPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : <RefreshCw className="h-3 w-3 animate-spin inline-block opacity-20" />}
                      </div>
                    </TableCell>
                    <TableCell className="text-right py-3">
                       <div className="text-emerald-400 font-black text-[10px] font-mono">
                         {upsidePercent ? `+${upsidePercent}%` : "--"}
                       </div>
                    </TableCell>
                    <TableCell className="text-right py-3">
                       <div className="text-rose-400 font-black text-[10px] font-mono">
                         {drawdownPercent ? `${drawdownPercent}%` : "--"}
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
