"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, limit } from "firebase/firestore";
import { 
  TrendingUp, 
  TrendingDown, 
  Loader2, 
  History,
  ArrowUpRight,
  ArrowDownRight,
  Archive,
  Filter,
  Layers,
  Zap,
  Clock
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMemo, useState } from "react";
import { getLeverage } from "@/lib/leverage";

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

  type ViewMode = "active" | "retired";
  const [viewMode, setViewMode] = useState<ViewMode>("active");

  type FilterMode = "all" | "aligned";
  const [filterMode, setFilterMode] = useState<FilterMode>("all");

  const [selectedTf, setSelectedTf] = useState<string>("all");

  const activeSignals = useMemo(() => {
    if (!allSignals) return [];
    return allSignals.filter(s => s.status !== "INACTIVE");
  }, [allSignals]);

  const closedSignals = useMemo(() => {
    if (!allSignals) return [];
    return allSignals.filter(s => s.status === "INACTIVE");
  }, [allSignals]);

  const currentSignals = viewMode === "active" ? activeSignals : closedSignals;

  const tableSignals = useMemo(() => {
    let sigs = currentSignals;
    if (selectedTf !== "all") sigs = sigs.filter(s => String(s.timeframe).toUpperCase() === selectedTf);
    if (filterMode === "aligned") sigs = sigs.filter(s => s.aligned === true);
    return sigs;
  }, [currentSignals, selectedTf, filterMode]);

  const TIMEFRAMES = [
    { id: "5", name: "Scalping", chart: "5m" },
    { id: "15", name: "Intraday", chart: "15m" },
    { id: "60", name: "BTST", chart: "1h" },
    { id: "240", name: "Swing", chart: "4h" },
    { id: "D", name: "Buy & Hold", chart: "1D" },
  ];

  type SideStats = { count: number; profit: { count: number; max: number; median: number; avg: number }; loss: { count: number; max: number; median: number; avg: number } };

  const computeSideStats = (sigs: typeof closedSignals, lev: number): SideStats => {
    const withUpside = sigs.filter(hasUpsideData);
    const upsideValues = withUpside.map(s => calculatePercent(s.maxUpsidePrice, s.price, s.type) * lev);
    const withDownside = sigs.filter(hasDownsideData);
    const downsideValues = withDownside.map(s => calculatePercent(s.maxDrawdownPrice, s.price, s.type) * lev);
    return {
      count: sigs.length,
      profit: upsideValues.length > 0
        ? { count: upsideValues.length, max: Math.max(...upsideValues), median: median(upsideValues), avg: upsideValues.reduce((a, b) => a + b, 0) / upsideValues.length }
        : { count: 0, max: 0, median: 0, avg: 0 },
      loss: downsideValues.length > 0
        ? { count: downsideValues.length, max: Math.min(...downsideValues), median: median(downsideValues), avg: downsideValues.reduce((a, b) => a + b, 0) / downsideValues.length }
        : { count: 0, max: 0, median: 0, avg: 0 },
    };
  };

  const tfStats = useMemo(() => {
    const result: Record<string, { all: { bullish: SideStats; bearish: SideStats }; premium: { bullish: SideStats; bearish: SideStats }; total: number; premiumTotal: number }> = {};
    TIMEFRAMES.forEach(tf => {
      const lev = getLeverage(tf.id);
      const tfSignals = currentSignals.filter(s => String(s.timeframe).toUpperCase() === tf.id);
      const premiumSignals = tfSignals.filter(s => s.aligned === true);
      result[tf.id] = {
        all: { bullish: computeSideStats(tfSignals.filter(s => s.type === "BUY"), lev), bearish: computeSideStats(tfSignals.filter(s => s.type === "SELL"), lev) },
        premium: { bullish: computeSideStats(premiumSignals.filter(s => s.type === "BUY"), lev), bearish: computeSideStats(premiumSignals.filter(s => s.type === "SELL"), lev) },
        total: tfSignals.length,
        premiumTotal: premiumSignals.length,
      };
    });
    return result;
  }, [currentSignals]);

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

  const renderSideBlock = (data: { all: { bullish: SideStats; bearish: SideStats }; premium: { bullish: SideStats; bearish: SideStats } }, label: string, sideKey: "bullish" | "bearish", icon: typeof TrendingUp, iconColor: string) => {
    const all = data.all[sideKey];
    const prem = data.premium[sideKey];
    const hasPrem = prem.count > 0;

    const renderVal = (v: number, hasData: boolean, isProfit: boolean) => {
      if (!hasData) return <span className="text-muted-foreground/30">--</span>;
      return <span className={cn("font-mono font-black", isProfit ? "text-emerald-400" : "text-rose-400")}>{isProfit && v >= 0 ? "+" : ""}{v.toFixed(2)}%</span>;
    };

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {icon === TrendingUp ? <TrendingUp className={cn("h-4 w-4", iconColor)} /> : <TrendingDown className={cn("h-4 w-4", iconColor)} />}
          <span className={cn("text-[10px] font-black uppercase tracking-wider", iconColor)}>{label}</span>
          <span className="text-[10px] text-muted-foreground ml-auto">{all.count} total{hasPrem ? ` · ${prem.count} premium` : ""}</span>
        </div>
        {all.count === 0 ? (
          <div className="text-[10px] text-muted-foreground/40 text-center py-3">No {label.toLowerCase()} trades</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left font-bold text-muted-foreground/60 uppercase tracking-wider py-1.5 pr-2" />
                  <th className="text-center font-bold text-muted-foreground uppercase tracking-wider py-1.5 px-2">Trades</th>
                  <th className="text-center font-bold text-muted-foreground uppercase tracking-wider py-1.5 px-2">Avg Profit</th>
                  <th className="text-center font-bold text-muted-foreground uppercase tracking-wider py-1.5 px-2">Max Profit</th>
                  <th className="text-center font-bold text-muted-foreground uppercase tracking-wider py-1.5 px-2">Avg Loss</th>
                  <th className="text-center font-bold text-muted-foreground uppercase tracking-wider py-1.5 px-2">Max Loss</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-white/5">
                  <td className="py-2 pr-2 text-[10px] font-bold text-muted-foreground uppercase">All</td>
                  <td className="py-2 px-2 text-center text-sm font-mono font-black text-white">{all.count}</td>
                  <td className="py-2 px-2 text-center text-sm">{renderVal(all.profit.avg, all.profit.count > 0, true)}</td>
                  <td className="py-2 px-2 text-center text-sm">{renderVal(all.profit.max, all.profit.count > 0, true)}</td>
                  <td className="py-2 px-2 text-center text-sm">{renderVal(all.loss.avg, all.loss.count > 0, false)}</td>
                  <td className="py-2 px-2 text-center text-sm">{renderVal(all.loss.max, all.loss.count > 0, false)}</td>
                </tr>
                {hasPrem && (
                  <>
                    <tr className="border-b border-white/5">
                      <td className="py-2 pr-2 text-[10px] font-bold text-accent uppercase">Premium</td>
                      <td className="py-2 px-2 text-center text-sm font-mono font-black text-accent">{prem.count}</td>
                      <td className="py-2 px-2 text-center text-sm">{renderVal(prem.profit.avg, prem.profit.count > 0, true)}</td>
                      <td className="py-2 px-2 text-center text-sm">{renderVal(prem.profit.max, prem.profit.count > 0, true)}</td>
                      <td className="py-2 px-2 text-center text-sm">{renderVal(prem.loss.avg, prem.loss.count > 0, false)}</td>
                      <td className="py-2 px-2 text-center text-sm">{renderVal(prem.loss.max, prem.loss.count > 0, false)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-2 text-[10px] font-bold text-accent/50 uppercase">Edge</td>
                      <td className="py-2 px-2" />
                      {(() => {
                        const profitEdge = all.profit.count > 0 && prem.profit.count > 0 ? prem.profit.avg - all.profit.avg : null;
                        const maxProfitEdge = all.profit.count > 0 && prem.profit.count > 0 ? prem.profit.max - all.profit.max : null;
                        const lossEdge = all.loss.count > 0 && prem.loss.count > 0 ? prem.loss.avg - all.loss.avg : null;
                        const maxLossEdge = all.loss.count > 0 && prem.loss.count > 0 ? prem.loss.max - all.loss.max : null;
                        const edgeCell = (edge: number | null) => (
                          <td className={cn("py-2 px-2 text-center text-sm font-mono font-black", edge != null && edge > 0 ? "text-accent" : "text-muted-foreground/30")}>
                            {edge != null ? `${edge >= 0 ? "+" : ""}${edge.toFixed(2)}%` : "--"}
                          </td>
                        );
                        return <>{edgeCell(profitEdge)}{edgeCell(maxProfitEdge)}{edgeCell(lossEdge)}{edgeCell(maxLossEdge)}</>;
                      })()}
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const tfLabelMap: Record<string, string> = { "5": "5m", "15": "15m", "60": "1h", "240": "4h", "D": "1D" };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <TopBar />
      
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <header className="flex items-start justify-between gap-4">
           <div className="space-y-2">
             <h1 className="text-3xl font-black text-white tracking-tighter uppercase">
               {viewMode === "active" ? "Live Performance Node" : "Closed Performance Node"}
             </h1>
             <p className="text-muted-foreground text-sm max-w-2xl">
               {viewMode === "active"
                 ? "Real-time analytics for signals currently in play. Numbers update with every price tick."
                 : "Retrospective analysis of signals retired from the live idea stream."}
             </p>
           </div>
           <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-1 shrink-0">
             {([
               { key: "active" as ViewMode, label: "Active", icon: Zap },
               { key: "retired" as ViewMode, label: "Retired", icon: Clock },
             ]).map(({ key, label, icon: Icon }) => (
               <button
                 key={key}
                 onClick={() => setViewMode(key)}
                 className={cn(
                   "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all",
                   viewMode === key
                     ? "bg-accent/15 text-accent shadow-sm"
                     : "text-muted-foreground hover:text-foreground",
                 )}
               >
                 <Icon className="h-3.5 w-3.5" />
                 {label}
               </button>
             ))}
           </div>
        </header>

        {/* Timeframe filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSelectedTf("all")}
            className={cn(
              "px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border",
              selectedTf === "all"
                ? "bg-accent/15 text-accent border-accent/30"
                : "text-muted-foreground border-white/10 hover:text-foreground hover:border-white/20",
            )}
          >
            All
          </button>
          {TIMEFRAMES.map(tf => {
            const count = tfStats[tf.id]?.total ?? 0;
            return (
              <button
                key={tf.id}
                onClick={() => setSelectedTf(tf.id)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border",
                  selectedTf === tf.id
                    ? "bg-accent/15 text-accent border-accent/30"
                    : "text-muted-foreground border-white/10 hover:text-foreground hover:border-white/20",
                )}
              >
                {tf.name} <span className="text-muted-foreground/50 ml-1">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Per-timeframe analytics cards */}
        <div className="space-y-6">
          {TIMEFRAMES.map(tf => {
            if (selectedTf !== "all" && selectedTf !== tf.id) return null;
            const data = tfStats[tf.id];
            if (!data || data.total === 0) return null;
            const lev = getLeverage(tf.id);

            return (
              <Card key={tf.id} className="bg-card/50 border-white/5 shadow-xl">
                <CardHeader className="pb-3 border-b border-white/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-black text-white uppercase tracking-tighter">{tf.name}</CardTitle>
                      <CardDescription className="text-[10px] font-bold text-muted-foreground uppercase">{tf.chart} chart · {lev}x leverage · Leveraged returns</CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black font-mono text-white">{data.total}</div>
                      <div className="text-[10px] font-bold text-accent uppercase">{viewMode === "active" ? "Active Trades" : "Retired Trades"}</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-5 space-y-5">
                  {renderSideBlock(data, "Bulls", "bullish", TrendingUp, "text-emerald-400")}
                  <div className="border-t border-white/5" />
                  {renderSideBlock(data, "Bears", "bearish", TrendingDown, "text-rose-400")}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Trade audit table — shown for both active and retired */}
        <Card className="bg-card border-white/5 overflow-hidden">
          <CardHeader className="bg-white/[0.02] border-b border-white/5">
            <div className="flex items-center justify-between">
               <div className="space-y-1">
                  <CardTitle className="text-sm uppercase tracking-widest text-white">
                    {viewMode === "active" ? "Live Trades" : "Closed Ideas Audit"}
                  </CardTitle>
                  <CardDescription className="text-[10px] font-bold">
                    {viewMode === "active" ? "Individual active signals with live performance" : "Comprehensive trade log for retired setups"}
                  </CardDescription>
               </div>
               <div className="flex items-center gap-3">
                 <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-1">
                   {([
                     { key: "all" as FilterMode, label: "All", icon: Layers },
                     { key: "aligned" as FilterMode, label: "Premium", icon: Filter },
                   ]).map(({ key, label, icon: Icon }) => (
                     <button
                       key={key}
                       onClick={() => setFilterMode(key)}
                       className={cn(
                         "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                         filterMode === key
                           ? "bg-accent/15 text-accent shadow-sm"
                           : "text-muted-foreground hover:text-foreground",
                       )}
                     >
                       <Icon className="h-3 w-3" />
                       {label}
                     </button>
                   ))}
                 </div>
                 <Badge variant="outline" className="border-white/10 text-muted-foreground bg-white/5">
                   <History className="h-3 w-3 mr-2" /> {tableSignals.length}
                 </Badge>
               </div>
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
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">{viewMode === "active" ? "Current Price" : "Exit Price"}</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">SL</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Net PNL</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Aligned</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Max Excursion</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 text-right">{viewMode === "active" ? "Date Opened" : "Date Closed"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableSignals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="h-64 text-center">
                        <div className="flex flex-col items-center gap-4 opacity-40">
                           <Archive className="h-12 w-12 text-muted-foreground" />
                           <div className="space-y-1">
                              <p className="text-xs font-bold uppercase tracking-widest text-white">
                                {viewMode === "active" ? "No Active Signals" : "No Retired Signals"}
                              </p>
                              <p className="text-[10px] text-muted-foreground max-w-xs mx-auto">
                                {viewMode === "active"
                                  ? "No active signals match the current filters."
                                  : "Signals appear here once they hit Stop Loss or are retired."}
                              </p>
                           </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    tableSignals.map((signal) => {
                      const leverage = getLeverage(signal.timeframe);
                      const pnl = effectivePnl(signal) * leverage;
                      const maxUp = calculatePercent(signal.maxUpsidePrice, signal.price, signal.type) * leverage;
                      const maxDown = calculatePercent(signal.maxDrawdownPrice, signal.price, signal.type) * leverage;
                      const slAtCost = didHit2x(signal);
                      const chartLabel = tfLabelMap[String(signal.timeframe).toUpperCase()] ?? `${signal.timeframe}m`;

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
