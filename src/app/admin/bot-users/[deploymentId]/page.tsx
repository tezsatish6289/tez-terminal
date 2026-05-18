"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { TopBar } from "@/components/dashboard/TopBar";
import { useUser } from "@/firebase";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  Loader2,
  ShieldAlert,
  ArrowLeft,
  RefreshCw,
  Bot,
  ScrollText,
  LayoutList,
  Shield,
} from "lucide-react";
import type { TradingPrefs } from "@/lib/freedombot/trading-prefs-shared";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { TradesPanel } from "@/components/freedombot/TradesPanel";
import {
  type Trade,
  anyTradeIsPreliminary,
  cumulativeBestPnlByTradeId,
  sortTradesForDashboard,
  totalClosedPnl,
} from "@/lib/freedombot/trade-display";

const ADMIN_EMAIL = "hello@tezterminal.com";

interface DeploymentWallet {
  total: number | null;
  available: number | null;
  currency: string;
  status: "valid" | "invalid";
  error: string | null;
  checkedAt: string | null;
}

interface DeploymentRow {
  deploymentId: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  bot: string;
  botLabel: string;
  exchange: string;
  firstDeployedAt: string | null;
  deploymentStatus: string;
  running: boolean;
  autoTradeEnabled?: boolean | null;
  liveMirroringActive?: boolean;
  lifetimeRealizedPnl: number;
  /** Server-cached aggregates (may be undefined on legacy deployment docs). */
  openTradeCount?: number;
  closedTradeCount?: number;
  aggregatesSource?: "cache" | "rebuilt";
  pnlCurrency: string;
  pnlNote: string;
  /** Exchange wallet snapshot — `null` for legacy deployments that haven't
   *  been refreshed yet. Cron refreshes every 5 minutes; admin can force a
   *  refresh from the detail page. */
  wallet: DeploymentWallet | null;
  tradingPrefs?: TradingPrefs;
}

interface TradesAggregates {
  lifetimeRealizedPnl: number;
  openTradeCount: number;
  closedTradeCount: number;
  source?: "cache" | "rebuilt";
}

interface LogRow {
  id: string;
  timestamp: string;
  action: string;
  details: string;
  symbol?: string;
  signalId?: string;
  exchange?: string;
  assetType?: string;
}

