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
import { Terminal, AlertCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useCollection, useUser, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, limit, orderBy, where } from "firebase/firestore";

interface SignalHistoryProps {
  onSignalSelect?: (signal: { symbol: string; timeframe?: string; exchange?: string }) => void;
}

const FILTERS = [
  { label: "All", value: null },
  { label: "1 min", value: "1" },
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

  if (error) {
    return (
      <div className="p-6 flex flex-col items-center text-center space-y-4">
        <div className="bg-destructive/10 p-3 rounded-full"><AlertCircle className="h-6 w-6 text-destructive" /></div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-white">Stream Sync Error</h3>
          <p className="text-[10px] text-muted-foreground leading-relaxed max-w-[200px] mx-auto">
            {error.message.includes("index") ? "Indexing required. Check F12 console." : error.message}
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
              <TableHead className="w-[80px] px-2 text-[10px] uppercase font-bold">Time</TableHead>
              <TableHead className="w-[100px] px-2 text-[10px] uppercase font-bold">Asset</TableHead>
              <TableHead className="w-[60px] px-1 text-[10px] uppercase font-bold text-center">Side</TableHead>
              <TableHead className="w-[80px] px-2 text-[10px] uppercase font-bold">TF</TableHead>
              <TableHead className="w-[100px] px-2 text-[10px] uppercase font-bold">Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (!signals || signals.length === 0) ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 animate-pulse text-[10px]">Syncing...</TableCell></TableRow>
            ) : !signals || signals.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-[10px] opacity-20">No signals found.</TableCell></TableRow>
            ) : (
              signals.map((signal) => {
                const data = parsePayload(signal.payload);
                
                // Resilient Price detection
                // 1. Try primary db field
                // 2. Try various payload keys if db field is null/undefined
                let displayPriceValue = signal.price;
                if (displayPriceValue === null || displayPriceValue === undefined) {
                  displayPriceValue = data?.price ?? data?.close ?? data?.price_at_alert ?? data?.last_price ?? data?.entry;
                }
                
                const displayTF = signal.timeframe || data?.timeframe || data?.interval || data?.tf;
                
                return (
                  <TableRow key={signal.id} className="transition-colors group border-border hover:bg-accent/5 cursor-pointer" onClick={() => handleRowClick(signal)}>
                    <TableCell className="text-[10px] font-mono py-3 px-2">
                      <div className="text-white font-medium">{getFormattedDate(signal.receivedAt)}</div>
                      <div className="text-muted-foreground opacity-50">{getFormattedDay(signal.receivedAt)}</div>
                    </TableCell>
                    <TableCell className="font-bold text-xs text-white px-2">{signal.symbol}</TableCell>
                    <TableCell className="px-1 text-center">
                      <Badge variant="outline" className={cn("text-[9px] uppercase font-bold border-none h-5 px-1.5", signal.type === 'BUY' ? 'text-emerald-400 bg-emerald-400/10' : 'text-rose-400 bg-rose-400/10')}>
                        {signal.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-2">
                      <div className="text-[10px] font-bold text-muted-foreground">{formatTimeframe(displayTF)}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs px-2 text-accent font-bold">
                      {displayPriceValue !== null && displayPriceValue !== undefined 
                        ? `$${Number(displayPriceValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}` 
                        : "--"}
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
