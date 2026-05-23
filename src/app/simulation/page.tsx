"use client";

import { TopBar } from "@/components/dashboard/TopBar";
import {
  useUser,
  useFirestore,
  useCollection,
  useDoc,
  useMemoFirebase,
} from "@/firebase";
import { collection, query, orderBy, limit, where, doc, getDocs, startAfter, QueryDocumentSnapshot, DocumentData } from "firebase/firestore";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Filter,
  X,
  XCircle,
  Link2,
} from "lucide-react";
import { useAutoRefresh, useRelativeTimeLabel } from "@/hooks/use-auto-refresh";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useState, useMemo, useEffect, useCallback, useRef, Fragment } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PatternBadge, type PatternType } from "@/components/ui/pattern-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import type { SimulatorState, SimTrade, SimLog, SimTradeEvent } from "@/lib/simulator";
import { getSimStateDocId } from "@/lib/simulator";
import { SimulatorParamsDialog } from "@/components/simulator/SimulatorParamsDialog";
import { BotCockpit } from "@/components/simulator/BotCockpit";
import { format, startOfDay, startOfWeek, startOfMonth, isAfter } from "date-fns";
import { buildEquityCurve } from "@/lib/equity-curve";
import { matchesBotSource } from "@/lib/bot-source-filter";
import { SIM_COCKPIT_BOTS, type CockpitBotId } from "@/lib/sim-cockpit-bots";
import { matchesLogForBotSource } from "@/lib/sim-cockpit-logs";
import { CronHealthBanner } from "@/components/simulator/CronHealthBanner";
import {
  LiveMirrorExchangeBar,
  LiveMirrorSymbolLink,
  useOpenTradesMirrors,
} from "@/components/simulator/OpenTradesLiveMirrors";
import { TabErrorBoundary } from "@/components/error/TabErrorBoundary";
import { SimulatorToolbar } from "@/components/simulator/SimulatorToolbar";
import { SimulatorMainPanel } from "@/components/simulator/SimulatorMainPanel";
import { OpenPositionsPanel } from "@/components/simulator/OpenPositionsPanel";
import { SimForceCloseDialog } from "@/components/simulator/SimForceCloseDialog";
import { SimNotionalSizeDisplay } from "@/components/simulator/SimNotionalSize";
import { SIM_CARD } from "@/components/simulator/simulator-surfaces";

