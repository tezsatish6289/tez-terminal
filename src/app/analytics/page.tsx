"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, limit } from "firebase/firestore";
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Activity, 
  BarChart3, 
  Loader2, 
  History,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Zap,
  Info,
  Archive
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
    if (!exit || !entry) return 0;
    const diff = type === 'BUY' ? exit - entry : entry - exit;
    return (diff / entry) * 100;
  };

  const closedSignals = useMemo(() => {
    if (!allSignals) return [];
    return allSignals.filter(s => s.status === "INACTIVE");
  }, [allSignals]);

  const stats = useMemo(() => {
    if (closedSignals.length === 0) return { winRate: 0, totalPnl: 0, avgPnl: 0, best: 0, worst: 0 };
    
    let wins = 0;
    let totalPnl = 0;
    let best = -Infinity;
    let worst = Infinity;

    closedSignals.forEach(s => {
      const pnl = calculatePercent(s.currentPrice, s.price, s.type);
      if (pnl > 0) wins++;
      totalPnl += pnl;
      if (pnl > best) best = pnl;
      if (pnl < worst) worst = pnl;
    });

    return {
      winRate: (wins / closedSignals.length) * 100,
      totalPnl,
      avgPnl: totalPnl / closedSignals.length,
      best: best === -Infinity ? 0 : best,
      worst: worst === Infinity ? 0 : worst
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

        {/* Aggregate Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="bg-card/50 border-white/5 shadow-xl">
             <CardHeader className="pb-2">
               <CardDescription className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                 <Target className="h-3 w-3 text-accent" /> Sample Size
               </CardDescription>
               <CardTitle className="text-4xl font-black text-white font-mono">{closedSignals.length}</CardTitle>
             </CardHeader>
             <CardContent>
                <div className="text-[10px] font-bold text-accent uppercase">Retired Trades</div>
             </CardContent>
          </Card>

          <Card className="bg-card/50 border-white/5 shadow-xl">
             <CardHeader className="pb-2">
               <CardDescription className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                 <ShieldCheck className="h-3 w-3 text-emerald-400" /> Success Rate
               </CardDescription>
               <CardTitle className="text-4xl font-black text-emerald-400 font-mono">{stats.winRate.toFixed(1)}%</CardTitle>
             </CardHeader>
             <CardContent>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden mt-1">
                   <div className="h-full bg-emerald-500" style={{ width: `${stats.winRate}%` }} />
                </div>
             </CardContent>
          </Card>

          <Card className="bg-card/50 border-white/5 shadow-xl">
             <CardHeader className="pb-2">
               <CardDescription className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                 <Activity className="h-3 w-3 text-accent" /> Mean Return
               </CardDescription>
               <CardTitle className={cn("text-4xl font-black font-mono", stats.avgPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                 {stats.avgPnl >= 0 ? '+' : ''}{stats.avgPnl.toFixed(2)}%
               </CardTitle>
             </CardHeader>
             <CardContent>
                <div className="text-[10px] font-bold text-muted-foreground uppercase">Average Profit/Trade</div>
             </CardContent>
          </Card>

          <Card className="bg-card/50 border-white/5 shadow-xl">
             <CardHeader className="pb-2">
               <CardDescription className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
                 <Zap className="h-3 w-3 text-amber-400" /> Extreme Move
               </CardDescription>
               <CardTitle className="text-4xl font-black text-white font-mono">{stats.best.toFixed(1)}%</CardTitle>
             </CardHeader>
             <CardContent>
                <div className="text-[10px] font-bold text-emerald-400 uppercase">Max Observed Upside</div>
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
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Net PNL</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Max Excursion</TableHead>
                    <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 text-right">Date Closed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closedSignals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-64 text-center">
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
                          <TableCell>
                            <div className={cn("flex items-center gap-1.5 font-mono text-xs font-black", pnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                               {pnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                               {pnl.toFixed(2)}%
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-4">
                               <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-400/60">
                                  <ArrowUpRight className="h-3 w-3" /> {maxUp.toFixed(1)}%
                               </div>
                               <div className="flex items-center gap-1 text-[10px] font-bold text-rose-400/60">
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
