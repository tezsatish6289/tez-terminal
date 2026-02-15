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
import { Button } from "@/components/ui/button";
import { Terminal, Clock, AlertCircle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useCollection, useUser, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, limit, orderBy, where } from "firebase/firestore";

interface SignalHistoryProps {
  onSignalSelect?: (signal: { symbol: string; timeframe?: string; exchange?: string }) => void;
}

// These values MUST match the normalized output of the API engine exactly
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
    
    // Querying by timeframe requires a Firestore Composite Index
    if (activeFilter) {
      return query(
        baseQuery,
        where("timeframe", "==", activeFilter),
        orderBy("receivedAt", "desc"),
        limit(50)
      );
    }

    return query(
      baseQuery,
      orderBy("receivedAt", "desc"),
      limit(50)
    );
  }, [user, firestore, activeFilter]);

  const { data: signals, isLoading: isCollectionLoading, error } = useCollection(signalsQuery);

  const isLoading = isUserLoading || isCollectionLoading;

  const getFormattedDate = (receivedAt: string) => {
    if (!mounted) return "...";
    try {
      const date = new Date(receivedAt);
      return !isNaN(date.getTime()) ? format(date, 'HH:mm:ss') : receivedAt;
    } catch (e) {
      return receivedAt;
    }
  };

  const getFormattedDay = (receivedAt: string) => {
    if (!mounted) return "";
    try {
      const date = new Date(receivedAt);
      return !isNaN(date.getTime()) ? format(date, '(MMM dd)') : "";
    } catch (e) {
      return "";
    }
  };

  const formatTimeframe = (tf: string) => {
    if (!tf) return "--";
    const upperTf = tf.toString().toUpperCase();
    if (upperTf === 'D' || upperTf === '1D') return 'Daily';
    if (upperTf === 'W' || upperTf === '1W') return 'Weekly';
    if (upperTf === '60' || upperTf === '1H') return '1 hour';
    if (upperTf === '240' || upperTf === '4H') return '4 hours';
    if (/^\d+$/.test(tf)) return `${tf} min`;
    return tf;
  };

  const parsePayload = (payload: string) => {
    try {
      return JSON.parse(payload);
    } catch (e) {
      return null;
    }
  };

  const handleRowClick = (signal: any) => {
    if (!onSignalSelect) return;
    const data = parsePayload(signal.payload);
    onSignalSelect({
      symbol: signal.symbol,
      timeframe: signal.timeframe || data?.timeframe || "15",
      exchange: data?.exchange || "BINANCE"
    });
  };

  if (error) {
    return (
      <div className="p-6 flex flex-col items-center text-center space-y-4">
        <div className="bg-destructive/10 p-3 rounded-full">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-white">Stream Sync Error</h3>
          <p className="text-[10px] text-muted-foreground leading-relaxed max-w-[200px] mx-auto">
            {error.message.includes("index") 
              ? "This filter requires a Firestore Index. Check your browser console (F12) for the activation link."
              : `Connection error: ${error.message}`}
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full">
           <Button 
            variant="outline" 
            size="sm" 
            className="h-8 text-[10px]" 
            onClick={() => {
              setActiveFilter(null);
            }}
          >
            Clear Filter
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 text-[10px]" 
            onClick={() => window.location.reload()}
          >
            Reload Terminal
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col h-full">
      <div className="px-4 py-3 bg-background/20 border-b border-border flex items-center gap-1 overflow-x-auto no-scrollbar">
        {FILTERS.map((filter) => (
          <Button
            key={filter.label}
            variant="ghost"
            size="sm"
            onClick={() => setActiveFilter(filter.value)}
            disabled={isLoading && activeFilter !== filter.value}
            className={cn(
              "h-7 px-2.5 text-[10px] font-bold rounded-md transition-all whitespace-nowrap",
              activeFilter === filter.value 
                ? "bg-accent text-accent-foreground shadow-sm" 
                : "text-muted-foreground hover:bg-secondary hover:text-white"
            )}
          >
            {filter.label}
          </Button>
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
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground animate-pulse text-[10px]">
                  Syncing Idea Stream...
                </TableCell>
              </TableRow>
            ) : !signals || signals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
                  <Terminal className="h-6 w-6 text-muted-foreground mx-auto mb-2 opacity-20" />
                  <p className="text-muted-foreground text-[10px]">
                    {activeFilter ? `No "${formatTimeframe(activeFilter)}" signals found...` : "No signals yet..."}
                  </p>
                  {activeFilter && (
                    <Button 
                      variant="link" 
                      size="sm" 
                      className="text-[9px] text-accent mt-2"
                      onClick={() => setActiveFilter(null)}
                    >
                      Show all timeframes
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              signals.map((signal) => {
                const data = parsePayload(signal.payload);
                const displayPrice = signal.price ?? data?.price_at_alert;
                const displayTF = signal.timeframe;
                
                return (
                  <TableRow 
                    key={signal.id} 
                    className="transition-colors group border-border hover:bg-accent/5 cursor-pointer"
                    onClick={() => handleRowClick(signal)}
                  >
                    <TableCell className="text-[10px] font-mono py-3 px-2">
                      <div className="text-white font-medium">{getFormattedDate(signal.receivedAt)}</div>
                      <div className="text-muted-foreground opacity-50">{getFormattedDay(signal.receivedAt)}</div>
                    </TableCell>
                    <TableCell className="font-bold text-xs text-white px-2">
                      {signal.symbol}
                    </TableCell>
                    <TableCell className="px-1 text-center">
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-[9px] uppercase font-bold border-none h-5 px-1.5",
                          signal.type === 'BUY' ? 'text-emerald-400 bg-emerald-400/10' : 
                          signal.type === 'SELL' ? 'text-rose-400 bg-rose-400/10' : 
                          'text-accent bg-accent/10'
                        )}
                      >
                        {signal.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-2">
                      <div className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">
                        {formatTimeframe(displayTF)}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs px-2">
                      {displayPrice ? (
                         <span className="text-accent font-bold">
                           ${Number(displayPrice).toLocaleString()}
                         </span>
                      ) : (
                        <span className="text-muted-foreground/30">--</span>
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