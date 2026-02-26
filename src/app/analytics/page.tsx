"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, limit } from "firebase/firestore";
import { 
  TrendingUp, 
  TrendingDown, 
  BarChart3, 
  Loader2, 
  History,
  ArrowUpRight,
  ArrowDownRight,
  Archive
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMemo } from "react";

/**
 * Closed Performance Analytics Page.
 * Focus: Retrospective analysis of signals that have hit Stop Loss or been retired.
 */
export default function AnalyticsPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const signalsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "signals"), 
      orderBy("receivedAt", "desc"), 
      limit(500)
    );
  }, [user, firestore]);

  const { data: allSignals, isLoading } = useCollection(signalsQuery);

  const calculatePercent = (exit: number | undefined, entry: number, type: string) => {
    if (exit == null || entry == null || entry === 0) return 0;
    const diff = type === 'BUY' ? exit - entry : entry - exit;
    return (diff / entry) * 100;
  };

  const median = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  const hasUpsideData = (s: { maxUpsidePrice?: number | null }) =>
    s.maxUpsidePrice != null && s.maxUpsidePrice !== undefined;
  const hasDownsideData = (s: { maxDrawdownPrice?: number | null }) =>
    s.maxDrawdownPrice != null && s.maxDrawdownPrice !== undefined;

  const closedSignals = useMemo(() => {
    if (!allSignals) return [];
    return allSignals.filter(s => s.status === "INACTIVE");
  }, [allSignals]);

  const sideStats = useMemo(() => {
    const bullish = closedSignals.filter(s => s.type === "BUY");
    const bearish = closedSignals.filter(s => s.type === "SELL");

    const computeUpsideStats = (signals: typeof closedSignals) => {
      const withUpside = signals.filter(hasUpsideData);
      if (withUpside.length === 0) return { count: 0, max: 0, median: 0, avg: 0 };
      const values = withUpside.map(s => calculatePercent(s.maxUpsidePrice, s.price, s.type));
      return {
        count: withUpside.length,
        max: Math.max(...values),
        median: median(values),
        avg: values.reduce((a, b) => a + b, 0) / values.length
      };
    };
    const computeDownsideStats = (signals: typeof closedSignals) => {
      const withDownside = signals.filter(hasDownsideData);
      if (withDownside.length === 0) return { count: 0, max: 0, median: 0, avg: 0 };
      const values = withDownside.map(s => calculatePercent(s.maxDrawdownPrice, s.price, s.type));
      return {
        count: withDownside.length,
        max: Math.min(...values),
        median: median(values),
        avg: values.reduce((a, b) => a + b, 0) / values.length
      };
    };

    return {
      bullish: {
        count: bullish.length,
        profit: computeUpsideStats(bullish),
        loss: computeDownsideStats(bullish)
      },
      bearish: {
        count: bearish.length,
        profit: computeUpsideStats(bearish),
        loss: computeDownsideStats(bearish)
      }
    };
  }, [closedSignals]);

  const formatPrice = (p: number | null | undefined) => {
    if (p === null || p === undefined) return "--";
    const decimals = p < 1 ? 6 : 2;
    return p.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  if (isUserLoading || (isLoading && !allSignals)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <TopBar />
      
      <main className="flex-1 overflow-y-auto p-6 space-y-8">
        <header className="flex flex-col gap-2">
           <div className="flex items-center gap-3">
              <div className="bg-primary/20 p-2 rounded-xl border border-white/5"><BarChart3 className="h-6 w-6 text-accent" /></div>
              <h1 className="text-3xl font-black text-white tracking-tighter uppercase">Closed Performance Node</h1>
           </div>
           <p className="text-muted-foreground text-sm max-w-2xl">
             Quantitative review of signals retired from the live idea stream. Tracks win rate and execution accuracy for Inactive signals.
           </p>
        </header>

        {/* Bullish / Bearish sections — in-trade excursion stats (signals without data excluded) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Bullish (BUY) */}
          <Card className="bg-card/50 border-white/5 shadow-xl border-emerald-500/20">
            <CardHeader className="pb-3 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-500/20 p-2 rounded-xl"><TrendingUp className="h-5 w-5 text-emerald-400" /></div>
                  <div>
                    <CardTitle className="text-lg font-black text-white uppercase tracking-tighter">Bullish</CardTitle>
                    <CardDescription className="text-[10px] font-bold text-muted-foreground uppercase">BUY · In-trade max upside / max downside</CardDescription>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black font-mono text-white">{sideStats.bullish.count}</div>
                  <div className="text-[10px] font-bold text-accent uppercase">Retired Trades</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Max profit</div>
                  <div className={cn("text-xl font-black font-mono", sideStats.bullish.profit.max >= 0 ? "text-emerald-400" : "text-white")}>
                    {sideStats.bullish.profit.count ? `${sideStats.bullish.profit.max >= 0 ? '+' : ''}${sideStats.bullish.profit.max.toFixed(2)}%` : "--"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Median profit</div>
                  <div className={cn("text-xl font-black font-mono", sideStats.bullish.profit.median >= 0 ? "text-emerald-400" : "text-white")}>
                    {sideStats.bullish.profit.count ? `${sideStats.bullish.profit.median >= 0 ? '+' : ''}${sideStats.bullish.profit.median.toFixed(2)}%` : "--"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Avg profit</div>
                  <div className={cn("text-xl font-black font-mono", sideStats.bullish.profit.avg >= 0 ? "text-emerald-400" : "text-white")}>
                    {sideStats.bullish.profit.count ? `${sideStats.bullish.profit.avg >= 0 ? '+' : ''}${sideStats.bullish.profit.avg.toFixed(2)}%` : "--"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Max loss</div>
                  <div className="text-xl font-black font-mono text-rose-400">
                    {sideStats.bullish.loss.count ? `${sideStats.bullish.loss.max.toFixed(2)}%` : "--"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Median loss</div>
                  <div className="text-xl font-black font-mono text-rose-400">
                    {sideStats.bullish.loss.count ? `${sideStats.bullish.loss.median.toFixed(2)}%` : "--"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Avg loss</div>
                  <div className="text-xl font-black font-mono text-rose-400">
                    {sideStats.bullish.loss.count ? `${sideStats.bullish.loss.avg.toFixed(2)}%` : "--"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bearish (SELL) */}
          <Card className="bg-card/50 border-white/5 shadow-xl border-rose-500/20">
            <CardHeader className="pb-3 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-rose-500/20 p-2 rounded-xl"><TrendingDown className="h-5 w-5 text-rose-400" /></div>
                  <div>
                    <CardTitle className="text-lg font-black text-white uppercase tracking-tighter">Bearish</CardTitle>
                    <CardDescription className="text-[10px] font-bold text-muted-foreground uppercase">SELL · In-trade max upside / max downside</CardDescription>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-black font-mono text-white">{sideStats.bearish.count}</div>
                  <div className="text-[10px] font-bold text-accent uppercase">Retired Trades</div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Max profit</div>
                  <div className={cn("text-xl font-black font-mono", sideStats.bearish.profit.max >= 0 ? "text-emerald-400" : "text-white")}>
                    {sideStats.bearish.profit.count ? `${sideStats.bearish.profit.max >= 0 ? '+' : ''}${sideStats.bearish.profit.max.toFixed(2)}%` : "--"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Median profit</div>
                  <div className={cn("text-xl font-black font-mono", sideStats.bearish.profit.median >= 0 ? "text-emerald-400" : "text-white")}>
                    {sideStats.bearish.profit.count ? `${sideStats.bearish.profit.median >= 0 ? '+' : ''}${sideStats.bearish.profit.median.toFixed(2)}%` : "--"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Avg profit</div>
                  <div className={cn("text-xl font-black font-mono", sideStats.bearish.profit.avg >= 0 ? "text-emerald-400" : "text-white")}>
                    {sideStats.bearish.profit.count ? `${sideStats.bearish.profit.avg >= 0 ? '+' : ''}${sideStats.bearish.profit.avg.toFixed(2)}%` : "--"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Max loss</div>
                  <div className="text-xl font-black font-mono text-rose-400">
                    {sideStats.bearish.loss.count ? `${sideStats.bearish.loss.max.toFixed(2)}%` : "--"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Median loss</div>
                  <div className="text-xl font-black font-mono text-rose-400">
                    {sideStats.bearish.loss.count ? `${sideStats.bearish.loss.median.toFixed(2)}%` : "--"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">Avg loss</div>
                  <div className="text-xl font-black font-mono text-rose-400">
                    {sideStats.bearish.loss.count ? `${sideStats.bearish.loss.avg.toFixed(2)}%` : "--"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card border-white/5 overflow-hidden">
          <CardHeader className="bg-white/[0.02] border-b border-white/5">
            <div className="flex items-center justify-between">
               <div className="space-y-1">
                  <CardTitle className="text-sm uppercase tracking-widest text-white">Closed Ideas Audit</CardTitle>
                  <CardDescription className="text-[10px] font-bold">Comprehensive trade log for retired setups</CardDescription>
               </div>
               <Badge variant="outline" className="border-white/10 text-muted-foreground bg-white/5">
                 <History className="h-3 w-3 mr-2" /> DATA LOADED: {closedSignals.length}
               </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="min-w-[1000px]">
              <Table>
                <TableHeader className="bg-black/20">
                  <TableRow className="hover:bg-transparent border-white/5">
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Symbol</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Side</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Entry</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Exit Price</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">SL</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Net PNL</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Max Excursion</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 text-right">Date Closed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closedSignals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-64 text-center">
                        <div className="flex flex-col items-center gap-4 opacity-40">
                           <Archive className="h-12 w-12 text-muted-foreground" />
                           <div className="space-y-1">
                              <p className="text-xs font-bold uppercase tracking-widest text-white">No Inactive Signals Detected</p>
                              <p className="text-[10px] text-muted-foreground max-w-xs mx-auto">
                                Signals only appear here once they hit their **Stop Loss** level or are retired. All currently active ideas are visible in the main terminal.
                              </p>
                           </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    closedSignals.map((signal) => {
                      const pnl = calculatePercent(signal.currentPrice, signal.price, signal.type);
                      const maxUp = calculatePercent(signal.maxUpsidePrice, signal.price, signal.type);
                      const maxDown = calculatePercent(signal.maxDrawdownPrice, signal.price, signal.type);

                      return (
                        <TableRow key={signal.id} className="border-white/5 hover:bg-white/[0.02] transition-colors group">
                          <TableCell className="py-4">
                            <div className="flex flex-col">
                               <span className="text-sm font-black text-white leading-none uppercase tracking-tighter mb-1">{signal.symbol}</span>
                               <span className="text-[9px] font-bold text-muted-foreground uppercase">{signal.timeframe}m Terminal</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn("text-[9px] font-black h-5 uppercase px-2", signal.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400')}>
                              {signal.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs font-bold text-white/60">${formatPrice(signal.price)}</TableCell>
                          <TableCell className="font-mono text-xs font-bold text-white">${formatPrice(signal.currentPrice)}</TableCell>
                          <TableCell className="font-mono text-xs font-bold text-amber-400/90">{signal.stopLoss != null && signal.stopLoss > 0 ? `$${formatPrice(signal.stopLoss)}` : "--"}</TableCell>
                          <TableCell>
                            <div className={cn("flex items-center gap-1.5 font-mono text-xs font-black", pnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                               {pnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                               {pnl.toFixed(2)}%
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-4">
                               <div className="flex items-center gap-1 font-mono text-xs font-bold text-emerald-400">
                                  <ArrowUpRight className="h-3 w-3" /> {maxUp.toFixed(1)}%
                               </div>
                               <div className="flex items-center gap-1 font-mono text-xs font-bold text-rose-400">
                                  <ArrowDownRight className="h-3 w-3" /> {maxDown.toFixed(1)}%
                               </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                             <div className="flex flex-col items-end">
                                <span className="text-[10px] font-mono font-bold text-white/40">{format(new Date(signal.receivedAt), 'yyyy-MM-dd')}</span>
                                <span className="text-[10px] font-mono font-bold text-accent/40">{format(new Date(signal.receivedAt), 'HH:mm')}</span>
                             </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
