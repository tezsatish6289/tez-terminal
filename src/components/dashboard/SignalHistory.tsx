
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
import { Zap, Clock, Terminal, AlertCircle, Globe, Activity, Info, Tag } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useCollection, useUser, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, limit, orderBy } from "firebase/firestore";

export function SignalHistory() {
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
      limit(25)
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
              <TableHead className="w-[120px]">Time</TableHead>
              <TableHead className="w-[140px]">Asset</TableHead>
              <TableHead className="w-[100px]">Side</TableHead>
              <TableHead className="w-[120px]">Price</TableHead>
              <TableHead className="hidden md:table-cell">Signal Metadata</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (!signals || signals.length === 0) ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground animate-pulse">
                  Connecting to global signal node...
                </TableCell>
              </TableRow>
            ) : !signals || signals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
                  <Terminal className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-20" />
                  <p className="text-muted-foreground text-sm">Waiting for market signals...</p>
                </TableCell>
              </TableRow>
            ) : (
              signals.map((signal) => {
                const data = parsePayload(signal.payload);
                return (
                  <TableRow key={signal.id} className="transition-colors group border-border hover:bg-white/[0.02]">
                    <TableCell className="text-[11px] font-mono py-4">
                      <div className="text-white font-medium">{getFormattedDate(signal.receivedAt)}</div>
                      <div className="text-muted-foreground opacity-60">{getFormattedDay(signal.receivedAt)}</div>
                    </TableCell>
                    <TableCell className="font-bold text-sm text-white">
                      {signal.symbol}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-[10px] uppercase font-bold border-none h-6 px-3",
                          signal.type === 'BUY' ? 'text-emerald-400 bg-emerald-400/10' : 
                          signal.type === 'SELL' ? 'text-rose-400 bg-rose-400/10' : 
                          'text-accent bg-accent/10'
                        )}
                      >
                        {signal.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-white text-xs">
                      {signal.price ? (
                         <div className="flex items-center gap-1">
                           <Tag className="h-3 w-3 text-muted-foreground" />
                           {Number(signal.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                         </div>
                      ) : '--'}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-2 items-center">
                        {data?.exchange && (
                          <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded text-[10px] text-muted-foreground border border-white/5">
                            <Globe className="h-3 w-3" />
                            <span className="font-semibold text-white/80">{data.exchange}</span>
                          </div>
                        )}
                        {data?.timeframe && (
                          <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded text-[10px] text-muted-foreground border border-white/5">
                            <Activity className="h-3 w-3" />
                            <span className="font-semibold text-white/80">{data.timeframe}m</span>
                          </div>
                        )}
                        {data?.note && (
                          <div className="flex items-center gap-1 bg-white/5 px-2 py-1 rounded text-[10px] text-muted-foreground border border-white/5 max-w-[300px] truncate">
                            <Info className="h-3 w-3" />
                            <span className="italic truncate">{data.note}</span>
                          </div>
                        )}
                        {!data && (
                          <code className="text-[10px] text-muted-foreground/50 font-mono italic">
                            {signal.payload.substring(0, 50)}...
                          </code>
                        )}
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
