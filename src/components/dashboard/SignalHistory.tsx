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
  Activity,
  Zap,
  ChevronRight
} from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import { useCollection, useUser, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, limit, orderBy } from "firebase/firestore";
import { useRouter } from "next/navigation";

/**
 * PRODUCTION TERMINAL ENGINE - THEMED SECTIONS
 * Organizes signals into horizontal scrollable rows based on trading strategy.
 * 5m: Try scalping, 15m: Intraday, 1h: BTST, 4h: Swing, Daily: Positional.
 */
export function SignalHistory() {
  const router = useRouter();
  const { user } = useUser();
  const firestore = useFirestore();
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(new Date());
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
      limit(200)
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

  const categories = [
    { id: "5", title: "Try scalping", label: "5 Min Chart" },
    { id: "15", title: "Intraday candidates", label: "15 Min Chart" },
    { id: "60", title: "BTST options", label: "1 Hour Chart" },
    { id: "240", title: "Swing opportunities", label: "4 Hour Chart" },
    { id: "D", title: "Positional opportunities", label: "Daily Chart" },
  ];

  const filteredSignals = useMemo(() => {
    if (!rawSignals) return [];
    return rawSignals.filter(signal => {
      if (activeAssetType) {
        const displayAssetType = getDisplayAssetType(signal);
        if (displayAssetType !== activeAssetType) return false;
      }
      return true;
    });
  }, [rawSignals, activeAssetType]);

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

  const assetTypes = [
    { label: "All Assets", value: null },
    { label: "Crypto", value: "CRYPTO" },
    { label: "Indian Stocks", value: "INDIAN STOCKS" },
    { label: "US Stocks", value: "US STOCKS" },
  ];

  if (error) {
    return (
      <div className="p-10 text-center flex flex-col items-center justify-center gap-4 h-full">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-sm font-bold text-white uppercase tracking-widest">Database Error: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0c]">
      {/* Top Filter Bar */}
      <div className="p-4 border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-md flex items-center justify-between shrink-0 z-20">
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

      {/* Main Content Sections */}
      <ScrollArea className="flex-1 w-full bg-[#0a0a0c]">
        <div className="py-6 space-y-12">
          {isLoading ? (
            <div className="px-6 space-y-8">
               {[1,2,3].map(i => (
                 <div key={i} className="space-y-4">
                   <div className="h-6 w-48 bg-white/5 animate-pulse rounded" />
                   <div className="flex gap-4 overflow-hidden">
                     {[1,2,3,4].map(j => <div key={j} className="h-64 w-72 shrink-0 rounded-xl bg-white/5 animate-pulse" />)}
                   </div>
                 </div>
               ))}
            </div>
          ) : filteredSignals.length === 0 ? (
            <div className="py-24 text-center">
              <Activity className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-black">No signals detected for current asset filters</p>
            </div>
          ) : (
            categories.map(cat => {
              const categorySignals = filteredSignals.filter(s => s.timeframe === cat.id);
              if (categorySignals.length === 0) return null;

              return (
                <section key={cat.id} className="space-y-6">
                  <div className="px-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="bg-accent/10 p-2 rounded-lg border border-accent/20">
                        <Zap className="h-5 w-5 text-accent" />
                      </div>
                      <div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tighter leading-none">
                          {cat.label}
                        </h2>
                        <p className="text-[11px] font-bold text-accent uppercase tracking-[0.2em] mt-1.5 opacity-70">
                          {cat.title}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="border-white/5 text-muted-foreground/60 text-[10px] uppercase font-bold">
                      {categorySignals.length} Active
                    </Badge>
                  </div>

                  <ScrollArea className="w-full">
                    <div className="flex gap-4 px-6 pb-6">
                      {categorySignals.map((signal) => {
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
                            className="group relative overflow-hidden bg-[#121214] border-white/5 hover:border-accent/40 transition-all duration-300 cursor-pointer shadow-xl hover:shadow-accent/5 rounded-xl flex flex-col w-[300px] shrink-0"
                          >
                            <div className="p-4 border-b border-white/5 bg-white/[0.02]">
                              <div className="flex items-start justify-between">
                                <div className="flex flex-col">
                                  <h3 className="text-lg font-black text-white leading-none tracking-tighter uppercase mb-1 flex items-baseline gap-2">
                                    {signal.symbol}
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
                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Analyze Chart</span>
                                <span className="text-[9px] font-bold text-accent/60 uppercase">{cat.label.replace(' Chart', '')}</span>
                              </div>
                              <LineChart className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors" />
                            </div>

                            <div className={cn(
                              "absolute bottom-0 left-0 right-0 h-[2px] transition-all duration-300",
                              isPnlPositive ? "bg-emerald-500/40" : "bg-rose-500/40",
                              "group-hover:h-1 group-hover:bg-accent"
                            )} />
                          </Card>
                        );
                      })}
                    </div>
                    <ScrollBar orientation="horizontal" />
                  </ScrollArea>
                </section>
              );
            })
          )}

          {/* Fallback for signals not in mapped categories (e.g. 1m, 15s) */}
          {!isLoading && filteredSignals.some(s => !categories.map(c => c.id).includes(s.timeframe)) && (
             <section className="space-y-6 pt-6 border-t border-white/5 opacity-40 hover:opacity-100 transition-opacity">
                <div className="px-6">
                  <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Other Intervals</h2>
                </div>
                <ScrollArea className="w-full">
                  <div className="flex gap-4 px-6 pb-6">
                    {filteredSignals
                      .filter(s => !categories.map(c => c.id).includes(s.timeframe))
                      .map((signal) => (
                        <Card 
                          key={signal.id} 
                          onClick={() => router.push(`/chart/${signal.id}`)}
                          className="bg-[#121214] border-white/5 rounded-xl w-[260px] shrink-0 p-4 hover:border-accent/40 transition-colors cursor-pointer"
                        >
                           <div className="flex justify-between items-center mb-2">
                             <span className="font-bold text-white uppercase">{signal.symbol}</span>
                             <Badge variant="outline" className="text-[9px] border-white/10">{signal.timeframe}</Badge>
                           </div>
                           <div className="flex justify-between items-center">
                             <span className="text-[10px] text-muted-foreground">{getDisplayAssetType(signal)}</span>
                             <ChevronRight className="h-3 w-3 text-muted-foreground" />
                           </div>
                        </Card>
                      ))}
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
             </section>
          )}
        </div>
        <ScrollBar orientation="vertical" />
      </ScrollArea>
    </div>
  );
}