// Defensive against legacy trade docs missing newer fields
// (`fees`, `positionSize`, zone-bot fields). Unguarded
// `undefined.toFixed()` previously crashed the History tab.
function formatMoney(val: number | null | undefined, cs = "$"): string {
  if (val == null || !Number.isFinite(val)) {
    return cs === "₹" ? "₹0.00" : "$0.00";
  }
  if (cs === "₹") {
    return `₹${val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${val.toFixed(2)}`;
}

function formatPct(val: number | null | undefined): string {
  if (val == null || !Number.isFinite(val)) return "0.00%";
  const sign = val >= 0 ? "+" : "";
  return `${sign}${val.toFixed(2)}%`;
}

function formatTimeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const tfLabelMap: Record<string, string> = { "5": "5m", "15": "15m", "60": "1h", "240": "4h", "D": "1D" };

function formatPrice(val: number | null | undefined): string {
  if (val == null || val === 0) return "—";
  if (val >= 100) return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val >= 1) return val.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return val.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

export default function SimulationPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const router = useRouter();
  const [tab, setTab] = useState<"overview" | "trades" | "logs">("overview");
  const [selectedBotId, setSelectedBotId] = useState<CockpitBotId>("crypto");
  const [selectedTrade, setSelectedTrade] = useState<SimTrade | null>(null);
  const selectedBot = useMemo(
    () => SIM_COCKPIT_BOTS.find((b) => b.id === selectedBotId) ?? SIM_COCKPIT_BOTS[0],
    [selectedBotId],
  );
  const [botMaxOpenTrades, setBotMaxOpenTrades] = useState<number | null>(null);
  const cs = "$";

  useEffect(() => {
    fetch(`/api/settings/sim-bot/${selectedBotId}`)
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.maxOpenTrades === "number") setBotMaxOpenTrades(d.maxOpenTrades);
      })
      .catch(() => setBotMaxOpenTrades(null));
  }, [selectedBotId]);

  const stateRef = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return doc(firestore, "config", getSimStateDocId("CRYPTO"));
  }, [firestore, user]);
  const { data: stateData, isLoading: stateLoading, refetch: refetchState } = useDoc(stateRef);
  const simState = stateData as SimulatorState | null;

  // OPEN trades — small set (5–20 docs), updated every minute by the cron.
  // No orderBy so no composite index is required; client sorts if needed.
  const openTradesQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, "simulator_trades"),
      where("status", "==", "OPEN"),
    );
  }, [firestore, user]);
  const { data: rawOpenTrades, isLoading: openTradesLoading, refetch: refetchOpenTrades } = useCollection(openTradesQuery);

  // Auto-refresh: pulls fresh sim state + open trades every 60s while the tab
  // is visible (zero reads while hidden) plus on visibility / focus change.
  // Cost at 1 user / 1 hr usage ≈ a few hundred reads/day — well inside the
  // free Firestore tier. Historical closed trades + logs are intentionally
  // NOT refreshed — refresh the page if you need fresh history.
  const { lastRefreshedAt, refresh } = useAutoRefresh(
    [refetchState, refetchOpenTrades],
    60_000,
  );
  const lastRefreshedLabel = useRelativeTimeLabel(lastRefreshedAt);

  // CLOSED trades — server-side paginated (50 per page), cursor-based.
  // getDocs (not onSnapshot) keeps listener cost at zero; fetchHistPage(0)
  // resets to page 1 on asset switch or after a force-close.
  const HIST_PAGE_SIZE = 50;
  const [histTrades, setHistTrades] = useState<SimTrade[]>([]);
  const [histPage, setHistPage] = useState(0); // 0-indexed
  const [histHasMore, setHistHasMore] = useState(false);
  const [closedTradesLoading, setClosedTradesLoading] = useState(false);
  // pageCursorsRef[n] = cursor to startAfter when fetching page n.
  // null means "no cursor" (start from the beginning of the collection).
  const pageCursorsRef = useRef<Map<number, QueryDocumentSnapshot<DocumentData> | null>>(
    new Map([[0, null]])
  );

  const fetchHistPage = useCallback(async (pageIdx: number) => {
    if (!firestore || !user) return;
    setClosedTradesLoading(true);
    try {
      const cursor = pageCursorsRef.current.get(pageIdx) ?? null;
      const baseConstraints = [
        where("status", "==", "CLOSED"),
        where("assetType", "==", "CRYPTO"),
        orderBy("openedAt", "desc"),
        limit(HIST_PAGE_SIZE + 1), // +1 to detect if a next page exists
      ] as const;
      const q = cursor
        ? query(collection(firestore, "simulator_trades"), ...baseConstraints, startAfter(cursor))
        : query(collection(firestore, "simulator_trades"), ...baseConstraints);
      const snap = await getDocs(q);
      const docs = snap.docs;
      const hasMore = docs.length > HIST_PAGE_SIZE;
      const pageDocs = hasMore ? docs.slice(0, HIST_PAGE_SIZE) : docs;

      // Store the last doc of this page as the cursor for the next page.
      if (hasMore) {
        pageCursorsRef.current.set(pageIdx + 1, pageDocs[pageDocs.length - 1]);
      }
      setHistTrades(pageDocs.map(d => ({ id: d.id, ...d.data() } as SimTrade)));
      setHistHasMore(hasMore);
      setHistPage(pageIdx);
    } finally {
      setClosedTradesLoading(false);
    }
  }, [firestore, user]);

  useEffect(() => {
    // Reset cursors and jump to first page on mount.
    pageCursorsRef.current = new Map([[0, null]]);
    fetchHistPage(0);
  }, [fetchHistPage]);

  // Logs — historical, fetched once on mount / manual refresh.
  const [rawLogs, setRawLogs] = useState<any[] | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const refetchLogs = useCallback(async () => {
    if (!firestore || !user) return;
    setLogsLoading(true);
    try {
      const snap = await getDocs(query(
        collection(firestore, "simulator_logs"),
        orderBy("timestamp", "desc"),
        limit(200),
      ));
      setRawLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } finally {
      setLogsLoading(false);
    }
  }, [firestore, user]);
  useEffect(() => {
    refetchLogs();
  }, [refetchLogs]);

  // Bottom panel is scoped to the heatmap card selected above.
  const botSourcePredicate = useMemo(
    () => matchesBotSource(selectedBot.botSource),
    [selectedBot.botSource],
  );

  const openTradesAll = useMemo(() => {
    return (rawOpenTrades ?? [])
      .map((d: any) => ({ id: d.id, ...d } as SimTrade))
      .filter((t) => (t.assetType || "CRYPTO") === "CRYPTO");
  }, [rawOpenTrades]);

  const openTrades = useMemo(
    () => openTradesAll.filter(botSourcePredicate),
    [openTradesAll, botSourcePredicate],
  );

  // closedTrades — current page of server-side history when filter is
  // ALL. For per-bot filters we render the full filtered list client-
  // side (zone-bot trade counts are small, and Firestore can't index
  // by botSource without composite indexes — keep the API surface
  // simple until volumes demand otherwise).
  const closedTrades = histTrades;

  // allClosedTrades — full history fetched from perf-data API (same source as
  // /performance page). Used exclusively for the equity curve and performance
  // metrics panel so both pages show identical charts and ratios.
  const [allClosedTrades, setAllClosedTrades] = useState<SimTrade[]>([]);
  const [allTradesLoading, setAllTradesLoading] = useState(true);
  useEffect(() => {
    setAllTradesLoading(true);
    setAllClosedTrades([]);
    fetch(`/api/freedombot/perf-data?assetType=CRYPTO`)
      .then((r) => r.json())
      .then((d) => {
        const trades: SimTrade[] = (d.trades ?? []).filter(
          (t: any) => t.status === "CLOSED"
        );
        setAllClosedTrades(trades);
      })
      .catch(() => {})
      .finally(() => setAllTradesLoading(false));
  }, []);

  // Bot-source-aware filtered closed trades — drives the equity curve,
  // metric panel, chart and history table so all four numbers reconcile
  // exactly for whatever bot the user has selected.
  const filteredClosedTrades = useMemo(
    () => allClosedTrades.filter(botSourcePredicate),
    [allClosedTrades, botSourcePredicate],
  );

  // All "fund value" math (chart, history balance, headline) derives from
  // the same shared helper so /simulation, /freedombot/performance and
  // anywhere else stay perfectly in sync. For per-bot filters this is
  // the counterfactual "starting capital → +Σ this bot's PnL" curve.
  const equityCurve = useMemo(
    () => buildEquityCurve(filteredClosedTrades, simState?.startingCapital ?? 0),
    [filteredClosedTrades, simState?.startingCapital],
  );
  const { tradeNumberMap, balanceAfterMap, finalCapital: closedEquity } = equityCurve;

  const logsAll = useMemo(() => {
    if (!rawLogs) return [];
    return rawLogs
      .map((d: any) => d as SimLog)
      .filter((l) => (l.assetType || "CRYPTO") === "CRYPTO");
  }, [rawLogs]);

  const logs = useMemo(
    () => logsAll.filter((l) => matchesLogForBotSource(l, selectedBot.botSource)),
    [logsAll, selectedBot.botSource],
  );

  // Headline stats / equity chart / risk ratios moved to /stats
  // (rendered by `<StatsDashboard />`). The trade-history tab on this
  // page still needs `filteredClosedTrades` + `tradeNumberMap` +
  // `balanceAfterMap` from above, so the perf-data fetch and
  // `equityCurve` helper stay — but everything that *only* fed the
  // headline cards or the chart has been removed.

  const isLoading = stateLoading || openTradesLoading || closedTradesLoading || logsLoading || allTradesLoading;

  const [forceClosing, setForceClosing] = useState<string | null>(null);
  const { toast } = useToast();

  // Single handler for BOTH paths:
  //   • Open Trades panel button → sim is OPEN → endpoint closes sim + cascades
  //   • History row button       → sim is CLOSED → endpoint runs live-only
  //                                cascade (admin gated by the route itself)
  // The endpoint switches behaviour from the sim doc's current state, so the
  // client doesn't need to pass a mode. `liveErrors` is the field we missed
  // before — when the inline cascade failed, the UI silently celebrated and
  // the orphaned live positions sat there until someone noticed. Now any
  // non-empty `liveErrors` raises a destructive toast that names the symbols
  // that didn't confirm.
  const handleForceClose = useCallback(async (trade: SimTrade) => {
    if (!user || !trade.id || forceClosing) return;
    setForceClosing(trade.id);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/sim/force-close", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ simTradeId: trade.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Force close failed",
          description: data.error || "Unknown error",
        });
        return;
      }
      const liveErrors: string[] = Array.isArray(data.liveErrors) ? data.liveErrors : [];
      const liveClosed = typeof data.liveClosed === "number" ? data.liveClosed : 0;
      const mode = data.mode === "live-only" ? "live-only" : "default";

      if (liveErrors.length > 0) {
        // Cron will retry within ~60s now that KILL_SWITCH is no longer in
        // the sync-live-trades blacklist, so this is a heads-up — not a
        // dead-end. Make it loud anyway so the operator can verify on the
        // users' panels.
        toast({
          variant: "destructive",
          title:
            mode === "live-only"
              ? `Live recovery: ${liveErrors.length} mirror${liveErrors.length === 1 ? "" : "s"} still open`
              : `Sim closed — ${liveErrors.length} live mirror${liveErrors.length === 1 ? "" : "s"} didn't confirm`,
          description:
            (liveClosed > 0 ? `${liveClosed} closed OK. ` : "") +
            `Failures: ${liveErrors.slice(0, 4).join("; ")}${liveErrors.length > 4 ? "; …" : ""}. sync-live-trades will retry on the next tick.`,
        });
      } else if (mode === "live-only") {
        toast({
          title: "Live mirrors closed",
          description: `Reconciled ${liveClosed} orphaned mirror${liveClosed === 1 ? "" : "s"} on the exchange.`,
        });
      } else if (liveClosed > 0) {
        toast({
          title: "Sim + live closed",
          description: `${liveClosed} live mirror${liveClosed === 1 ? "" : "s"} cascaded successfully.`,
        });
      }

      refresh();
      await Promise.all([fetchHistPage(0), refetchLogs()]);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Force close failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setForceClosing(null);
    }
  }, [user, forceClosing, refresh, fetchHistPage, refetchLogs, toast]);

  const openSimTradeIds = useMemo(
    () =>
      tab === "overview"
        ? openTrades
            .map((t) => t.id ?? (t.signalId ? `sim-${t.signalId}` : ""))
            .filter(Boolean)
        : [],
    [openTrades, tab],
  );
  const {
    isAdmin: mirrorAdmin,
    mirrorsBySimTradeId,
    exchangeSummary,
    loading: mirrorsLoading,
    error: mirrorsError,
  } = useOpenTradesMirrors(openSimTradeIds, tab === "overview");

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.replace("/");
    }
  }, [isUserLoading, user, router]);

  if (isUserLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <main className="flex-1 flex flex-col min-w-0">
        <TopBar />

        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-[#08080a]">
          <div className="max-w-[1280px] mx-auto space-y-3 sm:space-y-4">
            <CronHealthBanner variant="compact" />

            <SimulatorToolbar
              simState={simState}
              lastRefreshedLabel={lastRefreshedLabel}
              onRefresh={refresh}
              paramsControl={<SimulatorParamsDialog />}
            />

            <BotCockpit
              openTrades={openTradesAll}
              closedTrades={allClosedTrades}
              startingCapital={simState?.startingCapital ?? 1000}
              cs={cs}
              selectedBotId={selectedBotId}
              onSelectBot={setSelectedBotId}
            >
            {isLoading ? (
              <div className="flex items-center justify-center min-h-[200px] py-6">
                <Loader2 className="h-7 w-7 animate-spin text-accent/50" />
              </div>
            ) : !simState ? (
              <div className="px-3 sm:px-4 py-8 sm:py-10 text-center space-y-3">
                <div className="w-14 h-14 rounded-2xl border border-accent/25 bg-accent/[0.12] shadow-[0_4px_16px_rgba(0,212,170,0.15)] flex items-center justify-center mx-auto">
                  <Activity className="w-7 h-7 text-accent/50" />
                </div>
                <p className="text-sm font-black text-foreground/80">Simulator idle</p>
                <p className="text-[11px] text-muted-foreground/45 max-w-sm mx-auto leading-relaxed">
                  Waiting for the next AI-passed signal. Once a trade opens, it will appear in the open slots above.
                </p>
                {logs.length > 0 && (
                  <div className="pt-6 text-left max-w-lg mx-auto space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                      Recent logs ({logs.length})
                    </p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {logs.slice(0, 20).map((log, i) => (
                        <LogRow key={i} log={log} cs={cs} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <SimulatorMainPanel
                tab={tab}
                onTabChange={setTab}
                openCount={openTrades.length}
                closedCount={filteredClosedTrades.length}
                logsCount={logs.length}
              >
                {tab === "overview" && (
                  <OpenPositionsPanel
                    trades={openTrades}
                    maxSlots={
                      botMaxOpenTrades ??
                      simState.currentMaxTrades ??
                      5
                    }
                    cs={cs}
                    onSelectTrade={setSelectedTrade}
                    onForceClose={handleForceClose}
                    showMirrorUi={mirrorAdmin}
                    mirrorsBySimTradeId={mirrorsBySimTradeId}
                    exchangeSummary={exchangeSummary}
                    mirrorsLoading={mirrorsLoading}
                    mirrorsError={mirrorsError}
                    openSimTradeIds={openSimTradeIds}
                  />
                )}

                {tab === "trades" && (
                  <div className="space-y-4">
                    {/* Score-vs-Outcome analysis — runs over the full
                        bot-filtered closed-trade set (same source as the
                        equity chart) so the edge stat reflects the user's
                        active filter and not just the current page.
                        Wrapped in a TabErrorBoundary because partial
                        legacy trade docs occasionally crash a renderer
                        when a field is undefined — keep the rest of the
                        cockpit usable and surface the exact stack so we
                        can pinpoint the offending field. */}
                    <TabErrorBoundary label="Score vs Outcome">
                      <ScoreOutcomeAnalysis trades={filteredClosedTrades} cs={cs} />
                    </TabErrorBoundary>
                    {/* When a bot filter is active, render the full filtered
                        history client-side (zone-bot volumes are small and
                        the server pagination doesn't know about botSource).
                        For "All" keep the existing server-paginated path. */}
                    <TabErrorBoundary label="History">
                      <TradeList
                        trades={filteredClosedTrades}
                        emptyIcon={<BarChart3 className="w-6 h-6" />}
                        emptyLabel={`No closed trades for ${selectedBot.label} yet`}
                        onSelectTrade={setSelectedTrade}
                        onForceClose={handleForceClose}
                        cs={cs}
                        startingCapital={simState?.startingCapital}
                        tradeNumberMap={tradeNumberMap}
                        balanceAfterMap={balanceAfterMap}
                      />
                    </TabErrorBoundary>
                  </div>
                )}

                {tab === "logs" && (
                  <div className="space-y-1 max-h-[min(60vh,520px)] overflow-y-auto pr-1">
                    {logs.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground/30">
                        <Activity className="w-6 h-6 mx-auto mb-2 opacity-40" />
                        <p className="text-xs font-bold">No logs yet</p>
                        <p className="text-[10px] text-muted-foreground/25 mt-1">
                          Evaluations and trade events appear here
                        </p>
                      </div>
                    ) : (
                      logs.map((log, i) => (
                        <LogRow key={i} log={log} cs={cs} />
                      ))
                    )}
                  </div>
                )}
              </SimulatorMainPanel>
            )}
            </BotCockpit>
          </div>
        </div>
      </main>

      {/* Trade Narration Dialog */}
      <TradeNarrationDialog trade={selectedTrade} onClose={() => setSelectedTrade(null)} cs={cs} />
    </div>
  );
}

// ── (Stats cards / equity curve / risk-ratio panel moved to
//     `src/components/stats/StatsDashboard.tsx`, rendered on /stats.)

const CLOSE_REASON_MAP: Record<string, { label: string; color: string }> = {
  SL: { label: "SL", color: "bg-rose-500/15 text-rose-400" },
  TRAILING_SL: { label: "SL→BE", color: "bg-rose-500/15 text-rose-400" },
  MARKET_TURN: { label: "Mkt Turn", color: "bg-amber-500/15 text-amber-400" },
  SCORE_DEGRADED: { label: "Score↓", color: "bg-amber-500/15 text-amber-400" },
  SCORE_FLOOR_EXIT: { label: "Score Floor", color: "bg-amber-500/15 text-amber-400" },
  PATTERN_BREAK: { label: "Pattern↓", color: "bg-orange-500/15 text-orange-400" },
  TP1: { label: "TP1", color: "bg-emerald-500/15 text-emerald-400" },
  TP2: { label: "TP2", color: "bg-emerald-500/15 text-emerald-400" },
  TP3: { label: "TP3", color: "bg-emerald-500/15 text-emerald-400" },
  KILL_SWITCH: { label: "Closed", color: "bg-violet-500/15 text-violet-400" },
};

function getCloseDisplay(reason: string | null) {
  if (!reason) return { label: "Closed", color: "bg-white/5 text-muted-foreground" };
  return CLOSE_REASON_MAP[reason] ?? { label: reason, color: "bg-white/5 text-muted-foreground" };
}

function getSlDisplay(trade: SimTrade) {
  if (trade.trailingSl != null) {
    const isBuy = trade.side === "BUY";
    const pastTp3 = trade.tp3 != null && (isBuy ? trade.trailingSl > trade.tp3 : trade.trailingSl < trade.tp3);
    if (pastTp3) return { price: trade.trailingSl, label: "Trailing" };
    if (trade.tp3Hit) return { price: trade.trailingSl, label: "Moved to TP2" };
    if (trade.tp2Hit) return { price: trade.trailingSl, label: "Moved to TP1" };
    if (trade.tp1Hit) return { price: trade.trailingSl, label: "Moved to Entry" };
    return { price: trade.trailingSl, label: "Trailing" };
  }
  if (trade.tp3Hit) return { price: trade.stopLoss, label: "Moved to TP2" };
  if (trade.tp2Hit) return { price: trade.stopLoss, label: "Moved to TP1" };
  if (trade.tp1Hit) return { price: trade.stopLoss, label: "Moved to Entry" };
  return { price: trade.stopLoss, label: "Original" };
}

// ── Column filter types & helpers ──────────────────────────────

type SimFilters = {
  symbol: string;
  sides: string[];
  timeframes: string[];
  algos: string[];
  leverages: string[];
  tpLevel: "any" | "none" | "tp1" | "tp2" | "tp3";
  pnl: "all" | "win" | "loss";
  scoreMin: string;
  scoreMax: string;
  statuses: string[];
};
const DEFAULT_SIM_FILTERS: SimFilters = {
  symbol: "", sides: [], timeframes: [], algos: [], leverages: [],
  tpLevel: "any", pnl: "all", scoreMin: "", scoreMax: "", statuses: [],
};
function simActiveCount(f: SimFilters): number {
  return (f.symbol ? 1 : 0) + f.sides.length + f.timeframes.length +
    f.algos.length + f.leverages.length + (f.tpLevel !== "any" ? 1 : 0) +
    (f.pnl !== "all" ? 1 : 0) + ((f.scoreMin || f.scoreMax) ? 1 : 0) + f.statuses.length;
}
function applySimFilters(trades: SimTrade[], f: SimFilters): SimTrade[] {
  return trades.filter((t) => {
    if (f.symbol && !t.symbol.toLowerCase().includes(f.symbol.toLowerCase())) return false;
    if (f.sides.length && !f.sides.includes(t.side)) return false;
    if (f.timeframes.length && !f.timeframes.includes(String(t.timeframe))) return false;
    if (f.algos.length && !f.algos.includes(t.algo || "—")) return false;
    if (f.leverages.length && !f.leverages.includes(String(t.leverage))) return false;
    if (f.tpLevel === "none" && (t.tp1Hit || t.tp2Hit || t.tp3Hit)) return false;
    if (f.tpLevel === "tp1" && !t.tp1Hit) return false;
    if (f.tpLevel === "tp2" && !t.tp2Hit) return false;
    if (f.tpLevel === "tp3" && !t.tp3Hit) return false;
    if (f.pnl === "win" && t.realizedPnl <= 0) return false;
    if (f.pnl === "loss" && t.realizedPnl > 0) return false;
    if (f.scoreMin && t.confidenceScore < Number(f.scoreMin)) return false;
    if (f.scoreMax && t.confidenceScore > Number(f.scoreMax)) return false;
    if (f.statuses.length && !f.statuses.includes(t.closeReason ?? "")) return false;
    return true;
  });
}

// ── Filter UI primitives ──────────────────────────────────────

function ColFilter({ label, isActive, children, width = "w-52" }: {
  label: string; isActive: boolean; children: React.ReactNode; width?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={cn(
          "flex items-center gap-1.5 cursor-pointer group font-black uppercase tracking-wider rounded px-1 -ml-1 py-0.5 transition-colors",
          isActive
            ? "text-accent bg-accent/10"
            : "text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.05]"
        )}>
          <span className="text-[10px]">{label}</span>
          <Filter className={cn("h-3 w-3 shrink-0", isActive ? "fill-accent/40" : "opacity-50 group-hover:opacity-100")} />
        </button>
      </PopoverTrigger>
      <PopoverContent className={cn(width, "p-0 bg-[#18181b] border-white/[0.08] shadow-2xl")} align="start">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function CheckFilter({ values, selected, onChange, labelMap }: {
  values: string[]; selected: string[];
  onChange: (v: string[]) => void; labelMap?: Record<string, string>;
}) {
  if (!values.length) return <p className="p-3 text-[10px] text-muted-foreground/40 italic">No values</p>;
  return (
    <div className="py-1">
      <div className="max-h-52 overflow-y-auto">
        {values.map((v) => (
          <label key={v} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-white/[0.04] cursor-pointer">
            <Checkbox checked={selected.includes(v)}
              onCheckedChange={(chk) => onChange(chk ? [...selected, v] : selected.filter((s) => s !== v))}
              className="h-3.5 w-3.5 border-white/20" />
            <span className="text-[11px] font-medium text-foreground/80">{labelMap?.[v] ?? v}</span>
          </label>
        ))}
      </div>
      {selected.length > 0 && (
        <div className="border-t border-white/[0.06] px-3 pt-1.5 pb-1.5">
          <button onClick={() => onChange([])} className="text-[10px] text-muted-foreground/50 hover:text-accent">Clear</button>
        </div>
      )}
    </div>
  );
}

function TextSearchFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="p-2.5">
      <Input placeholder="Search…" value={value} onChange={(e) => onChange(e.target.value)}
        className="h-7 text-xs bg-white/[0.04] border-white/[0.08] placeholder:text-muted-foreground/30" />
      {value && (
        <button onClick={() => onChange("")} className="mt-1.5 w-full text-[10px] text-muted-foreground/50 hover:text-accent">Clear</button>
      )}
    </div>
  );
}

function PnlFilterUI({ value, onChange }: { value: "all" | "win" | "loss"; onChange: (v: "all" | "win" | "loss") => void }) {
  return (
    <div className="py-1">
      {([["all", "All trades"], ["win", "Profitable"], ["loss", "Loss"]] as const).map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)}
          className={cn("w-full text-left px-3 py-1.5 text-[11px] font-medium",
            value === v ? "text-accent bg-accent/10" : "text-foreground/60 hover:bg-white/[0.04]")}>
          {label}
        </button>
      ))}
    </div>
  );
}

