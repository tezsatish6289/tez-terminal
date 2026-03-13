"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { useUser, useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, orderBy, limit } from "firebase/firestore";
import {
  TrendingUp,
  TrendingDown,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  Archive,
  Zap,
  Clock,
  ChevronLeft,
  ChevronRight,
  Layers,
  CalendarDays,
} from "lucide-react";
import { format, startOfDay, startOfWeek, startOfMonth } from "date-fns";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useMemo, useState, Suspense } from "react";
import { getLeverage } from "@/lib/leverage";
import { getEffectivePnl as effectivePnl } from "@/lib/pnl";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const PAGE_SIZE = 25;

const tfLabelMap: Record<string, string> = { "5": "5m", "15": "15m", "60": "1h", "240": "4h", "D": "1D" };
const TIMEFRAMES = [
  { id: "5", name: "Scalping" },
  { id: "15", name: "Intraday" },
  { id: "60", name: "Swing" },
  { id: "240", name: "Positional" },
  { id: "D", name: "Buy & Hold" },
];

function TradeAuditContent() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const searchParams = useSearchParams();
  const initialTf = searchParams.get("timeframe") || "all";

  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "retired">("all");
  const [sideFilter, setSideFilter] = useState<"all" | "BUY" | "SELL">("all");
  const [tfFilter, setTfFilter] = useState(initialTf);
  const [algoFilter, setAlgoFilter] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<"all" | "tp1" | "tp2" | "tp3" | "sl">("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month" | "custom">("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [page, setPage] = useState(0);

  const signalsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(collection(firestore, "signals"), orderBy("receivedAt", "desc"), limit(500));
  }, [user, firestore]);

  const { data: allSignals, isLoading } = useCollection(signalsQuery);

  const uniqueAlgos = useMemo(() => {
    if (!allSignals) return [];
    const set = new Set<string>();
    allSignals.forEach((s: any) => set.add(s.algo || "V8 Reversal"));
    return Array.from(set).sort();
  }, [allSignals]);

  const calculatePercent = (target: any, entry: any, type: string) => {
    const e = Number(entry);
    const t = Number(target);
    if (!e || isNaN(t)) return 0;
    const diff = type === "BUY" ? t - e : e - t;
    return (diff / e) * 100;
  };

  const formatPrice = (p: number | null | undefined) => {
    if (p === null || p === undefined) return "--";
    const decimals = p < 1 ? 6 : 2;
    return p.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const dateCutoff = useMemo(() => {
    const now = new Date();
    if (dateFilter === "today") return startOfDay(now).getTime();
    if (dateFilter === "week") return startOfWeek(now, { weekStartsOn: 1 }).getTime();
    if (dateFilter === "month") return startOfMonth(now).getTime();
    if (dateFilter === "custom") {
      return customFrom ? new Date(customFrom).getTime() : 0;
    }
    return 0;
  }, [dateFilter, customFrom]);

  const dateEnd = useMemo(() => {
    if (dateFilter === "custom" && customTo) {
      const d = new Date(customTo);
      d.setHours(23, 59, 59, 999);
      return d.getTime();
    }
    return Infinity;
  }, [dateFilter, customTo]);

  const filtered = useMemo(() => {
    if (!allSignals) return [];
    return allSignals.filter((s: any) => {
      if (s.autoFilterPassed !== true) return false;
      if (statusFilter === "active" && s.status === "INACTIVE") return false;
      if (statusFilter === "retired" && s.status !== "INACTIVE") return false;
      if (sideFilter !== "all" && s.type !== sideFilter) return false;
      if (tfFilter !== "all" && String(s.timeframe).toUpperCase() !== tfFilter.toUpperCase()) return false;
      if (algoFilter !== "all" && (s.algo || "V8 Reversal") !== algoFilter) return false;
      if (outcomeFilter === "tp1" && !s.tp1Hit) return false;
      if (outcomeFilter === "tp2" && !s.tp2Hit) return false;
      if (outcomeFilter === "tp3" && !s.tp3Hit) return false;
      if (outcomeFilter === "sl" && !(s.slHitAt != null && !s.tp1Hit)) return false;
      if (dateCutoff > 0 || dateEnd < Infinity) {
        const t = s.receivedAt ? new Date(s.receivedAt).getTime() : 0;
        if (t < dateCutoff || t > dateEnd) return false;
      }
      return true;
    });
  }, [allSignals, statusFilter, sideFilter, tfFilter, algoFilter, outcomeFilter, dateCutoff, dateEnd]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSignals = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const summaryStats = useMemo(() => {
    const total = filtered.length;
    const pnls = filtered.map((s: any) => effectivePnl(s) * getLeverage(s.timeframe));
    const wins = pnls.filter(p => p >= 0).length;
    const netPnl = pnls.reduce((a, b) => a + b, 0);
    const profitPnls = pnls.filter(p => p > 0);
    const lossPnls = pnls.filter(p => p < 0);
    const avgProfit = profitPnls.length > 0 ? profitPnls.reduce((a, b) => a + b, 0) / profitPnls.length : 0;
    const avgLoss = lossPnls.length > 0 ? lossPnls.reduce((a, b) => a + b, 0) / lossPnls.length : 0;

    const upsideValues = filtered
      .filter((s: any) => s.maxUpsidePrice != null)
      .map((s: any) => calculatePercent(s.maxUpsidePrice, s.price, s.type) * getLeverage(s.timeframe));
    const downsideValues = filtered
      .filter((s: any) => s.maxDrawdownPrice != null)
      .map((s: any) => calculatePercent(s.maxDrawdownPrice, s.price, s.type) * getLeverage(s.timeframe));

    const maxProfit = upsideValues.length > 0 ? Math.max(...upsideValues) : 0;
    const maxLoss = downsideValues.length > 0 ? Math.min(...downsideValues) : 0;

    const grossProfit = profitPnls.reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(lossPnls.reduce((a, b) => a + b, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    const tp1 = filtered.filter((s: any) => s.tp1Hit === true).length;
    const tp2 = filtered.filter((s: any) => s.tp2Hit === true).length;
    const tp3 = filtered.filter((s: any) => s.tp3Hit === true).length;
    const sl = filtered.filter((s: any) => s.slHitAt != null && !s.tp1Hit).length;

    return {
      total, wins, winRate: total > 0 ? (wins / total) * 100 : 0, netPnl,
      avgProfit, avgLoss, maxProfit, maxLoss, profitFactor, tp1, tp2, tp3, sl,
    };
  }, [filtered]);

  // Reset page when filters change
  const setFilterAndResetPage = <T,>(setter: (v: T) => void) => (v: T) => { setter(v); setPage(0); };

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

      <div className="lg:hidden flex items-center justify-center gap-2 px-4 py-2 bg-accent/10 border-b border-accent/20">
        <Zap className="w-3.5 h-3.5 text-accent" />
        <span className="text-[11px] font-bold text-accent/80">For the best experience, switch to desktop</span>
      </div>

      <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4 lg:space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tighter uppercase">Trade Audit</h1>
          <p className="text-muted-foreground text-sm max-w-2xl">
            Individual signal details with full execution history.
          </p>
        </header>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 lg:gap-3 overflow-x-auto pb-1">
          {/* Status filter */}
          <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-1">
            {([
              { key: "all" as const, label: "All", icon: Layers },
              { key: "active" as const, label: "Active", icon: Zap },
              { key: "retired" as const, label: "Retired", icon: Clock },
            ]).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setFilterAndResetPage(setStatusFilter)(key)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                  statusFilter === key
                    ? "bg-accent/15 text-accent shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>

          {/* Side filter */}
          <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-1">
            {([
              { key: "all" as const, label: "All" },
              { key: "BUY" as const, label: "Bulls" },
              { key: "SELL" as const, label: "Bears" },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilterAndResetPage(setSideFilter)(key)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                  sideFilter === key
                    ? "bg-accent/15 text-accent shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Timeframe filter */}
          <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-1">
            <button
              onClick={() => setFilterAndResetPage(setTfFilter)("all")}
              className={cn(
                "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                tfFilter === "all"
                  ? "bg-accent/15 text-accent shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              All TF
            </button>
            {TIMEFRAMES.map(tf => (
              <button
                key={tf.id}
                onClick={() => setFilterAndResetPage(setTfFilter)(tf.id)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                  tfFilter === tf.id
                    ? "bg-accent/15 text-accent shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tfLabelMap[tf.id]}
              </button>
            ))}
          </div>

          {/* Date filter */}
          <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-1">
            {([
              { key: "all" as const, label: "All Time" },
              { key: "today" as const, label: "Today" },
              { key: "week" as const, label: "This Week" },
              { key: "month" as const, label: "This Month" },
              { key: "custom" as const, label: "Custom" },
            ]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilterAndResetPage(setDateFilter)(key)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                  dateFilter === key
                    ? "bg-accent/15 text-accent shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {key === "all" && <CalendarDays className="h-3 w-3" />}
                {label}
              </button>
            ))}
          </div>

          {/* Algo filter */}
          {uniqueAlgos.length > 1 && (
            <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-1">
              <button
                onClick={() => setFilterAndResetPage(setAlgoFilter)("all")}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                  algoFilter === "all"
                    ? "bg-accent/15 text-accent shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                All Algos
              </button>
              {uniqueAlgos.map(algo => (
                <button
                  key={algo}
                  onClick={() => setFilterAndResetPage(setAlgoFilter)(algo)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                    algoFilter === algo
                      ? "bg-accent/15 text-accent shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {algo}
                </button>
              ))}
            </div>
          )}

          {/* Outcome filter */}
          <div className="flex items-center rounded-lg border border-white/10 bg-white/[0.03] p-1">
            {([
              { id: "all", label: "All" },
              { id: "tp1", label: "TP1" },
              { id: "tp2", label: "TP2" },
              { id: "tp3", label: "TP3" },
              { id: "sl", label: "SL" },
            ] as const).map(o => (
              <button
                key={o.id}
                onClick={() => setFilterAndResetPage(setOutcomeFilter)(o.id)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                  outcomeFilter === o.id
                    ? o.id === "sl" ? "bg-rose-500/15 text-rose-400 shadow-sm"
                    : o.id !== "all" ? "bg-emerald-500/15 text-emerald-400 shadow-sm"
                    : "bg-accent/15 text-accent shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>

        </div>

        {/* Custom date range inputs */}
        {dateFilter === "custom" && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">From</span>
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => { setCustomFrom(e.target.value); setPage(0); }}
                className="h-8 w-40 text-xs bg-white/[0.03] border-white/10"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">To</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => { setCustomTo(e.target.value); setPage(0); }}
                className="h-8 w-40 text-xs bg-white/[0.03] border-white/10"
              />
            </div>
          </div>
        )}

        {/* Summary stats bar — grouped by theme */}
        <div className="grid grid-cols-2 lg:flex lg:flex-wrap items-stretch gap-2 text-center">
          {/* Overview group */}
          <div className="flex flex-wrap items-center justify-evenly gap-3 lg:gap-5 px-3 lg:px-4 py-3 rounded-lg border border-white/5 bg-white/[0.02]">
            <div>
              <span className="text-[8px] lg:text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 block">Trades</span>
              <span className="text-base lg:text-lg font-black font-mono text-white">{summaryStats.total}</span>
            </div>
            <div>
              <span className="text-[8px] lg:text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 block">Win Rate</span>
              <span className={cn("text-base lg:text-lg font-black font-mono", summaryStats.winRate >= 50 ? "text-emerald-400" : "text-rose-400")}>
                {summaryStats.winRate.toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="text-[8px] lg:text-[9px] font-bold uppercase tracking-widest text-muted-foreground/50 block">PF</span>
              <span className={cn("text-base lg:text-lg font-black font-mono", summaryStats.profitFactor >= 1 ? "text-emerald-400" : "text-rose-400")}>
                {summaryStats.profitFactor === Infinity ? "∞" : summaryStats.profitFactor.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Profit group */}
          <div className="flex flex-wrap items-center justify-evenly gap-3 lg:gap-5 px-3 lg:px-4 py-3 rounded-lg border border-emerald-500/10 bg-emerald-500/[0.03]">
            <div>
              <span className="text-[8px] lg:text-[9px] font-bold uppercase tracking-widest text-emerald-400/40 block">Avg Profit</span>
              <span className="text-base lg:text-lg font-black font-mono text-emerald-400">
                +{summaryStats.avgProfit.toFixed(2)}%
              </span>
            </div>
            <div>
              <span className="text-[8px] lg:text-[9px] font-bold uppercase tracking-widest text-emerald-400/40 block">Max Profit</span>
              <span className="text-base lg:text-lg font-black font-mono text-emerald-400">
                +{summaryStats.maxProfit.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Loss group */}
          <div className="flex flex-wrap items-center justify-evenly gap-3 lg:gap-5 px-3 lg:px-4 py-3 rounded-lg border border-rose-500/10 bg-rose-500/[0.03]">
            <div>
              <span className="text-[8px] lg:text-[9px] font-bold uppercase tracking-widest text-rose-400/40 block">Avg Loss</span>
              <span className="text-base lg:text-lg font-black font-mono text-rose-400">
                {summaryStats.avgLoss.toFixed(2)}%
              </span>
            </div>
            <div>
              <span className="text-[8px] lg:text-[9px] font-bold uppercase tracking-widest text-rose-400/40 block">Max Loss</span>
              <span className="text-base lg:text-lg font-black font-mono text-rose-400">
                {summaryStats.maxLoss.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Targets group */}
          <div className="flex flex-wrap items-center justify-evenly gap-3 lg:gap-5 px-3 lg:px-4 py-3 rounded-lg border border-white/5 bg-white/[0.02]">
            <div>
              <span className="text-[8px] lg:text-[9px] font-bold uppercase tracking-widest text-emerald-400/40 block">TP1</span>
              <span className="text-base lg:text-lg font-black font-mono text-emerald-400">{summaryStats.tp1}</span>
            </div>
            <div>
              <span className="text-[8px] lg:text-[9px] font-bold uppercase tracking-widest text-emerald-400/40 block">TP2</span>
              <span className="text-base lg:text-lg font-black font-mono text-emerald-400">{summaryStats.tp2}</span>
            </div>
            <div>
              <span className="text-[8px] lg:text-[9px] font-bold uppercase tracking-widest text-emerald-400/40 block">TP3</span>
              <span className="text-base lg:text-lg font-black font-mono text-emerald-400">{summaryStats.tp3}</span>
            </div>
            <div>
              <span className="text-[8px] lg:text-[9px] font-bold uppercase tracking-widest text-rose-400/40 block">SL</span>
              <span className="text-base lg:text-lg font-black font-mono text-rose-400">{summaryStats.sl}</span>
            </div>
          </div>
        </div>

        {/* Mobile: Card layout */}
        <div className="lg:hidden space-y-3">
          {pageSignals.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-16 opacity-40">
              <Archive className="h-12 w-12 text-muted-foreground" />
              <p className="text-xs font-bold uppercase tracking-widest text-white">No Signals Found</p>
            </div>
          ) : (
            pageSignals.map((signal: any) => {
              const leverage = getLeverage(signal.timeframe);
              const pnl = effectivePnl(signal) * leverage;
              const chartLabel = tfLabelMap[String(signal.timeframe).toUpperCase()] ?? `${signal.timeframe}m`;
              const isRetired = signal.status === "INACTIVE";
              const isBuy = signal.type === "BUY";
              const maxUp = calculatePercent(signal.maxUpsidePrice, signal.price, signal.type) * leverage;
              const maxDown = calculatePercent(signal.maxDrawdownPrice, signal.price, signal.type) * leverage;

              return (
                <Link key={signal.id} href={`/chart/${signal.id}`} className="block">
                  <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] shadow-lg shadow-black/20 overflow-hidden hover:border-white/[0.12] transition-all">
                    {/* Header row */}
                    <div className="px-4 pt-4 pb-3 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-black text-foreground uppercase tracking-tight">{signal.symbol}</span>
                          <span className={cn("text-[11px] font-bold uppercase", isBuy ? "text-emerald-400/70" : "text-rose-400/70")}>
                            {isBuy ? "▲ Long" : "▼ Short"}
                          </span>
                          <span className="text-white/15">·</span>
                          <span className="text-[11px] text-muted-foreground/60 uppercase">{chartLabel}</span>
                          <span className="text-[9px] font-bold text-muted-foreground/40">{leverage}x</span>
                        </div>
                        <Badge className={cn("text-[9px] font-black h-5 uppercase px-2", isRetired ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400")}>
                          {isRetired ? "Retired" : "Active"}
                        </Badge>
                      </div>
                      <div className="text-[10px] font-bold text-muted-foreground/30 uppercase mt-1">
                        {signal.algo || "V8 Reversal"}
                      </div>
                    </div>

                    {/* Body */}
                    <div className="px-4 py-3 space-y-3">
                      {/* PNL + Date */}
                      <div className="flex items-center justify-between">
                        <div className={cn("flex items-center gap-1.5 font-mono text-lg font-black", pnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                          {pnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                          {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}%
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground/40">{format(new Date(signal.receivedAt), "MMM dd, HH:mm")}</span>
                      </div>

                      {/* Entry / Current */}
                      <div className="flex items-center gap-3 text-[11px]">
                        <div>
                          <span className="text-muted-foreground/40 mr-1.5">Entry</span>
                          <span className="font-mono font-bold text-white/50">${formatPrice(signal.price)}</span>
                        </div>
                        <span className="text-white/10">→</span>
                        <div>
                          <span className="text-muted-foreground/40 mr-1.5">Current</span>
                          <span className="font-mono font-bold text-white">${formatPrice(signal.currentPrice)}</span>
                        </div>
                      </div>

                      {/* Targets + Excursion */}
                      <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
                        <div className="flex items-center gap-1.5">
                          {[
                            { num: 1, hit: signal.tp1Hit },
                            { num: 2, hit: signal.tp2Hit },
                            { num: 3, hit: signal.tp3Hit },
                          ].map((tp) => {
                            const slKilled = !tp.hit && signal.slHitAt != null;
                            return (
                              <span
                                key={tp.num}
                                className={cn(
                                  "px-1.5 py-0.5 rounded text-[9px] font-bold",
                                  tp.hit
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : slKilled
                                      ? "bg-rose-500/10 text-rose-400/50 line-through"
                                      : "bg-white/5 text-muted-foreground/40"
                                )}
                              >
                                TP{tp.num}{tp.hit ? "✓" : ""}
                              </span>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1 font-mono text-[10px] font-bold text-emerald-400/80">
                            <ArrowUpRight className="h-2.5 w-2.5" />{maxUp.toFixed(1)}%
                          </div>
                          <div className="flex items-center gap-1 font-mono text-[10px] font-bold text-rose-400/80">
                            <ArrowDownRight className="h-2.5 w-2.5" />{maxDown.toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>

        {/* Desktop: Table layout */}
        <div className="hidden lg:block bg-card border border-white/5 rounded-lg overflow-x-auto">
          <div className="min-w-[1100px]">
            <Table>
              <TableHeader className="bg-card sticky top-0 z-10 shadow-[0_1px_0_rgba(255,255,255,0.05)]">
                    <TableRow className="hover:bg-transparent border-white/5">
                      <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 w-[120px]">Symbol</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 w-[48px]">Side</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 w-[36px]">Chart</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 w-[70px]">Algo</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 w-[36px]">Lev.</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Entry</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Current</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">SL</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 w-[72px]">Targets</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Net PNL</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider h-12">Max Excursion</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 w-[72px]">AI Score</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 w-[64px]">Status</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider h-12 w-[90px] text-right">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageSignals.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={14} className="h-64 text-center">
                          <div className="flex flex-col items-center gap-4 opacity-40">
                            <Archive className="h-12 w-12 text-muted-foreground" />
                            <div className="space-y-1">
                              <p className="text-xs font-bold uppercase tracking-widest text-white">No Signals Found</p>
                              <p className="text-[10px] text-muted-foreground max-w-xs mx-auto">No signals match the current filters.</p>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      pageSignals.map((signal: any) => {
                        const leverage = getLeverage(signal.timeframe);
                        const pnl = effectivePnl(signal) * leverage;
                        const maxUp = calculatePercent(signal.maxUpsidePrice, signal.price, signal.type) * leverage;
                        const maxDown = calculatePercent(signal.maxDrawdownPrice, signal.price, signal.type) * leverage;
                        const chartLabel = tfLabelMap[String(signal.timeframe).toUpperCase()] ?? `${signal.timeframe}m`;
                        const hasTp = signal.tp1 != null && signal.tp2 != null;
                        const effectiveSLPhase = signal.tp2Hit ? "tp1" : signal.tp1Hit ? "cost" : "original";
                        const isRetired = signal.status === "INACTIVE";

                        return (
                          <TableRow key={signal.id} className="border-white/5 hover:bg-white/[0.02] transition-colors">
                            <TableCell className="py-4">
                              <Link href={`/chart/${signal.id}`} className="text-sm font-black text-white leading-none uppercase tracking-tighter hover:text-accent transition-colors">
                                {signal.symbol}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <Badge className={cn("text-[9px] font-black h-5 uppercase px-2", signal.type === "BUY" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400")}>
                                {signal.type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs font-bold text-muted-foreground uppercase">{chartLabel}</TableCell>
                            <TableCell className="text-[10px] font-bold text-muted-foreground/50 uppercase max-w-[70px] truncate">{signal.algo || "V8 Reversal"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[9px] font-black h-5 px-1.5 border-accent/20 text-accent">{leverage}x</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs font-bold text-white/60">${formatPrice(signal.price)}</TableCell>
                            <TableCell className="font-mono text-xs font-bold text-white">${formatPrice(signal.currentPrice)}</TableCell>
                            <TableCell>
                              {signal.stopLoss != null && signal.stopLoss > 0 ? (
                                <div className="flex flex-col">
                                  <span className="font-mono text-xs font-bold text-white">
                                    ${formatPrice(effectiveSLPhase === "tp1" ? signal.tp1 : effectiveSLPhase === "cost" ? signal.price : signal.stopLoss)}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground/60">
                                    {effectiveSLPhase === "tp1" ? "Moved to TP1" : effectiveSLPhase === "cost" ? "Moved to Entry" : "Original"}
                                  </span>
                                </div>
                              ) : <span className="font-mono text-xs font-bold text-muted-foreground/30">--</span>}
                            </TableCell>
                            <TableCell>
                              {hasTp ? (
                                <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase">
                                  {[
                                    { num: 1, hit: signal.tp1Hit },
                                    { num: 2, hit: signal.tp2Hit },
                                    { num: 3, hit: signal.tp3Hit },
                                  ].map((tp) => {
                                    const slKilled = !tp.hit && signal.slHitAt != null;
                                    return (
                                      <span
                                        key={tp.num}
                                        className={cn(
                                          "relative px-1.5 py-0.5 rounded",
                                          tp.hit
                                            ? "bg-emerald-500/20 text-emerald-400"
                                            : slKilled
                                              ? "bg-rose-500/10 text-rose-400/50 line-through decoration-rose-400/60"
                                              : "bg-white/5 text-muted-foreground/40"
                                        )}
                                      >
                                        {tp.num}{tp.hit ? "✓" : ""}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-[10px] text-muted-foreground/30">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className={cn("flex items-center gap-1.5 font-mono text-xs font-black", pnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                {pnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}%
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
                            <TableCell>
                              {signal.initialConfidenceScore != null ? (
                                <div className="flex items-center gap-2 font-mono text-xs font-bold">
                                  <span className="text-white/60">{Math.round(signal.initialConfidenceScore)}</span>
                                  <span className="text-white/20">/</span>
                                  <span className="text-rose-400">{Math.round(signal.minConfidenceScore ?? signal.initialConfidenceScore)}</span>
                                  <span className="text-white/20">/</span>
                                  <span className="text-emerald-400">{Math.round(signal.maxConfidenceScore ?? signal.initialConfidenceScore)}</span>
                                  <span className="text-white/20">/</span>
                                  <span className="text-accent">{Math.round(signal.confidenceScore ?? signal.initialConfidenceScore)}</span>
                                </div>
                              ) : (
                                <span className="text-[10px] text-muted-foreground/30">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge className={cn("text-[9px] font-black h-5 uppercase px-2", isRetired ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400")}>
                                {isRetired ? "Retired" : "Active"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex flex-col items-end">
                                <span className="text-[10px] font-mono font-bold text-white/40">{format(new Date(signal.receivedAt), "yyyy-MM-dd")}</span>
                                <span className="text-[10px] font-mono font-bold text-accent/40">{format(new Date(signal.receivedAt), "HH:mm")}</span>
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

      </main>

      {/* Sticky pagination */}
      {totalPages > 1 && (
        <div className="sticky bottom-0 z-20 border-t border-white/5 bg-background/95 backdrop-blur px-6 py-3 flex items-center justify-between">
          <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider">
            Page {page + 1} of {totalPages} · Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              className="h-8 px-3 text-[10px] font-bold uppercase tracking-wider border-white/10"
            >
              <ChevronLeft className="h-3 w-3 mr-1" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              className="h-8 px-3 text-[10px] font-bold uppercase tracking-wider border-white/10"
            >
              Next <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TradeAuditPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>}>
      <TradeAuditContent />
    </Suspense>
  );
}
