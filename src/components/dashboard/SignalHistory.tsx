
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
import { Zap, Clock, Terminal, AlertCircle } from "lucide-react";
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

  // Listen to GLOBAL signals collection
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
      return !isNaN(date.getTime()) ? format(date, 'HH:mm:ss (MMM dd)') : receivedAt;
    } catch (e) {
      return receivedAt;
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
          <Clock className="h-4 w-4" />
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
              <TableHead className="w-[140px]">Time</TableHead>
              <TableHead className="w-[100px]">Asset</TableHead>
              <TableHead className="w-[80px]">Side</TableHead>
              <TableHead className="hidden md:table-cell">Raw Signal Payload</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (!signals || signals.length === 0) ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground animate-pulse">
                  Connecting to global signal node...
                </TableCell>
              </TableRow>
            ) : !signals || signals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12">
                  <Terminal className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-20" />
                  <p className="text-muted-foreground text-sm">Waiting for market signals...</p>
                </TableCell>
              </TableRow>
            ) : (
              signals.map((signal) => (
                <TableRow key={signal.id} className="transition-colors group border-border">
                  <TableCell className="text-[11px] font-mono text-muted-foreground">
                    {getFormattedDate(signal.receivedAt)}
                  </TableCell>
                  <TableCell className="font-bold text-sm">
                    {signal.symbol}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-[10px] uppercase font-bold border-none",
                        signal.type === 'BUY' ? 'text-emerald-400 bg-emerald-400/10' : 
                        signal.type === 'SELL' ? 'text-rose-400 bg-rose-400/10' : 
                        'text-accent bg-accent/10'
                      )}
                    >
                      {signal.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="bg-background/40 rounded p-1.5 border border-border/30 overflow-hidden">
                      <code className="text-[10px] text-muted-foreground truncate block font-mono">
                        {signal.payload}
                      </code>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
