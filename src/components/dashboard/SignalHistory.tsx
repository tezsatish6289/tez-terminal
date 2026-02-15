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
import { AlertCircle, Loader2, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useCollection, useUser, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, limit, orderBy, where } from "firebase/firestore";

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

export function SignalHistory({ onSignalSelect }: SignalHistoryProps) {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [mounted, setMounted] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [latestPrices, setLatestPrices] = useState<Record<string, number>>({});

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

  // Poll our internal Server Proxy for latest prices
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const response = await fetch('/api/prices');
        if (response.ok) {
          const priceMap = await response.json();
          setLatestPrices(priceMap);
        }
      } catch (e) {
        // Silently fail, UI will show "Live..." or "Syncing"
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const isLoading = isUserLoading || isCollectionLoading;

  const getFormattedDate = (receivedAt: string) => {
    if (!mounted) return "...";
    try {
      const date = new Date(receivedAt);
      return !isNaN(date.getTime()) ? format(date, 'HH:mm:ss') : receivedAt;
    } catch (e) { return receivedAt; }
  };

  const getFormattedDay = (receivedAt: string) => {
    if (!mounted) return "";
    try {
      const date = new Date(receivedAt);
      return !isNaN(date.getTime()) ? format(date, '(MMM dd)') : "";
    } catch (e) { return ""; }
  };

  const formatTimeframe = (tf: string) => {
    if (!tf) return "--";
    const upperTf = tf.toString().toUpperCase();
    if (upperTf === 'D' || upperTf === '1D') return 'Daily';
    if (upperTf === '60' || upperTf === '1H') return '1 hour';
    if (upperTf === '240' || upperTf === '4H') return '4 hours';
    if (/^\d+$/.test(tf)) return `${tf} min`;
    return tf;
  };

  const parsePayload = (payload: string) => {
    try { return JSON.parse(payload); } catch (e) { return null; }
  };

  const handleRowClick = (signal: any) => {
    if (!onSignalSelect) return;
    const data = parsePayload(signal.payload);
    onSignalSelect({
      symbol: signal.symbol,
      timeframe: signal.timeframe || data?.timeframe || data?.interval || "15",
      exchange: data?.exchange || "BINANCE"
    });
  };

  // Robust symbol cleaning for Binance matching (e.g. BINANCE:BTC/USDT -> BTCUSDT)
  const resolveBinanceSymbol = (rawSymbol: string) => {
    if (!rawSymbol) return "";
    const clean = rawSymbol.split(':').pop()?.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() || "";
    return clean;
  };

  if (error) {
    return (
      <div className="p-6 flex flex-col items-center text-center space-y-4">
        <div className="bg-destructive/10 p-3 rounded-full"><AlertCircle className="h-6 w-6 text-destructive" /></div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-white">Stream Sync Error</h3>
          <p className="text-[10px] text-muted-foreground leading-relaxed max-w-[200px] mx-auto">
            {error.message}
          </p>
        </div>
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
        {isLoading && <Loader2 className="h-3 w-3 animate-spin text-accent ml-auto shrink-0" />}
      </div>

      <div className="flex-1 overflow-y-auto">
        <Table>
          <TableHeader className="bg-secondary/10 sticky top-0 z-10">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="w-[80px] px-2 text-[10px] uppercase font-bold text-accent/80">Alert Time</TableHead>
              <TableHead className="w-[100px] px-2 text-[10px] uppercase font-bold text-accent/80">Asset Name</TableHead>
              <TableHead className="w-[70px] px-2 text-[10px] uppercase font-bold text-center text-accent/80">Chart</TableHead>
              <TableHead className="w-[50px] px-1 text-[10px] uppercase font-bold text-center text-accent/80">Side</TableHead>
              <TableHead className="w-[80px] px-2 text-[10px] uppercase font-bold text-right text-accent/80">Alert Price</TableHead>
              <TableHead className="w-[80px] px-2 text-[10px] uppercase font-bold text-right text-accent/80">Latest Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (!signals || signals.length === 0) ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 animate-pulse text-[10px]">Syncing Terminal...</TableCell></TableRow>
            ) : !signals || signals.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-[10px] opacity-20">No active signals.</TableCell></TableRow>
            ) : (
              signals.map((signal) => {
                const data = parsePayload(signal.payload);
                
                let alertPriceValue = signal.price;
                if (!alertPriceValue) {
                  alertPriceValue = data?.price ?? data?.close ?? data?.price_at_alert ?? data?.last_price ?? data?.entry;
                }
                
                const cleanSym = resolveBinanceSymbol(signal.symbol);
                const latestPrice = latestPrices[cleanSym];
                const isBuy = signal.type === 'BUY';
                
                let priceColorClass = "text-muted-foreground";
                if (latestPrice && alertPriceValue) {
                  const alertPriceNum = Number(alertPriceValue);
                  if (isBuy) {
                    priceColorClass = latestPrice >= alertPriceNum ? "text-emerald-400" : "text-rose-400";
                  } else {
                    priceColorClass = latestPrice <= alertPriceNum ? "text-emerald-400" : "text-rose-400";
                  }
                }

                return (
                  <TableRow key={signal.id} className="transition-colors group border-border hover:bg-accent/5 cursor-pointer" onClick={() => handleRowClick(signal)}>
                    <TableCell className="text-[10px] font-mono py-3 px-2">
                      <div className="text-white font-medium">{getFormattedDate(signal.receivedAt)}</div>
                      <div className="text-muted-foreground opacity-50">{getFormattedDay(signal.receivedAt)}</div>
                    </TableCell>
                    <TableCell className="px-2">
                      <div className="font-bold text-xs text-white truncate max-w-[80px]">{signal.symbol}</div>
                    </TableCell>
                    <TableCell className="px-2 text-center">
                      <div className="text-[9px] text-muted-foreground font-medium uppercase">{formatTimeframe(signal.timeframe)}</div>
                    </TableCell>
                    <TableCell className="px-1 text-center">
                      <Badge variant="outline" className={cn("text-[9px] uppercase font-bold border-none h-5 px-1.5", signal.type === 'BUY' ? 'text-emerald-400 bg-emerald-400/10' : 'text-rose-400 bg-rose-400/10')}>
                        {signal.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] px-2 text-white/70 font-semibold text-right">
                      {alertPriceValue ? `$${Number(alertPriceValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}` : "--"}
                    </TableCell>
                    <TableCell className={cn("font-mono text-[11px] px-2 font-bold text-right", priceColorClass)}>
                      {latestPrice ? (
                        <div className="flex flex-col items-end">
                          <span>${latestPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</span>
                          <div className="flex items-center gap-0.5 text-[8px] opacity-80">
                            {priceColorClass === "text-emerald-400" ? <ArrowUpRight className="h-2 w-2" /> : <ArrowDownRight className="h-2 w-2" />}
                            {alertPriceValue ? `${((Math.abs(latestPrice - Number(alertPriceValue)) / Number(alertPriceValue)) * 100).toFixed(2)}%` : ""}
                          </div>
                        </div>
                      ) : (
                        <span className="opacity-20 animate-pulse">Live...</span>
                      )}
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
