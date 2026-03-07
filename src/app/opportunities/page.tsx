"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import { LandingPage } from "@/components/landing/LandingPage";
import {
  useUser,
  useAuth,
  useFirestore,
  useCollection,
  useMemoFirebase,
} from "@/firebase";
import { collection, query, orderBy, limit } from "firebase/firestore";
import { initiateGoogleSignIn } from "@/firebase/non-blocking-login";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Zap,
  Target,
  ShieldOff,
  XCircle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  SlidersHorizontal,
  Trophy,
  Flame,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getLeverage } from "@/lib/leverage";
import { getEffectivePnl } from "@/lib/pnl";

const TIMEFRAME_OPTIONS = [
  { id: "all", label: "All" },
  { id: "5", label: "5m" },
  { id: "15", label: "15m" },
  { id: "60", label: "1h" },
  { id: "240", label: "4h" },
] as const;

const SIDE_OPTIONS = [
  { id: "all", label: "All" },
  { id: "BUY", label: "Bullish" },
  { id: "SELL", label: "Bearish" },
] as const;

const PERF_OPTIONS = [
  { id: "all", label: "All" },
  { id: "winning", label: "Winning" },
  { id: "losing", label: "Losing" },
] as const;

const TIMEFRAME_NAMES: Record<string, string> = {
  "5": "Scalping",
  "15": "Intraday",
  "60": "BTST",
  "240": "Swing",
  D: "Positional",
};

function formatTimeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatPrice(price: number | null | undefined): string {
  if (price == null) return "--";
  const decimals = price < 1 ? 6 : price < 100 ? 4 : 2;
  return price.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function getDisplayAssetType(signal: { assetType?: string }) {
  if (signal.assetType && signal.assetType !== "UNCLASSIFIED")
    return signal.assetType;
  return "CRYPTO";
}

interface ProcessedSignal {
  id: string;
  symbol: string;
  type: "BUY" | "SELL";
  price: number;
  currentPrice: number | null;
  pnl: number;
  leveragedPnl: number;
  leverage: number;
  timeframe: string;
  timeframeName: string;
  receivedAt: string;
  status: string;
  algo: string;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  slHitAt: string | null;
  totalBookedPnl: number | null;
  stopLoss: number | null;
}

interface StatusEvent {
  id: string;
  type: string;
  symbol: string;
  side: string;
  timeframe: string;
  signalId: string;
  createdAt: string;
  bookedPnl?: number | null;
  totalBookedPnl?: number | null;
  guidance: string;
  entryPrice: number;
  price: number;
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all border cursor-pointer",
        active
          ? "bg-accent/20 border-accent/40 text-accent"
          : "bg-white/[0.04] border-white/10 text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

function OpportunityCard({ signal }: { signal: ProcessedSignal }) {
  const isBuy = signal.type === "BUY";
  const isWinning = signal.pnl > 0.05;
  const isLosing = signal.pnl < -0.05;

  return (
    <Link
      href={`/chart/${signal.id}`}
      className={cn(
        "block rounded-xl border transition-all hover:translate-y-[-1px]",
        isWinning
          ? "border-positive/15 bg-positive/[0.03] hover:border-positive/25 hover:shadow-lg hover:shadow-positive/5"
          : isLosing
            ? "border-negative/15 bg-negative/[0.03] hover:border-negative/25 hover:shadow-lg hover:shadow-negative/5"
            : "border-white/[0.06] bg-white/[0.02] hover:border-white/10 hover:shadow-lg hover:shadow-white/5"
      )}
    >
      {/* Header: direction + symbol */}
      <div className="px-3.5 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              "flex items-center justify-center w-7 h-7 rounded-lg shrink-0",
              isBuy
                ? "bg-positive/15 text-positive"
                : "bg-negative/15 text-negative"
            )}
          >
            {isBuy ? (
              <ArrowUpRight className="w-3.5 h-3.5" />
            ) : (
              <ArrowDownRight className="w-3.5 h-3.5" />
            )}
          </div>
          <div className="min-w-0">
            <span className="text-sm font-black uppercase tracking-tight text-foreground truncate block">
              {signal.symbol}
            </span>
            <span
              className={cn(
                "text-[9px] font-bold uppercase tracking-widest",
                isBuy ? "text-positive/60" : "text-negative/60"
              )}
            >
              {isBuy ? "Long" : "Short"}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <span
            className={cn(
              "text-lg font-black font-mono tabular-nums block leading-tight",
              isWinning
                ? "text-positive"
                : isLosing
                  ? "text-negative"
                  : "text-muted-foreground"
            )}
          >
            {signal.leveragedPnl >= 0 ? "+" : ""}
            {signal.leveragedPnl.toFixed(2)}%
          </span>
          <span className="text-[9px] text-accent/50 font-bold">
            {signal.leverage}x
          </span>
        </div>
      </div>

      {/* Price row */}
      <div className="px-3.5 pb-2 flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground/40 font-mono">
          ${formatPrice(signal.price)}
        </span>
        <span className="text-white/10">→</span>
        <span
          className={cn(
            "text-[10px] font-mono font-bold",
            isWinning
              ? "text-positive/70"
              : isLosing
                ? "text-negative/70"
                : "text-muted-foreground/50"
          )}
        >
          ${formatPrice(signal.currentPrice)}
        </span>
      </div>

      {/* Footer: meta */}
      <div className="px-3.5 pb-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold text-muted-foreground/40 uppercase">
            {signal.timeframeName}
          </span>
          <span className="text-white/8">·</span>
          <span className="text-[9px] text-muted-foreground/30">
            {signal.algo}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="w-2.5 h-2.5 text-muted-foreground/25" />
          <span className="text-[9px] text-muted-foreground/25">
            {formatTimeAgo(signal.receivedAt)}
          </span>
        </div>
      </div>
    </Link>
  );
}