function TpFilterUI({ value, onChange }: { value: SimFilters["tpLevel"]; onChange: (v: SimFilters["tpLevel"]) => void }) {
  return (
    <div className="py-1">
      {([["any", "Any"], ["none", "No TP hit"], ["tp1", "TP1+"], ["tp2", "TP2+"], ["tp3", "TP3"]] as const).map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)}
          className={cn("w-full text-left px-3 py-1.5 text-[11px] font-medium",
            value === v ? "text-accent bg-accent/10" : "text-foreground/60 hover:bg-white/[0.04]")}>
          {label}
        </button>
      ))}
    </div>
  );
}

function ScoreRangeFilter({ min, max, onMin, onMax }: { min: string; max: string; onMin: (v: string) => void; onMax: (v: string) => void }) {
  return (
    <div className="p-2.5 space-y-2">
      <div>
        <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider mb-1">Min</p>
        <Input value={min} onChange={(e) => onMin(e.target.value)} placeholder="0" type="number"
          className="h-7 text-xs bg-white/[0.04] border-white/[0.08]" />
      </div>
      <div>
        <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider mb-1">Max</p>
        <Input value={max} onChange={(e) => onMax(e.target.value)} placeholder="80" type="number"
          className="h-7 text-xs bg-white/[0.04] border-white/[0.08]" />
      </div>
      {(min || max) && (
        <button onClick={() => { onMin(""); onMax(""); }}
          className="w-full text-[10px] text-muted-foreground/50 hover:text-accent border-t border-white/[0.06] pt-1.5">Clear</button>
      )}
    </div>
  );
}

const PAGE_SIZE = 50;

function Paginator({ page, total, pageSize, onChange, activeClass = "bg-accent/20 text-accent" }: {
  page: number; total: number; pageSize: number; onChange: (p: number) => void; activeClass?: string;
}) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <span className="text-[10px] text-muted-foreground/40">{from}–{to} of {total}</span>
      <div className="flex items-center gap-0.5">
        <button disabled={page === 1} onClick={() => onChange(page - 1)}
          className="h-7 w-7 flex items-center justify-center rounded text-sm font-bold text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.05] disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
          ‹
        </button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`e${i}`} className="h-7 w-6 flex items-center justify-center text-[10px] text-muted-foreground/30">…</span>
          ) : (
            <button key={p} onClick={() => onChange(p as number)}
              className={cn("h-7 min-w-[28px] px-1.5 flex items-center justify-center rounded text-[11px] font-bold transition-colors",
                page === p ? activeClass : "text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.05]")}>
              {p}
            </button>
          )
        )}
        <button disabled={page === totalPages} onClick={() => onChange(page + 1)}
          className="h-7 w-7 flex items-center justify-center rounded text-sm font-bold text-muted-foreground/50 hover:text-foreground hover:bg-white/[0.05] disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
          ›
        </button>
      </div>
    </div>
  );
}

// ── Score-vs-Outcome analysis ─────────────────────────────────
//
// Buckets closed trades by how the confidence score behaved between entry
// and exit, then reports win rate + average PnL per bucket. Lets you see at
// a glance whether trades whose score collapsed actually performed worse
// than trades whose score still endorsed the position at exit.
//
// Trade is counted toward a bucket only if a closing score is available
// (either `confidenceScoreAtClose` or legacy `currentScore`). Zone-bot
// trades have no score → counted under "No data".

// Six buckets keyed by drop quartile so users can see whether win rate
// declines smoothly with score deterioration or falls off a cliff somewhere
// in the middle. "drop100" includes the score-zero case (hard gates failed)
// since 100% drop = score went to 0 — keeping it as its own bucket would
// fragment small samples.
type ScoreBucket = "held" | "drop25" | "drop50" | "drop75" | "drop100" | "unknown";

function classifyTrade(t: SimTrade): { bucket: ScoreBucket; closeScore: number | null } {
  const close = getCloseScore(t);
  if (close.value == null) return { bucket: "unknown", closeScore: null };
  // Dropped from what to 0 can't be expressed as a ratio of zero entry —
  // treat any close < entry as full drop in that edge case.
  if (t.confidenceScore <= 0) {
    return { bucket: close.value > 0 ? "held" : "drop100", closeScore: close.value };
  }
  const ratio = close.value / t.confidenceScore;
  if (ratio >= 1)    return { bucket: "held",    closeScore: close.value };
  if (ratio >= 0.75) return { bucket: "drop25",  closeScore: close.value }; // 0–25% drop
  if (ratio >= 0.50) return { bucket: "drop50",  closeScore: close.value }; // 25–50% drop
  if (ratio >= 0.25) return { bucket: "drop75",  closeScore: close.value }; // 50–75% drop
  return                    { bucket: "drop100", closeScore: close.value }; // 75–100% drop
}

// Close-reason classification used to validate whether the chart's edge
// is real. Splits exits into FIVE groups so user-initiated closes don't
// contaminate the strategy-level read of system-driven exits:
//   - tp     : `TP1` / `TP2` / `TP3` → price hit a take-profit (winning exit)
//   - sl     : `SL` → price hit the hard stop, locked-in loss. THIS is the
//              bucket score-floor exit could have prevented.
//   - early  : `TRAILING_SL`, `MARKET_TURN`, `SCORE_DEGRADED`, `PATTERN_BREAK`,
//              `ZONE_FLIP`, `MAX_PAIN_EXIT`, `EOD_SQUARE_OFF` → sim/bot
//              decided to close before SL fired. System already caught these.
//   - manual : `KILL_SWITCH` (force-close from UI/API), `SYNCED_FROM_EXCHANGE`
//              (admin synced an off-platform fill). NOT a strategy decision;
//              should not skew EV math.
//   - other  : null, free-text (e.g. zone-bot's English `next.reason` written
//              directly), and anything unmapped. Tracks classifier blind spots.
type CloseReasonGroup = "tp" | "sl" | "early" | "manual" | "other";

function classifyCloseReason(reason: string | null): CloseReasonGroup {
  if (!reason) return "other";
  switch (reason) {
    case "TP1":
    case "TP2":
    case "TP3":
      return "tp";
    case "SL":
      return "sl";
    case "TRAILING_SL":
    case "MARKET_TURN":
    case "SCORE_DEGRADED":
    case "SCORE_FLOOR_EXIT":
    case "PATTERN_BREAK":
    case "ZONE_FLIP":
    case "ZONE_BOT_FLIP":
    case "MAX_PAIN_EXIT":
    case "ZONE_BOT_MAX_PAIN_EXIT":
    case "EOD_SQUARE_OFF":
      return "early";
    case "KILL_SWITCH":
    case "SYNCED_FROM_EXCHANGE":
      return "manual";
    default:
      return "other";
  }
}

interface BucketStats {
  count: number;
  wins: number;
  losses: number;
  totalPnl: number;
  // Close-reason split — surfaces what actually took each trade out so we
  // can tell whether a low-score bucket is dominated by SL fills (which
  // score-floor exit could have prevented), system-driven early closes
  // (already caught upstream), or user-initiated closes (not a strategy
  // signal, must not skew EV math).
  tpCount: number;
  slCount: number;
  earlyCount: number;
  manualCount: number;
  otherCount: number;
  // Realized PnL contributed by SL fills in this bucket. Used to size the
  // "avoidable losses" headline so we can quantify the upper bound of EV
  // recoverable by a stricter score-floor exit.
  slPnl: number;
}

function emptyStats(): BucketStats {
  return {
    count: 0,
    wins: 0,
    losses: 0,
    totalPnl: 0,
    tpCount: 0,
    slCount: 0,
    earlyCount: 0,
    manualCount: 0,
    otherCount: 0,
    slPnl: 0,
  };
}

interface ScoreOutcomeBuckets {
  held:    BucketStats;
  drop25:  BucketStats;
  drop50:  BucketStats;
  drop75:  BucketStats;
  drop100: BucketStats;
  unknown: BucketStats;
  total: number;
  scoredTotal: number;
}

function computeScoreOutcomeBuckets(trades: SimTrade[]): ScoreOutcomeBuckets {
  const buckets: ScoreOutcomeBuckets = {
    held:    emptyStats(),
    drop25:  emptyStats(),
    drop50:  emptyStats(),
    drop75:  emptyStats(),
    drop100: emptyStats(),
    unknown: emptyStats(),
    total: 0,
    scoredTotal: 0,
  };
  for (const t of trades) {
    const { bucket } = classifyTrade(t);
    const b = buckets[bucket];
    b.count++;
    b.totalPnl += t.realizedPnl ?? 0;
    if ((t.realizedPnl ?? 0) > 0) b.wins++;
    else if ((t.realizedPnl ?? 0) < 0) b.losses++;
    const group = classifyCloseReason(t.closeReason ?? null);
    if (group === "tp") b.tpCount++;
    else if (group === "sl") {
      b.slCount++;
      b.slPnl += t.realizedPnl ?? 0;
    }
    else if (group === "early") b.earlyCount++;
    else if (group === "manual") b.manualCount++;
    else b.otherCount++;
    buckets.total++;
    if (bucket !== "unknown") buckets.scoredTotal++;
  }
  return buckets;
}

const BUCKET_DEFS: { key: ScoreBucket; label: string; sub: string; color: string; bg: string }[] = [
  { key: "held",    label: "Score Held",    sub: "Close ≥ Entry",         color: "text-positive",            bg: "bg-positive/10"          },
  { key: "drop25",  label: "0-25% Drop",    sub: "Close 75-100% of Entry", color: "text-yellow-300",          bg: "bg-yellow-500/10"        },
  { key: "drop50",  label: "25-50% Drop",   sub: "Close 50-75% of Entry",  color: "text-amber-400",           bg: "bg-amber-500/10"         },
  { key: "drop75",  label: "50-75% Drop",   sub: "Close 25-50% of Entry",  color: "text-orange-400",          bg: "bg-orange-500/10"        },
  { key: "drop100", label: "75-100% Drop",  sub: "Close 0-25% of Entry",   color: "text-rose-400",            bg: "bg-rose-500/10"          },
  { key: "unknown", label: "No Score",      sub: "Zone-bot / legacy",      color: "text-muted-foreground/60", bg: "bg-white/[0.03]"         },
];

