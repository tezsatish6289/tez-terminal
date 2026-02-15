
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
import { AlertCircle, Timer, TrendingUp, TrendingDown, LayoutDashboard } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useCollection, useUser, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, limit, orderBy, where, doc } from "firebase/firestore";
import { updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";

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

  const { data: signals, isLoading, error } = useCollection(signalsQuery);

  const resolveBinanceSymbol = (rawSymbol: string) => {
    if (!rawSymbol) return "";
    return rawSymbol.split(':').pop()?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || "";
  };

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const response = await fetch('/api/prices');
        if (response.ok) {
          const priceMap = await response.json();
          setLatestPrices(priceMap);

          // If Admin is viewing, update the Max Metrics in the database
          if (isAdmin && signals && firestore) {
            signals.forEach(signal => {
              const cleanSym = resolveBinanceSymbol(signal.symbol);
              const currentPrice = priceMap[cleanSym];
              const alertPrice = Number(signal.price || 0);
              
              if (!currentPrice || !alertPrice) return;

              const updatePayload: any = {};
              const isBuy = signal.type === 'BUY';

              if (isBuy) {
                if (!signal.maxUpsidePrice || currentPrice > signal.maxUpsidePrice) {
                  updatePayload.maxUpsidePrice = currentPrice;
                }
                if (!signal.maxDrawdownPrice || currentPrice < signal.maxDrawdownPrice) {
                  updatePayload.maxDrawdownPrice = currentPrice;
                }
              } else if (signal.type === 'SELL') {
                if (!signal.maxUpsidePrice || currentPrice < signal.maxUpsidePrice) {
                  updatePayload.maxUpsidePrice = currentPrice;
                }
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
  }, [signals, isAdmin, firestore]);

  const calculatePercent = (target: number, entry: number, type: string) => {
    if (!target || !entry) return null;
    const diff = type === 'BUY' ? target - entry : entry - target;
    return ((diff / entry) * 100).toFixed(2);
  };

  if (error) {
    return (
      <div className="p-10 text-center">
        <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">{error.message}</p>
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
                "px-3 py-1 text-[10px] font-bold rounded-md uppercase transition-colors",
                (tf === "All" ? !activeFilter : activeFilter === tf) 
                  ? "bg-accent text-accent-foreground" 
                  : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
              )}
            >
              {tf === "All" ? "All" : tf === "D" ? "Daily" : `${tf}m`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-accent/10 border border-accent/20 rounded-full">
          <Timer className="h-3 w-3 text-accent" />
          <span className="text-[10px] font-mono text-accent font-bold">NEXT: {countdown}s</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="bg-secondary/20 sticky top-0 z-10">
            <TableRow className="border-border">
              <TableHead className="text-[9px] uppercase font-bold text-muted-foreground">Alert Time</TableHead>
              <TableHead className="text-[9px] uppercase font-bold text-muted-foreground">Asset Name</TableHead>
              <TableHead className="text-[9px] uppercase font-bold text-muted-foreground text-center">Side</TableHead>
              <TableHead className="text-[9px] uppercase font-bold text-muted-foreground text-right">Alert Price</TableHead>
              <TableHead className="text-[9px] uppercase font-bold text-accent text-right">Latest Price</TableHead>
              <TableHead className="text-[9px] uppercase font-bold text-emerald-400 text-right">Max Upside</TableHead>
              <TableHead className="text-[9px] uppercase font-bold text-rose-400 text-right">Max Draw</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (!signals || signals.length === 0) ? (
              <TableRow><TableCell colSpan={7} className="text-center py-20 text-xs animate-pulse">Syncing Feed...</TableCell></TableRow>
            ) : signals?.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-20 text-xs text-muted-foreground">No signals detected.</TableCell></TableRow>
            ) : (
              signals?.map((signal) => {
                const cleanSym = resolveBinanceSymbol(signal.symbol);
                const latestPrice = latestPrices[cleanSym];
                const alertPrice = Number(signal.price || 0);
                
                const upsidePercent = calculatePercent(signal.maxUpsidePrice, alertPrice, signal.type);
                const drawdownPercent = calculatePercent(signal.maxDrawdownPrice, alertPrice, signal.type);

                return (
                  <TableRow 
                    key={signal.id} 
                    className="group border-border hover:bg-accent/5 cursor-pointer transition-colors"
                    onClick={() => onSignalSelect?.({ symbol: signal.symbol, timeframe: signal.timeframe })}
                  >
                    <TableCell className="text-[10px] font-mono text-muted-foreground">
                      {mounted ? format(new Date(signal.receivedAt), 'HH:mm:ss') : "--"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[11px] text-white">{signal.symbol}</span>
                        <Badge variant="outline" className="text-[8px] h-4 px-1 opacity-50">{signal.timeframe}m</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={cn(
                        "text-[9px] font-bold border-none",
                        signal.type === 'BUY' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                      )}>
                        {signal.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-[10px] text-white/70">
                      ${alertPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className={cn(
                        "font-mono text-[10px] font-bold",
                        latestPrice && alertPrice ? (
                          (signal.type === 'BUY' && latestPrice >= alertPrice) || (signal.type === 'SELL' && latestPrice <= alertPrice) 
                          ? "text-emerald-400" : "text-rose-400"
                        ) : "text-muted-foreground"
                      )}>
                        {latestPrice ? `$${latestPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "--"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                       <div className="text-emerald-400 font-bold text-[10px] font-mono">
                         {upsidePercent ? `+${upsidePercent}%` : "--"}
                       </div>
                       <div className="text-[8px] text-muted-foreground">
                         {signal.maxUpsidePrice ? `$${Number(signal.maxUpsidePrice).toFixed(2)}` : ""}
                       </div>
                    </TableCell>
                    <TableCell className="text-right">
                       <div className="text-rose-400 font-bold text-[10px] font-mono">
                         {drawdownPercent ? `${drawdownPercent}%` : "--"}
                       </div>
                       <div className="text-[8px] text-muted-foreground">
                         {signal.maxDrawdownPrice ? `$${Number(signal.maxDrawdownPrice).toFixed(2)}` : ""}
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
