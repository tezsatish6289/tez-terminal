"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import {
  Loader2,
  Settings,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { useUser } from "@/firebase";
import { trackCtaClick } from "@/firebase/analytics";
import { usePublicBots } from "@/hooks/use-public-bots";
import { CRYPTO_BOTS } from "@/lib/crypto-bots";
import { freedombotDashboardBase, freedombotHomePath } from "@/lib/freedombot/dashboard-path";
import { exchangeLabel } from "@/components/freedombot/dashboard/exchange-labels";
import { BotExchangeIcons } from "@/components/freedombot/dashboard/BotExchangeIcons";
import {
  BotSettings,
  type DeploymentWallet,
  type SettingsDeployment,
} from "@/app/freedombot/components/BotSettings";
import type { TradingPrefs } from "@/lib/freedombot/trading-prefs-shared";
import { toast } from "@/hooks/use-toast";
import { TradesPanel } from "@/components/freedombot/TradesPanel";
import {
  type Trade,
  anyTradeIsPreliminary,
  cumulativeBestPnlByTradeId,
  sortTradesForDashboard,
} from "@/lib/freedombot/trade-display";
import { tradeMatchesDeployBot } from "@/lib/freedombot/trade-bot-match";
import { FB_COMPACT_SHELL, FB_DASHBOARD_DETAIL_SHELL } from "@/lib/freedombot/responsive";

interface Deployment {
  id: string;
  bot: string;
  exchange: string;
  status: "active" | "paused";
  keyLastFour?: string | null;
  createdAt: string | null;
  pausedAt?: string | null;
  wallet?: DeploymentWallet | null;
  tradingPrefs?: TradingPrefs;
  lifetimeRealizedPnl?: number;
  openTradeCount?: number;
  closedTradeCount?: number;
}

const FREEDOMBOT_CRYPTO_EXCHANGES = ["BYBIT", "COINDCX", "HYPERLIQUID"] as const;

function tradeMatchesDeployment(t: Trade, dep: Deployment): boolean {
  if (t.exchange && t.exchange !== dep.exchange) return false;
  if (t.exchange == null && dep.exchange !== "BYBIT") return false;
  return tradeMatchesDeployBot(t, dep.bot);
}

function runningDays(createdAt: string | null): number {
  if (!createdAt) return 1;
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, days);
}

function botLabel(deployKey: string, publicBots: ReturnType<typeof usePublicBots>["bots"]): string {
  const fromRegistry = publicBots.find((b) => b.deployKey === deployKey);
  if (fromRegistry) return fromRegistry.label;
  const fromCatalog = CRYPTO_BOTS.find((b) => b.deployKey === deployKey);
  return fromCatalog?.label ?? deployKey;
}

