"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import {
  useUser,
  useAuth,
  useFirestore,
  useCollection,
  useDoc,
  useMemoFirebase,
} from "@/firebase";
import { collection, query, orderBy, limit, doc } from "firebase/firestore";
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
  TrendingUp,
  Shield,
  BookOpen,
  Lock,
} from "lucide-react";
import { RadarIcon } from "@/components/icons/RadarIcon";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/hooks/use-toast";
import Link from "next/link";
import { trackFilterApplied, trackTabChanged, trackPageView } from "@/firebase/analytics";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getLeverage } from "@/lib/leverage";
import { getEffectivePnl } from "@/lib/pnl";
import { AUTO_FILTER_THRESHOLD, isRegimeStale, type ScoredSignal, type MarketRegimeData } from "@/lib/auto-filter";
import { useSubscription } from "@/hooks/use-subscription";
import { DEFAULT_PLANS, FREE_TRIAL_DAYS } from "@/lib/subscription";

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

  const tp3Pnl = useMemo(() => {
    if (signal.tp3 == null || !signal.price) return null;
    const raw = isBuy
      ? ((signal.tp3 - signal.price) / signal.price) * 100
      : ((signal.price - signal.tp3) / signal.price) * 100;
    return raw * signal.leverage;
  }, [signal.tp3, signal.price, signal.leverage, isBuy]);

  return (
    <Link
      href={`/chart/${signal.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "group block rounded-xl border shadow-lg transition-all hover:translate-y-[-2px] hover:shadow-2xl",
        isWinning
          ? "border-positive/25 bg-gradient-to-b from-positive/[0.08] to-positive/[0.02] shadow-positive/5 hover:border-positive/40 hover:shadow-positive/15"
          : isLosing
            ? "border-negative/25 bg-gradient-to-b from-negative/[0.08] to-negative/[0.02] shadow-negative/5 hover:border-negative/40 hover:shadow-negative/15"
            : "border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.01] shadow-black/20 hover:border-white/20 hover:shadow-black/40"
      )}
    >
      {/* Symbol + Direction */}
      <div className="px-4 pt-3.5 pb-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[15px] font-black uppercase tracking-tight text-foreground truncate min-w-0">
            {signal.symbol}
          </span>
          {score && (
            <div
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-lg border shrink-0",
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

      {/* PnL + TP3 Target */}
      <div className="px-4 py-2.5">
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "text-[11px] font-bold font-mono tabular-nums",
              isWinning
                ? "text-positive"
                : isLosing
                  ? "text-negative"
                  : "text-muted-foreground/50"
            )}
          >
            {signal.leveragedPnl >= 0 ? "+" : ""}
            {signal.leveragedPnl.toFixed(2)}%
          </span>
          {tp3Pnl != null && (
            <>
              <span className="text-muted-foreground/20 text-[11px]">/</span>
              <span className="text-2xl font-black font-mono tabular-nums leading-none text-muted-foreground">
                +{tp3Pnl.toFixed(1)}%
              </span>
            </>
          )}
        </div>
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
          <div className="flex items-baseline justify-between gap-2">
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
              <span className="shrink-0 text-right">
                <span
                  className={cn(
                    "text-[13px] font-black font-mono tabular-nums",
                    pnlValue >= 0 ? "text-positive" : "text-negative"
                  )}
                >
                  {pnlValue >= 0 ? "+" : ""}
                  {(pnlValue * leverage).toFixed(2)}%
                </span>
                <span className="text-[9px] font-bold text-muted-foreground/40 ml-1">{leverage}x</span>
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
          {event.guidance && (
            <p
              className={cn(
                "text-[12px] mt-1.5 leading-relaxed font-medium",
                event.type === "TP1_HIT" || event.type === "TP2_HIT" || event.type === "TP3_HIT" || isTrailingSL
                  ? "text-foreground/80"
                  : event.type === "SL_HIT"
                    ? "text-negative/70"
                    : "text-muted-foreground/40"
              )}
            >
              {event.guidance}
            </p>
          )}
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

function GuideItem({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex gap-3.5">
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.05] shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="min-w-0">
        <span className="text-[13px] font-bold text-foreground">{title}</span>
        <p className="text-[12px] text-muted-foreground/60 leading-relaxed mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

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
      className="block px-4 py-3 border-b border-white/[0.05] transition-colors hover:bg-white/[0.03]"
    >
      <div className="flex items-start gap-3">
        <span className="text-lg leading-none shrink-0 mt-0.5">
          {rank <= 3 ? RANK_MEDALS[rank - 1] : (
            <span className="inline-flex items-center justify-center w-6 h-6 rounded text-[10px] font-black bg-white/5 text-muted-foreground/40">
              {rank}
            </span>
          )}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[13px] font-black uppercase tracking-tight text-foreground truncate">
              {signal.symbol}
            </span>
            <span className="shrink-0 text-right">
              <span className="text-[13px] font-black font-mono tabular-nums text-positive">
                +{signal.leveragedPnl.toFixed(2)}%
              </span>
              <span className="text-[9px] font-bold text-muted-foreground/40 ml-1">{signal.leverage}x</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={cn("text-[11px] font-bold", isBuy ? "text-positive/70" : "text-negative/70")}>
              {isBuy ? "▲" : "▼"}
            </span>
            <span className={cn("text-[11px] font-bold uppercase", isBuy ? "text-positive/70" : "text-negative/70")}>
              {isBuy ? "Long" : "Short"}
            </span>
            <span className="text-white/15">·</span>
            <span className="text-[11px] text-muted-foreground/60 uppercase">{signal.timeframeName}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function SignalsPage() {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const firestore = useFirestore();
  const router = useRouter();

  const [telegramStatus, setTelegramStatus] = useState<{
    connected: boolean;
    enabled: boolean;
  } | null>(null);

  const subscription = useSubscription(user?.uid, {
    name: user?.displayName,
    email: user?.email,
    photo: user?.photoURL,
  });

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
    trackFilterApplied({
      timeframe: draftTimeframe,
      side: draftSide,
      perf: draftPerf,
      algo: draftAlgo,
    });
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

  const regimeRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, "config", "market_regime");
  }, [firestore, user]);
  const { data: regimeData } = useDoc(regimeRef);

  const filterCfgRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, "config", "auto_filter");
  }, [firestore, user]);
  const { data: filterCfgData } = useDoc(filterCfgRef);
  const configuredThreshold = (filterCfgData as any)?.baseThreshold ?? AUTO_FILTER_THRESHOLD;

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

  const getSignalThreshold = useCallback((timeframe: string, side: string) => {
    if (!regimeData) return configuredThreshold;
    const key = `${timeframe}_${side}`;
    const entry = (regimeData as unknown as MarketRegimeData)[key];
    if (!entry || isRegimeStale(entry.lastUpdated)) return configuredThreshold;
    return entry.adjustedThreshold;
  }, [regimeData, configuredThreshold]);

  const aiActiveSignals = useMemo(() => {
    const base = filteredSignals.filter(
      (s) =>
        s.status !== "INACTIVE" &&
        !s.tp1Hit &&
        !s.tp2Hit &&
        !s.tp3Hit &&
        !s.slHitAt &&
        s.autoFilterPassed === true &&
        (s.confidenceScore ?? 0) >= getSignalThreshold(s.timeframe, s.type),
    );
    return base.sort(
      (a, b) => (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0),
    );
  }, [filteredSignals, getSignalThreshold]);

  const aiWatchSignals = useMemo(() => {
    return filteredSignals
      .filter(
        (s) =>
          s.status !== "INACTIVE" &&
          !s.tp1Hit &&
          !s.tp2Hit &&
          !s.tp3Hit &&
          !s.slHitAt &&
          s.autoFilterPassed === true &&
          (s.confidenceScore ?? 0) < getSignalThreshold(s.timeframe, s.type),
      )
      .sort((a, b) => (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0));
  }, [filteredSignals, getSignalThreshold]);

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


  if (isUserLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!user) {
    router.push("/");
    return null;
  }

  const isLoading = signalsLoading || eventsLoading;

  return (
    <div className="flex min-h-screen lg:h-screen bg-background text-foreground lg:overflow-hidden">
      <main className="flex-1 flex flex-col min-w-0 h-full">
        <TopBar />

        {/* Mobile desktop banner */}
        <div className="lg:hidden flex items-center justify-center gap-2 px-4 py-2 bg-accent/10 border-b border-accent/20">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          <span className="text-[11px] font-bold text-accent/80">For the best experience, switch to desktop</span>
        </div>

        {/* Three-pane layout */}
        <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 overflow-y-auto lg:overflow-hidden">

          {/* Left pane: Opportunities (~50%) */}
          <div className="flex-[5] flex flex-col min-w-0 rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] shadow-xl shadow-black/30 overflow-hidden">
            {/* Hero Header */}
            <div className="px-5 pt-5 pb-3 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400/70">AI-Powered</span>
                </div>
                {!subscription.isLoading && subscription.isActive && (
                  <Link
                    href="/subscribe"
                    className={cn(
                      "text-[10px] font-bold tracking-wide shrink-0 transition-colors hover:underline",
                      subscription.isTrial
                        ? "text-amber-400/70"
                        : "text-positive/70"
                    )}
                  >
                    <span className="hidden sm:inline">{subscription.isTrial ? "Free Trial" : "Active"} · </span>{subscription.daysRemaining}d left
                  </Link>
                )}
                {!subscription.isLoading && subscription.isExpired && (
                  <Link
                    href="/subscribe"
                    className="text-[10px] font-bold tracking-wide text-negative/70 shrink-0 transition-colors hover:underline"
                  >
                    Expired · Subscribe
                  </Link>
                )}
              </div>
              <h1 className="text-lg lg:text-xl font-black tracking-tight text-foreground leading-tight">
                AI-Powered Trade Signals
              </h1>
              <div className="flex items-center justify-between mt-3 lg:mt-4 gap-2">
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => { setAiTab("active"); trackTabChanged("top_picks"); }}
                    className={cn(
                      "px-2.5 lg:px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap",
                      aiTab === "active"
                        ? "bg-positive/15 text-positive"
                        : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-white/[0.04]"
                    )}
                  >
                    Top Picks {!isLoading && `(${activeCount})`}
                  </button>
                  <button
                    onClick={() => { setAiTab("watch"); trackTabChanged("radar"); }}
                    className={cn(
                      "px-2.5 lg:px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap",
                      aiTab === "watch"
                        ? "bg-amber-400/15 text-amber-400"
                        : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-white/[0.04]"
                    )}
                  >
                    Radar {!isLoading && watchCount > 0 && `(${watchCount})`}
                  </button>
                </div>
              <div className="flex items-center gap-1.5 lg:gap-2 shrink-0">
              <Popover>
                <PopoverTrigger asChild>
                  <button className="flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-white/10 bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08] hover:text-foreground transition-all cursor-pointer">
                    <BookOpen className="w-3 h-3" />
                    <span className="hidden sm:inline">Guide</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-[420px] bg-card border-white/10 shadow-2xl p-0 max-h-[520px] overflow-y-auto"
                >
                  <div className="px-5 py-4 border-b border-white/[0.06]">
                    <span className="text-sm font-black uppercase tracking-wider">How It Works</span>
                  </div>
                  <div className="p-5 space-y-5">
                    <GuideItem
                      icon={<Sparkles className="w-3.5 h-3.5 text-positive" />}
                      title="Top Picks"
                      desc="High-confidence signals our AI recommends. These pass all scoring filters and are ready to act on."
                    />
                    <GuideItem
                      icon={<Target className="w-3.5 h-3.5 text-amber-400" />}
                      title="Market Radar"
                      desc="Signals being tracked but haven't crossed the confidence threshold yet. Watch for upgrades."
                    />
                    <GuideItem
                      icon={<SlidersHorizontal className="w-3.5 h-3.5 text-accent" />}
                      title="Filters"
                      desc="Narrow signals by timeframe (Scalping, Intraday, BTST), direction (Long/Short), or performance."
                    />
                    <div className="border-t border-white/[0.04] pt-4">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">Trade Management</span>
                    </div>
                    <GuideItem
                      icon={<CheckCircle2 className="w-3.5 h-3.5 text-positive" />}
                      title="TP1 · TP2 · TP3"
                      desc="Take profit targets. Book 50% at TP1, 25% at TP2, and the final 25% at TP3."
                    />
                    <GuideItem
                      icon={<Shield className="w-3.5 h-3.5 text-negative" />}
                      title="Stop Loss (SL)"
                      desc="Your safety net. Set automatically for every signal to protect your capital."
                    />
                    <GuideItem
                      icon={<TrendingUp className="w-3.5 h-3.5 text-positive" />}
                      title="Trailing Profit"
                      desc="As TPs hit, your SL moves up to lock gains. TP1 hit → SL moves to entry. TP2 hit → SL moves to TP1."
                    />
                    <div className="border-t border-white/[0.04] pt-4">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">Stay Connected</span>
                    </div>
                    <GuideItem
                      icon={<Send className="w-3.5 h-3.5 text-blue-400" />}
                      title="Telegram Alerts"
                      desc="Get instant notifications when new Top Picks appear and when your trades hit targets."
                    />
                    <Link
                      href="/settings"
                      className="flex items-center gap-2 mt-1 ml-11.5 text-[12px] font-bold text-accent hover:text-accent/80 transition-colors"
                    >
                      Go to Settings →
                    </Link>
                  </div>
                </PopoverContent>
              </Popover>
              <Popover open={filterOpen} onOpenChange={handleFilterOpen}>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer",
                      hasActiveFilters
                        ? "bg-accent/20 border-accent/40 text-accent"
                        : "bg-white/[0.04] border-white/10 text-muted-foreground hover:bg-white/[0.08] hover:text-foreground"
                    )}
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    <span className="hidden sm:inline">{hasActiveFilters ? `${activeFilterCount}` : "Filter"}</span>
                    <span className="sm:hidden">{hasActiveFilters ? `${activeFilterCount}` : ""}</span>
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
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {subscription.isExpired ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
                  <div className="flex flex-col items-center gap-5 max-w-sm text-center p-6">
                    <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                      <Lock className="w-7 h-7 text-accent" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-black tracking-tight text-foreground">
                        Unlock AI-Powered Trade Signals
                      </h3>
                      <p className="text-[13px] text-muted-foreground/60 leading-relaxed">
                        Subscribe to get real-time access to Top Picks, Radar signals, and Live Updates. Our AI scans the market 24/7 so you don&apos;t have to.
                      </p>
                    </div>
                    <div className="flex flex-col items-center gap-3 w-full">
                      <Link
                        href="/subscribe"
                        className="w-full py-3 rounded-xl bg-accent text-accent-foreground text-sm font-black uppercase tracking-wider hover:bg-accent/90 transition-colors text-center shadow-lg shadow-accent/20"
                      >
                        Subscribe — from ${DEFAULT_PLANS[0].price}/{DEFAULT_PLANS[0].days} days
                      </Link>
                      <p className="text-[11px] text-muted-foreground/40">
                        Pay with crypto. No credit card needed.
                      </p>
                    </div>
                  </div>
                </div>
              ) : isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-5 w-5 animate-spin text-accent/50" />
                </div>
              ) : liveOpportunities.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[200px]">
                  {aiTab === "active" ? (
                    <div className="flex flex-col items-center gap-4 max-w-xs text-center">
                      <div className="relative w-20 h-20">
                        <div className="absolute inset-0 rounded-full border border-accent/15" />
                        <div className="absolute inset-[25%] rounded-full border border-accent/10" />
                        <div className="absolute inset-[45%] rounded-full bg-accent/20 border border-accent/25" />
                        <div
                          className="absolute inset-0 rounded-full animate-[spin_3s_linear_infinite]"
                          style={{
                            background: "conic-gradient(from 0deg, transparent 0deg, transparent 270deg, hsl(var(--accent) / 0.15) 330deg, hsl(var(--accent) / 0.4) 360deg)",
                          }}
                        />
                        <div className="absolute inset-0 animate-[spin_3s_linear_infinite]">
                          <div
                            className="absolute left-1/2 bottom-1/2 w-[1.5px] bg-gradient-to-t from-accent to-transparent"
                            style={{ height: "50%", transformOrigin: "bottom center" }}
                          />
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_6px_hsl(var(--accent))]" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-sm font-bold text-foreground/70">
                          Scanning the market for winning opportunities
                        </p>
                        <p className="text-[11px] text-muted-foreground/40">
                          High-confidence signals scoring {configuredThreshold}+ will appear here
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
          <div className="flex-[2.5] flex flex-col min-w-0 rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] shadow-xl shadow-black/30 overflow-hidden lg:max-h-full max-h-[400px]">
            <div className="px-4 py-3 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-accent" />
                <h2 className="text-sm font-black tracking-tight uppercase">
                  Live Updates
                </h2>
              </div>
              <p className="text-[11px] text-muted-foreground/50 mt-1 pl-6">
                Live status updates on running trades
              </p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {subscription.isExpired ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[200px] p-6">
                  <div className="flex flex-col items-center gap-3 text-center max-w-[220px]">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                      <Lock className="w-4.5 h-4.5 text-accent" />
                    </div>
                    <p className="text-[13px] font-bold text-foreground/70">
                      Subscribe to view live updates
                    </p>
                    <p className="text-[11px] text-muted-foreground/40 leading-relaxed">
                      Real-time TP/SL events on running trades
                    </p>
                    <Link
                      href="/subscribe"
                      className="mt-1 px-4 py-2 rounded-lg bg-accent/15 border border-accent/25 text-accent text-xs font-bold uppercase tracking-wider hover:bg-accent/25 transition-colors"
                    >
                      Subscribe Now
                    </Link>
                  </div>
                </div>
              ) : isLoading ? (
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
          <div className="flex-[2.5] flex flex-col min-w-0 rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] shadow-xl shadow-black/30 overflow-hidden lg:max-h-full max-h-[400px]">
            <div className="px-4 py-3 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent">
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

            <div className="flex-1 overflow-y-auto">
              <div className="p-3">
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
                  <div>
                    {topWinners.map((signal, i) => (
                      <WinnerCard key={signal.id} signal={signal} rank={i + 1} />
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </main>

      {/* Floating Telegram CTA — page-level */}
      <Link
        href="/settings"
        className="fixed bottom-6 right-6 z-50 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 shadow-lg shadow-black/40 flex items-center justify-center transition-all hover:scale-110 border border-white/10 backdrop-blur-sm"
        title="Get Telegram Alerts"
      >
        <svg viewBox="0 0 240 240" className="w-5 h-5 fill-[#2AABEE]">
          <path d="M66.964 134.874s-32.08-10.062-51.344-16.002c-17.542-5.41-6.196-12.054 6.09-16.686 12.288-4.632 169.486-64.15 169.486-64.15s18.498-7.682 16.964 5.17c-.522 5.17-4.694 23.29-8.866 43.478L183.33 160.74s-1.566 12.396-14.636 1.304c-8.344-7.682-37.17-26.846-43.63-31.27-1.566-1.042-3.654-3.39.522-5.952 9.91-9.246 21.6-20.642 28.582-27.542 3.132-3.13 6.264-10.288-6.786-1.56L98.39 137.222c-6.264 4.108-12.004 1.304-12.004 1.304l-19.422-6.652z"/>
        </svg>
      </Link>
    </div>
  );
}