export default function AdminBotUserDetailPage() {
  const params = useParams();
  const deploymentId = typeof params.deploymentId === "string" ? params.deploymentId : "";
  const { user, isUserLoading } = useUser();
  const isAdmin = user?.email === ADMIN_EMAIL;

  const [deployment, setDeployment] = useState<DeploymentRow | null>(null);
  const [depLoading, setDepLoading] = useState(true);
  const [depError, setDepError] = useState("");

  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradeCursor, setTradeCursor] = useState<string | null>(null);
  const [tradeHasMore, setTradeHasMore] = useState(false);
  const [tradesAggregates, setTradesAggregates] = useState<TradesAggregates | null>(null);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [tradesError, setTradesError] = useState("");

  const [logs, setLogs] = useState<LogRow[]>([]);
  const [logCursor, setLogCursor] = useState<string | null>(null);
  const [logHasMore, setLogHasMore] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState("");

  const [reconciling, setReconciling] = useState(false);
  const [pageError, setPageError] = useState("");
  const logsTabPrimedRef = useRef(false);

  const fetchDeployment = useCallback(async () => {
    if (!user || !deploymentId) return;
    setDepLoading(true);
    setDepError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/admin/bot-deployments/${deploymentId}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load deployment");
      setDeployment(data.deployment ?? null);
    } catch (e: unknown) {
      setDepError(e instanceof Error ? e.message : "Unexpected error");
      setDeployment(null);
    } finally {
      setDepLoading(false);
    }
  }, [user, deploymentId]);

  const fetchTradesPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      if (!user || !deploymentId) return;
      setTradesLoading(true);
      setTradesError("");
      try {
        const idToken = await user.getIdToken();
        const qs = new URLSearchParams({ pageSize: "50" });
        if (cursor) qs.set("cursor", cursor);
        const res = await fetch(`/api/admin/bot-deployments/${deploymentId}/trades?${qs}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load trades");
        const newTrades = (data.trades ?? []) as Trade[];
        setTrades((prev) => (append ? [...prev, ...newTrades] : newTrades));
        setTradeCursor(data.nextCursor ?? null);
        setTradeHasMore(!!data.hasMore);
        // The API only returns aggregates on the first page (no cursor) — that
        // single read covers totals + counts for the whole deployment.
        if (!append && data.aggregates && typeof data.aggregates.lifetimeRealizedPnl === "number") {
          setTradesAggregates({
            lifetimeRealizedPnl: data.aggregates.lifetimeRealizedPnl,
            openTradeCount: data.aggregates.openTradeCount ?? 0,
            closedTradeCount: data.aggregates.closedTradeCount ?? 0,
            source: data.aggregates.source,
          });
        }
      } catch (e: unknown) {
        setTradesError(e instanceof Error ? e.message : "Unexpected error");
      } finally {
        setTradesLoading(false);
      }
    },
    [user, deploymentId],
  );

  const fetchLogsPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      if (!user || !deploymentId) return;
      setLogsLoading(true);
      setLogsError("");
      try {
        const idToken = await user.getIdToken();
        const qs = new URLSearchParams({ pageSize: "50" });
        if (cursor) qs.set("cursor", cursor);
        const res = await fetch(`/api/admin/bot-deployments/${deploymentId}/logs?${qs}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load logs");
        const newLogs = (data.logs ?? []) as LogRow[];
        setLogs((prev) => (append ? [...prev, ...newLogs] : newLogs));
        setLogCursor(data.nextCursor ?? null);
        setLogHasMore(!!data.hasMore);
      } catch (e: unknown) {
        setLogsError(e instanceof Error ? e.message : "Unexpected error");
      } finally {
        setLogsLoading(false);
      }
    },
    [user, deploymentId],
  );

  useEffect(() => {
    if (isAdmin && deploymentId) void fetchDeployment();
  }, [isAdmin, deploymentId, fetchDeployment]);

  useEffect(() => {
    if (isAdmin && deploymentId && deployment) {
      void fetchTradesPage(null, false);
    }
  }, [isAdmin, deploymentId, deployment, fetchTradesPage]);

  const runReconcilePnl = async () => {
    if (!user || !deploymentId) return;
    setReconciling(true);
    setPageError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(`/api/admin/bot-deployments/${deploymentId}/reconcile-pnl`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Reconcile failed");
      await fetchDeployment();
      void fetchTradesPage(null, false);
      void fetchLogsPage(null, false);
    } catch (e: unknown) {
      setPageError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setReconciling(false);
    }
  };

  // Re-use the shared resolver (same as user dashboard) so the per-row PnL,
  // cumulative column, and the warning banner all agree. Pass the cached
  // lifetime as the cumulative anchor so per-row running totals stay correct
  // even when only the first page is loaded.
  const sortedTrades = useMemo(() => sortTradesForDashboard(trades), [trades]);
  const cumulativeByTradeId = useMemo(
    () =>
      cumulativeBestPnlByTradeId(
        trades,
        tradesAggregates
          ? { lifetimeRealizedPnl: tradesAggregates.lifetimeRealizedPnl }
          : undefined,
      ),
    [trades, tradesAggregates],
  );
  const showWarningBanner = useMemo(() => anyTradeIsPreliminary(trades), [trades]);

  // Header "Realised P&L" reflects ALL trades for this (uid, exchange). The
  // server returns the cached lifetime alongside the trades page; we fall
  // back to the deployment doc's cached value (same field) and finally to a
  // local sum if the API didn't bootstrap yet.
  const totalRealizedClosed =
    tradesAggregates?.lifetimeRealizedPnl
    ?? deployment?.lifetimeRealizedPnl
    ?? totalClosedPnl(trades);
  const tradeTotalCount =
    tradesAggregates
      ? tradesAggregates.openTradeCount + tradesAggregates.closedTradeCount
      : (deployment?.openTradeCount != null && deployment?.closedTradeCount != null
          ? deployment.openTradeCount + deployment.closedTradeCount
          : null);

  const handleRefreshTrade = useCallback(
    async (tradeId: string) => {
      if (!user || !deploymentId) return;
      try {
        const idToken = await user.getIdToken();
        const res = await fetch(
          `/api/admin/bot-deployments/${deploymentId}/sync-trade`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${idToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ tradeId }),
          },
        );
        // Always refresh so failed reconciles still show updated status.
        await fetchTradesPage(null, false);
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error((data && data.error) ?? `Sync failed (${res.status})`);
        }
      } catch (e: unknown) {
        setTradesError(e instanceof Error ? e.message : "Unexpected error");
      }
    },
    [user, deploymentId, fetchTradesPage],
  );

  const [walletRefreshing, setWalletRefreshing] = useState(false);
  const [walletRefreshError, setWalletRefreshError] = useState("");

  const handleRefreshWallet = useCallback(async () => {
    if (!user || !deploymentId) return;
    setWalletRefreshing(true);
    setWalletRefreshError("");
    try {
      const idToken = await user.getIdToken();
      const res = await fetch(
        `/api/admin/bot-deployments/${deploymentId}/refresh-wallet`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` },
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((data && data.error) ?? `Refresh failed (${res.status})`);
      }
      // The route already persists onto bot_deployments; re-fetch the
      // deployment so the rendered wallet card reflects the new snapshot.
      await fetchDeployment();
      // Invalid-status responses come back with HTTP 200 but ok=false; we
      // surface the error so the admin sees it inline next to the button.
      if (data && data.ok === false && data.error) {
        setWalletRefreshError(String(data.error));
      }
    } catch (e: unknown) {
      setWalletRefreshError(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setWalletRefreshing(false);
    }
  }, [user, deploymentId, fetchDeployment]);

  const runningDays = useMemo(() => {
    if (!deployment?.firstDeployedAt) return 0;
    return Math.floor(
      (Date.now() - new Date(deployment.firstDeployedAt).getTime()) / (1000 * 60 * 60 * 24),
    );
  }, [deployment?.firstDeployedAt]);

  if (isUserLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full border-accent/20 bg-card shadow-2xl">
          <CardHeader className="text-center">
            <ShieldAlert className="h-12 w-12 text-rose-400 mx-auto mb-4" />
            <CardTitle>Access Restricted</CardTitle>
            <CardDescription>This page is only available to administrators.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!deploymentId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <p className="text-muted-foreground">Invalid deployment.</p>
      </div>
    );
  }

  const pnlHeaderColor =
    deployment && deployment.lifetimeRealizedPnl > 0
      ? "text-emerald-400"
      : deployment && deployment.lifetimeRealizedPnl < 0
        ? "text-rose-400"
        : "text-muted-foreground";

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <TopBar />

      <main className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
        <div className="flex flex-col gap-4">
          <Link
            href="/admin/bot-users"
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-accent w-fit"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Bot users
          </Link>

          {depLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
            </div>
          ) : depError ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
              {depError}
            </div>
          ) : deployment ? (
            <>
              <header className="space-y-2">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-accent" />
                  <h1 className="text-2xl font-black text-white tracking-tighter uppercase">
                    {deployment.displayName || "—"}
                  </h1>
                </div>
                <p className="text-sm text-muted-foreground">{deployment.email ?? "—"}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono text-muted-foreground/80">
                  <span>
                    <span className="text-muted-foreground/50 uppercase text-[9px] font-bold">
                      User ID{" "}
                    </span>
                    {deployment.userId}
                  </span>
                  <span>
                    <span className="text-muted-foreground/50 uppercase text-[9px] font-bold">
                      Deployment{" "}
                    </span>
                    {deployment.deploymentId}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <span className="text-sm font-semibold text-white">{deployment.botLabel}</span>
                  <span className="text-xs font-mono text-muted-foreground">{deployment.bot}</span>
                  <span className="text-xs font-mono text-muted-foreground">· {deployment.exchange}</span>
                  <span
                    className={cn(
                      "inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase",
                      deployment.running
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-white/5 text-muted-foreground",
                    )}
                  >
                    {deployment.running ? "Running" : "Stopped"}
                  </span>
                  <span className={cn("text-sm font-mono font-bold", pnlHeaderColor)}>
                    Lifetime: {deployment.lifetimeRealizedPnl >= 0 ? "+" : ""}
                    {deployment.lifetimeRealizedPnl.toLocaleString(undefined, {
                      maximumFractionDigits: 4,
                    })}{" "}
                    {deployment.pnlCurrency}
                  </span>
                </div>
              </header>

              <div className="rounded-xl border border-white/[0.06] bg-gradient-to-b from-[#141416] to-[#0f0f11] p-4 space-y-3">
                <p className="text-[11px] text-muted-foreground leading-snug">{deployment.pnlNote}</p>
                <button
                  type="button"
                  onClick={() => void runReconcilePnl()}
                  disabled={reconciling}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-accent/30 bg-accent/10 text-xs font-bold uppercase tracking-wider text-accent hover:bg-accent/20 disabled:opacity-50"
                >
                  {reconciling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Sync PnL from exchange
                </button>
              </div>
            </>
          ) : null}
        </div>

        {pageError && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {pageError}
          </div>
        )}

        {deployment && (
          <Tabs
            defaultValue="details"
            className="w-full"
            onValueChange={(v) => {
              if (v === "logs" && !logsTabPrimedRef.current) {
                logsTabPrimedRef.current = true;
                void fetchLogsPage(null, false);
              }
            }}
          >
            <TabsList className="bg-white/[0.04] border border-white/10 p-1 h-auto flex-wrap justify-start gap-1">
              <TabsTrigger
                value="details"
                className="text-xs font-bold uppercase tracking-wider data-[state=active]:bg-accent/15 data-[state=active]:text-accent"
              >
                <LayoutList className="h-3.5 w-3.5 mr-1.5" />
                Trade details
              </TabsTrigger>
              <TabsTrigger
                value="logs"
                className="text-xs font-bold uppercase tracking-wider data-[state=active]:bg-accent/15 data-[state=active]:text-accent"
              >
                <ScrollText className="h-3.5 w-3.5 mr-1.5" />
                Trade execution logs
              </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-4 space-y-4">
              {/* Exchange connection panel — proves the deployment's API
                  keys still work and shows the wallet's live balance.
                  Cron refreshes every ~5 minutes; the button forces an
                  immediate refresh via the admin refresh-wallet route. */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.12)" }}
              >
                <div
                  className="flex items-center justify-between px-5 py-3"
                  style={{ borderBottom: "1px solid rgba(90,140,220,0.08)" }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor:
                          deployment.wallet?.status === "valid"
                            ? "#22c55e"
                            : deployment.wallet?.status === "invalid"
                              ? "#ef4444"
                              : "#64748b",
                        boxShadow:
                          deployment.wallet?.status === "valid"
                            ? "0 0 6px #22c55e"
                            : deployment.wallet?.status === "invalid"
                              ? "0 0 6px #ef4444"
                              : "none",
                      }}
                    />
                    <span
                      className="text-sm font-black"
                      style={{
                        color:
                          deployment.wallet?.status === "valid"
                            ? "#22c55e"
                            : deployment.wallet?.status === "invalid"
                              ? "#f87171"
                              : "#94a3b8",
                      }}
                    >
                      {deployment.wallet?.status === "valid"
                        ? "Connection valid"
                        : deployment.wallet?.status === "invalid"
                          ? "Connection invalid"
                          : "Connection not checked"}
                    </span>
                    <span className="text-xs" style={{ color: "#334155" }}>
                      ·
                    </span>
                    <span className="text-xs font-medium" style={{ color: "#475569" }}>
                      {deployment.wallet?.checkedAt
                        ? `Checked ${format(new Date(deployment.wallet.checkedAt), "MMM d, h:mm a")}`
                        : "Never checked"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRefreshWallet()}
                    disabled={walletRefreshing}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                    style={{
                      borderColor: "rgba(90,140,220,0.18)",
                      color: "#cbd5e1",
                      backgroundColor: "rgba(255,255,255,0.02)",
                    }}
                  >
                    {walletRefreshing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Refresh
                  </button>
                </div>
                {deployment.running && deployment.autoTradeEnabled === false && (
                  <p
                    className="mx-5 mt-4 px-4 py-3 rounded-xl text-xs"
                    style={{
                      backgroundColor: "rgba(234,179,8,0.08)",
                      border: "1px solid rgba(234,179,8,0.25)",
                      color: "#fbbf24",
                    }}
                  >
                    Deployment shows RUNNING but live mirroring is OFF (auto-trade disabled —
                    often after the daily loss kill switch). Re-enable from FreedomBot or exchange
                    settings to receive new signals.
                  </p>
                )}
                <div className="grid grid-cols-2">
                  {[
                    {
                      label: "Wallet balance",
                      value:
                        deployment.wallet?.status === "valid" && deployment.wallet.total != null
                          ? `${deployment.wallet.total.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${deployment.wallet.currency}`
                          : deployment.wallet?.status === "invalid"
                            ? "—"
                            : "—",
                      color:
                        deployment.wallet?.status === "valid"
                          ? "#34d399"
                          : deployment.wallet?.status === "invalid"
                            ? "#f87171"
                            : "#94a3b8",
                    },
                    {
                      label: "Available",
                      value:
                        deployment.wallet?.status === "valid" && deployment.wallet.available != null
                          ? `${deployment.wallet.available.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${deployment.wallet.currency}`
                          : "—",
                      color: "#cbd5e1",
                    },
                  ].map((s, i) => (
                    <div
                      key={s.label}
                      className="px-5 py-4"
                      style={{ borderRight: i < 1 ? "1px solid rgba(90,140,220,0.08)" : "none" }}
                    >
                      <p
                        className="text-[10px] font-bold uppercase tracking-widest mb-1"
                        style={{ color: "#334155" }}
                      >
                        {s.label}
                      </p>
                      <p className="text-2xl font-black" style={{ color: s.color }}>
                        {s.value}
                      </p>
                    </div>
                  ))}
                </div>
                {(deployment.wallet?.status === "invalid" || walletRefreshError) && (
                  <div
                    className="px-5 py-3 text-xs"
                    style={{
                      borderTop: "1px solid rgba(90,140,220,0.08)",
                      color: "#fda4af",
                      backgroundColor: "rgba(244,63,94,0.04)",
                    }}
                  >
                    {walletRefreshError ||
                      deployment.wallet?.error ||
                      "Exchange rejected the credentials. Check that the API key, secret and IP allowlist are still valid."}
                  </div>
                )}
              </div>

              {deployment.tradingPrefs && (
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.12)" }}
                >
                  <div
                    className="flex items-center gap-2 px-5 py-3"
                    style={{ borderBottom: "1px solid rgba(90,140,220,0.08)" }}
                  >
                    <Shield className="h-4 w-4" style={{ color: "#60a5fa" }} />
                    <span className="text-sm font-black" style={{ color: "#e2e8f0" }}>
                      Risk &amp; sizing (user settings)
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4">
                    {[
                      {
                        label: "Risk / trade",
                        value: `${deployment.tradingPrefs.riskPerTrade}%`,
                        color: "#f0f4ff",
                      },
                      {
                        label: "Max open",
                        value: String(deployment.tradingPrefs.maxConcurrentTrades),
                        color: "#60a5fa",
                      },
                      {
                        label: "Daily loss cap",
                        value: `${deployment.tradingPrefs.dailyLossLimit}%`,
                        color: "#fbbf24",
                      },
                      {
                        label: "Auto-trade",
                        value:
                          deployment.autoTradeEnabled === true
                            ? "On"
                            : deployment.autoTradeEnabled === false
                              ? "Off"
                              : "—",
                        color:
                          deployment.autoTradeEnabled === true ? "#34d399" : "#f87171",
                      },
                    ].map((s, i, arr) => (
                      <div
                        key={s.label}
                        className="px-5 py-4"
                        style={{
                          borderRight:
                            i < arr.length - 1 ? "1px solid rgba(90,140,220,0.08)" : "none",
                        }}
                      >
                        <p
                          className="text-[10px] font-bold uppercase tracking-widest mb-1"
                          style={{ color: "#334155" }}
                        >
                          {s.label}
                        </p>
                        <p className="text-2xl font-black" style={{ color: s.color }}>
                          {s.value}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p
                    className="px-5 py-3 text-[11px]"
                    style={{ color: "#64748b", borderTop: "1px solid rgba(90,140,220,0.08)" }}
                  >
                    Set by the user in FreedomBot Bot Settings. Read-only here.
                  </p>
                </div>
              )}

              <div
                className="rounded-2xl overflow-hidden"
                style={{ backgroundColor: "#0a1628", border: "1px solid rgba(90,140,220,0.12)" }}
              >
                <div
                  className="flex items-center justify-between px-5 py-3"
                  style={{ borderBottom: "1px solid rgba(90,140,220,0.08)" }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: deployment.running ? "#22c55e" : "#64748b",
                        boxShadow: deployment.running ? "0 0 6px #22c55e" : "none",
                      }}
                    />
                    <span
                      className="text-sm font-black"
                      style={{ color: deployment.running ? "#22c55e" : "#94a3b8" }}
                    >
                      {deployment.running ? "Live" : "Stopped"}
                    </span>
                    <span className="text-xs" style={{ color: "#334155" }}>
                      ·
                    </span>
                    <span className="text-xs font-medium" style={{ color: "#475569" }}>
                      {deployment.exchange}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-3">
                  {[
                    {
                      label: "Running",
                      value: `${runningDays} ${runningDays === 1 ? "Day" : "Days"}`,
                      color: "#f0f4ff",
                    },
                    {
                      label: "Trades",
                      value:
                        tradeTotalCount != null && tradeTotalCount !== trades.length
                          ? `${trades.length} / ${tradeTotalCount}`
                          : String(tradeTotalCount ?? trades.length),
                      color: "#60a5fa",
                    },
                    {
                      label: "Realised P&L",
                      value: `${totalRealizedClosed >= 0 ? "+" : ""}$${Math.abs(totalRealizedClosed).toFixed(2)}`,
                      color: totalRealizedClosed >= 0 ? "#34d399" : "#f87171",
                    },
                  ].map((s, i) => (
                    <div
                      key={s.label}
                      className="px-5 py-4"
                      style={{ borderRight: i < 2 ? "1px solid rgba(90,140,220,0.08)" : "none" }}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#334155" }}>
                        {s.label}
                      </p>
                      <p className="text-2xl font-black flex items-center gap-2" style={{ color: s.color }}>
                        {i === 2 && tradesLoading && trades.length === 0 ? (
                          <Loader2 className="h-6 w-6 animate-spin shrink-0" style={{ color: "#64748b" }} />
                        ) : null}
                        {s.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {tradesError && (
                <p className="text-sm text-rose-400">{tradesError}</p>
              )}

              <TradesPanel
                trades={sortedTrades}
                cumulativeByTradeId={cumulativeByTradeId}
                showWarningBanner={showWarningBanner}
                isInitiallyLoading={tradesLoading}
                onRefreshTrade={handleRefreshTrade}
                onLoadMore={() => void fetchTradesPage(tradeCursor, true)}
                hasMore={tradeHasMore}
                loadingMore={tradesLoading}
                loadMoreLabel={
                  tradeTotalCount != null
                    ? `Load more (${Math.min(50, tradeTotalCount - trades.length)} of ${tradeTotalCount - trades.length} remaining)`
                    : "Load more (50)"
                }
                emptyTitle="No trades yet"
                emptySubtitle="Trades will appear here once this user's bot starts placing orders"
              />
            </TabsContent>

            <TabsContent value="logs" className="mt-4 space-y-3">
              <div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 mb-1 flex items-center gap-2">
                  <ScrollText className="h-3.5 w-3.5 text-accent/80" />
                  Execution logs
                </h3>
                <p className="text-[10px] text-muted-foreground/80 mb-2 max-w-3xl">
                  Live engine events for this user and venue (
                  <span className="font-mono">{deployment.exchange}</span>) from{" "}
                  <span className="font-mono">live_trade_logs</span> — opens, closes, failures, and sync messages.
                  Newest first.
                </p>
                {logsError && <p className="text-sm text-rose-400 mb-2">{logsError}</p>}
                {logsLoading && logs.length === 0 && (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-accent" />
                  </div>
                )}
                {logs.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-white/[0.06] max-h-[min(520px,55vh)] overflow-y-auto">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 z-[1] bg-[#121214] border-b border-white/[0.06]">
                        <tr className="text-left text-[9px] font-black uppercase tracking-wider text-muted-foreground/60">
                          <th className="px-2 py-2 whitespace-nowrap">Time</th>
                          <th className="px-2 py-2">Action</th>
                          <th className="px-2 py-2">Symbol</th>
                          <th className="px-2 py-2 min-w-[200px]">Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map((row) => {
                          const action = row.action.toUpperCase();
                          const actionClass =
                            action.includes("FAIL") || action.includes("REJECT")
                              ? "text-rose-400"
                              : action.includes("OPEN") || action.includes("TP") || action === "SL_HIT"
                                ? "text-emerald-400/90"
                                : action.includes("SKIP") || action.includes("EVAL")
                                  ? "text-amber-400/80"
                                  : "text-muted-foreground";
                          return (
                            <tr
                              key={row.id}
                              className="border-b border-white/[0.04] last:border-0 align-top hover:bg-white/[0.02]"
                            >
                              <td className="px-2 py-2 font-mono text-muted-foreground whitespace-nowrap">
                                {row.timestamp ? format(new Date(row.timestamp), "MMM d HH:mm:ss") : "—"}
                              </td>
                              <td className={cn("px-2 py-2 font-bold uppercase text-[10px]", actionClass)}>
                                {row.action}
                              </td>
                              <td className="px-2 py-2 font-mono text-white/80">{row.symbol ?? "—"}</td>
                              <td className="px-2 py-2 text-muted-foreground break-words max-w-xl">
                                {row.details}
                                {row.signalId ? (
                                  <span className="block mt-0.5 text-[9px] font-mono text-muted-foreground/50">
                                    signal: {row.signalId}
                                  </span>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {!logsLoading && !logsError && logs.length === 0 && (
                  <p className="text-sm text-muted-foreground py-3">
                    No log rows for this user and exchange yet (or index still deploying — check Firebase console).
                  </p>
                )}
                {logHasMore && (
                  <button
                    type="button"
                    disabled={logsLoading}
                    onClick={() => void fetchLogsPage(logCursor, true)}
                    className="mt-2 w-full sm:w-auto px-4 py-2 rounded-lg border border-white/10 bg-white/[0.04] text-xs font-bold uppercase tracking-wider text-accent hover:bg-white/[0.08] disabled:opacity-50"
                  >
                    {logsLoading ? "Loading…" : "More logs (50)"}
                  </button>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
