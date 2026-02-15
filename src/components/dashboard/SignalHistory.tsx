
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
  Globe
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

/**
 * PRODUCTION TERMINAL ENGINE - PERSISTENT STATE
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
  const STORAGE_KEY_STATUS = "tez_terminal_status";
  const STORAGE_KEY_SCROLL = "tez_terminal_scroll";

  // Filtering States - Initialized from Session Storage if available
  const [activeAssetType, setActiveAssetType] = useState<string | null>(null);
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>(["5", "15", "60", "240", "D"]);
  const [sectionStatusFilters, setSectionStatusFilters] = useState<Record<string, string>>({
    "5": "all",
    "15": "all",
    "60": "all",
    "240": "all",
    "D": "all"
  });

  // Load state and handle scroll restoration
  useEffect(() => {
    setMounted(true);
    
    const savedAsset = sessionStorage.getItem(STORAGE_KEY_ASSET);
    const savedTf = sessionStorage.getItem(STORAGE_KEY_TF);
    const savedStatus = sessionStorage.getItem(STORAGE_KEY_STATUS);
    const savedScroll = sessionStorage.getItem(STORAGE_KEY_SCROLL);

    if (savedAsset !== null) setActiveAssetType(savedAsset === "null" ? null : savedAsset);
    if (savedTf) setSelectedTimeframes(JSON.parse(savedTf));
    if (savedStatus) setSectionStatusFilters(JSON.parse(savedStatus));

    // Wait for content to render before restoring scroll
    if (savedScroll && scrollContainerRef.current) {
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = parseInt(savedScroll, 10);
        }
      }, 100);
    }

    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Sync states to storage
  useEffect(() => {
    if (!mounted) return;
    sessionStorage.setItem(STORAGE_KEY_ASSET, String(activeAssetType));
    sessionStorage.setItem(STORAGE_KEY_TF, JSON.stringify(selectedTimeframes));
    sessionStorage.setItem(STORAGE_KEY_STATUS, JSON.stringify(sectionStatusFilters));
  }, [activeAssetType, selectedTimeframes, sectionStatusFilters, mounted]);

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

  const calculatePercent = (targetPrice: number | undefined | null, entry: number, type: string) => {
    if (targetPrice === undefined || targetPrice === null || !entry || entry === 0) return "0.00";
    const diff = type === 'BUY' ? targetPrice - entry : entry - targetPrice;
    return ((diff / entry) * 100).toFixed(2);
  };

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

  const getCountForTimeframe = (tfId: string) => {
    if (!rawSignals) return 0;
    return rawSignals.filter(s => s.timeframe === tfId).length;
  };

  const toggleTimeframe = (tfId: string) => {
    setSelectedTimeframes(prev => 
      prev.includes(tfId) ? prev.filter(id => id !== tfId) : [...prev, tfId]
    );
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

  const updateSectionStatus = (tfId: string, status: string) => {
    setSectionStatusFilters(prev => ({ ...prev, [tfId]: status }));
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

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2 border-white/10 bg-[#121214] hover:bg-white/5 text-muted-foreground hover:text-white rounded-xl px-4">
              <Filter className="h-4 w-4 text-accent" />
              <span className="text-[10px] font-black uppercase tracking-wider">Analysis Filters</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 bg-[#121214] border-white/10 p-4 shadow-2xl">
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] pb-2 border-b border-white/5">DATA FEEDS</h3>
              <div className="space-y-3">
                {categories.map(cat => {
                  const count = getCountForTimeframe(cat.id);
                  return (
                    <div key={cat.id} className="flex items-center space-x-3 group cursor-pointer" onClick={() => toggleTimeframe(cat.id)}>
                      <Checkbox 
                        id={`filter-${cat.id}`} 
                        checked={selectedTimeframes.includes(cat.id)}
                        onCheckedChange={() => toggleTimeframe(cat.id)}
                        className="border-white/20 data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground"
                      />
                      <Label 
                        htmlFor={`filter-${cat.id}`} 
                        className="flex-1 text-xs font-bold text-white/70 group-hover:text-white transition-colors cursor-pointer flex justify-between items-center"
                      >
                        <span className="uppercase tracking-wide">{cat.label} ENGINE</span>
                        <span className="text-[10px] font-mono opacity-40">({count})</span>
                      </Label>
                    </div>
                  );
                })}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto w-full bg-[#0a0a0c]"
      >
        <div className="py-8 space-y-16">
          {isLoading ? (
            <div className="px-6 space-y-8">
               {[1,2,3].map(i => (
                 <div key={i} className="space-y-4">
                   <div className="h-6 w-48 bg-white/5 animate-pulse rounded" />
                   <div className="flex gap-4 overflow-hidden">
                     {[1,2,3,4].map(j => <div key={j} className="h-64 w-80 shrink-0 rounded-2xl bg-white/5 animate-pulse" />)}
                   </div>
                 </div>
               ))}
            </div>
          ) : filteredSignals.length === 0 ? (
            <div className="py-24 text-center">
              <Activity className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-black">No signals detected for current filters</p>
            </div>
          ) : (
            categories.map(cat => {
              if (!selectedTimeframes.includes(cat.id)) return null;

              let categorySignals = filteredSignals.filter(s => s.timeframe === cat.id);
              const statusFilter = sectionStatusFilters[cat.id] || "all";
              
              if (statusFilter !== "all") {
                categorySignals = categorySignals.filter(s => {
                  const pnl = Number(calculatePercent(s.currentPrice, s.price, s.type));
                  if (statusFilter === "working") return pnl > 0.05;
                  if (statusFilter === "not-working") return pnl < -0.05;
                  if (statusFilter === "neutral") return pnl >= -0.05 && pnl <= 0.05;
                  return true;
                });
              }

              if (categorySignals.length === 0 && statusFilter === "all") return null;

              const SectionIcon = cat.icon;

              return (
                <section key={cat.id} className="space-y-8">
                  <div className="px-6">
                    <div className="flex items-center gap-4">
                      <div className="bg-primary/20 p-2.5 rounded-xl border border-white/10 shrink-0">
                        <SectionIcon className="h-6 w-6 text-accent" />
                      </div>
                      <div className="space-y-1.5">
                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter leading-none">
                          {cat.title}
                        </h2>
                        <p className="text-[10px] font-black text-accent uppercase tracking-[0.4em] opacity-80">
                          {cat.label} TECHNICAL CONTEXT
                        </p>
                        
                        <div className="flex items-center gap-4 pt-1">
                          {[
                            { id: 'all', label: 'All' },
                            { id: 'working', label: 'Working' },
                            { id: 'neutral', label: 'Neutral' },
                            { id: 'not-working', label: 'Not Working' }
                          ].map((status) => (
                            <button
                              key={status.id}
                              onClick={() => updateSectionStatus(cat.id, status.id)}
                              className={cn(
                                "text-[9px] font-black uppercase tracking-wider transition-all",
                                statusFilter === status.id 
                                  ? "text-accent border-b border-accent pb-0.5" 
                                  : "text-muted-foreground/30 hover:text-muted-foreground"
                              )}
                            >
                              {status.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="w-full overflow-x-auto flex flex-row gap-6 px-6 pb-6 scrollbar-thin">
                    {categorySignals.length === 0 ? (
                      <div className="w-full py-12 text-center bg-white/[0.01] border border-dashed border-white/5 rounded-2xl">
                        <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-widest">No signals match filter</p>
                      </div>
                    ) : (
                      categorySignals.map((signal) => {
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
                            className="group relative overflow-hidden bg-[#121214] border-white/5 hover:border-accent/40 transition-all duration-300 cursor-pointer shadow-2xl rounded-2xl flex flex-col w-[340px] shrink-0"
                          >
                            <div className="p-6 border-b border-white/5 bg-white/[0.02]">
                              <div className="flex items-start justify-between">
                                <div className="flex flex-col">
                                  <h3 className="text-2xl font-black text-white leading-none tracking-tighter uppercase mb-2">
                                    {signal.symbol}
                                  </h3>
                                  <span className="text-[10px] font-black text-accent uppercase tracking-widest">
                                    {displayAssetType}
                                  </span>
                                </div>
                                <Badge className={cn(
                                  "text-[10px] font-black border-none px-4 h-7 uppercase rounded-md",
                                  isBullish ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                                )}>
                                  {isBullish ? 'BULLISH' : 'BEARISH'}
                                </Badge>
                              </div>
                            </div>

                            <div className="px-6 py-3 bg-black/40 flex items-center justify-between border-b border-white/5 text-[10px] font-black text-muted-foreground/40 uppercase">
                              <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4" /> {mounted ? format(new Date(signal.receivedAt), 'HH:mm') : "--"} UTC
                              </div>
                              <div className="flex items-center gap-2">
                                <Timer className="h-4 w-4 text-accent" /> {mounted ? getRunningSince(signal.receivedAt) : "--"}
                              </div>
                            </div>

                            <CardContent className="p-6 flex-1 flex flex-col gap-8">
                              <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest opacity-60">Entry Level</p>
                                  <p className="text-lg font-mono font-bold text-white">${formatPrice(alertPrice)}</p>
                                </div>
                                <div className="space-y-2 text-right">
                                  <p className="text-[10px] font-black text-accent uppercase tracking-widest">Latest Live</p>
                                  <div className={cn("text-lg font-mono font-black", isPnlPositive ? "text-emerald-400" : "text-rose-400")}>
                                    ${formatPrice(currentPrice)}
                                  </div>
                                  <div className={cn("text-xs font-black flex items-center justify-end gap-2 mt-1", isPnlPositive ? "text-emerald-400" : "text-rose-400")}>
                                     <TrendingUp className={cn("h-4 w-4", !isPnlPositive && "rotate-180")} />
                                     {livePnl}%
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4 pt-6 border-t border-white/5">
                                <div className="p-4 rounded-xl bg-emerald-500/[0.03] border border-emerald-500/10">
                                  <p className="text-[9px] font-black text-emerald-500/60 uppercase tracking-widest mb-2">Max Upside</p>
                                  <p className="text-md font-mono font-black text-emerald-400 flex items-center gap-2">
                                    <ArrowUpRight className="h-5 w-5" /> {upsidePercent}%
                                  </p>
                                </div>
                                <div className="p-4 rounded-xl bg-rose-500/[0.03] border border-rose-500/10 text-right">
                                  <p className="text-[9px] font-black text-rose-500/60 uppercase tracking-widest mb-2">Max Drawdown</p>
                                  <p className="text-md font-mono font-black text-rose-400 flex items-center justify-end gap-2">
                                    <ArrowDownRight className="h-5 w-5" /> {drawdownPercent}%
                                  </p>
                                </div>
                              </div>
                            </CardContent>

                            <div className="px-6 py-5 border-t border-white/5 bg-white/[0.01] flex items-center justify-between group-hover:bg-accent/[0.05] transition-colors">
                              <div className="flex items-center gap-3">
                                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] group-hover:text-white transition-colors">Analyze Chart</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className="text-[10px] border-accent/20 h-6 px-3 text-accent font-black uppercase">{cat.label}</Badge>
                                <LineChart className="h-5 w-5 text-muted-foreground group-hover:text-accent transition-colors" />
                              </div>
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
