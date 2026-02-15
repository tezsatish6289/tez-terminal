
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
import { Zap, Terminal, AlertCircle, Globe, Activity, DollarSign, ExternalLink } from "lucide-react";
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-semibold tracking-tight">Antigravity Signal Stream</h2>
        </div>
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          {isLoading ? 'Syncing...' : 'Live Connected'}
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 p-3 rounded-lg flex items-center gap-3 text-destructive text-sm">
          <AlertCircle className="h-4 w-4" />
          <span>Sync error: {error.message}</span>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-secondary/30">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="w-[90px]">Time</TableHead>
              <TableHead className="w-[110px]">Asset</TableHead>
              <TableHead className="w-[70px] px-1">Side</TableHead>
              <TableHead className="w-[80px]">Chart</TableHead>
              <TableHead className="w-[100px]">Exchange</TableHead>
              <TableHead className="text-accent font-bold">Price @ Alert</TableHead>
              <TableHead className="w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (!signals || signals.length === 0) ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground animate-pulse">
                  Connecting to global signal node...
                </TableCell>
              </TableRow>
            ) : !signals || signals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <Terminal className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-20" />
                  <p className="text-muted-foreground text-sm">Waiting for market signals...</p>
                </TableCell>
              </TableRow>
            ) : (
              signals.map((signal) => {
                const data = parsePayload(signal.payload);
                const displayPrice = signal.price ?? data?.price_at_alert;
                
                return (
                  <TableRow 
                    key={signal.id} 
                    className="transition-colors group border-border hover:bg-white/[0.04] cursor-pointer"
                    onClick={() => handleRowClick(signal)}
                  >
                    <TableCell className="text-[10px] font-mono py-4">
                      <div className="text-white font-medium">{getFormattedDate(signal.receivedAt)}</div>
                      <div className="text-muted-foreground opacity-50">{getFormattedDay(signal.receivedAt)}</div>
                    </TableCell>
                    <TableCell className="font-bold text-sm text-white pr-0">
                      {signal.symbol}
                    </TableCell>
                    <TableCell className="px-1">
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-[9px] uppercase font-bold border-none h-5 px-2",
                          signal.type === 'BUY' ? 'text-emerald-400 bg-emerald-400/10' : 
                          signal.type === 'SELL' ? 'text-rose-400 bg-rose-400/10' : 
                          'text-accent bg-accent/10'
                        )}
                      >
                        {signal.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {data?.timeframe ? (
                        <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
                          <Activity className="h-3 w-3 opacity-50" />
                          {data.timeframe}m
                        </div>
                      ) : <span className="text-muted-foreground/20">--</span>}
                    </TableCell>
                    <TableCell>
                      {data?.exchange ? (
                        <div className="flex items-center gap-1 text-[10px] font-semibold text-white/70">
                          <Globe className="h-3 w-3 opacity-50" />
                          {data.exchange}
                        </div>
                      ) : <span className="text-muted-foreground/20">--</span>}
                    </TableCell>
                    <TableCell className="font-mono text-white text-xs">
                      {displayPrice ? (
                         <div className="flex items-center gap-1 bg-accent/5 px-2 py-1 rounded border border-accent/10 w-fit">
                           <DollarSign className="h-3 w-3 text-accent" />
                           <span className="font-bold text-accent/90">
                             {Number(displayPrice).toLocaleString(undefined, { 
                               minimumFractionDigits: 2, 
                               maximumFractionDigits: 6 
                             })}
                           </span>
                         </div>
                      ) : (
                        <span className="text-muted-foreground/30">--</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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
