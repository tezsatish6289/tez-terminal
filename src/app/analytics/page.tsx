"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, limit } from "firebase/firestore";
import { 
  TrendingUp, 
  TrendingDown, 
  Loader2, 
  Zap,
  Clock,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useMemo, useState } from "react";
import { getLeverage } from "@/lib/leverage";
import { getEffectivePnl as getEffectivePnlShared } from "@/lib/pnl";

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

  const effectivePnl = (signal: any): number => getEffectivePnlShared(signal);

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

  const [selectedTf, setSelectedTf] = useState<string>("all");

  const activeSignals = useMemo(() => {
    if (!allSignals) return [];
    return allSignals.filter(s => s.status !== "INACTIVE");
  }, [allSignals]);

  const closedSignals = useMemo(() => {
    if (!allSignals) return [];
    return allSignals.filter(s => s.status === "INACTIVE");
  }, [allSignals]);

  const TIMEFRAMES = [
    { id: "5", name: "Scalping", chart: "5m" },
    { id: "15", name: "Intraday", chart: "15m" },
    { id: "60", name: "BTST", chart: "1h" },
    { id: "240", name: "Swing", chart: "4h" },
    { id: "D", name: "Buy & Hold", chart: "1D" },
  ];

  type SideStats = {
    count: number; winCount: number; netPnl: number;
    tp1Count: number; tp2Count: number; tp3Count: number; slCount: number;
    profit: { count: number; max: number; median: number; avg: number };
    loss: { count: number; max: number; median: number; avg: number };
  };

  const computeSideStats = (sigs: any[], lev: number): SideStats => {
    const winCount = sigs.filter(s => effectivePnl(s) >= 0).length;
    const netPnl = sigs.reduce((sum, s) => sum + effectivePnl(s) * lev, 0);
    const tp1Count = sigs.filter(s => s.tp1Hit === true).length;
    const tp2Count = sigs.filter(s => s.tp2Hit === true).length;
    const tp3Count = sigs.filter(s => s.tp3Hit === true).length;
    const slCount = sigs.filter(s => s.slHitAt != null).length;
    const withUpside = sigs.filter(hasUpsideData);
    const upsideValues = withUpside.map(s => calculatePercent(s.maxUpsidePrice, s.price, s.type) * lev);
    const withDownside = sigs.filter(hasDownsideData);
    const downsideValues = withDownside.map(s => calculatePercent(s.maxDrawdownPrice, s.price, s.type) * lev);
    return {
      count: sigs.length,
      winCount,
      netPnl,
      tp1Count, tp2Count, tp3Count, slCount,
      profit: upsideValues.length > 0
        ? { count: upsideValues.length, max: Math.max(...upsideValues), median: median(upsideValues), avg: upsideValues.reduce((a, b) => a + b, 0) / upsideValues.length }
        : { count: 0, max: 0, median: 0, avg: 0 },
      loss: downsideValues.length > 0
        ? { count: downsideValues.length, max: Math.min(...downsideValues), median: median(downsideValues), avg: downsideValues.reduce((a, b) => a + b, 0) / downsideValues.length }
        : { count: 0, max: 0, median: 0, avg: 0 },
    };
  };

  type TfData = {
    active: { bullish: SideStats; bearish: SideStats; total: number };
    retired: { bullish: SideStats; bearish: SideStats; total: number };
    combined: number;
  };

  const tfStats = useMemo(() => {
    const result: Record<string, TfData> = {};
    TIMEFRAMES.forEach(tf => {
      const lev = getLeverage(tf.id);
      const activeTf = activeSignals.filter(s => String(s.timeframe).toUpperCase() === tf.id);
      const retiredTf = closedSignals.filter(s => String(s.timeframe).toUpperCase() === tf.id);
      const buildGroup = (sigs: any[]) => ({
        bullish: computeSideStats(sigs.filter(s => s.type === "BUY"), lev),
        bearish: computeSideStats(sigs.filter(s => s.type === "SELL"), lev),
        total: sigs.length,
      });
      result[tf.id] = { active: buildGroup(activeTf), retired: buildGroup(retiredTf), combined: activeTf.length + retiredTf.length };
    });
    return result;
  }, [activeSignals, closedSignals]);


  const renderSideBlock = (data: TfData, label: string, sideKey: "bullish" | "bearish", icon: typeof TrendingUp, iconColor: string) => {
    const aa = data.active[sideKey];
    const ra = data.retired[sideKey];

    if (aa.count === 0 && ra.count === 0) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {icon === TrendingUp ? <TrendingUp className={cn("h-4 w-4", iconColor)} /> : <TrendingDown className={cn("h-4 w-4", iconColor)} />}
            <span className={cn("text-[10px] font-black uppercase tracking-wider", iconColor)}>{label}</span>
          </div>
          <div className="text-[10px] text-muted-foreground/40 text-center py-3">No {label.toLowerCase()} trades</div>
        </div>
      );
    }

    const cell = "px-3 py-2 text-xs font-mono font-black whitespace-nowrap";
    const hdr = "px-3 py-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap";
    const hdrWithTip = (label: string, tip: string, extraClass?: string) => (
      <th className={cn(hdr, extraClass)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex items-center gap-1 cursor-help">
              {label}
              <Info className="h-2.5 w-2.5 text-muted-foreground/30" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[200px] text-[10px]">{tip}</TooltipContent>
        </Tooltip>
      </th>
    );
    const pctCell = (v: number, has: boolean, profit: boolean) => {
      if (!has) return <td className={cell}><span className="text-muted-foreground/30">--</span></td>;
      const color = profit ? "text-emerald-400" : "text-rose-400";
      return <td className={cell}><span className={color}>{Math.abs(v).toFixed(2)}%</span></td>;
    };
    const pnlCell = (v: number, has: boolean) => {
      if (!has) return <td className={cell}><span className="text-muted-foreground/30">--</span></td>;
      const color = v >= 0 ? "text-emerald-400" : "text-rose-400";
      const prefix = v >= 0 ? "+" : "";
      return <td className={cell}><span className={color}>{prefix}{v.toFixed(2)}%</span></td>;
    };
    const countCell = (v: number, color?: string) => (
      <td className={cell}><span className={color || "text-white"}>{v}</span></td>
    );

    const renderRow = (s: SideStats, rowLabel: string, labelColor: string, RowIcon: typeof Zap) => {
      const wr = s.count > 0 ? (s.winCount / s.count) * 100 : 0;
      return (
        <tr className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
          <td className={cn(cell, "flex items-center gap-1.5", labelColor)}>
            <RowIcon className="h-3 w-3 shrink-0" />{rowLabel}
          </td>
          <td className={cn(cell, "text-white")}>{s.count}</td>
          {pctCell(wr, s.count > 0, true)}
          {pnlCell(s.netPnl, s.count > 0)}
          {pctCell(s.profit.avg, s.profit.count > 0, true)}
          {pctCell(s.loss.avg, s.loss.count > 0, false)}
          {pctCell(s.profit.max, s.profit.count > 0, true)}
          {pctCell(s.loss.max, s.loss.count > 0, false)}
          {countCell(s.tp1Count, "text-emerald-400")}
          {countCell(s.tp2Count, "text-emerald-400")}
          {countCell(s.tp3Count, "text-emerald-400")}
          {countCell(s.slCount, "text-rose-400")}
        </tr>
      );
    };

    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {icon === TrendingUp ? <TrendingUp className={cn("h-4 w-4", iconColor)} /> : <TrendingDown className={cn("h-4 w-4", iconColor)} />}
          <span className={cn("text-[10px] font-black uppercase tracking-wider", iconColor)}>{label}</span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-white/5">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/[0.02]">
                <th className={hdr}></th>
                {hdrWithTip("Trades", "Total number of signals in this category")}
                {hdrWithTip("Win Rate", "% of trades with positive PNL at exit or current")}
                {hdrWithTip("Net PNL", "Cumulative leveraged PNL across all trades")}
                {hdrWithTip("Avg Profit", "Average leveraged gain of winning trades")}
                {hdrWithTip("Avg Loss", "Average leveraged loss of losing trades")}
                {hdrWithTip("Max Profit", "Largest single leveraged gain observed")}
                {hdrWithTip("Max Loss", "Largest single leveraged loss observed")}
                {hdrWithTip("TP1", "Trades that hit Target Price 1 (50% booked)", "text-emerald-400/50")}
                {hdrWithTip("TP2", "Trades that hit Target Price 2 (25% booked)", "text-emerald-400/50")}
                {hdrWithTip("TP3", "Trades that hit Target Price 3 (final 25%)", "text-emerald-400/50")}
                {hdrWithTip("SL", "Trades that hit Stop Loss", "text-rose-400/50")}
              </tr>
            </thead>
            <tbody>
              {renderRow(aa, "Active", "text-emerald-400/80", Zap)}
              {renderRow(ra, "Retired", "text-amber-400/80", Clock)}
            </tbody>
          </table>
        </div>
      </div>
    );
  };


  if (isUserLoading || (isLoading && !allSignals)) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
    <div className="flex flex-col h-screen bg-background text-foreground">
      <TopBar />
      
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-black text-white tracking-tighter uppercase">Trade Analytics</h1>
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
                  <Link href={`/trade-audit?timeframe=${tf.id}`} className="block">
                    <Button variant="outline" size="sm" className="w-full h-9 text-[10px] font-black uppercase tracking-widest border-white/10 text-muted-foreground hover:text-accent hover:border-accent/30 transition-all">
                      View Trade Audit →
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>

      </main>
    </div>
    </TooltipProvider>
  );
}
