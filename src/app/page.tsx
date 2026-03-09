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
  Sparkles,
  Send,
} from "lucide-react";
import { RadarIcon } from "@/components/icons/RadarIcon";
import { useState, useMemo, useCallback, useEffect } from "react";
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
import { AUTO_FILTER_THRESHOLD, type ScoredSignal } from "@/lib/auto-filter";

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
  closedAt: string | null;
  totalBookedPnl: number | null;
  stopLoss: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  maxUpsidePrice: number | null;
  maxDrawdownPrice: number | null;
  originalStopLoss: number | null;
  sentimentAtEntry: string;
  aligned: boolean;
  autoFilterPassed: boolean | null;
  confidenceScore: number | null;
  confidenceLabel: string | null;
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
  algo: string;
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

function OpportunityCard({
  signal,
  score,
}: {
  signal: ProcessedSignal;
  score?: ScoredSignal;
}) {
  const isBuy = signal.type === "BUY";
  const isWinning = signal.pnl > 0.05;
  const isLosing = signal.pnl < -0.05;

  return (
    <Link
      href={`/chart/${signal.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group block rounded-xl border transition-all hover:translate-y-[-2px] hover:shadow-xl",
        isWinning
          ? "border-positive/25 bg-gradient-to-b from-positive/[0.06] to-positive/[0.02] hover:border-positive/40 hover:shadow-positive/10"
          : isLosing
            ? "border-negative/25 bg-gradient-to-b from-negative/[0.06] to-negative/[0.02] hover:border-negative/40 hover:shadow-negative/10"
            : "border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-white/[0.01] hover:border-white/20 hover:shadow-white/5"
      )}
    >
      {/* Symbol + Direction */}
      <div className="px-4 pt-3.5 pb-1">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-black uppercase tracking-tight text-foreground">
            {signal.symbol}
          </span>
          {score && (
            <div
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-lg border",
                score.score >= 80
                  ? "bg-positive/10 border-positive/25 text-positive"
                  : score.score >= 65
                    ? "bg-accent/10 border-accent/25 text-accent"
                    : score.score >= 50
                      ? "bg-amber-400/10 border-amber-400/25 text-amber-400"
                      : "bg-orange-400/10 border-orange-400/25 text-orange-400"
              )}
            >
              <Sparkles className="w-3 h-3" />
              <span className="text-[11px] font-black tabular-nums">
                {score.score}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex items-center gap-1">
            {isBuy ? (
              <ArrowUpRight className="w-3.5 h-3.5 text-positive" />
            ) : (
              <ArrowDownRight className="w-3.5 h-3.5 text-negative" />
            )}
            <span
              className={cn(
                "text-[11px] font-black uppercase tracking-wide",
                isBuy ? "text-positive" : "text-negative"
              )}
            >
              {isBuy ? "Long" : "Short"}
            </span>
          </div>
          <span className="text-white/10">·</span>
          <span className="text-[11px] font-bold text-accent/60">
            {signal.leverage}x
          </span>
          <span className="text-white/10">·</span>
          <span className="text-[11px] font-bold text-muted-foreground/50 uppercase">
            {signal.timeframeName}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-1.5 text-muted-foreground/35">
          <Clock className="w-3 h-3" />
          <span className="text-[10px]">
            {formatTimeAgo(signal.receivedAt)}
          </span>
        </div>
      </div>

      {/* PnL */}
      <div className="px-4 py-2.5">
        <span
          className={cn(
            "text-2xl font-black font-mono tabular-nums leading-none",
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
      </div>

      {/* Price */}
      <div className="px-4 pb-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground/50 font-mono">
            ${formatPrice(signal.price)}
          </span>
          <span className="text-white/15">→</span>
          <span
            className={cn(
              "text-[11px] font-mono font-bold",
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
      </div>

      {/* Algo */}
      <div className="px-4 pb-3 pt-1.5 border-t border-white/[0.04]">
        <span className="text-[9px] font-bold text-muted-foreground/30 uppercase tracking-widest">
          {signal.algo}
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
  const pnlValue = event.totalBookedPnl ?? event.bookedPnl;
  const isTrailingSL =
    event.type === "SL_HIT" && pnlValue != null && pnlValue > 0;

  const config = isTrailingSL
    ? {
        icon: ShieldOff,
        color: "text-positive",
        bgColor: "bg-positive/10",
        label: "Trailing SL Hit",
      }
    : (EVENT_CONFIG[event.type] ?? {
        icon: XCircle,
        color: "text-muted-foreground",
        bgColor: "bg-white/5",
        label: event.type,
      });
  const Icon = config.icon;
  const isBuy = event.side === "BUY";
  const tfName = TIMEFRAME_NAMES[event.timeframe] ?? event.timeframe;
  const leverage = getLeverage(event.timeframe);

  return (
    <Link
      href={`/chart/${event.signalId}`}
      className="block px-4 py-3 border-b border-white/[0.05] transition-colors hover:bg-white/[0.03]"
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex items-center justify-center w-7 h-7 rounded-md shrink-0 mt-0.5",
            config.bgColor
          )}
        >
          <Icon className={cn("w-3.5 h-3.5", config.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "text-[13px] font-black uppercase tracking-tight truncate",
                config.color
              )}
            >
              {config.label}
              {(event.type === "TP1_HIT" || event.type === "TP2_HIT" || event.type === "TP3_HIT") && " 🔥"}
            </span>
            {pnlValue != null && (
              <span
                className={cn(
                  "text-[13px] font-black font-mono tabular-nums shrink-0",
                  pnlValue >= 0 ? "text-positive" : "text-negative"
                )}
              >
                {pnlValue >= 0 ? "+" : ""}
                {(pnlValue * leverage).toFixed(2)}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className={cn(
                "text-[11px] font-bold",
                isBuy ? "text-positive/70" : "text-negative/70"
              )}
            >
              {isBuy ? "▲" : "▼"}
            </span>
            <span className="text-[11px] font-bold text-foreground/90 uppercase tracking-tight">
              {event.symbol}
            </span>
            <span className="text-white/15">·</span>
            <span className="text-[11px] text-muted-foreground/60">{tfName}</span>
          </div>
          {event.algo && (
            <p className="text-[10px] text-muted-foreground/40 mt-0.5 uppercase tracking-wider">
              {event.algo}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground/50 mt-1 leading-relaxed">
            {event.guidance}
          </p>
          <div className="flex items-center gap-1 mt-1.5">
            <Clock className="w-3 h-3 text-muted-foreground/40" />
            <span className="text-[11px] text-muted-foreground/40">
              {formatTimeAgo(event.createdAt)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

function WinnerCard({
  signal,
  rank,
}: {
  signal: ProcessedSignal;
  rank: number;
}) {
  const isBuy = signal.type === "BUY";

  return (
    <Link
      href={`/chart/${signal.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group block rounded-lg border border-amber-400/10 bg-amber-400/[0.02] px-3.5 py-2.5 transition-all hover:border-amber-400/25 hover:bg-amber-400/[0.05]"
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-black uppercase tracking-tight text-foreground truncate">
          {signal.symbol}
        </span>
        <span className="text-base leading-none">
          {rank <= 3 ? RANK_MEDALS[rank - 1] : (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-black bg-white/5 text-muted-foreground/40">
              {rank}
            </span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        {isBuy ? (
          <ArrowUpRight className="w-3 h-3 text-positive" />
        ) : (
          <ArrowDownRight className="w-3 h-3 text-negative" />
        )}
        <span className={cn("text-[11px] font-black uppercase", isBuy ? "text-positive" : "text-negative")}>
          {isBuy ? "Long" : "Short"}
        </span>
        <span className="text-white/10">·</span>
        <span className="text-[11px] font-bold text-accent/60">{signal.leverage}x</span>
        <span className="text-white/10">·</span>
        <span className="text-[11px] font-bold text-muted-foreground/50 uppercase">{signal.timeframeName}</span>
      </div>
      <span className="text-lg font-black font-mono tabular-nums text-positive leading-none mt-2 block">
        +{signal.leveragedPnl.toFixed(2)}%
      </span>
    </Link>
  );
}

export default function Home() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [telegramStatus, setTelegramStatus] = useState<{
    connected: boolean;
    enabled: boolean;
  } | null>(null);

  useEffect(() => {
    if (!user) return;
    fetch(`/api/telegram/status?uid=${user.uid}`)
      .then((r) => r.json())
      .then((data) => setTelegramStatus({ connected: data.connected, enabled: data.enabled }))
      .catch(() => {});
  }, [user]);

  const FILTER_STORAGE_KEY = "tez-opp-filters";

  const [filterTimeframe, setFilterTimeframe] = useState("all");
  const [filterSide, setFilterSide] = useState("all");
  const [filterPerf, setFilterPerf] = useState("all");
  const [filterAlgo, setFilterAlgo] = useState("all");
  const [filtersLoaded, setFiltersLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(FILTER_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.timeframe) setFilterTimeframe(parsed.timeframe);
        if (parsed.side) setFilterSide(parsed.side);
        if (parsed.perf) setFilterPerf(parsed.perf);
        if (parsed.algo) setFilterAlgo(parsed.algo);
      }
    } catch {}
    setFiltersLoaded(true);
  }, []);

  const [draftTimeframe, setDraftTimeframe] = useState("all");
  const [draftSide, setDraftSide] = useState("all");
  const [draftPerf, setDraftPerf] = useState("all");
  const [draftAlgo, setDraftAlgo] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);

  const activeFilterCount = [filterTimeframe, filterSide, filterPerf, filterAlgo].filter(
    (v) => v !== "all"
  ).length;
  const hasActiveFilters = activeFilterCount > 0;

  const handleFilterOpen = useCallback((open: boolean) => {
    if (open) {
      setDraftTimeframe(filterTimeframe);
      setDraftSide(filterSide);
      setDraftPerf(filterPerf);
      setDraftAlgo(filterAlgo);
    }
    setFilterOpen(open);
  }, [filterTimeframe, filterSide, filterPerf, filterAlgo]);

  const handleApplyFilters = useCallback(() => {
    setFilterTimeframe(draftTimeframe);
    setFilterSide(draftSide);
    setFilterPerf(draftPerf);
    setFilterAlgo(draftAlgo);
    setFilterOpen(false);
    try {
      localStorage.setItem(
        FILTER_STORAGE_KEY,
        JSON.stringify({
          timeframe: draftTimeframe,
          side: draftSide,
          perf: draftPerf,
          algo: draftAlgo,
        })
      );
    } catch {}
  }, [draftTimeframe, draftSide, draftPerf, draftAlgo]);

  const handleClearFilters = useCallback(() => {
    setDraftTimeframe("all");
    setDraftSide("all");
    setDraftPerf("all");
    setDraftAlgo("all");
  }, []);

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
          closedAt: signal.slHitAt ?? signal.tp3HitAt ?? null,
          totalBookedPnl: signal.totalBookedPnl ?? null,
          stopLoss: signal.stopLoss ?? null,
          tp1: signal.tp1 != null ? Number(signal.tp1) : null,
          tp2: signal.tp2 != null ? Number(signal.tp2) : null,
          tp3: signal.tp3 != null ? Number(signal.tp3) : null,
          maxUpsidePrice: signal.maxUpsidePrice != null ? Number(signal.maxUpsidePrice) : null,
          maxDrawdownPrice: signal.maxDrawdownPrice != null ? Number(signal.maxDrawdownPrice) : null,
          originalStopLoss: signal.originalStopLoss != null ? Number(signal.originalStopLoss) : null,
          sentimentAtEntry: signal.sentimentAtEntry ?? "",
          aligned: signal.aligned ?? false,
          autoFilterPassed: signal.autoFilterPassed ?? null,
          confidenceScore: signal.confidenceScore ?? null,
          confidenceLabel: signal.confidenceLabel ?? null,
        };
      });
  }, [rawSignals]);

  const uniqueAlgos = useMemo(() => {
    const set = new Set<string>();
    processedSignals.forEach((s) => set.add(s.algo));
    return Array.from(set).sort();
  }, [processedSignals]);

  const filteredSignals = useMemo(() => {
    return processedSignals.filter((s) => {
      if (filterTimeframe !== "all" && s.timeframe !== filterTimeframe)
        return false;
      if (filterSide !== "all" && s.type !== filterSide) return false;
      if (filterAlgo !== "all" && s.algo !== filterAlgo) return false;
      if (filterPerf === "winning" && s.pnl <= 0.05) return false;
      if (filterPerf === "losing" && s.pnl >= -0.05) return false;
      return true;
    });
  }, [processedSignals, filterTimeframe, filterSide, filterAlgo, filterPerf]);

  const signalAlgoMap = useMemo(() => {
    const map: Record<string, string> = {};
    processedSignals.forEach((s) => { map[s.id] = s.algo; });
    return map;
  }, [processedSignals]);

  const aiPassedIds = useMemo(() => {
    const ids = new Set<string>();
    processedSignals.forEach((s) => {
      if (s.autoFilterPassed === true) ids.add(s.id);
    });
    return ids;
  }, [processedSignals]);

  const allEvents: StatusEvent[] = useMemo(() => {
    if (!rawEvents) return [];
    return rawEvents
      .filter((e: any) => aiPassedIds.has(e.signalId))
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
        algo: signalAlgoMap[e.signalId] || "",
      }));
  }, [rawEvents, signalAlgoMap, aiPassedIds]);

  const [aiTab, setAiTab] = useState<"active" | "watch">("active");

  const aiActiveSignals = useMemo(() => {
    const base = filteredSignals.filter(
      (s) =>
        s.status !== "INACTIVE" &&
        !s.tp1Hit &&
        !s.tp2Hit &&
        !s.tp3Hit &&
        !s.slHitAt &&
        s.autoFilterPassed === true &&
        (s.confidenceScore ?? 0) >= AUTO_FILTER_THRESHOLD,
    );
    return base.sort(
      (a, b) => (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0),
    );
  }, [filteredSignals]);

  const aiWatchSignals = useMemo(() => {
    return filteredSignals.filter(
      (s) =>
        s.status !== "INACTIVE" &&
        !s.tp1Hit &&
        !s.tp2Hit &&
        !s.tp3Hit &&
        !s.slHitAt &&
        s.autoFilterPassed === true &&
        (s.confidenceScore ?? 0) < AUTO_FILTER_THRESHOLD,
    );
  }, [filteredSignals]);

  const liveOpportunities = aiTab === "active" ? aiActiveSignals : aiWatchSignals;

  const activeCount = aiActiveSignals.length;
  const watchCount = aiWatchSignals.length;
  const winningCount = aiActiveSignals.filter((s) => s.pnl > 0.05).length;

  const topWinners = useMemo(() => {
    return processedSignals
      .filter((s) => s.autoFilterPassed === true && s.pnl > 0.05)
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
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-black tracking-tight uppercase">
                    AI Filtered
                  </h2>
                  {!isLoading && (
                    <div className="flex items-center gap-2 ml-1">
                      <span className="text-[11px] font-bold text-positive/70">
                        {activeCount} active
                      </span>
                      {watchCount > 0 && (
                        <>
                          <span className="text-white/15">·</span>
                          <span className="text-[11px] font-bold text-amber-400/60">
                            {watchCount} watch
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
              <Popover open={filterOpen} onOpenChange={handleFilterOpen}>
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
                    {(draftTimeframe !== "all" || draftSide !== "all" || draftPerf !== "all") && (
                      <button
                        onClick={handleClearFilters}
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
                            active={draftTimeframe === opt.id}
                            onClick={() => setDraftTimeframe(opt.id)}
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
                            active={draftSide === opt.id}
                            onClick={() => setDraftSide(opt.id)}
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
                            active={draftPerf === opt.id}
                            onClick={() => setDraftPerf(opt.id)}
                          />
                        ))}
                      </div>
                    </div>
                    {uniqueAlgos.length > 1 && (
                      <div className="space-y-2">
                        <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest">
                          Algo
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          <FilterChip
                            label="All"
                            active={draftAlgo === "all"}
                            onClick={() => setDraftAlgo("all")}
                          />
                          {uniqueAlgos.map((algo) => (
                            <FilterChip
                              key={algo}
                              label={algo}
                              active={draftAlgo === algo}
                              onClick={() => setDraftAlgo(algo)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="px-4 py-3 border-t border-white/[0.06]">
                    <button
                      onClick={handleApplyFilters}
                      className="w-full py-2 rounded-lg bg-accent text-background text-xs font-black uppercase tracking-wider hover:bg-accent/90 transition-colors cursor-pointer"
                    >
                      Apply Filters
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
                </div>
              </div>
              <div className="flex items-center gap-1 px-4 pt-2 pb-1">
                <button
                  onClick={() => setAiTab("active")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                    aiTab === "active"
                      ? "bg-positive/15 text-positive"
                      : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-white/[0.04]"
                  )}
                >
                  AI Active {!isLoading && `(${activeCount})`}
                </button>
                <button
                  onClick={() => setAiTab("watch")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer",
                    aiTab === "watch"
                      ? "bg-amber-400/15 text-amber-400"
                      : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-white/[0.04]"
                  )}
                >
                  AI Watch {!isLoading && watchCount > 0 && `(${watchCount})`}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-5 w-5 animate-spin text-accent/50" />
                </div>
              ) : liveOpportunities.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[200px]">
                  {aiTab === "active" ? (
                    <div className="flex flex-col items-center gap-4 max-w-xs text-center">
                      <div className="relative w-20 h-20">
                        {/* Static radar rings */}
                        <div className="absolute inset-0 rounded-full border border-accent/15" />
                        <div className="absolute inset-[25%] rounded-full border border-accent/10" />
                        <div className="absolute inset-[45%] rounded-full bg-accent/20 border border-accent/25" />
                        {/* Sweep line with trailing glow */}
                        <div
                          className="absolute inset-0 rounded-full animate-[spin_3s_linear_infinite]"
                          style={{
                            background: "conic-gradient(from 0deg, transparent 0deg, transparent 270deg, hsl(var(--accent) / 0.15) 330deg, hsl(var(--accent) / 0.4) 360deg)",
                          }}
                        />
                        {/* Sweep line */}
                        <div className="absolute inset-0 animate-[spin_3s_linear_infinite]">
                          <div
                            className="absolute left-1/2 bottom-1/2 w-[1.5px] bg-gradient-to-t from-accent to-transparent"
                            style={{ height: "50%", transformOrigin: "bottom center" }}
                          />
                        </div>
                        {/* Center dot */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_6px_hsl(var(--accent))]" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-sm font-bold text-foreground/70">
                          Scanning the market for winning opportunities
                        </p>
                        <p className="text-[11px] text-muted-foreground/40">
                          High-confidence signals scoring {AUTO_FILTER_THRESHOLD}+ will appear here
                        </p>
                      </div>
                      {telegramStatus && !telegramStatus.connected ? (
                        <Link
                          href="/settings"
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent/15 border border-accent/25 text-accent text-xs font-bold uppercase tracking-wider hover:bg-accent/25 transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Get notified on Telegram
                        </Link>
                      ) : telegramStatus && telegramStatus.connected && !telegramStatus.enabled ? (
                        <Link
                          href="/settings"
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-accent/15 border border-accent/25 text-accent text-xs font-bold uppercase tracking-wider hover:bg-accent/25 transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Enable Telegram notifications
                        </Link>
                      ) : telegramStatus && telegramStatus.connected && telegramStatus.enabled ? (
                        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-positive/[0.08] border border-positive/20 text-positive/70 text-[11px] font-bold">
                          <Send className="w-3.5 h-3.5" />
                          You&apos;ll be notified on Telegram the moment we find a winner
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-muted-foreground/30">
                      <Zap className="w-6 h-6 mb-2" />
                      <span className="text-xs font-bold">
                        No demoted signals
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
                  {liveOpportunities.map((signal) => (
                    <OpportunityCard
                      key={signal.id}
                      signal={signal}
                      score={signal.confidenceScore != null ? {
                        signalId: signal.id,
                        score: signal.confidenceScore,
                        label: signal.confidenceLabel ?? "",
                        color: signal.confidenceScore >= 80 ? "text-positive"
                          : signal.confidenceScore >= 65 ? "text-accent"
                          : signal.confidenceScore >= 50 ? "text-amber-400"
                          : "text-orange-400",
                        breakdown: { mtfConfluence: 0, momentum: 0, riskReward: 0, algoPerformance: 0, tradeHealth: 0, freshness: 0 },
                      } : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Middle pane: Status Updates (~25%) */}
          <div className="flex-[2.5] flex-col min-w-0 rounded-xl border border-white/[0.08] bg-[#111113] overflow-hidden hidden lg:flex">
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-accent" />
                <h2 className="text-sm font-black tracking-tight uppercase">
                  Status Updates
                </h2>
              </div>
              <p className="text-[11px] text-muted-foreground/50 mt-1 pl-6">
                Live status updates on running trades
              </p>
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
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center justify-between">
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
              <p className="text-[11px] text-muted-foreground/50 mt-1 pl-6">
                Best performing trades ranked by PNL
              </p>

            </div>

            <div className="flex-1 overflow-y-auto p-3">
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
                <div className="grid grid-cols-1 gap-2.5">
                  {topWinners.map((signal, i) => (
                    <WinnerCard key={signal.id} signal={signal} rank={i + 1} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