const EVENT_CONFIG: Record<
  string,
  { icon: typeof Target; color: string; bgColor: string; label: string }
> = {
  TP1_HIT: {
    icon: Target,
    color: "text-positive",
    bgColor: "bg-positive/10",
    label: "TP1 Hit",
  },
  TP2_HIT: {
    icon: Target,
    color: "text-positive",
    bgColor: "bg-positive/10",
    label: "TP2 Hit",
  },
  TP3_HIT: {
    icon: CheckCircle2,
    color: "text-positive",
    bgColor: "bg-positive/10",
    label: "TP3 Hit",
  },
  SL_HIT: {
    icon: ShieldOff,
    color: "text-negative",
    bgColor: "bg-negative/10",
    label: "SL Hit",
  },
  NEW_SIGNAL: {
    icon: Zap,
    color: "text-accent",
    bgColor: "bg-accent/10",
    label: "New Signal",
  },
};

function EventRow({ event }: { event: StatusEvent }) {
  const config = EVENT_CONFIG[event.type] ?? {
    icon: XCircle,
    color: "text-muted-foreground",
    bgColor: "bg-white/5",
    label: event.type,
  };
  const Icon = config.icon;
  const isBuy = event.side === "BUY";
  const pnlValue = event.totalBookedPnl ?? event.bookedPnl;
  const tfName = TIMEFRAME_NAMES[event.timeframe] ?? event.timeframe;
  const leverage = getLeverage(event.timeframe);

  return (
    <Link
      href={`/chart/${event.signalId}`}
      className="block px-3 py-2.5 border-b border-white/[0.04] transition-colors hover:bg-white/[0.03]"
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "flex items-center justify-center w-6 h-6 rounded-md shrink-0 mt-0.5",
            config.bgColor
          )}
        >
          <Icon className={cn("w-3 h-3", config.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={cn(
                  "text-xs font-black uppercase tracking-tight truncate",
                  config.color
                )}
              >
                {config.label}
              </span>
            </div>
            {pnlValue != null && (
              <span
                className={cn(
                  "text-xs font-black font-mono tabular-nums shrink-0",
                  pnlValue >= 0 ? "text-positive" : "text-negative"
                )}
              >
                {pnlValue >= 0 ? "+" : ""}
                {(pnlValue * leverage).toFixed(2)}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={cn(
                "text-[9px] font-bold",
                isBuy ? "text-positive/50" : "text-negative/50"
              )}
            >
              {isBuy ? "▲" : "▼"}
            </span>
            <span className="text-[10px] font-bold text-foreground/80 uppercase tracking-tight">
              {event.symbol}
            </span>
            <span className="text-white/10">·</span>
            <span className="text-[9px] text-muted-foreground/40">{tfName}</span>
          </div>
          <p className="text-[9px] text-muted-foreground/40 mt-0.5 leading-relaxed">
            {event.guidance}
          </p>
          <div className="flex items-center gap-1 mt-1">
            <Clock className="w-2.5 h-2.5 text-muted-foreground/25" />
            <span className="text-[9px] text-muted-foreground/25">
              {formatTimeAgo(event.createdAt)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function WinnerRow({
  signal,
  rank,
}: {
  signal: ProcessedSignal;
  rank: number;
}) {
  const isBuy = signal.type === "BUY";
  const isClosed = signal.status === "INACTIVE";

  const tpCount = [signal.tp1Hit, signal.tp2Hit, signal.tp3Hit].filter(
    Boolean
  ).length;

  return (
    <Link
      href={`/chart/${signal.id}`}
      className="block px-3 py-3 border-b border-white/[0.04] transition-colors hover:bg-amber-500/[0.03]"
    >
      <div className="flex items-start gap-2.5">
        <div
          className={cn(
            "flex items-center justify-center w-6 h-6 rounded-md shrink-0 mt-0.5 text-[10px] font-black",
            rank <= 3
              ? "bg-amber-400/15 text-amber-400"
              : "bg-white/5 text-muted-foreground/50"
          )}
        >
          {rank}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={cn(
                  "text-[9px] font-bold",
                  isBuy ? "text-positive" : "text-negative"
                )}
              >
                {isBuy ? "▲" : "▼"}
              </span>
              <span className="text-xs font-black uppercase tracking-tight text-foreground truncate">
                {signal.symbol}
              </span>
              {isClosed && (
                <span className="text-[8px] font-bold text-muted-foreground/40 bg-white/5 px-1 py-0.5 rounded">
                  Closed
                </span>
              )}
            </div>
            <span className="text-sm font-black font-mono tabular-nums text-positive shrink-0">
              +{signal.leveragedPnl.toFixed(2)}%
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-muted-foreground/40">
                {signal.timeframeName}
              </span>
              <span className="text-white/10">·</span>
              <span className="text-[9px] text-muted-foreground/30">
                {signal.algo}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {tpCount > 0 && (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-positive/10 text-positive/80 border border-positive/15">
                  {tpCount} TP{tpCount > 1 ? "s" : ""}
                </span>
              )}
              <span className="text-[9px] text-accent/40 font-bold">
                {signal.leverage}x
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-[9px] text-muted-foreground/30 font-mono">
              ${formatPrice(signal.price)} → ${formatPrice(signal.currentPrice)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function OpportunitiesPage() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [filterTimeframe, setFilterTimeframe] = useState("all");
  const [filterSide, setFilterSide] = useState("all");
  const [filterPerf, setFilterPerf] = useState("all");

  const activeFilterCount = [filterTimeframe, filterSide, filterPerf].filter(
    (v) => v !== "all"
  ).length;
  const hasActiveFilters = activeFilterCount > 0;

  const signalsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "signals"),
      orderBy("receivedAt", "desc"),
      limit(200)
    );
  }, [user, firestore]);

  const eventsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "signal_events"),
      orderBy("createdAt", "desc"),
      limit(100)
    );
  }, [user, firestore]);

  const { data: rawSignals, isLoading: signalsLoading } =
    useCollection(signalsQuery);
  const { data: rawEvents, isLoading: eventsLoading } =
    useCollection(eventsQuery);

  const processedSignals: ProcessedSignal[] = useMemo(() => {
    if (!rawSignals) return [];
    return rawSignals
      .filter((s: any) => getDisplayAssetType(s) === "CRYPTO")
      .map((signal: any) => {
        const pnl = getEffectivePnl(signal);
        const tf = String(signal.timeframe || "15");
        const leverage = getLeverage(tf);
        return {
          id: signal.id,
          symbol: signal.symbol || "???",
          type: signal.type as "BUY" | "SELL",
          price: Number(signal.price || 0),
          currentPrice:
            signal.currentPrice != null ? Number(signal.currentPrice) : null,
          pnl,
          leveragedPnl: pnl * leverage,
          leverage,
          timeframe: tf,
          timeframeName: TIMEFRAME_NAMES[tf] ?? tf,
          receivedAt: signal.receivedAt,
          status: signal.status || "ACTIVE",
          algo: signal.algo || "V8 Reversal",
          tp1Hit: signal.tp1Hit ?? false,
          tp2Hit: signal.tp2Hit ?? false,
          tp3Hit: signal.tp3Hit ?? false,
          slHitAt: signal.slHitAt ?? null,
          totalBookedPnl: signal.totalBookedPnl ?? null,
          stopLoss: signal.stopLoss ?? null,
        };
      });
  }, [rawSignals]);

  const filteredSignals = useMemo(() => {
    return processedSignals.filter((s) => {
      if (filterTimeframe !== "all" && s.timeframe !== filterTimeframe)
        return false;
      if (filterSide !== "all" && s.type !== filterSide) return false;
      if (filterPerf === "winning" && s.pnl <= 0.05) return false;
      if (filterPerf === "losing" && s.pnl >= -0.05) return false;
      return true;
    });
  }, [processedSignals, filterTimeframe, filterSide, filterPerf]);

  const allEvents: StatusEvent[] = useMemo(() => {
    if (!rawEvents) return [];
    return rawEvents.map((e: any) => ({
      id: e.id,
      type: e.type,
      symbol: e.symbol,
      side: e.side,
      timeframe: e.timeframe || "15",
      signalId: e.signalId,
      createdAt: e.createdAt,
      bookedPnl: e.bookedPnl ?? null,
      totalBookedPnl: e.totalBookedPnl ?? null,
      guidance: e.guidance || "",
      entryPrice: e.entryPrice || 0,
      price: e.price || 0,
    }));
  }, [rawEvents]);

  const liveOpportunities = useMemo(() => {
    return filteredSignals.filter(
      (s) =>
        s.status !== "INACTIVE" &&
        !s.tp1Hit &&
        !s.tp2Hit &&
        !s.tp3Hit &&
        !s.slHitAt
    );
  }, [filteredSignals]);

  const activeCount = liveOpportunities.length;
  const winningCount = liveOpportunities.filter((s) => s.pnl > 0.05).length;

  const topWinners = useMemo(() => {
    return processedSignals
      .filter((s) => s.pnl > 0.05)
      .sort((a, b) => b.leveragedPnl - a.leveragedPnl)
      .slice(0, 20);
  }, [processedSignals]);

  const handleGoogleLogin = useCallback(async () => {
    if (auth) {
      setIsLoggingIn(true);
      try {
        await initiateGoogleSignIn(auth);
      } catch (e: any) {
        toast({
          variant: "destructive",
          title: "Login Failed",
          description: e.message || "Could not authenticate with Google.",
        });
      } finally {
        setIsLoggingIn(false);
      }
    }
  }, [auth]);

  if (isUserLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!user) {
    return <LandingPage onLogin={handleGoogleLogin} isLoggingIn={isLoggingIn} />;
  }

  const isLoading = signalsLoading || eventsLoading;

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <main className="flex-1 flex flex-col min-w-0 h-full">
        <TopBar />

        {/* Three-pane layout */}
        <div className="flex-1 flex gap-3 p-3 overflow-hidden">

          {/* Left pane: Opportunities (~50%) */}
          <div className="flex-[5] flex flex-col min-w-0 rounded-xl border border-white/[0.08] bg-[#111113] overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-accent" />
                <h2 className="text-sm font-black tracking-tight uppercase">
                  Live Opportunities
                </h2>
                {!isLoading && (
                  <div className="flex items-center gap-2 ml-1">
                    <span className="text-[10px] font-bold text-muted-foreground/50">
                      {activeCount} active
                    </span>
                    <span className="text-white/10">·</span>
                    <span className="text-[10px] font-bold text-positive/60">
                      {winningCount} winning
                    </span>
                  </div>
                )}
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer",
                      hasActiveFilters
                        ? "bg-accent/20 border-accent/40 text-accent"
                        : "bg-white/[0.04] border-white/10 text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
                    )}
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    {hasActiveFilters ? `${activeFilterCount}` : "Filter"}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-64 bg-card border-white/10 shadow-2xl p-0"
                >
                  <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider">Filters</span>
                    {hasActiveFilters && (
                      <button
                        onClick={() => {
                          setFilterTimeframe("all");
                          setFilterSide("all");
                          setFilterPerf("all");
                        }}
                        className="text-[10px] font-bold text-accent hover:text-accent/80 cursor-pointer"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="space-y-2">
                      <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest">
                        Timeframe
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {TIMEFRAME_OPTIONS.map((opt) => (
                          <FilterChip
                            key={opt.id}
                            label={opt.label}
                            active={filterTimeframe === opt.id}
                            onClick={() => setFilterTimeframe(opt.id)}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest">
                        Side
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {SIDE_OPTIONS.map((opt) => (
                          <FilterChip
                            key={opt.id}
                            label={opt.label}
                            active={filterSide === opt.id}
                            onClick={() => setFilterSide(opt.id)}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest">
                        Performance
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {PERF_OPTIONS.map((opt) => (
                          <FilterChip
                            key={opt.id}
                            label={opt.label}
                            active={filterPerf === opt.id}
                            onClick={() => setFilterPerf(opt.id)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-5 w-5 animate-spin text-accent/50" />
                </div>
              ) : liveOpportunities.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground/30">
                  <Zap className="w-6 h-6 mb-2" />
                  <span className="text-xs font-bold">
                    No open opportunities match your filters
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                  {liveOpportunities.map((signal) => (
                    <OpportunityCard key={signal.id} signal={signal} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Middle pane: Status Updates (~25%) */}
          <div className="flex-[2.5] flex-col min-w-0 rounded-xl border border-white/[0.08] bg-[#111113] overflow-hidden hidden lg:flex">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
              <Target className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-black tracking-tight uppercase">
                Status Updates
              </h2>
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-5 w-5 animate-spin text-accent/50" />
                </div>
              ) : allEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground/30">
                  <Target className="w-6 h-6 mb-2" />
                  <span className="text-xs font-bold">No events yet</span>
                </div>
              ) : (
                allEvents.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))
              )}
            </div>
          </div>

          {/* Right pane: Top Winners (~25%) */}
          <div className="flex-[2.5] flex-col min-w-0 rounded-xl border border-white/[0.08] bg-[#111113] overflow-hidden hidden lg:flex">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-black tracking-tight uppercase text-amber-400/80">
                  Top Winners
                </h2>
              </div>
              {topWinners.length > 0 && (
                <div className="flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5 text-amber-400/40" />
                  <span className="text-[10px] font-bold text-amber-400/40">
                    {topWinners.length}
                  </span>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-5 w-5 animate-spin text-accent/50" />
                </div>
              ) : topWinners.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground/30">
                  <Trophy className="w-6 h-6 mb-2" />
                  <span className="text-xs font-bold">No winners yet</span>
                </div>
              ) : (
                topWinners.map((signal, i) => (
                  <WinnerRow key={signal.id} signal={signal} rank={i + 1} />
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
