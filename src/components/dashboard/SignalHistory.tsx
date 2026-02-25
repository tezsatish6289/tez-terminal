
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
  Filter,
  ChevronDown,
  Zap,
  BarChart3,
  Globe,
  Activity as PerformanceIcon
} from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import { useCollection, useUser, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, limit, orderBy } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

/**
 * PRODUCTION TERMINAL ENGINE - PERSISTENT STATE
 * Now exclusively displays ACTIVE signals for the live idea stream.
 */
export function SignalHistory() {
  const router = useRouter();
  const { user } = useUser();
  const firestore = useFirestore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(new Date());
  
  // Persistence Keys
  const STORAGE_KEY_ASSET = "tez_terminal_asset";
  const STORAGE_KEY_TF = "tez_terminal_tf";
  const STORAGE_KEY_GLOBAL_PERF = "tez_terminal_global_perf";
  const STORAGE_KEY_SCROLL = "tez_terminal_scroll";

  // Filtering States
  const [activeAssetType, setActiveAssetType] = useState<string | null>(null);
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(["5", "15", "60", "240", "D"]);
  const [globalPerformanceFilter, setGlobalPerformanceFilter] = useState<string>("working");

  // Initialization
  useEffect(() => {
    setMounted(true);
    
    const savedAsset = sessionStorage.getItem(STORAGE_KEY_ASSET);
    const savedTf = sessionStorage.getItem(STORAGE_KEY_TF);
    const savedPerf = sessionStorage.getItem(STORAGE_KEY_GLOBAL_PERF);
    const savedScroll = sessionStorage.getItem(STORAGE_KEY_SCROLL);

    if (savedAsset !== null) setActiveAssetType(savedAsset === "null" ? null : savedAsset);
    if (savedTf) setSelectedTimeframes(JSON.parse(savedTf));
    if (savedPerf) setGlobalPerformanceFilter(savedPerf);

    if (savedScroll && scrollContainerRef.current) {
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = parseInt(savedScroll, 10);
        }
      }, 200);
    }

    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    sessionStorage.setItem(STORAGE_KEY_ASSET, String(activeAssetType));
    sessionStorage.setItem(STORAGE_KEY_TF, JSON.stringify(selectedTimeframes));
    sessionStorage.setItem(STORAGE_KEY_GLOBAL_PERF, globalPerformanceFilter);
  }, [activeAssetType, selectedTimeframes, globalPerformanceFilter, mounted]);

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

  const assetTypes = [
    { label: "ALL ASSETS", value: null },
    { label: "CRYPTO", value: "CRYPTO" },
    { label: "INDIAN STOCKS", value: "INDIAN STOCKS" },
    { label: "US STOCKS", value: "US STOCKS" },
  ];

  const performanceOptions = [
    { label: "All Signals", value: "all" },
    { label: "Working", value: "working" },
    { label: "Neutral", value: "neutral" },
    { label: "Not Working", value: "not-working" },
  ];

  const calculatePercent = (targetPrice: number | undefined | null, entry: number, type: string) => {
    if (targetPrice === undefined || targetPrice === null || !entry || entry === 0) return "0.00";
    const diff = type === 'BUY' ? targetPrice - entry : entry - targetPrice;
    return ((diff / entry) * 100).toFixed(2);
  };

  const filteredSignals = useMemo(() => {
    if (!rawSignals) return [];
    return rawSignals.filter(signal => {
      // Exclude INACTIVE (Stopped Out) signals from the live feed
      if (signal.status === "INACTIVE") return false;
      
      if (activeAssetType) {
        const displayAssetType = getDisplayAssetType(signal);
        if (displayAssetType !== activeAssetType) return false;
      }

      // Apply Global Performance Filter
      if (globalPerformanceFilter !== "all") {
        const pnl = Number(calculatePercent(signal.currentPrice, signal.price, signal.type));
        if (globalPerformanceFilter === "working" && pnl <= 0.05) return false;
        if (globalPerformanceFilter === "not-working" && pnl >= -0.05) return false;
        if (globalPerformanceFilter === "neutral" && (pnl > 0.05 || pnl < -0.05)) return false;
      }

      return true;
    });
  }, [rawSignals, activeAssetType, globalPerformanceFilter]);

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
      <div className="p-4 border-b border-white/5 bg-[#0a0a0c]/80 backdrop-blur-md flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-6">
           <div className="flex gap-2">
              {assetTypes.map(asset => (
                <button
                  key={asset.label}
                  onClick={() => setActiveAssetType(asset.value)}
                  className={cn(
                    "px-4 py-1.5 text-[10px] font-black rounded-lg uppercase transition-all whitespace-nowrap border",
                    activeAssetType === asset.value 
                      ? "bg-primary text-primary-foreground border-primary/50" 
                      : "bg-white/5 text-muted-foreground border-white/5 hover:bg-white/10"
                  )}
                >
                  {asset.label}
                </button>
              ))}
           </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Analysis Filters Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-2 border-white/10 bg-[#121214] hover:bg-white/5 text-muted-foreground hover:text-foreground rounded-xl px-4">
                <Filter className="h-4 w-4 text-accent" />
                <span className="text-[10px] font-black uppercase tracking-wider">Analysis Filters</span>
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 bg-[#121214] border-white/10 p-4 shadow-2xl">
              <div className="space-y-4">
                <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] pb-2 border-b border-white/5">DATA FEEDS</h3>
                <div className="space-y-3">
                  {categories.map(cat => (
                    <div key={cat.id} className="flex items-center space-x-3 group cursor-pointer" onClick={() => {
                      setSelectedTimeframes(prev => 
                        prev.includes(cat.id) ? prev.filter(id => id !== cat.id) : [...prev, cat.id]
                      );
                    }}>
                      <Checkbox 
                        id={`filter-${cat.id}`} 
                        checked={selectedTimeframes.includes(cat.id)}
                        onCheckedChange={() => {}}
                        className="border-white/20 data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground"
                      />
                      <Label 
                        htmlFor={`filter-${cat.id}`} 
                        className="flex-1 text-xs font-bold text-foreground/80 group-hover:text-foreground transition-colors cursor-pointer flex justify-between items-center"
                      >
                        <span className="uppercase tracking-wide">{cat.label} ENGINE</span>
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Performance Filter Popover */}
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
              if (!selectedTimeframes.includes(cat.id)) return null;

              const categorySignals = filteredSignals.filter(s => s.timeframe === cat.id);
              
              if (categorySignals.length === 0 && globalPerformanceFilter === "all") return null;

              const SectionIcon = cat.icon;

              return (
                <section key={cat.id} className="space-y-8">
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

                  <div className="w-full overflow-x-auto flex flex-row gap-6 px-6 pb-6">
                    {categorySignals.length === 0 ? (
                      <div className="w-full py-12 text-center bg-white/[0.01] border border-dashed border-white/5 rounded-2xl">
                        <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">No matching signals</p>
                      </div>
                    ) : (
                      categorySignals.map((signal) => {
                        const alertPrice = Number(signal.price || 0);
                        const hasCurrentPrice = signal.currentPrice != null && signal.currentPrice !== "";
                        const currentPrice = hasCurrentPrice ? Number(signal.currentPrice) : alertPrice;
                        const livePnl = calculatePercent(currentPrice, alertPrice, signal.type);
                        const maxUpPnl = calculatePercent(signal.maxUpsidePrice, alertPrice, signal.type);
                        const maxDownPnl = calculatePercent(signal.maxDrawdownPrice, alertPrice, signal.type);
                        const isBullish = signal.type === 'BUY';
                        const minutesSinceSync = getMinutesSinceSync(signal.lastSyncAt);

                        return (
                          <Card 
                            key={signal.id} 
                            onClick={() => router.push(`/chart/${signal.id}`)}
                            className="group bg-[#121214] border-white/5 hover:border-accent/30 transition-all duration-300 cursor-pointer shadow-2xl rounded-2xl flex flex-col w-[340px] shrink-0"
                          >
                            <div className="p-6 border-b border-white/5 bg-white/[0.02]">
                              <div className="flex items-start justify-between">
                                <div className="flex flex-col">
                                  <h3 className="text-2xl font-black text-foreground leading-none tracking-tighter uppercase mb-2">{signal.symbol}</h3>
                                  <span className="text-[10px] font-black text-accent uppercase tracking-widest">{getDisplayAssetType(signal)}</span>
                                </div>
                                <Badge className={cn("text-[10px] font-black border-none px-4 h-7 uppercase", isBullish ? 'bg-positive/20 text-positive' : 'bg-negative/20 text-negative')}>
                                  {isBullish ? 'BULLISH' : 'BEARISH'}
                                </Badge>
                              </div>
                            </div>
                            <div className="px-6 py-3 bg-black/40 flex items-center justify-between border-b border-white/5 text-[10px] font-black text-muted-foreground/40 uppercase">
                              <div className="flex items-center gap-2"><Clock className="h-4 w-4" /> {mounted ? format(new Date(signal.receivedAt), 'HH:mm') : "--"}</div>
                              <div className="flex items-center gap-2"><Timer className="h-4 w-4 text-accent" /> {mounted ? getRunningSince(signal.receivedAt) : "--"}</div>
                            </div>
                            <CardContent className="p-6 space-y-6">
                               <div className="grid grid-cols-2 gap-6">
                                  <div className="space-y-2">
                                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Alert price</p>
                                    <p className="text-lg font-mono font-bold text-foreground">${formatPrice(alertPrice)}</p>
                                  </div>
                                  <div className="space-y-2 text-right">
                                    <p className="text-[10px] font-black text-accent uppercase tracking-widest">Current price</p>
                                    {hasCurrentPrice ? (
                                      <>
                                        <p className={cn("text-lg font-mono font-black", Number(livePnl) >= 0 ? "text-positive" : "text-negative")}>${formatPrice(currentPrice)}</p>
                                        <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black w-fit", Number(livePnl) >= 0 ? "bg-positive/25 text-positive" : "bg-negative/25 text-negative")}>{livePnl}% PNL</span>
                                      </>
                                    ) : (
                                      <p className="text-sm font-mono text-muted-foreground">— Pending</p>
                                    )}
                                  </div>
                               </div>

                               <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">
                                  <span>Last price fetch</span>
                                  <span className={minutesSinceSync ? "text-accent/80" : "text-amber-600/80"}>{mounted && (minutesSinceSync ?? "Not synced yet")}</span>
                               </div>

                               {/* Max Positive / Max Negative — same treatment as deep-dive header */}
                               <div className="pt-4 mt-4 grid grid-cols-2 gap-3">
                                  <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg bg-positive/10 border border-positive/20">
                                    <span className="text-[9px] uppercase font-black text-positive/90 tracking-widest">Max Positive</span>
                                    <span className="text-base font-mono font-black text-positive leading-none">+{maxUpPnl}%</span>
                                  </div>
                                  <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg bg-negative/10 border border-negative/20">
                                    <span className="text-[9px] uppercase font-black text-negative/90 tracking-widest">Max Negative</span>
                                    <span className="text-base font-mono font-black text-negative leading-none">{maxDownPnl}%</span>
                                  </div>
                               </div>
                            </CardContent>
                            <div className="px-6 py-4 border-t border-white/5 bg-white/[0.01] flex items-center justify-between group-hover:bg-accent/[0.05] transition-colors">
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
