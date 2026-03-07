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
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { cn } from "@/lib/utils";
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

function OpportunityRow({ signal }: { signal: ProcessedSignal }) {
  const isBuy = signal.type === "BUY";
  const isWinning = signal.pnl > 0.05;
  const isLosing = signal.pnl < -0.05;
  const isClosed = signal.status === "INACTIVE";

  const tpStatus = [];
  if (signal.tp1Hit) tpStatus.push("TP1");
  if (signal.tp2Hit) tpStatus.push("TP2");
  if (signal.tp3Hit) tpStatus.push("TP3");

  return (
    <Link
      href={`/chart/${signal.id}`}
      className={cn(
        "block px-4 py-3 border-b border-white/[0.04] transition-colors hover:bg-white/[0.03] group",
        isClosed && "opacity-60"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left: Symbol + direction + meta */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-lg shrink-0",
              isBuy
                ? "bg-positive/10 text-positive"
                : "bg-negative/10 text-negative"
            )}
          >
            {isBuy ? (
              <ArrowUpRight className="w-4 h-4" />
            ) : (
              <ArrowDownRight className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black uppercase tracking-tight text-foreground truncate">
                {signal.symbol}
              </span>
              {isClosed && (
                <span className="text-[9px] font-bold uppercase text-muted-foreground/50 bg-white/5 px-1.5 py-0.5 rounded">
                  Closed
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={cn(
                  "text-[9px] font-bold uppercase tracking-widest",
                  isBuy ? "text-positive/70" : "text-negative/70"
                )}
              >
                {isBuy ? "Long" : "Short"}
              </span>
              <span className="text-white/10">·</span>
              <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-wider">
                {signal.timeframeName}
              </span>
              <span className="text-white/10">·</span>
              <span className="text-[9px] font-bold text-muted-foreground/40 tracking-wider">
                {signal.algo}
              </span>
            </div>
          </div>
        </div>

        {/* Center: TP badges */}
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          {tpStatus.map((tp) => (
            <span
              key={tp}
              className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-positive/10 text-positive border border-positive/20"
            >
              {tp}
            </span>
          ))}
          {signal.slHitAt && (
            <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-negative/10 text-negative border border-negative/20">
              SL
            </span>
          )}
        </div>

        {/* Right: PNL + entry info */}
        <div className="text-right shrink-0">
          <span
            className={cn(
              "text-sm font-black font-mono tabular-nums",
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
          <div className="flex items-center gap-1 justify-end mt-0.5">
            <span className="text-[9px] text-muted-foreground/40 font-mono">
              ${formatPrice(signal.price)}
            </span>
            <span className="text-white/10">→</span>
            <span
              className={cn(
                "text-[9px] font-mono",
                isWinning
                  ? "text-positive/60"
                  : isLosing
                    ? "text-negative/60"
                    : "text-muted-foreground/40"
              )}
            >
              ${formatPrice(signal.currentPrice)}
            </span>
          </div>
        </div>
      </div>

      {/* Time ago */}
      <div className="flex items-center gap-1 mt-1.5 pl-11">
        <Clock className="w-2.5 h-2.5 text-muted-foreground/30" />
        <span className="text-[9px] text-muted-foreground/30">
          {formatTimeAgo(signal.receivedAt)}
        </span>
        <span className="text-[9px] text-accent/40 font-bold ml-auto">
          {signal.leverage}x
        </span>
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

export default function OpportunitiesPage() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [filterTimeframe, setFilterTimeframe] = useState("all");
  const [filterSide, setFilterSide] = useState("all");
  const [filterPerf, setFilterPerf] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

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

  const filteredEvents: StatusEvent[] = useMemo(() => {
    if (!rawEvents) return [];
    return rawEvents
      .filter((e: any) => {
        if (filterTimeframe !== "all" && e.timeframe !== filterTimeframe)
          return false;
        if (filterSide !== "all" && e.side !== filterSide) return false;
        return true;
      })
      .map((e: any) => ({
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
  }, [rawEvents, filterTimeframe, filterSide]);

  const activeCount = filteredSignals.filter(
    (s) => s.status !== "INACTIVE"
  ).length;
  const winningCount = filteredSignals.filter((s) => s.pnl > 0.05).length;

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

        {/* Filter bar */}
        <div className="border-b border-white/[0.06] bg-background/95 backdrop-blur px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent" />
              <h1 className="text-sm font-black tracking-tight uppercase">
                Opportunities
              </h1>
              {!isLoading && (
                <div className="flex items-center gap-2 ml-2">
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
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer sm:hidden",
                showFilters
                  ? "bg-accent/20 border-accent/40 text-accent"
                  : "bg-white/[0.04] border-white/10 text-muted-foreground"
              )}
            >
              <SlidersHorizontal className="w-3 h-3" />
              Filters
            </button>
          </div>

          {/* Filters - always visible on desktop, toggle on mobile */}
          <div
            className={cn(
              "flex flex-wrap gap-x-6 gap-y-2 mt-3",
              !showFilters && "hidden sm:flex"
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest mr-1">
                Timeframe
              </span>
              {TIMEFRAME_OPTIONS.map((opt) => (
                <FilterChip
                  key={opt.id}
                  label={opt.label}
                  active={filterTimeframe === opt.id}
                  onClick={() => setFilterTimeframe(opt.id)}
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest mr-1">
                Side
              </span>
              {SIDE_OPTIONS.map((opt) => (
                <FilterChip
                  key={opt.id}
                  label={opt.label}
                  active={filterSide === opt.id}
                  onClick={() => setFilterSide(opt.id)}
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest mr-1">
                Performance
              </span>
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

        {/* Two-pane layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left pane: Opportunities (2/3) */}
          <div className="flex-[2] flex flex-col min-w-0 border-r border-white/[0.06]">
            <div className="px-4 py-2.5 border-b border-white/[0.04] bg-white/[0.01] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-accent/60" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                  Live Opportunities
                </span>
              </div>
              <span className="text-[10px] font-bold text-muted-foreground/30">
                {filteredSignals.length} signals
              </span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-5 w-5 animate-spin text-accent/50" />
                </div>
              ) : filteredSignals.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground/30">
                  <Zap className="w-6 h-6 mb-2" />
                  <span className="text-xs font-bold">
                    No opportunities match your filters
                  </span>
                </div>
              ) : (
                filteredSignals.map((signal) => (
                  <OpportunityRow key={signal.id} signal={signal} />
                ))
              )}
            </div>
          </div>

          {/* Right pane: Activity Feed (1/3) */}
          <div className="flex-[1] flex flex-col min-w-0 hidden md:flex">
            <div className="px-3 py-2.5 border-b border-white/[0.04] bg-white/[0.01] flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-accent/60" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
                Status Updates
              </span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-5 w-5 animate-spin text-accent/50" />
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground/30">
                  <Target className="w-6 h-6 mb-2" />
                  <span className="text-xs font-bold">No events yet</span>
                </div>
              ) : (
                filteredEvents.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
