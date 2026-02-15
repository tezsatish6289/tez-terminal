"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { AlertCircle, LineChart, Server, ArrowUpRight, ArrowDownRight, Timer, TrendingUp } from "lucide-react";
import { format, differenceInMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import { useCollection, useUser, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, limit, orderBy } from "firebase/firestore";
import { useRouter } from "next/navigation";

/**
 * PRODUCTION TERMINAL ENGINE
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
    const interval = setInterval(() => setNow(new Date()), 60000);
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
   * Extracts assetType from top-level OR raw payload string.
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
    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    parts.push(`${mins}m`);
    return parts.join(" ");
  };

  if (error) {
    return (
      <div className="p-10 text-center flex flex-col items-center justify-center gap-4 h-full bg-card/10">
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

  return (
    <div className="flex flex-col h-full bg-card/30">
      <div className="p-3 border-b border-border bg-background/50 flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {assetTypes.map(asset => (
              <button
                key={asset.label}
                onClick={() => setActiveAssetType(asset.value)}
                className={cn(
                  "px-4 py-1.5 text-[11px] font-bold rounded uppercase transition-all whitespace-nowrap",
                  activeAssetType === asset.value 
                    ? "bg-accent text-accent-foreground shadow-md shadow-accent/20" 
                    : "bg-secondary/30 text-muted-foreground hover:bg-secondary/50"
                )}
              >
                {asset.label}
              </button>
            ))}
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] h-7 border-emerald-500/20 text-emerald-400 gap-1.5 bg-emerald-500/5 px-3 font-bold uppercase">
              <Server className="h-3.5 w-3.5" /> 24/7 SYNC ACTIVE
            </Badge>
          </div>
        </div>

        <div className="flex gap-1.5">
          {["All TF", "5", "15", "60", "D"].map(tf => (
            <button
              key={tf}
              onClick={() => setActiveTimeframe(tf === "All TF" ? null : tf)}
              className={cn(
                "px-4 py-1.5 text-[11px] font-bold rounded uppercase transition-all",
                (tf === "All TF" ? !activeTimeframe : activeTimeframe === tf) 
                  ? "bg-accent text-accent-foreground shadow-md shadow-accent/20" 
                  : "bg-secondary/30 text-muted-foreground hover:bg-secondary/50"
              )}
            >
              {tf === "All TF" ? "All TF" : tf === "D" ? "Daily" : `${tf}m`}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1 w-full">
        <Table className="min-w-[1200px] table-fixed border-collapse">
          <TableHeader className="bg-secondary/20 sticky top-0 z-10 backdrop-blur-md">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-[10px] uppercase font-black py-3 text-center w-[80px]">TIME</TableHead>
              <TableHead className="text-[10px] uppercase font-black py-3 text-center w-[90px]">AGE</TableHead>
              <TableHead className="text-[10px] uppercase font-black py-3 text-left pl-6 w-[150px]">ASSET</TableHead>
              <TableHead className="text-[10px] uppercase font-black py-3 text-center w-[130px]">EXCHANGE</TableHead>
              <TableHead className="text-[10px] uppercase font-black py-3 text-center w-[80px]">CHART</TableHead>
              <TableHead className="text-[10px] uppercase font-black py-3 text-center w-[80px]">SIDE</TableHead>
              <TableHead className="text-[10px] uppercase font-black py-3 text-right w-[110px]">ENTRY</TableHead>
              <TableHead className="text-[10px] uppercase font-black text-accent py-3 text-right w-[180px]">LIVE PERFORMANCE</TableHead>
              <TableHead className="text-[10px] uppercase font-black text-emerald-400 py-3 text-right w-[120px]">MAX UP</TableHead>
              <TableHead className="text-[10px] uppercase font-black text-rose-400 py-3 text-center w-[120px] pr-6">MAX DOWN</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-20 text-sm animate-pulse text-accent uppercase tracking-widest font-bold">
                  Connecting to Idea Stream...
                </TableCell>
              </TableRow>
            ) : filteredSignals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-24">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">No signals detected for current filters</p>
                </TableCell>
              </TableRow>
            ) : (
              filteredSignals.map((signal) => {
                const alertPrice = Number(signal.price || 0);
                const currentPrice = signal.currentPrice ? Number(signal.currentPrice) : alertPrice;
                const livePnl = calculatePercent(currentPrice, alertPrice, signal.type);
                const upsidePercent = calculatePercent(signal.maxUpsidePrice, alertPrice, signal.type);
                const drawdownPercent = calculatePercent(signal.maxDrawdownPrice, alertPrice, signal.type);
                const isPnlPositive = Number(livePnl) >= 0;
                const displayAssetType = getDisplayAssetType(signal);

                return (
                  <TableRow 
                    key={signal.id} 
                    onClick={() => router.push(`/chart/${signal.id}`)}
                    className="group border-border hover:bg-accent/5 transition-all cursor-pointer"
                  >
                    <TableCell className="text-[11px] font-mono text-muted-foreground py-3 text-center">
                      {mounted ? format(new Date(signal.receivedAt), 'HH:mm') : "--"}
                    </TableCell>
                    <TableCell className="py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
                        <Timer className="h-3 w-3 text-accent/50" />
                        <span className="text-[11px] font-mono font-bold">
                          {mounted ? getRunningSince(signal.receivedAt) : "--"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 pl-6">
                      <div className="flex flex-col">
                        <span className="font-bold text-sm text-white tracking-tight uppercase leading-none">{signal.symbol}</span>
                        <span className="text-[9px] text-accent/70 font-bold mt-1.5 uppercase tracking-tighter truncate">
                          {displayAssetType}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-center">
                      <div className="flex justify-center">
                        <Badge className="bg-primary/30 text-accent border-accent/20 text-[9px] font-bold h-5 px-1.5 uppercase tracking-tighter">
                          {signal.exchange || "BINANCE"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Badge variant="outline" className="text-[9px] h-5 px-1.5 border-white/10 font-bold bg-white/5 opacity-80 uppercase">
                          {signal.timeframe}
                        </Badge>
                        <div className="p-1.5 rounded-md bg-accent/5 group-hover:bg-accent/20 text-muted-foreground group-hover:text-accent transition-all">
                          <LineChart className="h-4 w-4" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center py-3">
                      <Badge className={cn(
                        "text-[10px] font-bold border-none h-6 px-3 shadow-sm uppercase",
                        signal.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                      )}>
                        {signal.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-[11px] text-white/50 py-3">
                      ${formatPrice(alertPrice)}
                    </TableCell>
                    <TableCell className="text-right py-3">
                        <div className="flex flex-col items-end">
                          <div className={cn(
                            "font-mono text-[12px] font-black",
                            isPnlPositive ? "text-emerald-400" : "text-rose-400"
                          )}>
                            ${formatPrice(currentPrice)}
                          </div>
                          <div className={cn(
                            "font-mono text-[10px] font-bold flex items-center gap-1 mt-0.5",
                            isPnlPositive ? "text-emerald-400" : "text-rose-400"
                          )}>
                            <TrendingUp className={cn("h-2.5 w-2.5", !isPnlPositive && "rotate-180")} />
                            {livePnl}%
                          </div>
                        </div>
                    </TableCell>
                    <TableCell className="text-right py-3">
                       <div className="flex flex-col items-end">
                         <span className="text-emerald-400 font-bold text-[12px] font-mono flex items-center gap-1">
                           <ArrowUpRight className="h-3 w-3" />
                           {upsidePercent}%
                         </span>
                         <span className="text-[9px] text-muted-foreground font-mono opacity-60">
                           ${formatPrice(signal.maxUpsidePrice || alertPrice)}
                         </span>
                       </div>
                    </TableCell>
                    <TableCell className="text-center py-3 pr-6">
                       <div className="flex flex-col items-center">
                         <span className="text-rose-400 font-bold text-[12px] font-mono flex items-center gap-1">
                           <ArrowDownRight className="h-3 w-3" />
                           {drawdownPercent}%
                         </span>
                         <span className="text-[9px] text-muted-foreground font-mono opacity-60">
                           ${formatPrice(signal.maxDrawdownPrice || alertPrice)}
                         </span>
                       </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
