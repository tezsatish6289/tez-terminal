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

  type TableViewMode = "active" | "retired";
  const [tableViewMode, setTableViewMode] = useState<TableViewMode>("active");

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

  const tableSignals = useMemo(() => {
    let sigs = tableViewMode === "active" ? activeSignals : closedSignals;
    if (selectedTf !== "all") sigs = sigs.filter(s => String(s.timeframe).toUpperCase() === selectedTf);
    if (filterMode === "aligned") sigs = sigs.filter(s => s.aligned === true);
    return sigs;
  }, [tableViewMode, activeSignals, closedSignals, selectedTf, filterMode]);

  const TIMEFRAMES = [
    { id: "5", name: "Scalping", chart: "5m" },
    { id: "15", name: "Intraday", chart: "15m" },
    { id: "60", name: "BTST", chart: "1h" },
    { id: "240", name: "Swing", chart: "4h" },
    { id: "D", name: "Buy & Hold", chart: "1D" },
  ];

  type SideStats = { count: number; profit: { count: number; max: number; median: number; avg: number }; loss: { count: number; max: number; median: number; avg: number } };

  const computeSideStats = (sigs: any[], lev: number): SideStats => {
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

  type TfData = {
    active: { all: { bullish: SideStats; bearish: SideStats }; premium: { bullish: SideStats; bearish: SideStats }; total: number };
    retired: { all: { bullish: SideStats; bearish: SideStats }; premium: { bullish: SideStats; bearish: SideStats }; total: number };
    combined: number;
  };

  const tfStats = useMemo(() => {
    const result: Record<string, TfData> = {};
    TIMEFRAMES.forEach(tf => {
      const lev = getLeverage(tf.id);
      const activeTf = activeSignals.filter(s => String(s.timeframe).toUpperCase() === tf.id);
      const retiredTf = closedSignals.filter(s => String(s.timeframe).toUpperCase() === tf.id);
      const buildGroup = (sigs: any[]) => {
        const prem = sigs.filter(s => s.aligned === true);
        return {
          all: { bullish: computeSideStats(sigs.filter(s => s.type === "BUY"), lev), bearish: computeSideStats(sigs.filter(s => s.type === "SELL"), lev) },
          premium: { bullish: computeSideStats(prem.filter(s => s.type === "BUY"), lev), bearish: computeSideStats(prem.filter(s => s.type === "SELL"), lev) },
          total: sigs.length,
        };
      };
      result[tf.id] = { active: buildGroup(activeTf), retired: buildGroup(retiredTf), combined: activeTf.length + retiredTf.length };
    });
    return result;
  }, [activeSignals, closedSignals]);

  const formatPrice = (p: number | null | undefined) => {
    if (p === null || p === undefined) return "--";
    const decimals = p < 1 ? 6 : 2;
    return p.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const renderVal = (v: number, hasData: boolean, isProfit: boolean) => {
    if (!hasData) return <span className="text-muted-foreground/30">--</span>;
    return <span className={cn("font-mono font-black", isProfit ? "text-emerald-400" : "text-rose-400")}>{isProfit && v >= 0 ? "+" : ""}{v.toFixed(2)}%</span>;
  };

  const renderMetricBlock = (
    label: string,
    activeAll: { val: number; has: boolean },
    activePrem: { val: number; has: boolean } | null,
    retiredAll: { val: number; has: boolean },
    retiredPrem: { val: number; has: boolean } | null,
    isProfit: boolean,
    isCount?: boolean,
  ) => (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-2">
      <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground text-center">{label}</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="text-center">
          <div className="text-[8px] font-bold uppercase text-emerald-400/60 mb-1 flex items-center justify-center gap-1"><Zap className="h-2.5 w-2.5" />Active</div>
          {isCount ? (
            <div className="text-lg font-black font-mono text-white">{activeAll.val}</div>
          ) : (
            <div className="text-sm">{renderVal(activeAll.val, activeAll.has, isProfit)}</div>
          )}
          {activePrem && (
            <div className={cn("text-[10px] mt-0.5", isCount ? "font-mono font-bold text-accent" : "")}>
              {isCount ? activePrem.val : renderVal(activePrem.val, activePrem.has, isProfit)}
              <span className="text-[8px] text-accent/50 ml-1">prem</span>
            </div>
          )}
        </div>
        <div className="text-center border-l border-white/5">
          <div className="text-[8px] font-bold uppercase text-amber-400/60 mb-1 flex items-center justify-center gap-1"><Clock className="h-2.5 w-2.5" />Retired</div>
          {isCount ? (
            <div className="text-lg font-black font-mono text-white">{retiredAll.val}</div>
          ) : (
            <div className="text-sm">{renderVal(retiredAll.val, retiredAll.has, isProfit)}</div>
          )}
          {retiredPrem && (
            <div className={cn("text-[10px] mt-0.5", isCount ? "font-mono font-bold text-accent" : "")}>
              {isCount ? retiredPrem.val : renderVal(retiredPrem.val, retiredPrem.has, isProfit)}
              <span className="text-[8px] text-accent/50 ml-1">prem</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderSideBlock = (data: TfData, label: string, sideKey: "bullish" | "bearish", icon: typeof TrendingUp, iconColor: string) => {
    const aa = data.active.all[sideKey];
    const ap = data.active.premium[sideKey];
    const ra = data.retired.all[sideKey];
    const rp = data.retired.premium[sideKey];
    const hasActivePrem = ap.count > 0;
    const hasRetiredPrem = rp.count > 0;
    const hasPrem = hasActivePrem || hasRetiredPrem;

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {icon === TrendingUp ? <TrendingUp className={cn("h-4 w-4", iconColor)} /> : <TrendingDown className={cn("h-4 w-4", iconColor)} />}
          <span className={cn("text-[10px] font-black uppercase tracking-wider", iconColor)}>{label}</span>
        </div>
        {aa.count === 0 && ra.count === 0 ? (
          <div className="text-[10px] text-muted-foreground/40 text-center py-3">No {label.toLowerCase()} trades</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            {renderMetricBlock("Trades",
              { val: aa.count, has: true },
              hasPrem ? { val: ap.count, has: true } : null,
              { val: ra.count, has: true },
              hasPrem ? { val: rp.count, has: true } : null,
              true, true,
            )}
            {renderMetricBlock("Avg Profit",
              { val: aa.profit.avg, has: aa.profit.count > 0 },
              hasPrem ? { val: ap.profit.avg, has: ap.profit.count > 0 } : null,
              { val: ra.profit.avg, has: ra.profit.count > 0 },
              hasPrem ? { val: rp.profit.avg, has: rp.profit.count > 0 } : null,
              true,
            )}
            {renderMetricBlock("Max Profit",
              { val: aa.profit.max, has: aa.profit.count > 0 },
              hasPrem ? { val: ap.profit.max, has: ap.profit.count > 0 } : null,
              { val: ra.profit.max, has: ra.profit.count > 0 },
              hasPrem ? { val: rp.profit.max, has: rp.profit.count > 0 } : null,
              true,
            )}
            {renderMetricBlock("Avg Loss",
              { val: aa.loss.avg, has: aa.loss.count > 0 },
              hasPrem ? { val: ap.loss.avg, has: ap.loss.count > 0 } : null,
              { val: ra.loss.avg, has: ra.loss.count > 0 },
              hasPrem ? { val: rp.loss.avg, has: rp.loss.count > 0 } : null,
              false,
            )}
            {renderMetricBlock("Max Loss",
              { val: aa.loss.max, has: aa.loss.count > 0 },
              hasPrem ? { val: ap.loss.max, has: ap.loss.count > 0 } : null,
              { val: ra.loss.max, has: ra.loss.count > 0 },
              hasPrem ? { val: rp.loss.max, has: rp.loss.count > 0 } : null,
              false,
            )}
          </div>
        )}
      </div>
    );
  };

  const tfLabelMap: Record<string, string> = { "5": "5m", "15": "15m", "60": "1h", "240": "4h", "D": "1D" };

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
      
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase">Performance Node</h1>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Side-by-side analytics for active and retired signals across all timeframes.
          </p>
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
            const count = tfStats[tf.id]?.combined ?? 0;
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
            if (!data || data.combined === 0) return null;
            const lev = getLeverage(tf.id);

            return (
              <Card key={tf.id} className="bg-card/50 border-white/5 shadow-xl">
                <CardHeader className="pb-3 border-b border-white/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-black text-white uppercase tracking-tighter">{tf.name}</CardTitle>
                      <CardDescription className="text-[10px] font-bold text-muted-foreground uppercase">{tf.chart} chart · {lev}x leverage · Leveraged returns</CardDescription>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <div className="text-lg font-black font-mono text-white">{data.active.total}</div>
                        <div className="text-[9px] font-bold text-emerald-400/60 uppercase">Active</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-black font-mono text-white">{data.retired.total}</div>
                        <div className="text-[9px] font-bold text-amber-400/60 uppercase">Retired</div>
                      </div>
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

        {/* Trade audit table */}
        <Card className="bg-card border-white/5 overflow-hidden">
          <CardHeader className="bg-white/[0.02] border-b border-white/5">
            <div className="flex items-center justify-between">
               <div className="space-y-1">
                  <CardTitle className="text-sm uppercase tracking-widest text-white">Trade Audit</CardTitle>
                  <CardDescription className="text-[10px] font-bold">Individual signal details</CardDescription>
               </div>
               <div className="flex items-center gap-3">
                 <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-1">
                   {([
                     { key: "active" as TableViewMode, label: "Active", icon: Zap },
                     { key: "retired" as TableViewMode, label: "Retired", icon: Clock },
                   ]).map(({ key, label, icon: Icon }) => (
                     <button
                       key={key}
                       onClick={() => setTableViewMode(key)}
                       className={cn(
                         "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                         tableViewMode === key
                           ? "bg-accent/15 text-accent shadow-sm"
                           : "text-muted-foreground hover:text-foreground",
                       )}
                     >
                       <Icon className="h-3 w-3" />
                       {label}
                     </button>
                   ))}
                 </div>
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
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">{tableViewMode === "active" ? "Current Price" : "Exit Price"}</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">SL</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Net PNL</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Aligned</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Max Excursion</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 text-right">{tableViewMode === "active" ? "Date Opened" : "Date Closed"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableSignals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="h-64 text-center">
                        <div className="flex flex-col items-center gap-4 opacity-40">
                           <Archive className="h-12 w-12 text-muted-foreground" />
                           <div className="space-y-1">
                              <p className="text-xs font-bold uppercase tracking-widest text-white">No Signals Found</p>
                              <p className="text-[10px] text-muted-foreground max-w-xs mx-auto">
                                No signals match the current filters.
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
