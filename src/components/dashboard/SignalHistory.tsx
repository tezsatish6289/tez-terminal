
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
import { Terminal, Globe, DollarSign, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useCollection, useUser, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, limit, orderBy } from "firebase/firestore";

interface SignalHistoryProps {
  onSignalSelect?: (signal: { symbol: string; timeframe?: string; exchange?: string }) => void;
}

export function SignalHistory({ onSignalSelect }: SignalHistoryProps) {
  const { user } = useUser();
  const firestore = useFirestore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const signalsQuery = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return query(
      collection(firestore, "signals"),
      orderBy("receivedAt", "desc"),
      limit(50)
    );
  }, [user, firestore]);

  const { data: signals, isLoading, error } = useCollection(signalsQuery);

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
    const upperTf = tf.toUpperCase();
    if (upperTf === 'D' || upperTf === '1D') return 'Daily';
    if (upperTf === 'W' || upperTf === '1W') return 'Weekly';
    if (upperTf === 'M' || upperTf === '1M') return 'Monthly';
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
      timeframe: data?.timeframe || "15",
      exchange: data?.exchange || "BINANCE"
    });
  };

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-xs">
        Sync error: {error.message}
      </div>
    );
  }

  return (
    <div className="w-full">
      <Table>
        <TableHeader className="bg-secondary/10 sticky top-0 z-10">
          <TableRow className="hover:bg-transparent border-border">
            <TableHead className="w-[80px] px-2 text-[10px] uppercase font-bold">Time</TableHead>
            <TableHead className="w-[100px] px-2 text-[10px] uppercase font-bold">Asset</TableHead>
            <TableHead className="w-[60px] px-1 text-[10px] uppercase font-bold text-center">Side</TableHead>
            <TableHead className="w-[80px] px-2 text-[10px] uppercase font-bold">Chart</TableHead>
            <TableHead className="w-[100px] px-2 text-[10px] uppercase font-bold">Price @ Alert</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (!signals || signals.length === 0) ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-8 text-muted-foreground animate-pulse text-[10px]">
                Connecting...
              </TableCell>
            </TableRow>
          ) : !signals || signals.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-12">
                <Terminal className="h-6 w-6 text-muted-foreground mx-auto mb-2 opacity-20" />
                <p className="text-muted-foreground text-[10px]">No signals yet...</p>
              </TableCell>
            </TableRow>
          ) : (
            signals.map((signal) => {
              const data = parsePayload(signal.payload);
              const displayPrice = signal.price ?? data?.price_at_alert;
              
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
                    {data?.timeframe ? (
                      <div className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">
                        {formatTimeframe(data.timeframe)}
                      </div>
                    ) : <span className="text-muted-foreground/20">--</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs px-2">
                    {displayPrice ? (
                       <span className="text-accent font-bold">
                         ${Number(displayPrice).toLocaleString(undefined, { 
                           minimumFractionDigits: 2, 
                           maximumFractionDigits: 4 
                         })}
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
  );
}
