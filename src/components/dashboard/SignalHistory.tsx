
"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { 
  LineChart, 
  ArrowUpRight, 
  ArrowDownRight, 
  Timer, 
  TrendingUp,
  Clock,
  Activity,
  ChevronDown,
  Zap,
  BarChart3,
  Globe,
  Activity as PerformanceIcon,
  Shield
} from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import { useCollection, useUser, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, limit, orderBy } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { getLeverage, getLeverageLabel } from "@/lib/leverage";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type SignalHistoryProps = {
  initialTimeframeTab?: string | null;
  initialPerformanceFilter?: string | null;
  initialSideFilter?: string | null;
  hideFilters?: boolean;
};

/**
 * PRODUCTION TERMINAL ENGINE - PERSISTENT STATE
 * Now exclusively displays ACTIVE signals for the live idea stream.
 */
export function SignalHistory({ initialTimeframeTab, initialPerformanceFilter, initialSideFilter, hideFilters }: SignalHistoryProps = {}) {
  const router = useRouter();
  const { user } = useUser();
  const firestore = useFirestore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(new Date());
  
  // Persistence Keys
  const STORAGE_KEY_TAB = "tez_terminal_timeframe_tab";
  const STORAGE_KEY_GLOBAL_PERF = "tez_terminal_global_perf";
  const STORAGE_KEY_SCROLL = "tez_terminal_scroll";

  // Filtering States — crypto only; single active timeframe tab
  const [activeTimeframeTab, setActiveTimeframeTab] = useState<string>("all");
  const [globalPerformanceFilter, setGlobalPerformanceFilter] = useState<string>("working");
  const [activeSideFilter, setActiveSideFilter] = useState<string>("all");

  // Initialization — URL params (from Opportunity Finder links) override sessionStorage
  useEffect(() => {
    setMounted(true);
    const savedTab = sessionStorage.getItem(STORAGE_KEY_TAB);
    const savedPerf = sessionStorage.getItem(STORAGE_KEY_GLOBAL_PERF);
    const savedScroll = sessionStorage.getItem(STORAGE_KEY_SCROLL);
    if (initialTimeframeTab != null && initialTimeframeTab !== "") {
      setActiveTimeframeTab(initialTimeframeTab);
    } else if (savedTab) {
      setActiveTimeframeTab(savedTab);
    }
    if (initialPerformanceFilter != null && initialPerformanceFilter !== "") {
      setGlobalPerformanceFilter(initialPerformanceFilter);
    } else if (savedPerf) {
      setGlobalPerformanceFilter(savedPerf);
    }
    if (initialSideFilter != null && initialSideFilter !== "") {
      setActiveSideFilter(initialSideFilter);
    }
    if (savedScroll && scrollContainerRef.current) {
      setTimeout(() => {
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = parseInt(savedScroll, 10);
      }, 200);
    }
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    sessionStorage.setItem(STORAGE_KEY_TAB, activeTimeframeTab);
    sessionStorage.setItem(STORAGE_KEY_GLOBAL_PERF, globalPerformanceFilter);
  }, [activeTimeframeTab, globalPerformanceFilter, mounted]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    sessionStorage.setItem(STORAGE_KEY_SCROLL, e.currentTarget.scrollTop.toString());
  };

  const signalsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "signals"), 
      orderBy("receivedAt", "desc"), 
      limit(200)
    );
  }, [user, firestore]);

  const { data: rawSignals, isLoading } = useCollection(signalsQuery);

  const getDisplayAssetType = (signal: any) => {
    if (signal.assetType && signal.assetType !== "UNCLASSIFIED") return signal.assetType;
    return "CRYPTO";
  };

  const categories = [
    { id: "5", title: "High-Velocity Stream", label: "5 MIN", icon: Zap },
    { id: "15", title: "Interim-Trend Monitor", label: "15 MIN", icon: Activity },
    { id: "60", title: "Momentum Signal Engine", label: "1 HOUR", icon: BarChart3 },
    { id: "240", title: "Swing-Trend Processor", label: "4 HOUR", icon: TrendingUp },
    { id: "D", title: "Macro-Bias Terminal", label: "DAILY", icon: Globe },
  ];

  const timeframeTabs = [
    { id: "all", label: "ALL" },
    ...categories.map(c => ({ id: c.id, label: c.label })),
  ];

  const performanceOptions = [
    { label: "All Signals", value: "all" },
    { label: "Winning", value: "working" },
    { label: "Neutral", value: "neutral" },
    { label: "Losing", value: "not-working" },
  ];

  const calculatePercent = (targetPrice: number | undefined | null, entry: number, type: string) => {
    if (targetPrice === undefined || targetPrice === null || !entry || entry === 0) return "0.00";
    const diff = type === 'BUY' ? targetPrice - entry : entry - targetPrice;
    return ((diff / entry) * 100).toFixed(2);
  };

  const filteredSignals = useMemo(() => {
    if (!rawSignals) return [];
    return rawSignals.filter(signal => {
      if (signal.status === "INACTIVE") return false;
      if (getDisplayAssetType(signal) !== "CRYPTO") return false;
      if (activeSideFilter !== "all" && signal.type !== activeSideFilter) return false;
      if (globalPerformanceFilter !== "all") {
        const pnl = Number(calculatePercent(signal.currentPrice, signal.price, signal.type));
        if (globalPerformanceFilter === "working" && pnl <= 0.05) return false;
        if (globalPerformanceFilter === "not-working" && pnl >= -0.05) return false;
        if (globalPerformanceFilter === "neutral" && (pnl > 0.05 || pnl < -0.05)) return false;
      }
      return true;
    });
  }, [rawSignals, globalPerformanceFilter, activeSideFilter]);

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

  const getMinutesSinceSync = (lastSyncAt: string | undefined) => {
    if (!lastSyncAt) return null;
    const synced = new Date(lastSyncAt);
    const diffMins = differenceInMinutes(now, synced);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const hours = Math.floor(diffMins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0c]">
      {!hideFilters && (
        <div className="p-4 border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-md flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              {timeframeTabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTimeframeTab(tab.id)}
                  className={cn(
                    "px-4 py-1.5 text-[10px] font-black rounded-lg uppercase transition-all whitespace-nowrap border",
                    activeTimeframeTab === tab.id
                      ? "bg-primary text-primary-foreground border-primary/50"
                      : "bg-white/5 text-muted-foreground border-white/5 hover:bg-white/10"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="h-6 w-px bg-white/10" />
            <div className="flex gap-1.5">
              {([{ id: "all", label: "ALL" }, { id: "BUY", label: "BULLISH" }, { id: "SELL", label: "BEARISH" }] as const).map(s => (
                <button
                  key={s.id}
                  onClick={() => setActiveSideFilter(s.id)}
                  className={cn(
                    "px-3 py-1.5 text-[10px] font-black rounded-lg uppercase transition-all whitespace-nowrap border",
                    activeSideFilter === s.id
                      ? s.id === "BUY" ? "bg-positive/20 text-positive border-positive/40"
                        : s.id === "SELL" ? "bg-negative/20 text-negative border-negative/40"
                        : "bg-primary text-primary-foreground border-primary/50"
                      : "bg-white/5 text-muted-foreground border-white/5 hover:bg-white/10"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-2 border-white/10 bg-[#121214] hover:bg-white/5 text-muted-foreground hover:text-foreground rounded-xl px-4">
                  <PerformanceIcon className="h-4 w-4 text-accent" />
                  <span className="text-[10px] font-black uppercase tracking-wider">Performance Filter</span>
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 bg-[#121214] border-white/10 p-4 shadow-2xl">
                <div className="space-y-4">
                  <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] pb-2 border-b border-white/5">EXCURSION STATUS</h3>
                  <RadioGroup 
                    value={globalPerformanceFilter} 
                    onValueChange={setGlobalPerformanceFilter}
                    className="space-y-3"
                  >
                    {performanceOptions.map((opt) => (
                      <div key={opt.value} className="flex items-center space-x-3 group cursor-pointer" onClick={() => setGlobalPerformanceFilter(opt.value)}>
                        <RadioGroupItem 
                          value={opt.value} 
                          id={`perf-${opt.value}`}
                          className="border-white/20 data-[state=checked]:border-accent data-[state=checked]:text-accent"
                        />
                        <Label 
                          htmlFor={`perf-${opt.value}`} 
                          className="flex-1 text-xs font-bold text-foreground/80 group-hover:text-foreground transition-colors cursor-pointer uppercase tracking-wide"
                        >
                          {opt.label}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}

      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto w-full bg-[#0a0a0c]"
      >
        <div className="py-8 space-y-16">
          {isLoading ? (
            <div className="px-6 space-y-8">
               {[1,2].map(i => (
                 <div key={i} className="space-y-4">
                   <div className="h-6 w-48 bg-white/5 animate-pulse rounded" />
                   <div className="flex gap-4"><div className="h-64 w-80 shrink-0 rounded-2xl bg-white/5 animate-pulse" /></div>
                 </div>
               ))}
            </div>
          ) : (
            categories.map(cat => {
              if (activeTimeframeTab !== "all" && activeTimeframeTab !== cat.id) return null;

              const categorySignals = filteredSignals.filter(s => s.timeframe === cat.id);
              
              if (categorySignals.length === 0 && globalPerformanceFilter === "all") return null;

              const SectionIcon = cat.icon;

              return (
                <section key={cat.id} className={hideFilters ? "space-y-4" : "space-y-8"}>
                  {!hideFilters && (
                    <div className="px-6">
                      <div className="flex items-center gap-4">
                        <div className="bg-primary/20 p-2.5 rounded-xl border border-white/10 shrink-0">
                          <SectionIcon className="h-6 w-6 text-accent" />
                        </div>
                        <div className="space-y-1.5">
                          <h2 className="text-2xl font-black text-foreground uppercase tracking-tighter leading-none">
                            {cat.title}
                          </h2>
                          <p className="text-[10px] font-black text-accent uppercase tracking-[0.4em] opacity-80">
                            {cat.label} TECHNICAL CONTEXT
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className={cn(
                    "px-6 pb-6",
                    hideFilters
                      ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                      : "w-full overflow-x-auto flex flex-row gap-6"
                  )}>
                    {categorySignals.length === 0 ? (
                      <div className={cn("py-12 text-center bg-white/[0.01] border border-dashed border-white/5 rounded-2xl", hideFilters ? "col-span-full" : "w-full")}>
                        <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">No matching signals</p>
                      </div>
                    ) : (
                      categorySignals.map((signal) => {
                        const alertPrice = Number(signal.price || 0);
                        const hasCurrentPrice = signal.currentPrice != null && signal.currentPrice !== "";
                        const currentPrice = hasCurrentPrice ? Number(signal.currentPrice) : alertPrice;
                        const livePnl = calculatePercent(currentPrice, alertPrice, signal.type);
                        const leverage = getLeverage(signal.timeframe);
                        const leveragedPnl = (Number(livePnl) * leverage).toFixed(2);
                        const maxUpPnl = (Number(calculatePercent(signal.maxUpsidePrice, alertPrice, signal.type)) * leverage).toFixed(2);
                        const maxDownPnl = (Number(calculatePercent(signal.maxDrawdownPrice, alertPrice, signal.type)) * leverage).toFixed(2);
                        const isBullish = signal.type === 'BUY';
                        const minutesSinceSync = getMinutesSinceSync(signal.lastSyncAt);

                        return (
                          <Card 
                            key={signal.id} 
                            onClick={() => router.push(`/chart/${signal.id}`)}
                            className={cn(
                              "group bg-[#121214] border-white/5 hover:border-accent/30 transition-all duration-300 cursor-pointer shadow-2xl rounded-2xl flex flex-col",
                              hideFilters ? "w-full" : "w-[340px] shrink-0"
                            )}
                          >
                            <div className="px-5 py-4 border-b border-white/5 bg-white/[0.02]">
                              <div className="flex items-start justify-between">
                                <div className="flex flex-col">
                                  <h3 className="text-xl font-black text-foreground leading-none tracking-tighter uppercase mb-1">{signal.symbol}</h3>
                                  <span className="text-[9px] font-black text-accent uppercase tracking-widest">{getDisplayAssetType(signal)}</span>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  <Badge className={cn("text-[9px] font-black border-none px-3 h-6 uppercase", isBullish ? 'bg-positive/20 text-positive' : 'bg-negative/20 text-negative')}>
                                    {isBullish ? 'BULLISH' : 'BEARISH'}
                                  </Badge>
                                  <Badge className="text-[9px] font-black border-none px-2.5 h-6 uppercase bg-accent/15 text-accent">
                                    {leverage}x
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            <div className="px-5 py-2 bg-black/40 flex items-center justify-between border-b border-white/5 text-[9px] font-black text-muted-foreground/40 uppercase">
                              <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {mounted ? format(new Date(signal.receivedAt), 'HH:mm') : "--"}</div>
                              <div className="flex items-center gap-1.5"><Timer className="h-3.5 w-3.5 text-accent" /> {mounted ? getRunningSince(signal.receivedAt) : "--"}</div>
                            </div>
                            <CardContent className="px-5 py-4 space-y-4">
                               <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Alert price</p>
                                    <p className="text-base font-mono font-bold text-foreground">${formatPrice(alertPrice)}</p>
                                  </div>
                                  <div className="space-y-1 text-right">
                                    <p className="text-[9px] font-black text-accent uppercase tracking-widest">Current price</p>
                                    {hasCurrentPrice ? (
                                      <p className={cn("text-base font-mono font-black", Number(livePnl) >= 0 ? "text-positive" : "text-negative")}>${formatPrice(currentPrice)}</p>
                                    ) : (
                                      <p className="text-sm font-mono text-muted-foreground">— Pending</p>
                                    )}
                                  </div>
                               </div>

                               <div className="flex items-center justify-between text-[9px] font-bold text-muted-foreground/70 uppercase tracking-widest">
                                  <span>Last price fetch</span>
                                  <span className={minutesSinceSync ? "text-accent/80" : "text-amber-600/80"}>{mounted && (minutesSinceSync ?? "Not synced yet")}</span>
                               </div>

                               <div className="rounded-xl border border-accent/15 bg-accent/[0.03] p-2.5 space-y-2">
                                 <span className="text-[8px] uppercase font-black tracking-widest text-accent block text-center">Returns at {leverage}x Leverage</span>
                                 {hasCurrentPrice && (
                                   <div className="w-full rounded-lg border bg-white/5 border-white/10 px-3 py-1.5 flex items-center justify-between gap-4">
                                     <span className="text-[9px] uppercase font-black tracking-widest text-muted-foreground">Live PNL</span>
                                     <span className={cn("text-sm font-mono font-bold", Number(leveragedPnl) >= 0 ? "text-positive" : "text-negative")}>{Number(leveragedPnl) >= 0 ? "+" : ""}{leveragedPnl}%</span>
                                   </div>
                                 )}
                                 <div className="grid grid-cols-2 gap-2 w-full">
                                   <div className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg bg-positive/10 border border-positive/20">
                                     <span className="text-[8px] uppercase font-black text-positive/90 tracking-widest">Max Positive</span>
                                     <span className="text-sm font-mono font-black text-positive leading-none">+{maxUpPnl}%</span>
                                   </div>
                                   <div className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg bg-negative/10 border border-negative/20">
                                     <span className="text-[8px] uppercase font-black text-negative/90 tracking-widest">Max Negative</span>
                                     <span className="text-sm font-mono font-black text-negative leading-none">{maxDownPnl}%</span>
                                   </div>
                                 </div>
                               </div>
                               {signal.stopLoss != null && signal.stopLoss > 0 && (
                                 <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.03]">
                                   <Shield className="h-3 w-3 text-amber-400" />
                                   <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">Stop Loss</span>
                                   <span className="ml-auto font-mono text-xs font-bold">${formatPrice(signal.stopLoss)}</span>
                                 </div>
                               )}
                            </CardContent>
                            <div className="mt-auto px-5 py-3 border-t border-white/5 bg-white/[0.01] flex items-center justify-between group-hover:bg-accent/[0.05] transition-colors">
                              <span className="text-[10px] font-black text-muted-foreground uppercase group-hover:text-foreground transition-colors">Analyze Chart</span>
                              <LineChart className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors" />
                            </div>
                          </Card>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