function ScoreOutcomeAnalysis({ trades, cs }: { trades: SimTrade[]; cs: string }) {
  const buckets = useMemo(() => computeScoreOutcomeBuckets(trades), [trades]);

  if (buckets.total === 0) return null;

  // Headline insight: how does win rate when score holds compare to when it
  // collapses? Only meaningful with a few trades on either side.
  const heldWinRate = buckets.held.count > 0 ? (buckets.held.wins / buckets.held.count) * 100 : null;
  const droppedCount = buckets.drop25.count + buckets.drop50.count + buckets.drop75.count + buckets.drop100.count;
  const droppedWins  = buckets.drop25.wins  + buckets.drop50.wins  + buckets.drop75.wins  + buckets.drop100.wins;
  const droppedWinRate = droppedCount > 0 ? (droppedWins / droppedCount) * 100 : null;
  const edge =
    heldWinRate != null && droppedWinRate != null && buckets.held.count >= 3 && droppedCount >= 3
      ? heldWinRate - droppedWinRate
      : null;

  // "Avoidable losses" = trades that took an SL hit AFTER score had already
  // dropped >25% from entry. Upper bound on what a stricter score-floor
  // exit could have saved — those positions were held through a clearly
  // dying signal until the hard stop fired.
  // We deliberately exclude `drop25` (≤25% drop) because that band still
  // shows healthy win rate / positive PnL in the panel below; only widening
  // the SL→avoidable framing once the score has materially collapsed.
  const avoidable = {
    slCount: buckets.drop50.slCount + buckets.drop75.slCount + buckets.drop100.slCount,
    slPnl:   buckets.drop50.slPnl   + buckets.drop75.slPnl   + buckets.drop100.slPnl,
  };

  return (
    <div className={cn(SIM_CARD, "p-3 space-y-2.5")}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-3.5 h-3.5 text-accent/70" />
          <span className="text-[11px] font-black uppercase tracking-widest text-foreground/80">Score vs Outcome</span>
          <span className="text-[10px] text-muted-foreground/40">
            {buckets.scoredTotal}/{buckets.total} trades scored
          </span>
        </div>
        {edge != null && (
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-muted-foreground/50">Edge when score holds:</span>
            <span className={cn("font-mono font-black", edge >= 0 ? "text-positive" : "text-rose-400")}>
              {edge >= 0 ? "+" : ""}{edge.toFixed(0)}pp
            </span>
            <span className="text-muted-foreground/30">
              ({heldWinRate?.toFixed(0)}% vs {droppedWinRate?.toFixed(0)}% dropped)
            </span>
          </div>
        )}
      </div>
      {avoidable.slCount > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2 rounded-lg border border-rose-500/15 bg-rose-500/[0.04] px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="text-rose-400/80 font-bold uppercase tracking-wider">Avoidable</span>
            <span className="text-muted-foreground/60">
              SL hits after score dropped &gt;25%
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="text-foreground/80 font-bold">{avoidable.slCount} trades</span>
            <span className="text-muted-foreground/30">·</span>
            <span className={cn("font-black", avoidable.slPnl >= 0 ? "text-positive" : "text-rose-400")}>
              {avoidable.slPnl >= 0 ? "+" : ""}{formatMoney(avoidable.slPnl, cs)}
            </span>
            <span className="text-muted-foreground/40">locked in</span>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {BUCKET_DEFS.map((def) => {
          const b = buckets[def.key];
          const winRate = b.count > 0 ? (b.wins / b.count) * 100 : 0;
          const avgPnl = b.count > 0 ? b.totalPnl / b.count : 0;
          const pct = buckets.total > 0 ? (b.count / buckets.total) * 100 : 0;
          return (
            <div key={def.key} className={cn("rounded-lg border border-white/[0.05] p-2.5 space-y-1", def.bg)}>
              <div className="flex items-baseline justify-between gap-1">
                <span className={cn("text-[10px] font-black uppercase tracking-wider", def.color)}>{def.label}</span>
                <span className="text-[9px] font-mono text-muted-foreground/40">{pct.toFixed(0)}%</span>
              </div>
              <p className="text-[9px] text-muted-foreground/40 -mt-0.5">{def.sub}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg font-mono font-black text-foreground/90">{b.count}</span>
                <span className="text-[9px] text-muted-foreground/40">trades</span>
              </div>
              {b.count > 0 && (
                <div className="space-y-0.5 pt-0.5 border-t border-white/[0.04]">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground/50">Win rate</span>
                    <span className={cn("font-mono font-bold", winRate >= 50 ? "text-positive" : "text-rose-400")}>
                      {winRate.toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground/50">Avg PnL</span>
                    <span className={cn("font-mono font-bold", avgPnl >= 0 ? "text-positive" : "text-rose-400")}>
                      {avgPnl >= 0 ? "+" : ""}{formatMoney(avgPnl, cs)}
                    </span>
                  </div>
                  {/* Close-reason breakdown: validates the bucket's PnL signal
                      by showing what actually took the position out.
                        SL  → hard stop fired (score-floor exit could prevent).
                        Ear → system-driven early close (already caught
                              upstream — trailing SL, market turn, score
                              degraded, pattern break, zone flip, max-pain).
                        Man → user/admin force-close (KILL_SWITCH /
                              SYNCED_FROM_EXCHANGE) — NOT a strategy signal.
                        Oth → unmapped / free-text (e.g. zone-bot's English
                              reason). Acts as a classifier-blind-spot meter. */}
                  <div className="flex items-center justify-between gap-1 pt-0.5 text-[9px] font-mono">
                    <span className="text-muted-foreground/40">Exit</span>
                    <div className="flex items-center gap-1.5 tabular-nums">
                      {b.tpCount > 0 && (
                        <span className="text-emerald-400/80" title="Take-profit hit (TP1/TP2/TP3)">TP {b.tpCount}</span>
                      )}
                      {b.slCount > 0 && (
                        <span className="text-rose-400/90 font-bold" title="Stop-loss hit (SL)">SL {b.slCount}</span>
                      )}
                      {b.earlyCount > 0 && (
                        <span className="text-amber-400/80" title="System early close (trailing SL, market turn, score degraded, pattern break, zone flip, max-pain exit, EOD square-off)">Ear {b.earlyCount}</span>
                      )}
                      {b.manualCount > 0 && (
                        <span className="text-violet-400/80" title="User or admin force-close (KILL_SWITCH or SYNCED_FROM_EXCHANGE)">Man {b.manualCount}</span>
                      )}
                      {b.otherCount > 0 && (
                        <span className="text-muted-foreground/50" title="Unmapped close reason — likely zone-bot free-text or legacy. See Fix A in the cron split.">Oth {b.otherCount}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── History score cell: Entry vs Close ────────────────────────
//
// Closed trades stamp `confidenceScoreAtClose` when the cron runs the exit
// (PR: closing-score). For older trades that pre-date the field, fall back
// to the last stamped `currentScore` so we don't lose data on the chart.
// Zone-bot trades have neither (synthetic signal) and render as "—".

function getCloseScore(trade: SimTrade): { value: number | null; pattern?: "A" | "B" | "none" | "early"; isLegacy: boolean } {
  if (trade.confidenceScoreAtClose != null) {
    return { value: trade.confidenceScoreAtClose, pattern: trade.scorePatternAtClose, isLegacy: false };
  }
  if (trade.currentScore != null) {
    return { value: trade.currentScore, pattern: trade.currentScorePattern, isLegacy: true };
  }
  return { value: null, isLegacy: false };
}

function scoreDeltaColor(entry: number, close: number | null): string {
  if (close == null) return "text-muted-foreground/40";
  if (close === 0) return "text-rose-400";
  if (close < entry * 0.7) return "text-rose-400";
  if (close < entry) return "text-amber-400";
  return "text-positive";
}

function HistoryScoreCell({ trade }: { trade: SimTrade }) {
  const close = getCloseScore(trade);
  const closeColor = scoreDeltaColor(trade.confidenceScore, close.value);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/40">In</span>
        <span className="font-mono text-xs font-bold text-accent">{trade.confidenceScore}</span>
        {trade.scorePattern && (
          <PatternBadge pattern={trade.scorePattern as PatternType} score={null} />
        )}
      </div>
      <span className="text-white/15 text-[10px]">→</span>
      <div className="flex flex-col gap-0.5">
        <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/40" title={close.isLegacy ? "Last live score before close (legacy trade)" : "Score at close"}>
          {close.isLegacy ? "Last" : "Out"}
        </span>
        <span className={cn("font-mono text-xs font-bold", closeColor)}>
          {close.value ?? "—"}
        </span>
        {close.pattern && (
          <PatternBadge pattern={close.pattern as PatternType} score={null} />
        )}
      </div>
    </div>
  );
}

// ── TradeList with column filters + pagination ────────────────

function TradeList({ trades, emptyIcon, emptyLabel, onSelectTrade, onForceClose, cs, startingCapital, tradeNumberMap, balanceAfterMap: balanceAfterMapProp }: { trades: SimTrade[]; emptyIcon: React.ReactNode; emptyLabel: string; onSelectTrade: (t: SimTrade) => void; onForceClose?: (t: SimTrade) => void; cs: string; startingCapital?: number; tradeNumberMap?: Map<string, number>; balanceAfterMap?: Map<string, number> }) {
  const isHistory = startingCapital != null;
  // `isOpenTab` historically meant "user can force-close from this list",
  // which used to align with the Open Trades panel only. Now History also
  // gets `onForceClose` (for the live-mirror recovery flow), so the open-tab
  // flag is derived from the absence of history, not the presence of the
  // callback.
  const isOpenTab = !isHistory;
  const canForceClose = onForceClose != null;
  const [filters, setFilters] = useState<SimFilters>(DEFAULT_SIM_FILTERS);
  const [page, setPage] = useState(1);
  // For Open Trades we fetch mirrors for every visible row to power the
  // exchange pills + per-row live-user count. For History we ALSO fetch
  // them so we can surface a "Force close live mirror" button on any
  // already-closed sim that still has an open live row hanging around
  // (the orphan that started this whole RCA). The mirror endpoint already
  // filters server-side to `status == OPEN`, so the History call only
  // returns rows that actually need attention.
  const simTradeIds = useMemo(
    () =>
      trades
        .map((t) => t.id ?? (t.signalId ? `sim-${t.signalId}` : ""))
        .filter(Boolean),
    [trades],
  );
  const {
    isAdmin: mirrorAdmin,
    mirrorsBySimTradeId,
    exchangeSummary,
    loading: mirrorsLoading,
    error: mirrorsError,
  } = useOpenTradesMirrors(simTradeIds, true);
  const setF = <K extends keyof SimFilters>(k: K, v: SimFilters[K]) => {
    setFilters((prev) => ({ ...prev, [k]: v }));
    setPage(1);
  };

  const uSides  = useMemo(() => [...new Set(trades.map((t) => t.side))].sort(), [trades]);
  const uTfs    = useMemo(() => [...new Set(trades.map((t) => String(t.timeframe)))].sort(), [trades]);
  const uAlgos  = useMemo(() => [...new Set(trades.map((t) => t.algo || "—"))].sort(), [trades]);
  const uLevs   = useMemo(() => [...new Set(trades.map((t) => String(t.leverage)))].sort((a, b) => Number(a) - Number(b)), [trades]);
  const uStats  = useMemo(() => [...new Set(trades.map((t) => t.closeReason).filter(Boolean))].sort() as string[], [trades]);

  // History: sort by closedAt desc (latest close first). Open trades keep original order.
  const filtered = useMemo(() => {
    const f = applySimFilters(trades, filters);
    if (isHistory) {
      return [...f].sort((a, b) => {
        const ta = a.closedAt ? new Date(a.closedAt).getTime() : 0;
        const tb = b.closedAt ? new Date(b.closedAt).getTime() : 0;
        return tb - ta;
      });
    }
    return f;
  }, [trades, filters, isHistory]);

  const paginated = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  const active    = simActiveCount(filters);

  // Running fund balance after each closed trade — supplied by the page
  // and computed from the FULL history (allClosedTrades), so balances stay
  // consistent with the equity-curve chart even on later pages.
  const balanceAfterMap = isHistory ? (balanceAfterMapProp ?? null) : null;

  const statusLabelMap = useMemo(() =>
    Object.fromEntries(Object.entries(CLOSE_REASON_MAP).map(([k, v]) => [k, v.label])), []);
  const levLabelMap = useMemo(() =>
    Object.fromEntries(uLevs.map((l) => [l, `${l}×`])), [uLevs]);
  const tfLabelMapFiltered = useMemo(() =>
    Object.fromEntries(uTfs.map((tf) => [tf, tfLabelMap[tf.toUpperCase()] ?? `${tf}m`])), [uTfs]);

  if (trades.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground/30">
        {emptyIcon}
        <p className="text-xs font-bold mt-2">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {isOpenTab && mirrorAdmin && (
        <LiveMirrorExchangeBar
          exchangeSummary={exchangeSummary}
          loading={mirrorsLoading}
          error={mirrorsError}
          simTradeIds={simTradeIds}
        />
      )}

      {/* Active filter bar */}
      {active > 0 && (
        <div className="flex items-center gap-3 px-1">
          <span className="text-[10px] text-muted-foreground/50">{filtered.length} of {trades.length} shown</span>
          <button onClick={() => { setFilters(DEFAULT_SIM_FILTERS); setPage(1); }}
            className="flex items-center gap-1 text-[10px] text-accent/80 hover:text-accent border border-accent/20 rounded px-2 py-0.5">
            <X className="h-2.5 w-2.5" /> Clear {active} filter{active > 1 ? "s" : ""}
          </button>
        </div>
      )}

      {/* Mobile */}
      <div className="lg:hidden space-y-3">
        {paginated.map((trade) => {
          const key = trade.id ?? trade.signalId;
          const balance = balanceAfterMap && key ? balanceAfterMap.get(key) : undefined;
          const tradeNumber = tradeNumberMap && key ? tradeNumberMap.get(key) : undefined;
          return (
            <MobileTradeCard key={key} trade={trade} onSelect={onSelectTrade} onForceClose={onForceClose} cs={cs} balance={balance} startingCapital={startingCapital} tradeNumber={tradeNumber} />
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-muted-foreground/30">
            <p className="text-xs font-bold">No trades match filters</p>
          </div>
        )}
        {filtered.length > PAGE_SIZE && (
          <div className="bg-card border border-white/5 rounded-lg">
            <Paginator page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
          </div>
        )}
      </div>

      {/* Desktop */}
      <div className="hidden lg:block">
        <div className="bg-card border border-white/5 rounded-t-lg overflow-x-auto">
          <div className="min-w-[1200px]">
            <Table>
              <TableHeader className="bg-card sticky top-0 z-10 shadow-[0_1px_0_rgba(255,255,255,0.05)]">
                <TableRow className="hover:bg-transparent border-white/5">
                  <TableHead className="h-12 w-[130px]">
                    <ColFilter label="Symbol" isActive={!!filters.symbol}>
                      <TextSearchFilter value={filters.symbol} onChange={(v) => setF("symbol", v)} />
                    </ColFilter>
                  </TableHead>
                  <TableHead className="h-12 w-[56px]">
                    <ColFilter label="Side" isActive={filters.sides.length > 0}>
                      <CheckFilter values={uSides} selected={filters.sides} onChange={(v) => setF("sides", v)} />
                    </ColFilter>
                  </TableHead>
                  <TableHead className="h-12 w-[48px]">
                    <ColFilter label="TF" isActive={filters.timeframes.length > 0}>
                      <CheckFilter values={uTfs} selected={filters.timeframes} onChange={(v) => setF("timeframes", v)} labelMap={tfLabelMapFiltered} />
                    </ColFilter>
                  </TableHead>
                  <TableHead className="h-12 w-[80px]">
                    <ColFilter label="Algo" isActive={filters.algos.length > 0}>
                      <CheckFilter values={uAlgos} selected={filters.algos} onChange={(v) => setF("algos", v)} />
                    </ColFilter>
                  </TableHead>
                  <TableHead className="h-12 w-[44px]">
                    <ColFilter label="Lev." isActive={filters.leverages.length > 0}>
                      <CheckFilter values={uLevs} selected={filters.leverages} onChange={(v) => setF("leverages", v)} labelMap={levLabelMap} />
                    </ColFilter>
                  </TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/50 h-12">Entry</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/50 h-12">{isHistory ? "Exit" : "Current"}</TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/50 h-12">SL</TableHead>
                  <TableHead className="h-12 w-[80px]">
                    <ColFilter label="Targets" isActive={filters.tpLevel !== "any"} width="w-40">
                      <TpFilterUI value={filters.tpLevel} onChange={(v) => setF("tpLevel", v)} />
                    </ColFilter>
                  </TableHead>
                  <TableHead className="h-12">
                    <ColFilter label="Net PNL" isActive={filters.pnl !== "all"} width="w-44">
                      <PnlFilterUI value={filters.pnl} onChange={(v) => setF("pnl", v)} />
                    </ColFilter>
                  </TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/50 h-12 min-w-[120px]">Notional</TableHead>
                  <TableHead className="h-12 w-[130px]">
                    <ColFilter label="Score" isActive={!!(filters.scoreMin || filters.scoreMax)} width="w-44">
                      <ScoreRangeFilter min={filters.scoreMin} max={filters.scoreMax} onMin={(v) => setF("scoreMin", v)} onMax={(v) => setF("scoreMax", v)} />
                    </ColFilter>
                  </TableHead>
                  <TableHead className="h-12 w-[80px]">
                    <ColFilter label="Status" isActive={filters.statuses.length > 0}>
                      <CheckFilter values={uStats} selected={filters.statuses} onChange={(v) => setF("statuses", v)} labelMap={statusLabelMap} />
                    </ColFilter>
                  </TableHead>
                  <TableHead className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/50 h-12 w-[90px] text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.length > 0 ? (
                  paginated.map((trade) => {
                    const key = trade.id ?? trade.signalId;
                    const balance = balanceAfterMap && key ? balanceAfterMap.get(key) : undefined;
                    const tradeNumber = tradeNumberMap && key ? tradeNumberMap.get(key) : undefined;
                    const simId = trade.id ?? (trade.signalId ? `sim-${trade.signalId}` : "");
                    const mirrors = simId ? (mirrorsBySimTradeId[simId] ?? []) : [];
                    return (
                      <DesktopTradeRow
                        key={key}
                        trade={trade}
                        onSelect={onSelectTrade}
                        onForceClose={onForceClose}
                        cs={cs}
                        isHistory={isHistory}
                        balance={balance}
                        startingCapital={startingCapital}
                        tradeNumber={tradeNumber}
                        simTradeId={simId}
                        mirrorCount={mirrors.length}
                        showMirrorUi={mirrorAdmin && isOpenTab}
                        staleMirrorAdmin={mirrorAdmin && isHistory && canForceClose}
                      />
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center py-10 text-muted-foreground/30">
                      <p className="text-xs font-bold">No trades match the current filters</p>
                      <button onClick={() => { setFilters(DEFAULT_SIM_FILTERS); setPage(1); }} className="mt-2 text-[11px] text-accent/70 hover:text-accent">
                        Clear all filters
                      </button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
        <div className="bg-card border-x border-b border-white/5 rounded-b-lg">
          <Paginator page={page} total={filtered.length} pageSize={PAGE_SIZE} onChange={setPage} />
        </div>
      </div>
    </div>
  );
}

function DesktopTradeRow({
  trade,
  onSelect,
  onForceClose,
  cs,
  isHistory,
  balance,
  startingCapital,
  tradeNumber,
  simTradeId = "",
  mirrorCount = 0,
  showMirrorUi = false,
  staleMirrorAdmin = false,
}: {
  trade: SimTrade;
  onSelect: (t: SimTrade) => void;
  onForceClose?: (t: SimTrade) => void;
  cs: string;
  isHistory?: boolean;
  balance?: number;
  startingCapital?: number;
  tradeNumber?: number;
  simTradeId?: string;
  mirrorCount?: number;
  showMirrorUi?: boolean;
  /** Admin-only: drives the orphaned-live-mirror force-close button on
   *  the History row's status cell. Decoupled from `showMirrorUi` because
   *  the per-row "X live users" chip on Open trades has different visibility
   *  rules from the History recovery button. */
  staleMirrorAdmin?: boolean;
}) {
  const isBuy = trade.side === "BUY";
  const isOpen = trade.status === "OPEN";
  const chartLabel = tfLabelMap[String(trade.timeframe).toUpperCase()] ?? `${trade.timeframe}m`;
  const sl = getSlDisplay(trade);
  const closeDisplay = getCloseDisplay(trade.closeReason ?? null);
  // Exit price for closed trades: currentPrice is set to the last exit price by the cron.
  const exitPrice = !isOpen ? (trade.currentPrice ?? trade.events?.[trade.events.length - 1]?.price ?? null) : null;
  const cellPy = isHistory ? "py-2" : "py-4";

  return (
    <>
    <TableRow className="border-white/5 hover:bg-white/[0.02] transition-colors cursor-pointer" onClick={() => onSelect(trade)}>
      <TableCell className={cellPy}>
        <Link href={`/chart/${trade.signalId}`} target="_blank" className="text-sm font-black text-white leading-none uppercase tracking-tighter hover:text-accent transition-colors" onClick={(e) => e.stopPropagation()}>
          {trade.symbol}
        </Link>
        {showMirrorUi && (
          <LiveMirrorSymbolLink simTradeId={simTradeId} mirrorCount={mirrorCount} />
        )}
        {tradeNumber != null && (
          <div
            className="font-mono text-[9px] text-muted-foreground/40 hover:text-muted-foreground/70 cursor-pointer transition-colors mt-0.5"
            title={`Trade #${tradeNumber} — click to copy`}
            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`#${tradeNumber}`); }}
          >
            #{tradeNumber}
          </div>
        )}
      </TableCell>
      <TableCell className={cellPy}>
        <Badge className={cn("text-[9px] font-black h-5 uppercase px-2", isBuy ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400")}>
          {trade.side}
        </Badge>
      </TableCell>
      <TableCell className={cn(cellPy, "text-xs font-bold text-muted-foreground uppercase")}>{chartLabel}</TableCell>
      <TableCell className={cn(cellPy, "text-[10px] font-bold text-muted-foreground/50 uppercase max-w-[70px] truncate")}>{trade.algo || "—"}</TableCell>
      <TableCell className={cellPy}>
        <Badge variant="outline" className="text-[9px] font-black h-5 px-1.5 border-accent/20 text-accent">{trade.leverage}x</Badge>
      </TableCell>
      <TableCell className={cn(cellPy, "font-mono text-xs font-bold text-white/60")}>{cs}{formatPrice(trade.entryPrice)}</TableCell>
      {/* EXIT (history) or CURRENT (open trades) */}
      <TableCell className={cellPy}>
        {isHistory ? (
          exitPrice != null
            ? <span className="font-mono text-xs font-bold text-white/50">{cs}{formatPrice(exitPrice)}</span>
            : <span className="text-muted-foreground/30">—</span>
        ) : (
          isOpen && trade.currentPrice != null
            ? <span className="font-mono text-xs font-bold text-white">{cs}{formatPrice(trade.currentPrice)}</span>
            : <span className="text-muted-foreground/30">—</span>
        )}
      </TableCell>
      <TableCell className={cellPy}>
        <div className="flex flex-col">
          <span className="font-mono text-xs font-bold text-white">{cs}{formatPrice(sl.price)}</span>
          <span className="text-[9px] text-muted-foreground/60">{sl.label}</span>
        </div>
      </TableCell>
      <TableCell className={cellPy}>
        <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase">
          {[
            { num: 1, hit: trade.tp1Hit },
            { num: 2, hit: trade.tp2Hit },
            { num: 3, hit: trade.tp3Hit },
          ].map((tp) => {
            const slKilled = !tp.hit && trade.slHit;
            return (
              <span
                key={tp.num}
                className={cn(
                  "relative px-1.5 py-0.5 rounded",
                  tp.hit
                    ? "bg-emerald-500/20 text-emerald-400"
                    : slKilled
                      ? "bg-rose-500/10 text-rose-400/50 line-through decoration-rose-400/60"
                      : "bg-white/5 text-muted-foreground/40"
                )}
              >
                {tp.num}{tp.hit ? "✓" : ""}
              </span>
            );
          })}
        </div>
      </TableCell>
      <TableCell className={cellPy}>
        <div className="flex flex-col gap-0.5">
          {isOpen ? (
            <>
              <div className={cn("flex items-center gap-1 font-mono text-xs font-black", (trade.unrealizedPnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                {(trade.unrealizedPnl ?? 0) >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {(trade.unrealizedPnl ?? 0) >= 0 ? "+" : ""}{formatMoney(trade.unrealizedPnl ?? 0, cs)}
              </div>
              <span className="text-[9px] text-muted-foreground/30 font-mono">unreal.</span>
              {trade.realizedPnl !== 0 && (
                <span className={cn("text-[9px] font-mono font-bold", trade.realizedPnl >= 0 ? "text-emerald-400/60" : "text-rose-400/60")}>
                  {trade.realizedPnl >= 0 ? "+" : ""}{formatMoney(trade.realizedPnl, cs)} real.
                </span>
              )}
            </>
          ) : (
            <>
              <div className={cn("flex items-center gap-1 font-mono text-xs font-black", trade.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                {trade.realizedPnl >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {trade.realizedPnl >= 0 ? "+" : ""}{formatMoney(trade.realizedPnl, cs)}
              </div>
              <span className="text-[9px] text-muted-foreground/30 font-mono">fees: {formatMoney(trade.fees, cs)}</span>
            </>
          )}
        </div>
      </TableCell>
      <TableCell className={cellPy}>
        <SimNotionalSizeDisplay
          trade={trade}
          cs={cs}
          className="text-xs"
          valueClassName="text-white/60"
        />
      </TableCell>
      <TableCell className={cellPy}>
        {isHistory ? (
          /* History: Entry score and "at close" score side-by-side so users
             can read at a glance whether the score still endorsed the trade
             when it exited (held = green, degraded = amber, zero = red). */
          <HistoryScoreCell trade={trade} />
        ) : (
          <div className="flex gap-3">
            {/* Entry — click to see score breakdown */}
            <Popover>
              <PopoverTrigger asChild>
                <div className="flex flex-col gap-0.5 cursor-pointer hover:opacity-80 transition-opacity">
                  <span className="font-mono text-[10px] text-muted-foreground/40 uppercase tracking-wider">Entry</span>
                  <span className="font-mono text-xs font-bold text-accent underline decoration-dotted underline-offset-2">{trade.confidenceScore}</span>
                  {trade.scorePattern && (
                    <PatternBadge pattern={trade.scorePattern as PatternType} score={null} />
                  )}
                </div>
              </PopoverTrigger>
              {trade.scoreBreakdownAtEntry && (
                <PopoverContent className="w-72 p-3 text-xs space-y-2" side="right">
                  <p className="font-black uppercase tracking-widest text-[10px] text-muted-foreground/50 mb-1">Score at Entry</p>
                  {/* Price structure */}
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Price Structure</span>
                    <span className="font-mono font-bold text-white">{trade.scoreBreakdownAtEntry.priceStructure} <span className="text-muted-foreground/50">/ 60</span></span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Pattern</span>
                    <span className="font-mono font-bold text-accent uppercase">{trade.scoreBreakdownAtEntry.pattern}</span>
                  </div>
                  {trade.scoreBreakdownAtEntry.rrGateFailed && (
                    <div className="text-rose-400 text-[10px]">⚠ RR gate failed</div>
                  )}
                  {/* Liquidity */}
                  {trade.scoreBreakdownAtEntry.liquidityContext && (
                    <>
                      <div className="border-t border-white/[0.06] pt-2 mt-1">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-muted-foreground">Liquidity</span>
                          <span className="font-mono font-bold text-white">{trade.scoreBreakdownAtEntry.liquidityContext.score} <span className="text-muted-foreground/50">/ 40</span></span>
                        </div>
                        <div className="space-y-1">
                          {trade.scoreBreakdownAtEntry.liquidityContext.reasons.map((r, i) => (
                            <div key={i} className={cn(
                              "text-[10px] flex items-start gap-1",
                              r.startsWith("Sweep") || r.startsWith("Fresh") || r.startsWith("Strong") || r.startsWith("Moderate") || r.startsWith("OI rising") || r.startsWith("OI falling") || r.startsWith("Bid") || r.startsWith("Ask pressure") || r.startsWith("Clear") || r.startsWith("Protective") || r.startsWith("Neutral")
                                ? "text-positive/80" : "text-rose-400/80"
                            )}>
                              <span>{r.startsWith("No ") || r.startsWith("Sweep AGAINST") || r.startsWith("Wall") || r.startsWith("Extreme") || r.startsWith("Ask heavy") || r.startsWith("Bid heavy") ? "↓" : "↑"}</span>
                              <span>{r}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                  {/* Total */}
                  <div className="border-t border-white/[0.06] pt-2 flex justify-between items-center">
                    <span className="font-bold text-white/70">Total</span>
                    <span className="font-mono font-black text-accent">{trade.confidenceScore} / 100</span>
                  </div>
                </PopoverContent>
              )}
            </Popover>
            {/* Current / last */}
            {trade.currentScore != null && (
              <div className="flex flex-col gap-0.5 pl-3 border-l border-white/[0.06]">
                <span className="font-mono text-[10px] text-muted-foreground/40 uppercase tracking-wider">{isOpen ? "Now" : "Last"}</span>
                <span className={cn(
                  "font-mono text-xs font-bold",
                  trade.currentScore === 0 ? "text-rose-400" :
                  trade.currentScore < trade.confidenceScore ? "text-amber-400" : "text-positive",
                )}>
                  {trade.currentScore}
                </span>
                {trade.currentScorePattern && (
                  <PatternBadge pattern={trade.currentScorePattern as PatternType} score={null} />
                )}
              </div>
            )}
          </div>
        )}
      </TableCell>
      <TableCell className={cellPy}>
        {isOpen ? (
          <div className="flex items-center gap-1.5">
            <Badge className="text-[9px] font-black h-5 uppercase px-2 bg-accent/15 text-accent">Open</Badge>
            {onForceClose && (
              <SimForceCloseDialog trades={trade} onConfirm={() => onForceClose(trade)}>
                <button
                  onClick={(e) => e.stopPropagation()}
                  className="h-5 w-5 flex items-center justify-center rounded hover:bg-rose-500/20 text-muted-foreground/30 hover:text-rose-400 transition-colors"
                  title="Force close"
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </SimForceCloseDialog>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <Badge className={cn("text-[9px] font-black h-5 uppercase px-2 w-fit", closeDisplay.color)}>
                {closeDisplay.label}
              </Badge>
              {/* Orphaned-live-mirror recovery: shows only when the sim
                  is CLOSED but the mirror endpoint still returned OPEN
                  live_trades for this simTradeId. The endpoint is the
                  same `/api/sim/force-close` — when the sim is already
                  closed it runs the cascade-only branch (admin-gated). */}
              {staleMirrorAdmin && mirrorCount > 0 && onForceClose && (
                <SimForceCloseDialog
                  trades={trade}
                  onConfirm={() => onForceClose(trade)}
                  extraNote={`${mirrorCount} live mirror${mirrorCount === 1 ? "" : "s"} still open. Sim is already closed; this only runs the live-cascade recovery and does not touch the sim doc.`}
                >
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 h-5 px-1.5 rounded border border-rose-400/30 bg-rose-500/10 text-[9px] font-black uppercase text-rose-300 hover:bg-rose-500/20 transition-colors"
                    title={`Force close ${mirrorCount} orphaned live mirror${mirrorCount === 1 ? "" : "s"}`}
                  >
                    <XCircle className="h-3 w-3" />
                    {mirrorCount}
                  </button>
                </SimForceCloseDialog>
              )}
            </div>
            {(trade as any).txHash ? (
              <a
                href={`https://solscan.io/tx/${(trade as any).txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1 text-[8px] font-bold text-purple-400/70 hover:text-purple-400 transition-colors"
                title="View on Solscan"
              >
                <Link2 className="h-2.5 w-2.5" />
                On-chain ↗
              </a>
            ) : (trade as any).blockchainStatus === "pending" || (trade as any).blockchainStatus === "processing" ? (
              <span className="flex items-center gap-1 text-[8px] font-bold text-muted-foreground/30">
                <Link2 className="h-2.5 w-2.5" />
                Publishing…
              </span>
            ) : null}
          </div>
        )}
      </TableCell>
      <TableCell className={cn(cellPy, "text-right")}>
        <div className="flex flex-col items-end gap-0.5">
          <div className="flex items-center gap-1 whitespace-nowrap">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/30">In</span>
            <span className="text-[10px] font-mono font-bold text-white/40">{format(new Date(trade.openedAt), "MMM dd")}</span>
            <span className="text-[10px] font-mono font-bold text-accent/40">{format(new Date(trade.openedAt), "HH:mm")}</span>
          </div>
          {trade.closedAt && (
            <div className="flex items-center gap-1 whitespace-nowrap">
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/30">Out</span>
              <span className="text-[10px] font-mono font-bold text-white/25">{format(new Date(trade.closedAt), "MMM dd")}</span>
              <span className="text-[10px] font-mono font-bold text-muted-foreground/30">{format(new Date(trade.closedAt), "HH:mm")}</span>
            </div>
          )}
          {/* Fund balance inline — no separate row needed */}
          {balance != null && (
            <span className={cn(
              "text-[9px] font-mono font-bold mt-0.5",
              balance >= (startingCapital ?? 0) ? "text-emerald-500/60" : "text-rose-500/60"
            )}>
              {cs}{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
        </div>
      </TableCell>
    </TableRow>
    </>
  );
}

function MobileTradeCard({ trade, onSelect, onForceClose, cs, balance, startingCapital, tradeNumber }: { trade: SimTrade; onSelect: (t: SimTrade) => void; onForceClose?: (t: SimTrade) => void; cs: string; balance?: number; startingCapital?: number; tradeNumber?: number }) {
  const isBuy = trade.side === "BUY";
  const isOpen = trade.status === "OPEN";
  const isWin = trade.realizedPnl > 0;
  const chartLabel = tfLabelMap[String(trade.timeframe).toUpperCase()] ?? `${trade.timeframe}m`;
  const sl = getSlDisplay(trade);
  const closeDisplay = getCloseDisplay(trade.closeReason ?? null);
  const exitPrice = !isOpen ? (trade.currentPrice ?? trade.events?.[trade.events.length - 1]?.price ?? null) : null;

  return (
    <div className="block cursor-pointer" onClick={() => onSelect(trade)}>
      <div className={cn(
        "rounded-xl border overflow-hidden hover:border-white/[0.12] transition-all",
        isOpen
          ? "border-accent/15 bg-gradient-to-b from-[#141416] to-[#0f0f11]"
          : isWin
            ? "border-positive/10 bg-gradient-to-b from-[#141416] to-[#0f0f11]"
            : "border-negative/10 bg-gradient-to-b from-[#141416] to-[#0f0f11]"
      )}>
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-black text-foreground uppercase tracking-tight">{trade.symbol}</span>
              <span className={cn("text-[11px] font-bold uppercase", isBuy ? "text-emerald-400/70" : "text-rose-400/70")}>
                {isBuy ? "▲ Long" : "▼ Short"}
              </span>
              <span className="text-white/15">·</span>
              <span className="text-[11px] text-muted-foreground/60 uppercase">{chartLabel}</span>
              <span className="text-[9px] font-bold text-muted-foreground/40">{trade.leverage}x</span>
            </div>
            <div className="flex items-center gap-1.5">
              {isOpen ? (
                <>
                  <Badge className="text-[9px] font-black h-5 uppercase px-2 bg-accent/15 text-accent">Open</Badge>
                  {onForceClose && (
                    <SimForceCloseDialog trades={trade} onConfirm={() => onForceClose(trade)}>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="h-5 px-1.5 flex items-center gap-1 rounded text-[9px] font-bold text-rose-400/50 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      >
                        <XCircle className="h-3 w-3" /> Close
                      </button>
                    </SimForceCloseDialog>
                  )}
                </>
              ) : (
                <Badge className={cn("text-[9px] font-black h-5 uppercase px-2", closeDisplay.color)}>
                  {closeDisplay.label}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[10px] font-bold text-muted-foreground/30 uppercase">{trade.algo || "—"}</span>
            <span className="text-white/15">·</span>
            <Popover>
              <PopoverTrigger asChild>
                <span className="text-[10px] font-bold text-accent underline decoration-dotted underline-offset-2 cursor-pointer">Entry {trade.confidenceScore}</span>
              </PopoverTrigger>
              {trade.scoreBreakdownAtEntry && (
                <PopoverContent className="w-64 p-3 text-xs space-y-2" side="bottom">
                  <p className="font-black uppercase tracking-widest text-[10px] text-muted-foreground/50 mb-1">Score at Entry</p>
                  <div className="flex justify-between"><span className="text-muted-foreground">Price Structure</span><span className="font-mono font-bold">{trade.scoreBreakdownAtEntry.priceStructure}/60</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Pattern</span><span className="font-mono font-bold text-accent uppercase">{trade.scoreBreakdownAtEntry.pattern}</span></div>
                  {trade.scoreBreakdownAtEntry.liquidityContext && (
                    <>
                      <div className="flex justify-between border-t border-white/[0.06] pt-2"><span className="text-muted-foreground">Liquidity</span><span className="font-mono font-bold">{trade.scoreBreakdownAtEntry.liquidityContext.score}/40</span></div>
                      {trade.scoreBreakdownAtEntry.liquidityContext.reasons.map((r, i) => (
                        <div key={i} className={cn("text-[10px]", r.startsWith("No ") || r.startsWith("Sweep AGAINST") || r.startsWith("Wall") || r.startsWith("Extreme") || r.startsWith("Ask heavy") || r.startsWith("Bid heavy") ? "text-rose-400/80" : "text-positive/80")}>
                          {r.startsWith("No ") || r.startsWith("Sweep AGAINST") || r.startsWith("Wall") || r.startsWith("Extreme") ? "↓ " : "↑ "}{r}
                        </div>
                      ))}
                    </>
                  )}
                  <div className="border-t border-white/[0.06] pt-2 flex justify-between font-bold"><span>Total</span><span className="text-accent font-mono">{trade.confidenceScore}/100</span></div>
                </PopoverContent>
              )}
            </Popover>
            {trade.scorePattern && <PatternBadge pattern={trade.scorePattern as PatternType} score={null} />}
            {(() => {
              // Open trades show the live `currentScore` as "Now"; closed
              // trades prefer `confidenceScoreAtClose` (stamped on exit) and
              // fall back to `currentScore` only for legacy rows that
              // pre-date that field.
              const close = isOpen
                ? { value: trade.currentScore ?? null, pattern: trade.currentScorePattern, label: "Now" }
                : (() => {
                    const c = getCloseScore(trade);
                    return { value: c.value, pattern: c.pattern, label: c.isLegacy ? "Last" : "Close" };
                  })();
              if (close.value == null) return null;
              return (
                <>
                  <span className="text-white/15">→</span>
                  <span className={cn(
                    "text-[10px] font-bold",
                    scoreDeltaColor(trade.confidenceScore, close.value),
                  )}>
                    {close.label} {close.value}
                  </span>
                  {close.pattern && <PatternBadge pattern={close.pattern as PatternType} score={null} />}
                </>
              );
            })()}
            {tradeNumber != null && (
              <>
                <span className="text-white/10 ml-auto">·</span>
                <span
                  className="font-mono text-[9px] text-muted-foreground/40 hover:text-muted-foreground/70 cursor-pointer transition-colors"
                  title={`Trade #${tradeNumber} — click to copy`}
                  onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(`#${tradeNumber}`); }}
                >
                  #{tradeNumber}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3">
          {/* PNL + Date */}
          <div className="flex items-center justify-between">
            <div>
              {isOpen ? (
                <div className="flex flex-col">
                  <div className={cn("flex items-center gap-1.5 font-mono text-lg font-black", (trade.unrealizedPnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                    {(trade.unrealizedPnl ?? 0) >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {(trade.unrealizedPnl ?? 0) >= 0 ? "+" : ""}{formatMoney(trade.unrealizedPnl ?? 0, cs)}
                    <span className="text-[9px] font-bold text-muted-foreground/30 ml-1">unreal.</span>
                  </div>
                  {trade.realizedPnl !== 0 && (
                    <span className={cn("text-[10px] font-mono font-bold", trade.realizedPnl >= 0 ? "text-emerald-400/60" : "text-rose-400/60")}>
                      {trade.realizedPnl >= 0 ? "+" : ""}{formatMoney(trade.realizedPnl, cs)} realized
                    </span>
                  )}
                </div>
              ) : (
                <div className={cn("flex items-center gap-1.5 font-mono text-lg font-black", trade.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {trade.realizedPnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {trade.realizedPnl >= 0 ? "+" : ""}{formatMoney(trade.realizedPnl, cs)}
                  <span className="text-[9px] font-bold text-muted-foreground/30 ml-1">fees: {formatMoney(trade.fees, cs)}</span>
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <div className="flex items-center gap-1">
                <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/30">In</span>
                <span className="text-[10px] font-mono text-muted-foreground/40">{format(new Date(trade.openedAt), "MMM dd, HH:mm")}</span>
              </div>
              {trade.closedAt && (
                <div className="flex items-center gap-1">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/30">Out</span>
                  <span className="text-[10px] font-mono text-muted-foreground/30">{format(new Date(trade.closedAt), "MMM dd, HH:mm")}</span>
                </div>
              )}
              {balance != null && (
                <span className={cn(
                  "text-[9px] font-mono font-bold mt-0.5",
                  balance >= (startingCapital ?? 0) ? "text-emerald-500/60" : "text-rose-500/60"
                )}>
                  {cs}{balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              )}
            </div>
          </div>

          {/* Entry / Exit|Current / SL */}
          <div className="flex items-center gap-3 text-[11px] flex-wrap">
            <div>
              <span className="text-muted-foreground/40 mr-1.5">Entry</span>
              <span className="font-mono font-bold text-white/50">{cs}{formatPrice(trade.entryPrice)}</span>
            </div>
            {isOpen && trade.currentPrice != null ? (
              <>
                <span className="text-white/10">→</span>
                <div>
                  <span className="text-muted-foreground/40 mr-1.5">Current</span>
                  <span className="font-mono font-bold text-white">{cs}{formatPrice(trade.currentPrice)}</span>
                </div>
              </>
            ) : exitPrice != null ? (
              <>
                <span className="text-white/10">→</span>
                <div>
                  <span className="text-muted-foreground/40 mr-1.5">Exit</span>
                  <span className="font-mono font-bold text-white/50">{cs}{formatPrice(exitPrice)}</span>
                </div>
              </>
            ) : null}
            <span className="text-white/10">|</span>
            <div>
              <span className="text-muted-foreground/40 mr-1.5">SL</span>
              <span className="font-mono font-bold text-white/50">{cs}{formatPrice(sl.price)}</span>
              <span className="text-[9px] text-muted-foreground/40 ml-1">({sl.label})</span>
            </div>
          </div>

          {/* Notional */}
          <div className="text-[11px] flex flex-wrap items-center gap-x-3 gap-y-1">
            <div>
              <span className="text-muted-foreground/40 mr-1.5">Notional</span>
              <SimNotionalSizeDisplay
                trade={trade}
                cs={cs}
                useRemaining={isOpen}
                className="text-[11px] inline"
                valueClassName="text-white/50"
              />
            </div>
            {isOpen && (
              <div>
                <span className="text-muted-foreground/40 mr-1.5">Remaining</span>
                <span className="font-mono font-bold text-white/50">
                  {(trade.remainingPct * 100).toFixed(0)}%
                </span>
              </div>
            )}
          </div>

          {/* Targets */}
          <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
            <div className="flex items-center gap-1.5">
              {[
                { num: 1, hit: trade.tp1Hit, price: trade.tp1 },
                { num: 2, hit: trade.tp2Hit, price: trade.tp2 },
                { num: 3, hit: trade.tp3Hit, price: trade.tp3 },
              ].map((tp) => {
                const slKilled = !tp.hit && trade.slHit;
                return (
                  <span
                    key={tp.num}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[9px] font-bold",
                      tp.hit
                        ? "bg-emerald-500/20 text-emerald-400"
                        : slKilled
                          ? "bg-rose-500/10 text-rose-400/50 line-through"
                          : "bg-white/5 text-muted-foreground/40"
                    )}
                  >
                    TP{tp.num}{tp.hit ? "✓" : ""}
                  </span>
                );
              })}
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[9px] font-mono text-muted-foreground/30">
                <span className="uppercase tracking-widest mr-1">In</span>{format(new Date(trade.openedAt), "HH:mm")}
              </span>
              {trade.closedAt && (
                <span className="text-[9px] font-mono text-muted-foreground/25">
                  <span className="uppercase tracking-widest mr-1">Out</span>{format(new Date(trade.closedAt), "HH:mm")}
                </span>
              )}
            </div>
          </div>

          {/* Blockchain verification link (closed trades only) */}
          {!isOpen && (trade as any).txHash && (
            <div className="pt-2 border-t border-white/[0.04]">
              <a
                href={`https://solscan.io/tx/${(trade as any).txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 text-[10px] font-bold text-purple-400/70 hover:text-purple-400 transition-colors"
              >
                <Link2 className="h-3 w-3" />
                Verify on-chain ↗
              </a>
            </div>
          )}
          {!isOpen && ((trade as any).blockchainStatus === "pending" || (trade as any).blockchainStatus === "processing") && (
            <div className="pt-2 border-t border-white/[0.04]">
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground/30">
                <Link2 className="h-3 w-3" />
                Publishing to blockchain…
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LogRow({ log, cs = "$" }: { log: SimLog; cs?: string }) {
  const actionColor: Record<string, string> = {
    TRADE_OPENED: "text-accent",
    TP_HIT: "text-positive",
    SL_HIT: "text-negative",
    MARKET_TURN: "text-amber-400",
    SCORE_DEGRADED: "text-amber-400",
    SIGNAL_SKIPPED: "text-muted-foreground/40",
    INCUBATED_SKIPPED: "text-muted-foreground/40",
    COOLOFF_ACTIVATED: "text-amber-400",
    DAILY_RESET: "text-accent",
    ASSESSMENT_SUMMARY: "text-sky-400",
    PATTERN_BREAK: "text-rose-400",
  };

  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-white/[0.03]">
      <span className="text-[9px] text-muted-foreground/25 tabular-nums shrink-0 pt-0.5 w-14">
        {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className={cn("text-[9px] font-bold uppercase shrink-0 w-24 pt-0.5", actionColor[log.action] ?? "text-muted-foreground/40")}>
        {log.action.replace(/_/g, " ")}
      </span>
      <span className="text-[10px] text-muted-foreground/60 flex-1 min-w-0">
        {log.details}
      </span>
      {log.capital != null && (
        <span className="text-[9px] text-muted-foreground/30 tabular-nums shrink-0">
          {formatMoney(log.capital, cs)}
        </span>
      )}
    </div>
  );
}

const EVENT_DISPLAY: Record<string, { label: string; icon: string; color: string }> = {
  OPEN: { label: "Trade Opened", icon: "🟢", color: "text-accent" },
  SL_TO_BE: { label: "SL → Breakeven", icon: "🛡️", color: "text-accent" },
  TP1: { label: "TP1 Hit", icon: "🎯", color: "text-emerald-400" },
  TP2: { label: "TP2 Hit", icon: "🎯", color: "text-emerald-400" },
  TP3: { label: "TP3 Hit", icon: "🏆", color: "text-emerald-400" },
  SL: { label: "Stop Loss Hit", icon: "🔴", color: "text-rose-400" },
};

function TradeNarrationDialog({ trade, onClose, cs }: { trade: SimTrade | null; onClose: () => void; cs: string }) {
  if (!trade) return null;

  const isBuy = trade.side === "BUY";
  const isOpen = trade.status === "OPEN";
  const chartLabel = tfLabelMap[String(trade.timeframe).toUpperCase()] ?? `${trade.timeframe}m`;
  const closeDisplay = getCloseDisplay(trade.closeReason ?? null);

  const duration = trade.closedAt
    ? Math.round((new Date(trade.closedAt).getTime() - new Date(trade.openedAt).getTime()) / 60000)
    : Math.round((Date.now() - new Date(trade.openedAt).getTime()) / 60000);
  const durationLabel = duration < 60 ? `${duration}m` : duration < 1440 ? `${Math.floor(duration / 60)}h ${duration % 60}m` : `${Math.floor(duration / 1440)}d`;

  let runningPnl = 0;
  let runningFees = 0;
  let runningRemaining = 1.0;

  return (
    <Dialog open={!!trade} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto bg-[#0f0f11] border-white/[0.08]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-lg font-black uppercase tracking-tight">{trade.symbol}</span>
            <Badge className={cn("text-[9px] font-black h-5 uppercase px-2", isBuy ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400")}>
              {trade.side}
            </Badge>
            <span className="text-[11px] text-muted-foreground/60">{chartLabel} · {trade.leverage}x</span>
            {isOpen ? (
              <Badge className="text-[9px] font-black h-5 uppercase px-2 bg-accent/15 text-accent ml-auto">Open</Badge>
            ) : (
              <Badge className={cn("text-[9px] font-black h-5 uppercase px-2 ml-auto", closeDisplay.color)}>
                {closeDisplay.label}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Trade Metadata */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[11px] border-b border-white/[0.06] pb-3">
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">Entry</span>
            <span className="font-mono font-bold text-white/70">{cs}{formatPrice(trade.entryPrice)}</span>
          </div>
          <div className="flex justify-between col-span-2">
            <span className="text-muted-foreground/40">Notional</span>
            <SimNotionalSizeDisplay
              trade={trade}
              cs={cs}
              useRemaining={isOpen}
              valueClassName="text-white/70"
            />
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">SL</span>
            <span className="font-mono font-bold text-rose-400/70">{cs}{formatPrice(trade.stopLoss)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">Capital</span>
            <span className="font-mono font-bold text-white/70">{formatMoney(trade.capitalAtEntry, cs)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">TP1</span>
            <span className="font-mono font-bold text-emerald-400/70">{cs}{formatPrice(trade.tp1)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">Score</span>
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex flex-col items-end gap-0.5">
                <span className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">Entry</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <span className="font-mono font-bold text-accent underline decoration-dotted underline-offset-2 cursor-pointer">{trade.confidenceScore}</span>
                  </PopoverTrigger>
                  {trade.scoreBreakdownAtEntry && (
                    <PopoverContent className="w-64 p-3 text-xs space-y-2" side="left">
                      <p className="font-black uppercase tracking-widest text-[10px] text-muted-foreground/50 mb-1">Score at Entry</p>
                      <div className="flex justify-between"><span className="text-muted-foreground">Price Structure</span><span className="font-mono font-bold">{trade.scoreBreakdownAtEntry.priceStructure}/60</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Pattern</span><span className="font-mono font-bold text-accent uppercase">{trade.scoreBreakdownAtEntry.pattern}</span></div>
                      {trade.scoreBreakdownAtEntry.liquidityContext && (
                        <>
                          <div className="flex justify-between border-t border-white/[0.06] pt-2"><span className="text-muted-foreground">Liquidity</span><span className="font-mono font-bold">{trade.scoreBreakdownAtEntry.liquidityContext.score}/40</span></div>
                          {trade.scoreBreakdownAtEntry.liquidityContext.reasons.map((r, i) => (
                            <div key={i} className={cn("text-[10px]", r.startsWith("No ") || r.startsWith("Sweep AGAINST") || r.startsWith("Wall") || r.startsWith("Extreme") || r.startsWith("Ask heavy") || r.startsWith("Bid heavy") ? "text-rose-400/80" : "text-positive/80")}>
                              {r.startsWith("No ") || r.startsWith("Sweep AGAINST") || r.startsWith("Wall") || r.startsWith("Extreme") ? "↓ " : "↑ "}{r}
                            </div>
                          ))}
                        </>
                      )}
                      <div className="border-t border-white/[0.06] pt-2 flex justify-between font-bold"><span>Total</span><span className="text-accent font-mono">{trade.confidenceScore}/100</span></div>
                    </PopoverContent>
                  )}
                </Popover>
                {trade.scorePattern && <PatternBadge pattern={trade.scorePattern as PatternType} score={null} />}
              </div>
              {(() => {
                // For closed trades, show the score that was live at the
                // moment of exit (with full breakdown popover). For open
                // trades, keep showing the live `currentScore`.
                const close = isOpen
                  ? {
                      value: trade.currentScore ?? null,
                      pattern: trade.currentScorePattern,
                      label: "Now",
                      breakdown: undefined as SimTrade["scoreBreakdownAtClose"] | undefined,
                    }
                  : (() => {
                      const c = getCloseScore(trade);
                      return {
                        value: c.value,
                        pattern: c.pattern,
                        label: c.isLegacy ? "Last" : "Close",
                        breakdown: trade.scoreBreakdownAtClose,
                      };
                    })();
                if (close.value == null) return null;
                const colorClass = scoreDeltaColor(trade.confidenceScore, close.value);
                const valueNode = (
                  <span className={cn("font-mono font-bold", colorClass, close.breakdown ? "underline decoration-dotted underline-offset-2 cursor-pointer" : "")}>
                    {close.value}
                  </span>
                );
                return (
                  <div className="flex flex-col items-end gap-0.5 border-t border-white/[0.06] pt-1.5">
                    <span className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">{close.label}</span>
                    {close.breakdown ? (
                      <Popover>
                        <PopoverTrigger asChild>{valueNode}</PopoverTrigger>
                        <PopoverContent className="w-64 p-3 text-xs space-y-2" side="left">
                          <p className="font-black uppercase tracking-widest text-[10px] text-muted-foreground/50 mb-1">Score at Close</p>
                          <div className="flex justify-between"><span className="text-muted-foreground">Price Structure</span><span className="font-mono font-bold">{close.breakdown.priceStructure}/60</span></div>
                          <div className="flex justify-between"><span className="text-muted-foreground">Pattern</span><span className="font-mono font-bold text-accent uppercase">{close.breakdown.pattern}</span></div>
                          {close.breakdown.rrGateFailed && (
                            <div className="text-rose-400 text-[10px]">⚠ RR gate failed</div>
                          )}
                          {close.breakdown.liquidityContext && (
                            <>
                              <div className="flex justify-between border-t border-white/[0.06] pt-2"><span className="text-muted-foreground">Liquidity</span><span className="font-mono font-bold">{close.breakdown.liquidityContext.score}/40</span></div>
                              {close.breakdown.liquidityContext.reasons.map((r, i) => (
                                <div key={i} className={cn("text-[10px]", r.startsWith("No ") || r.startsWith("Sweep AGAINST") || r.startsWith("Wall") || r.startsWith("Extreme") || r.startsWith("Ask heavy") || r.startsWith("Bid heavy") ? "text-rose-400/80" : "text-positive/80")}>
                                  {r.startsWith("No ") || r.startsWith("Sweep AGAINST") || r.startsWith("Wall") || r.startsWith("Extreme") ? "↓ " : "↑ "}{r}
                                </div>
                              ))}
                            </>
                          )}
                          <div className="border-t border-white/[0.06] pt-2 flex justify-between font-bold"><span>Total</span><span className={cn("font-mono", colorClass)}>{close.value}/100</span></div>
                          <div className="border-t border-white/[0.06] pt-2 flex justify-between text-[10px]">
                            <span className="text-muted-foreground">Δ vs Entry</span>
                            <span className={cn("font-mono font-bold", colorClass)}>
                              {close.value - trade.confidenceScore >= 0 ? "+" : ""}{close.value - trade.confidenceScore}
                            </span>
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      valueNode
                    )}
                    {close.pattern && <PatternBadge pattern={close.pattern as PatternType} score={null} />}
                  </div>
                );
              })()}
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">TP2</span>
            <span className="font-mono font-bold text-emerald-400/70">{cs}{formatPrice(trade.tp2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">Bias</span>
            <span className="font-mono font-bold text-white/70">{trade.biasAtEntry}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">TP3</span>
            <span className="font-mono font-bold text-emerald-400/70">{cs}{formatPrice(trade.tp3)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">Duration</span>
            <span className="font-mono font-bold text-white/70">{durationLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">Live WR</span>
            <span className="font-mono font-bold text-white/70">{(trade.liveWinRateAtEntry * 100).toFixed(0)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground/40">Algo WR</span>
            <span className="font-mono font-bold text-white/70">{(trade.algoWinRateAtEntry * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* Timeline */}
        <div className="space-y-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-2">Trade Timeline</div>
          {(trade.events || []).map((evt, i) => {
            const display = EVENT_DISPLAY[evt.type] ?? { label: evt.type, icon: "•", color: "text-muted-foreground" };

            if (evt.type === "OPEN") {
              runningFees += evt.fee;
            } else if (evt.type === "SL_TO_BE") {
              // no PnL change
            } else {
              runningPnl += evt.pnl;
              runningFees += evt.fee;
              runningRemaining -= evt.closePct;
            }

            return (
              <div key={i} className="flex gap-3 py-2 border-b border-white/[0.03] last:border-0">
                <div className="flex flex-col items-center shrink-0 w-5">
                  <span className="text-sm">{display.icon}</span>
                  {i < trade.events.length - 1 && <div className="w-px flex-1 bg-white/[0.06] mt-1" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={cn("text-[11px] font-bold", display.color)}>{display.label}</span>
                    <span className="text-[9px] text-muted-foreground/30 font-mono">
                      {format(new Date(evt.timestamp), "MMM dd, HH:mm:ss")}
                    </span>
                  </div>

                  {evt.type === "OPEN" && (
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5">
                      <span>
                        Entry @ <span className="font-mono text-white/60">{cs}{formatPrice(evt.price)}</span>
                      </span>
                      <span className="text-muted-foreground/35">·</span>
                      <span className="inline-flex items-center gap-1">
                        <span>Notional</span>
                        <SimNotionalSizeDisplay
                          trade={trade}
                          cs={cs}
                          className="text-[10px] inline"
                          valueClassName="text-white/60"
                        />
                      </span>
                      <span className="text-muted-foreground/35">·</span>
                      <span>
                        Fee: <span className="font-mono text-rose-400/50">{formatMoney(evt.fee, cs)}</span>
                      </span>
                    </div>
                  )}

                  {evt.type === "SL_TO_BE" && (
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5">
                      Price crossed 50% of TP1 @ <span className="font-mono text-white/60">{cs}{formatPrice(evt.price)}</span>
                      {" · "}SL moved to entry <span className="font-mono text-white/60">{cs}{formatPrice(trade.entryPrice)}</span>
                    </div>
                  )}

                  {(evt.type === "TP1" || evt.type === "TP2" || evt.type === "TP3") && (
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5 space-y-0.5">
                      <div>
                        @ <span className="font-mono text-white/60">{cs}{formatPrice(evt.price)}</span>
                        {" · "}Closed <span className="font-mono text-white/60">{(evt.closePct * 100).toFixed(0)}%</span> ({formatMoney(trade.positionSize * evt.closePct, cs)})
                      </div>
                      <div>
                        PnL: <span className={cn("font-mono font-bold", evt.pnl >= 0 ? "text-emerald-400" : "text-rose-400")}>{evt.pnl >= 0 ? "+" : ""}{formatMoney(evt.pnl, cs)}</span>
                        {" · "}Fee: <span className="font-mono text-rose-400/50">{formatMoney(evt.fee, cs)}</span>
                        {" · "}Remaining: <span className="font-mono text-white/60">{Math.max(0, runningRemaining * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  )}

                  {evt.type === "SL" && (
                    <div className="text-[10px] text-muted-foreground/50 mt-0.5 space-y-0.5">
                      <div>
                        @ <span className="font-mono text-white/60">{cs}{formatPrice(evt.price)}</span>
                        {" · "}Closed <span className="font-mono text-white/60">{(evt.closePct * 100).toFixed(0)}%</span> remaining
                      </div>
                      <div>
                        PnL: <span className={cn("font-mono font-bold", evt.pnl >= 0 ? "text-emerald-400" : "text-rose-400")}>{evt.pnl >= 0 ? "+" : ""}{formatMoney(evt.pnl, cs)}</span>
                        {" · "}Fee: <span className="font-mono text-rose-400/50">{formatMoney(evt.fee, cs)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary Footer */}
        <div className="border-t border-white/[0.06] pt-3 mt-1">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-0.5">Realized PnL</div>
              <div className={cn("text-sm font-black font-mono", trade.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400")}>
                {trade.realizedPnl >= 0 ? "+" : ""}{formatMoney(trade.realizedPnl, cs)}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-0.5">Total Fees</div>
              <div className="text-sm font-black font-mono text-rose-400/60">{formatMoney(trade.fees, cs)}</div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40 mb-0.5">
                {isOpen ? "Unrealized" : "Net Result"}
              </div>
              {isOpen ? (
                <div className={cn("text-sm font-black font-mono", (trade.unrealizedPnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {(trade.unrealizedPnl ?? 0) >= 0 ? "+" : ""}{formatMoney(trade.unrealizedPnl ?? 0, cs)}
                </div>
              ) : (
                <div className={cn("text-sm font-black font-mono", (trade.realizedPnl - trade.fees) >= 0 ? "text-emerald-400" : "text-rose-400")}>
                  {(trade.realizedPnl - trade.fees) >= 0 ? "+" : ""}{formatMoney(trade.realizedPnl, cs)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Deep dive link */}
        <Link
          href={`/chart/${trade.signalId}`}
          target="_blank"
          className="flex items-center justify-center gap-2 text-[11px] font-bold text-accent hover:text-accent/80 transition-colors pt-1"
        >
          View signal deep dive →
        </Link>
      </DialogContent>
    </Dialog>
  );
}
