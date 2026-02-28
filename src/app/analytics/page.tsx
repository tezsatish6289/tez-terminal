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
  Archive,
  Filter,
  Layers
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMemo, useState } from "react";
import { getLeverage, getLeverageLabel } from "@/lib/leverage";

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

  const didHit2x = (signal: any): boolean => {
    const sl = signal.originalStopLoss ?? signal.stopLoss;
    if (!sl || !signal.maxUpsidePrice) return false;
    const risk = Math.abs(signal.price - sl);
    if (risk === 0) return false;
    const target = signal.type === "BUY" ? signal.price + 2 * risk : signal.price - 2 * risk;
    return signal.type === "BUY" ? signal.maxUpsidePrice >= target : signal.maxUpsidePrice <= target;
  };

  const effectivePnl = (signal: any): number => {
    const raw = calculatePercent(signal.currentPrice, signal.price, signal.type);
    if (raw >= 0) return raw;
    return didHit2x(signal) ? 0 : raw;
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

  type FilterMode = "all" | "aligned" | "non-aligned";
  const [filterMode, setFilterMode] = useState<FilterMode>("all");

  const closedSignals = useMemo(() => {
    if (!allSignals) return [];
    return allSignals.filter(s => s.status === "INACTIVE");
  }, [allSignals]);

  const alignedCount = useMemo(() => closedSignals.filter(s => s.aligned === true).length, [closedSignals]);

  const filteredClosedSignals = useMemo(() => {
    if (filterMode === "aligned") return closedSignals.filter(s => s.aligned === true);
    if (filterMode === "non-aligned") return closedSignals.filter(s => s.aligned === false);
    return closedSignals;
  }, [closedSignals, filterMode]);

  const computeExcursionStats = (signals: typeof closedSignals) => {
    const computeUpsideStats = (sigs: typeof closedSignals) => {
      const withUpside = sigs.filter(hasUpsideData);
      if (withUpside.length === 0) return { count: 0, max: 0, median: 0, avg: 0 };
      const values = withUpside.map(s => calculatePercent(s.maxUpsidePrice, s.price, s.type) * getLeverage(s.timeframe));
      return {
        count: withUpside.length,
        max: Math.max(...values),
        median: median(values),
        avg: values.reduce((a, b) => a + b, 0) / values.length
      };
    };
    const computeDownsideStats = (sigs: typeof closedSignals) => {
      const withDownside = sigs.filter(hasDownsideData);
      if (withDownside.length === 0) return { count: 0, max: 0, median: 0, avg: 0 };
      const values = withDownside.map(s => calculatePercent(s.maxDrawdownPrice, s.price, s.type) * getLeverage(s.timeframe));
      return {
        count: withDownside.length,
        max: Math.min(...values),
        median: median(values),
        avg: values.reduce((a, b) => a + b, 0) / values.length
      };
    };
    const bullish = signals.filter(s => s.type === "BUY");
    const bearish = signals.filter(s => s.type === "SELL");
    return {
      bullish: { count: bullish.length, profit: computeUpsideStats(bullish), loss: computeDownsideStats(bullish) },
      bearish: { count: bearish.length, profit: computeUpsideStats(bearish), loss: computeDownsideStats(bearish) },
    };
  };

  const allStats = useMemo(() => computeExcursionStats(closedSignals), [closedSignals]);
  const alignedStats = useMemo(() => computeExcursionStats(closedSignals.filter(s => s.aligned === true)), [closedSignals]);
  const sideStats = useMemo(() => computeExcursionStats(filteredClosedSignals), [filteredClosedSignals]);

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
        <header className="flex flex-col gap-4">
           <div className="flex items-start justify-between gap-4">
             <div className="space-y-2">
               <div className="flex items-center gap-3">
                 <div className="bg-primary/20 p-2 rounded-xl border border-white/5"><BarChart3 className="h-6 w-6 text-accent" /></div>
                 <h1 className="text-3xl font-black text-white tracking-tighter uppercase">Closed Performance Node</h1>
               </div>
               <p className="text-muted-foreground text-sm max-w-2xl">
                 Quantitative review of signals retired from the live idea stream. Tracks win rate and execution accuracy for Inactive signals.
               </p>
             </div>
             <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-1 shrink-0">
               {([
                 { key: "all" as FilterMode, label: "Unfiltered", icon: Layers },
                 { key: "aligned" as FilterMode, label: "Filtered", icon: Filter },
               ]).map(({ key, label, icon: Icon }) => (
                 <button
                   key={key}
                   onClick={() => setFilterMode(key)}
                   className={cn(
                     "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all",
                     filterMode === key
                       ? "bg-accent/15 text-accent shadow-sm"
                       : "text-muted-foreground hover:text-foreground",
                   )}
                 >
                   <Icon className="h-3.5 w-3.5" />
                   {label}
                 </button>
               ))}
             </div>
           </div>
           {alignedCount > 0 && (
             <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
               <Filter className="h-3 w-3 text-accent" />
               <span><span className="text-accent font-bold">{alignedCount}</span> aligned trades out of <span className="font-bold text-foreground">{closedSignals.length}</span> total retired signals</span>
             </div>
           )}
        </header>

        {/* Bullish / Bearish — comparison: All vs Aligned */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {([
            { side: "bullish" as const, label: "Bullish", sideLabel: "BUY", icon: TrendingUp, borderColor: "border-emerald-500/20", iconBg: "bg-emerald-500/20", iconColor: "text-emerald-400" },
            { side: "bearish" as const, label: "Bearish", sideLabel: "SELL", icon: TrendingDown, borderColor: "border-rose-500/20", iconBg: "bg-rose-500/20", iconColor: "text-rose-400" },
          ]).map(({ side, label, sideLabel, icon: SideIcon, borderColor, iconBg, iconColor }) => {
            const stats = sideStats[side];
            const all = allStats[side];
            const aligned = alignedStats[side];
            const hasAlignedData = aligned.count > 0;

            return (
              <Card key={side} className={cn("bg-card/50 border-white/5 shadow-xl", borderColor)}>
                <CardHeader className="pb-3 border-b border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-xl", iconBg)}><SideIcon className={cn("h-5 w-5", iconColor)} /></div>
                      <div>
                        <CardTitle className="text-lg font-black text-white uppercase tracking-tighter">{label}</CardTitle>
                        <CardDescription className="text-[10px] font-bold text-muted-foreground uppercase">{sideLabel} · Leveraged in-trade max upside / max downside</CardDescription>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black font-mono text-white">{stats.count}</div>
                      <div className="text-[10px] font-bold text-accent uppercase">
                        {filterMode === "all" ? "Retired Trades" : filterMode === "aligned" ? "Aligned" : "Non-aligned"}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  {/* Main stats grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {([
                      { label: "Max profit", value: stats.profit.max, hasData: stats.profit.count > 0, isProfit: true },
                      { label: "Median profit", value: stats.profit.median, hasData: stats.profit.count > 0, isProfit: true },
                      { label: "Avg profit", value: stats.profit.avg, hasData: stats.profit.count > 0, isProfit: true },
                      { label: "Max loss", value: stats.loss.max, hasData: stats.loss.count > 0, isProfit: false },
                      { label: "Median loss", value: stats.loss.median, hasData: stats.loss.count > 0, isProfit: false },
                      { label: "Avg loss", value: stats.loss.avg, hasData: stats.loss.count > 0, isProfit: false },
                    ]).map((metric) => (
                      <div key={metric.label}>
                        <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">{metric.label}</div>
                        <div className={cn("text-xl font-black font-mono", metric.isProfit ? (metric.value >= 0 ? "text-emerald-400" : "text-white") : "text-rose-400")}>
                          {metric.hasData ? `${metric.isProfit && metric.value >= 0 ? '+' : ''}${metric.value.toFixed(2)}%` : "--"}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Comparison: Unfiltered vs Filtered */}
                  {hasAlignedData && (
                    <div className="rounded-xl border border-accent/10 bg-accent/[0.02] p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Filter className="h-3 w-3 text-accent" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-accent">Unfiltered vs Filtered</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        <div className="text-[9px] font-bold uppercase text-muted-foreground/60" />
                        <div className="text-[9px] font-bold uppercase text-muted-foreground">All ({all.count})</div>
                        <div className="text-[9px] font-bold uppercase text-accent">Aligned ({aligned.count})</div>
                        <div className="text-[9px] font-bold uppercase text-muted-foreground/60">Edge</div>

                        {([
                          { label: "Avg Profit", allVal: all.profit.avg, alignedVal: aligned.profit.avg, allHas: all.profit.count > 0, alignedHas: aligned.profit.count > 0, isProfit: true },
                          { label: "Avg Loss", allVal: all.loss.avg, alignedVal: aligned.loss.avg, allHas: all.loss.count > 0, alignedHas: aligned.loss.count > 0, isProfit: false },
                        ]).map((row) => {
                          const edge = row.allHas && row.alignedHas
                            ? row.isProfit ? row.alignedVal - row.allVal : row.allVal - row.alignedVal
                            : null;
                          return [
                            <div key={`${row.label}-label`} className="text-[10px] font-bold text-muted-foreground text-left py-1.5">{row.label}</div>,
                            <div key={`${row.label}-all`} className={cn("text-sm font-black font-mono py-1.5", row.isProfit ? "text-emerald-400/60" : "text-rose-400/60")}>
                              {row.allHas ? `${row.allVal.toFixed(2)}%` : "--"}
                            </div>,
                            <div key={`${row.label}-aligned`} className={cn("text-sm font-black font-mono py-1.5", row.isProfit ? "text-emerald-400" : "text-rose-400")}>
                              {row.alignedHas ? `${row.alignedVal.toFixed(2)}%` : "--"}
                            </div>,
                            <div key={`${row.label}-edge`} className={cn("text-sm font-black font-mono py-1.5", edge != null && edge > 0 ? "text-accent" : "text-muted-foreground/40")}>
                              {edge != null ? `${edge >= 0 ? '+' : ''}${edge.toFixed(2)}%` : "--"}
                            </div>,
                          ];
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="bg-card border-white/5 overflow-hidden">
          <CardHeader className="bg-white/[0.02] border-b border-white/5">
            <div className="flex items-center justify-between">
               <div className="space-y-1">
                  <CardTitle className="text-sm uppercase tracking-widest text-white">Closed Ideas Audit</CardTitle>
                  <CardDescription className="text-[10px] font-bold">Comprehensive trade log for retired setups</CardDescription>
               </div>
               <Badge variant="outline" className="border-white/10 text-muted-foreground bg-white/5">
                 <History className="h-3 w-3 mr-2" /> DATA LOADED: {filteredClosedSignals.length}
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
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Chart</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Lev.</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Entry</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Exit Price</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">SL</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Net PNL</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Aligned</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Max Excursion</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 text-right">Date Closed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closedSignals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="h-64 text-center">
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
                    filteredClosedSignals.map((signal) => {
                      const leverage = getLeverage(signal.timeframe);
                      const pnl = effectivePnl(signal) * leverage;
                      const maxUp = calculatePercent(signal.maxUpsidePrice, signal.price, signal.type) * leverage;
                      const maxDown = calculatePercent(signal.maxDrawdownPrice, signal.price, signal.type) * leverage;
                      const slAtCost = didHit2x(signal);
                      const tfLabel: Record<string, string> = { "5": "5m", "15": "15m", "60": "1h", "240": "4h", "D": "1D" };
                      const chartLabel = tfLabel[String(signal.timeframe).toUpperCase()] ?? `${signal.timeframe}m`;

                      return (
                        <TableRow key={signal.id} className="border-white/5 hover:bg-white/[0.02] transition-colors group">
                          <TableCell className="py-4">
                            <span className="text-sm font-black text-white leading-none uppercase tracking-tighter">{signal.symbol}</span>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn("text-[9px] font-black h-5 uppercase px-2", signal.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400')}>
                              {signal.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs font-bold text-muted-foreground uppercase">{chartLabel}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[9px] font-black h-5 px-1.5 border-accent/20 text-accent">{leverage}x</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs font-bold text-white/60">${formatPrice(signal.price)}</TableCell>
                          <TableCell className="font-mono text-xs font-bold text-white">${formatPrice(signal.currentPrice)}</TableCell>
                          <TableCell className="font-mono text-xs font-bold">
                            {signal.stopLoss != null && signal.stopLoss > 0 ? (
                              slAtCost ? (
                                <span className="text-positive" title="SL moved to cost (2x risk achieved)">${formatPrice(signal.price)}</span>
                              ) : (
                                <span className="text-amber-400/90">${formatPrice(signal.stopLoss)}</span>
                              )
                            ) : "--"}
                          </TableCell>
                          <TableCell>
                            <div className={cn("flex items-center gap-1.5 font-mono text-xs font-black", pnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                               {pnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                               {pnl.toFixed(2)}%
                            </div>
                          </TableCell>
                          <TableCell>
                            {signal.aligned === true ? (
                              <Badge className="text-[9px] font-black h-5 uppercase px-2 bg-accent/15 text-accent">Yes</Badge>
                            ) : signal.aligned === false ? (
                              <span className="text-[10px] text-muted-foreground/40">No</span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground/30">—</span>
                            )}
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
