
"use client";

import { useState, useEffect } from "react";
import { MOCK_SIGNALS } from "@/app/lib/mock-data";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Zap, Clock, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export function SignalHistory() {
  const [formattedDates, setFormattedDates] = useState<Record<string, string>>({});

  useEffect(() => {
    const dates: Record<string, string> = {};
    MOCK_SIGNALS.forEach(s => {
      dates[s.id] = format(new Date(s.timestamp), 'MMM dd, HH:mm:ss');
    });
    setFormattedDates(dates);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-semibold tracking-tight">Webhook Signal History</h2>
        </div>
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Last updated: Just now
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-secondary/30">
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="w-[150px]">Pair</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Entry / Targets</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Time Received</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MOCK_SIGNALS.map((signal) => (
              <TableRow key={signal.id} className="cursor-pointer transition-colors group border-border">
                <TableCell className="font-bold">
                  <div className="flex items-center gap-2">
                    {signal.symbol}
                    <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </TableCell>
                <TableCell>
                  <Badge 
                    variant={signal.type === 'BUY' ? 'default' : 'destructive'} 
                    className={signal.type === 'BUY' ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border-rose-500/20'}
                  >
                    {signal.type}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between w-32">
                      <span className="text-muted-foreground">Entry:</span>
                      <span className="font-mono text-foreground">{signal.entry.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between w-32">
                      <span className="text-muted-foreground">TP:</span>
                      <span className="font-mono text-emerald-400">{signal.tp.toLocaleString()}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground font-medium">{signal.source}</span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {formattedDates[signal.id] || '...'}
                </TableCell>
                <TableCell className="text-right">
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-[10px] uppercase font-bold",
                      signal.status === 'active' ? 'border-accent/30 text-accent bg-accent/5' : 
                      signal.status === 'hit' ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5' : 
                      'border-muted/30 text-muted-foreground bg-muted/5'
                    )}
                  >
                    {signal.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
