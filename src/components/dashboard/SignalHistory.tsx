"use client";

import { useState, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { 
  AlertCircle, 
  LineChart, 
  Server, 
  ArrowUpRight, 
  ArrowDownRight, 
  Timer, 
  TrendingUp,
  Clock,
  ExternalLink,
  Activity
} from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import { useCollection, useUser, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, limit, orderBy } from "firebase/firestore";
import { useRouter } from "next/navigation";

/**
 * PRODUCTION TERMINAL ENGINE - CARD EDITION
 * Displays signals as high-density market cards with BULLISH/BEARISH labels.
 */
export function SignalHistory() {
  const router = useRouter();
  const { user } = useUser();
  const firestore = useFirestore();
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(new Date());
  const [activeTimeframe, setActiveTimeframe] = useState<string | null>(null);
  const [activeAssetType, setActiveAssetType] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const signalsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "signals"), 
      orderBy("receivedAt", "desc"), 
      limit(150)
    );
  }, [user, firestore]);

  const { data: rawSignals, isLoading, error } = useCollection(signalsQuery);

  /**
   * DEEP-PARSING ENGINE (TRUTH-BASED)
   */
  const getDisplayAssetType = (signal: any) => {
    if (signal.assetType && signal.assetType !== "UNCLASSIFIED") return signal.assetType;
    try {
      const payload = typeof signal.payload === 'string' ? JSON.parse(signal.payload) : (signal.payload || {});
      const raw = payload.asset_type || payload.assetType || payload.category || payload.market_type;
      if (raw) {
        const norm = raw.toString().toUpperCase().trim();
        if (norm.includes("INDIAN")) return "INDIAN STOCKS";
        if (norm.includes("US")) return "US STOCKS";
        if (norm.includes("CRYPTO")) return "CRYPTO";
        return norm;
      }
    } catch (e) {}
    return "UNCLASSIFIED";
  };

  /**
   * RESILIENT FILTERING ENGINE (CLIENT-SIDE)
   */
  const filteredSignals = useMemo(() => {
    if (!rawSignals) return [];
    return rawSignals.filter(signal => {
      const displayAssetType = getDisplayAssetType(signal);
      if (activeAssetType && displayAssetType !== activeAssetType) return false;
      if (activeTimeframe && signal.timeframe !== activeTimeframe) return false;
      return true;
    });
  }, [rawSignals, activeAssetType, activeTimeframe]);

  const calculatePercent = (targetPrice: number | undefined | null, entry: number, type: string) => {
    if (targetPrice === undefined || targetPrice === null || !entry || entry === 0) return "0.00";
    const diff = type === 'BUY' ? targetPrice - entry : entry - targetPrice;
    return ((diff / entry) * 100).toFixed(2);
  };

  const formatPrice = (price: number | null | undefined) => {
    if (price === null || price === undefined) return "--";
    const decimals = price < 1 ? 6 : 2;
    return price.toLocaleString(undefined, { 
      minimumFractionDigits: decimals, 
      maximumFractionDigits: decimals 
    });
  };

  const getRunningSince = (receivedAt: string) => {
    const start = new Date(receivedAt);
    const diffMins = differenceInMinutes(now, start);
    const days = Math.floor(diffMins / 1440);
    const hours = Math.floor((diffMins % 1440) / 60);
    const mins = diffMins % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  if (error) {
    return (
      <div className="p-10 text-center flex flex-col items-center justify-center gap-4 h-full">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-sm font-bold text-white uppercase tracking-widest">Database Error: {error.message}</p>
      </div>
    );
  }

  const assetTypes = [
    { label: "All Assets", value: null },
    { label: "Crypto", value: "CRYPTO" },
    { label: "Indian Stocks", value: "INDIAN STOCKS" },
    { label: "US Stocks", value: "US STOCKS" },
  ];

  const timeframeFilters = [
    { label: "All Chart Timeframes", value: null },
    { label: "5 min", value: "5" },
    { label: "15 min", value: "15" },
    { label: "1 hour", value: "60" },
    { label: "4 Hour", value: "240" },
    { label: "Daily", value: "D" },
  ];

  const getTimeframeLabel = (tf: string) => {
    const found = timeframeFilters.find(f => f.value === tf);
    if (found) return found.label;
    if (tf === "1") return "1 min";
    return tf;
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0c]">
      <div className="p-4 border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-md flex flex-col gap-4 shrink-0 z-20">
        <div className="flex items-center justify-between">
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {assetTypes.map(asset => (
              <button
                key={asset.label}
                onClick={() => setActiveAssetType(asset.value)}
                className={cn(
                  "px-4 py-2 text-[11px] font-black rounded-lg uppercase transition-all whitespace-nowrap border",
                  activeAssetType === asset.value 
                    ? "bg-accent text-accent-foreground border-accent shadow-[0_0_15px_rgba(125,249,255,0.2)]" 
                    : "bg-white/5 text-muted-foreground border-white/5 hover:bg-white/10"
                )}
              >
                {asset.label}
              </button>
            ))}
          </div>
          <Badge variant="outline" className="text-[10px] h-8 border-emerald-500/20 text-emerald-400 gap-2 bg-emerald-500/5 px-4 font-black uppercase hidden sm:flex">
            <Server className="h-3.5 w-3.5 animate-pulse" /> 24/7 SYNC ACTIVE
          </Badge>
        </div>

        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {timeframeFilters.map(tf => (
            <button
              key={tf.label}
              onClick={() => setActiveTimeframe(tf.value)}
              className={cn(
                "px-4 py-1.5 text-[10px] font-black rounded-md uppercase transition-all border whitespace-nowrap",
                activeTimeframe === tf.value
                  ? "bg-white text-black border-white" 
                  : "bg-white/5 text-muted-foreground border-white/5 hover:bg-white/10"
              )}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1 w-full bg-[#0a0a0c]">
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-64 rounded-xl bg-white/5 animate-pulse border border-white/5" />
            ))
          ) : filteredSignals.length === 0 ? (
            <div className="col-span-full py-24 text-center">
              <Activity className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-black">No signals detected for current filters</p>
            </div>
          ) : (
            filteredSignals.map((signal) => {
              const alertPrice = Number(signal.price || 0);
              const currentPrice = signal.currentPrice ? Number(signal.currentPrice) : alertPrice;
              const livePnl = calculatePercent(currentPrice, alertPrice, signal.type);
              const upsidePercent = calculatePercent(signal.maxUpsidePrice, alertPrice, signal.type);
              const drawdownPercent = calculatePercent(signal.maxDrawdownPrice, alertPrice, signal.type);
              const isPnlPositive = Number(livePnl) >= 0;
              const displayAssetType = getDisplayAssetType(signal);
              const isBullish = signal.type === 'BUY';

              return (
                <Card 
                  key={signal.id} 
                  onClick={() => router.push(`/chart/${signal.id}`)}
                  className="group relative overflow-hidden bg-[#121214] border-white/5 hover:border-accent/40 transition-all duration-300 cursor-pointer shadow-xl hover:shadow-accent/5 rounded-xl flex flex-col"
                >
                  <div className="p-4 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col">
                        <h3 className="text-lg font-black text-white leading-none tracking-tighter uppercase mb-1 flex items-baseline gap-2">
                          {signal.symbol}
                          <span className="text-[10px] text-muted-foreground font-bold opacity-40">
                            {getTimeframeLabel(signal.timeframe)}
                          </span>
                        </h3>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-black text-accent uppercase tracking-wider">
                            {displayAssetType}
                          </span>
                        </div>
                      </div>
                      <Badge className={cn(
                        "text-[10px] font-black border-none px-2 h-5 uppercase rounded-sm",
                        isBullish ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                      )}>
                        {isBullish ? 'BULLISH' : 'BEARISH'}
                      </Badge>
                    </div>
                  </div>

                  <div className="px-4 py-2 bg-black/40 flex items-center justify-between border-b border-white/5 text-[10px] font-bold text-muted-foreground/60 uppercase">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3" /> {mounted ? format(new Date(signal.receivedAt), 'HH:mm') : "--"}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Timer className="h-3 w-3 text-accent" /> {mounted ? getRunningSince(signal.receivedAt) : "--"}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ExternalLink className="h-3 w-3" /> {signal.exchange || "BINANCE"}
                    </div>
                  </div>

                  <CardContent className="p-4 flex-1 flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Entry Price</p>
                        <p className="text-sm font-mono font-bold text-white/80">${formatPrice(alertPrice)}</p>
                      </div>
                      <div className="space-y-1 text-right">
                        <p className="text-[9px] font-black text-accent uppercase tracking-widest">Live Performance</p>
                        <div className={cn("text-sm font-mono font-black", isPnlPositive ? "text-emerald-400" : "text-rose-400")}>
                          ${formatPrice(currentPrice)}
                        </div>
                        <div className={cn("text-[10px] font-black flex items-center justify-end gap-1", isPnlPositive ? "text-emerald-400" : "text-rose-400")}>
                           <TrendingUp className={cn("h-3 w-3", !isPnlPositive && "rotate-180")} />
                           {livePnl}%
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/5">
                      <div className="p-2 rounded-lg bg-emerald-500/[0.03] border border-emerald-500/10">
                        <p className="text-[8px] font-black text-emerald-500/60 uppercase tracking-widest mb-1">Max Upside</p>
                        <p className="text-xs font-mono font-black text-emerald-400 flex items-center gap-1">
                          <ArrowUpRight className="h-3 w-3" /> {upsidePercent}%
                        </p>
                        <p className="text-[9px] font-mono text-muted-foreground/40 font-bold mt-1">
                          ${formatPrice(signal.maxUpsidePrice)}
                        </p>
                      </div>
                      <div className="p-2 rounded-lg bg-rose-500/[0.03] border border-rose-500/10 text-right">
                        <p className="text-[8px] font-black text-rose-500/60 uppercase tracking-widest mb-1">Max Drawdown</p>
                        <p className="text-xs font-mono font-black text-rose-400 flex items-center justify-end gap-1">
                          <ArrowDownRight className="h-3 w-3" /> {drawdownPercent}%
                        </p>
                        <p className="text-[9px] font-mono text-muted-foreground/40 font-bold mt-1">
                          ${formatPrice(signal.maxDrawdownPrice)}
                        </p>
                      </div>
                    </div>
                  </CardContent>

                  <div className="px-4 py-3 border-t border-white/5 bg-white/[0.01] flex items-center justify-between group-hover:bg-accent/[0.05] transition-colors">
                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Analyze Chart</span>
                    <LineChart className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors" />
                  </div>

                  <div className={cn(
                    "absolute bottom-0 left-0 right-0 h-[2px] transition-all duration-300",
                    isPnlPositive ? "bg-emerald-500/40" : "bg-rose-500/40",
                    "group-hover:h-1 group-hover:bg-accent"
                  )} />
                </Card>
              );
            })
          )}
        </div>
        <ScrollBar orientation="vertical" />
      </ScrollArea>
    </div>
  );
}
