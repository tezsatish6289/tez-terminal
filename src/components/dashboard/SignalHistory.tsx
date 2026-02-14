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
import { Zap, Clock, Terminal, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useCollection, useUser, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, limit } from "firebase/firestore";

export function SignalHistory() {
  const { user } = useUser();
  const firestore = useFirestore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const eventsQuery = useMemoFirebase(() => {
    if (!user || !firestore) return null;
    return query(
      collection(firestore, "users", user.uid, "webhookEvents"),
      limit(20)
    );
  }, [user, firestore]);

  const { data: rawSignals, isLoading, error } = useCollection(eventsQuery);

  // Client-side sort to ensure newest signals appear first without requiring a server-side index
  const signals = useMemo(() => {
    if (!rawSignals) return null;
    return [...rawSignals].sort((a, b) => {
      const dateA = new Date(a.receivedAt).getTime();
      const dateB = new Date(b.receivedAt).getTime();
      return dateB - dateA;
    });
  }, [rawSignals]);

  const getFormattedDate = (receivedAt: string) => {
    if (!mounted) return "...";
    try {
      const date = new Date(receivedAt);
      return !isNaN(date.getTime()) ? format(date, 'MMM dd, HH:mm:ss') : receivedAt;
    } catch (e) {
      return receivedAt;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-semibold tracking-tight">Real-time Signal Stream</h2>
        </div>
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Clock className="h-4 w-4" />
          {isLoading ? 'Syncing...' : 'Live Connected'}
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 p-3 rounded-lg flex items-center gap-3 text-destructive text-sm">
          <AlertCircle className="h-4 w-4" />
          <span>Error loading signals: {error.message}</span>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-secondary/30">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="w-[150px]">Time Received</TableHead>
              <TableHead>Source IP</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="max-w-[400px]">Payload Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (!signals || signals.length === 0) ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground animate-pulse">
                  Connecting to signal bridge...
                </TableCell>
              </TableRow>
            ) : !signals || signals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-12">
                  <Terminal className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-20" />
                  <p className="text-muted-foreground text-sm">No signals received yet. Send a test signal from the Webhooks page.</p>
                </TableCell>
              </TableRow>
            ) : (
              signals.map((signal) => (
                <TableRow key={signal.id} className="transition-colors group border-border">
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {getFormattedDate(signal.receivedAt)}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-mono text-foreground">{signal.sourceIp}</span>
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-[10px] uppercase font-bold",
                        signal.processingStatus === 'PROCESSED' ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5' : 
                        'border-accent/30 text-accent bg-accent/5'
                      )}
                    >
                      {signal.processingStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[400px]">
                    <div className="bg-background/50 rounded p-2 border border-border/50 overflow-hidden">
                      <code className="text-[10px] text-accent truncate block font-mono">
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