export default function BotDetailPage() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const deploymentId = String(params.deploymentId ?? "");
  const dashboardHref = freedombotDashboardBase(pathname);

  const { user, isUserLoading } = useUser();
  const { bots: publicBots } = usePublicBots();

  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [deploymentsLoading, setDeploymentsLoading] = useState(true);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradesAggregates, setTradesAggregates] = useState<{
    lifetimeRealizedPnl: number;
    openTradeCount: number;
    closedTradeCount: number;
  } | null>(null);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const TRADES_PAGE_SIZE = 25;
  const [tradePage, setTradePage] = useState(1);

  const lastFetchExchangeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.replace(freedombotHomePath(pathname));
    }
  }, [user, isUserLoading, router, pathname]);

  useEffect(() => {
    document.title = "FreedomBot.ai — Bot trades";
  }, []);

  const fetchDeployment = useCallback(async () => {
    if (!user) return;
    setDeploymentsLoading(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/freedombot/my-deployment", {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      const list: Deployment[] = Array.isArray(data.deployments) ? data.deployments : [];
      const hit = list.find((d) => d.id === deploymentId) ?? null;
      setDeployment(hit);
    } catch {
      setDeployment(null);
    } finally {
      setDeploymentsLoading(false);
    }
  }, [user, deploymentId]);

  const fetchUserTrades = useCallback(
    async (exchangeForReconcile: string | null, withReconcile = true) => {
      if (!user) return;
      const exU = exchangeForReconcile?.trim().toUpperCase() ?? "";
      lastFetchExchangeRef.current = exU || null;
      if (withReconcile) setTradesLoading(true);
      try {
        const idToken = await user.getIdToken();
        const params = new URLSearchParams();
        const isCryptoTab =
          exU.length > 0 &&
          FREEDOMBOT_CRYPTO_EXCHANGES.includes(
            exU as (typeof FREEDOMBOT_CRYPTO_EXCHANGES)[number],
          );
        if (isCryptoTab) params.set("exchange", exU);
        params.set("deploymentId", deploymentId);
        if (withReconcile && isCryptoTab) params.set("reconcile", "1");
        const qs = params.toString();
        const res = await fetch(`/api/freedombot/my-trades${qs ? `?${qs}` : ""}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const data = await res.json();
        if (lastFetchExchangeRef.current !== (exU || null)) return;
        setTrades(data.trades ?? []);
        setTradesAggregates(
          data.aggregates && typeof data.aggregates.lifetimeRealizedPnl === "number"
            ? {
                lifetimeRealizedPnl: data.aggregates.lifetimeRealizedPnl,
                openTradeCount: data.aggregates.openTradeCount ?? 0,
                closedTradeCount: data.aggregates.closedTradeCount ?? 0,
              }
            : null,
        );
      } catch {
        if (lastFetchExchangeRef.current !== (exU || null)) return;
      } finally {
        if (withReconcile && lastFetchExchangeRef.current === (exU || null)) {
          setTradesLoading(false);
        }
      }
    },
    [user, deploymentId],
  );

  useEffect(() => {
    void fetchDeployment();
  }, [fetchDeployment]);

  useEffect(() => {
    if (!user || !deployment) return;
    const ex = deployment.exchange;
    void fetchUserTrades(ex, false);
    const crypto = FREEDOMBOT_CRYPTO_EXCHANGES.includes(
      ex.toUpperCase() as (typeof FREEDOMBOT_CRYPTO_EXCHANGES)[number],
    );
    if (!crypto) return;
    const id = requestAnimationFrame(() => {
      void fetchUserTrades(ex, true);
    });
    return () => cancelAnimationFrame(id);
  }, [user, deployment?.id, deployment?.exchange, fetchUserTrades]);

  const { dashboardTrades, cumulativeByTradeId } = useMemo(() => {
    const list = !deployment ? trades : trades.filter((t) => tradeMatchesDeployment(t, deployment));
    const anchor = tradesAggregates
      ? { lifetimeRealizedPnl: tradesAggregates.lifetimeRealizedPnl }
      : undefined;
    return {
      dashboardTrades: sortTradesForDashboard(list),
      cumulativeByTradeId: cumulativeBestPnlByTradeId(list, anchor),
    };
  }, [trades, deployment, tradesAggregates]);

  const tradePageCount = Math.max(1, Math.ceil(dashboardTrades.length / TRADES_PAGE_SIZE));
  const currentTradePage = Math.min(tradePage, tradePageCount);
  const pagedTrades = dashboardTrades.slice(
    (currentTradePage - 1) * TRADES_PAGE_SIZE,
    currentTradePage * TRADES_PAGE_SIZE,
  );

  useEffect(() => {
    setTradePage((p) => Math.min(Math.max(1, p), tradePageCount));
  }, [tradePageCount, deploymentId]);

  const handleSettingsMutated = useCallback(() => {
    void fetchDeployment();
    if (deployment) void fetchUserTrades(deployment.exchange, false);
  }, [fetchDeployment, fetchUserTrades, deployment]);

  if (isUserLoading || deploymentsLoading) {
    return (
      <div className="min-h-[50dvh] flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#3b82f6" }} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[50dvh] flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#3b82f6" }} />
      </div>
    );
  }

  if (!deployment) {
    return (
      <div className={`${FB_COMPACT_SHELL} py-12 min-w-0`}>
        <div className="max-w-lg mx-auto text-center space-y-4">
          <p className="text-lg font-black">Bot not found</p>
          <p className="text-sm" style={{ color: "#64748b" }}>
            This deployment may have been removed or you don&apos;t have access.
          </p>
          <Link
            href={dashboardHref}
            className="inline-flex items-center gap-2 text-sm font-bold"
            style={{ color: "#60a5fa" }}
          >
            <ArrowLeft className="h-4 w-4" /> Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const label = botLabel(deployment.bot, publicBots);
  const exchangeName = exchangeLabel(deployment.exchange);
  const botForIcons = publicBots.find((b) => b.deployKey === deployment.bot) ?? {
    id: "crypto" as const,
    label,
    shortLabel: deployment.bot,
    deployKey: deployment.bot,
    botSource: "",
    icon: "₿",
    logo: null,
    publicLive: true,
  };
  const days = runningDays(deployment.createdAt);
  const totalPnl = tradesAggregates?.lifetimeRealizedPnl ?? deployment.lifetimeRealizedPnl ?? 0;
  const pnlPositive = totalPnl >= 0;
  const isPaused = deployment.status === "paused";
  const isDisconnected = deployment.wallet?.status === "invalid";
  const hasUnverifiedPnl = anyTradeIsPreliminary(dashboardTrades);

  const statusMeta = isDisconnected
    ? { label: "Disconnected", color: "#f87171", bg: "rgba(248,113,113,0.1)", border: "rgba(248,113,113,0.25)" }
    : isPaused
      ? { label: "Paused", color: "#fbbf24", bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.25)" }
      : { label: "Running", color: "#22c55e", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.25)" };

  return (
    <>
    <div className={`${FB_DASHBOARD_DETAIL_SHELL} py-4 sm:py-6 space-y-4 min-w-0`}>
        <Link
          href={dashboardHref}
          className="inline-flex items-center gap-2 text-xs font-bold transition-colors hover:text-white"
          style={{ color: "#64748b" }}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </Link>

        <div
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: "#0c1a30", border: "1px solid rgba(59,130,246,0.35)" }}
        >
          <div
            className="flex items-start justify-between px-5 py-5 gap-4"
            style={{ borderBottom: "1px solid rgba(90,140,220,0.08)" }}
          >
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <BotExchangeIcons bot={botForIcons} exchange={deployment.exchange} size={48} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1
                    className="text-xl font-black text-white truncate"
                    title={`${label} on ${exchangeName}`}
                  >
                    {label}
                  </h1>
                  <span
                    className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{
                      color: statusMeta.color,
                      backgroundColor: statusMeta.bg,
                      border: `1px solid ${statusMeta.border}`,
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full animate-pulse"
                      style={{
                        backgroundColor: statusMeta.color,
                        boxShadow: `0 0 6px ${statusMeta.color}`,
                      }}
                    />
                    {statusMeta.label}
                  </span>
                </div>
                <p className="text-sm font-semibold mt-0.5 truncate" style={{ color: "#64748b" }}>
                  {exchangeName}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  trackCtaClick("fb_dashboard_bot_settings", { label: "Settings", bot: deployment.bot, exchange: deployment.exchange });
                  setSettingsOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all hover:scale-105"
                style={{
                  backgroundColor: "rgba(90,140,220,0.08)",
                  color: "#94a3b8",
                  border: "1px solid rgba(90,140,220,0.18)",
                }}
              >
                <Settings className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Settings</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 px-5 py-5">
            <div>
              <p
                className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
                style={{ color: "#334155" }}
              >
                Running
              </p>
              <p className="text-2xl sm:text-3xl font-black" style={{ color: "#f0f4ff" }}>
                {days} {days === 1 ? "Day" : "Days"}
              </p>
            </div>
            <div>
              <p
                className="text-[10px] font-bold uppercase tracking-widest mb-1.5"
                style={{ color: "#334155" }}
              >
                Cumulative Net P&amp;L
              </p>
              <p
                className="text-2xl sm:text-3xl font-black font-mono"
                style={{ color: pnlPositive ? "#34d399" : "#f87171" }}
              >
                {pnlPositive ? "+" : "−"}${Math.abs(totalPnl).toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        <TradesPanel
          trades={pagedTrades}
          cumulativeByTradeId={cumulativeByTradeId}
          showWarningBanner={hasUnverifiedPnl}
          isInitiallyLoading={tradesLoading}
          onRefreshTrade={async (tradeId) => {
            const idToken = await user.getIdToken();
            const res = await fetch("/api/freedombot/sync-trade", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
              body: JSON.stringify({ tradeId }),
            });
            const data = (await res.json()) as {
              error?: string;
              pnlReconciled?: boolean;
              reason?: string;
              status?: string;
              residualOrdersPendingCleanup?: boolean;
            };
            if (!res.ok) {
              toast({
                variant: "destructive",
                title: "Sync failed",
                description: data.error ?? `HTTP ${res.status}`,
              });
            } else if (data.status === "closed_now" && data.pnlReconciled === true) {
              toast({
                title: "Trade closed & P&L synced",
                description: `The exchange position was already closed. We've cleaned up any leftover orders and pulled the realized P&L.${data.residualOrdersPendingCleanup ? " (Some leftover orders will be cleared on the next cycle.)" : ""}`,
              });
            } else if (data.status === "closed_now" && data.pnlReconciled === false) {
              toast({
                title: "Trade closed — P&L pending",
                description:
                  "The exchange position was closed and any leftover orders were cancelled. The realized P&L is not yet indexed by the exchange and will be filled in automatically within a minute.",
              });
            } else if (data.pnlReconciled === false && data.reason) {
              toast({
                variant: "destructive",
                title: "Exchange P&L not available yet",
                description:
                  data.reason === "no_closed_pnl_rows_in_window"
                    ? "The exchange hasn't returned a realized-P&L row for this exit yet (typical lag is a few seconds, sometimes a minute). It will fill in automatically — or click refresh again shortly."
                    : String(data.reason),
              });
            } else if (data.pnlReconciled === true) {
              toast({ title: "P&L synced", description: "Updated from the exchange." });
            }
            await fetchUserTrades(deployment.exchange, true);
            void fetchDeployment();
          }}
          emptyTitle="No trades yet"
          emptySubtitle="Trades will appear here once your bot starts placing orders"
        />

        {dashboardTrades.length > TRADES_PAGE_SIZE && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl"
            style={{
              backgroundColor: "#060d1a",
              border: "1px solid rgba(90,140,220,0.12)",
            }}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#475569" }}>
              Showing {(currentTradePage - 1) * TRADES_PAGE_SIZE + 1}
              {"–"}
              {Math.min(currentTradePage * TRADES_PAGE_SIZE, dashboardTrades.length)} of{" "}
              {dashboardTrades.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentTradePage <= 1}
                onClick={() => setTradePage((p) => Math.max(1, p - 1))}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/[0.06]"
                style={{ color: "#94a3b8", border: "1px solid rgba(90,140,220,0.15)" }}
              >
                <ChevronLeft className="h-4 w-4" /> Prev
              </button>
              <span className="text-xs font-mono font-bold tabular-nums" style={{ color: "#64748b" }}>
                {currentTradePage} / {tradePageCount}
              </span>
              <button
                type="button"
                disabled={currentTradePage >= tradePageCount}
                onClick={() => setTradePage((p) => Math.min(tradePageCount, p + 1))}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/[0.06]"
                style={{ color: "#94a3b8", border: "1px solid rgba(90,140,220,0.15)" }}
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <BotSettings
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        user={user}
        deployment={
          {
            id: deployment.id,
            bot: deployment.bot,
            exchange: deployment.exchange,
            status: deployment.status,
            keyLastFour: deployment.keyLastFour ?? null,
            wallet: deployment.wallet ?? null,
            tradingPrefs: deployment.tradingPrefs,
            createdAt: deployment.createdAt,
          } satisfies SettingsDeployment
        }
        botLabel={label}
        exchangeLabel={exchangeLabel(deployment.exchange)}
        openTradesCount={
          tradesAggregates?.openTradeCount ??
          trades.filter(
            (t) =>
              tradeMatchesDeployment(t, deployment) &&
              (t.status === "OPEN" || t.status === "open"),
          ).length
        }
        lifetimeRealizedPnl={tradesAggregates?.lifetimeRealizedPnl ?? deployment.lifetimeRealizedPnl ?? null}
        onMutated={handleSettingsMutated}
      />
    </>
  );
}
