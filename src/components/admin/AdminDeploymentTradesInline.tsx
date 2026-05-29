"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "firebase/auth";
import { TradesPanel } from "@/components/freedombot/TradesPanel";
import {
  type Trade,
  anyTradeIsPreliminary,
  cumulativeBestPnlByTradeId,
  sortTradesForDashboard,
} from "@/lib/freedombot/trade-display";

interface TradesAggregates {
  lifetimeRealizedPnl: number;
  openTradeCount: number;
  closedTradeCount: number;
}

interface AdminDeploymentTradesInlineProps {
  deploymentId: string;
  user: User;
  active: boolean;
  lifetimeRealizedPnl?: number;
  closedTradeCount?: number;
  openTradeCount?: number;
}

export function AdminDeploymentTradesInline({
  deploymentId,
  user,
  active,
  lifetimeRealizedPnl,
  closedTradeCount,
  openTradeCount,
}: AdminDeploymentTradesInlineProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradeCursor, setTradeCursor] = useState<string | null>(null);
  const [tradeHasMore, setTradeHasMore] = useState(false);
  const [tradesAggregates, setTradesAggregates] = useState<TradesAggregates | null>(null);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [tradesError, setTradesError] = useState("");

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
        if (!append && data.aggregates && typeof data.aggregates.lifetimeRealizedPnl === "number") {
          setTradesAggregates({
            lifetimeRealizedPnl: data.aggregates.lifetimeRealizedPnl,
            openTradeCount: data.aggregates.openTradeCount ?? 0,
            closedTradeCount: data.aggregates.closedTradeCount ?? 0,
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

  useEffect(() => {
    if (active) {
      void fetchTradesPage(null, false);
      return;
    }
    setTrades([]);
    setTradeCursor(null);
    setTradeHasMore(false);
    setTradesAggregates(null);
    setTradesError("");
  }, [active, deploymentId, fetchTradesPage]);

  const handleRefreshTrade = useCallback(
    async (tradeId: string) => {
      if (!user || !deploymentId) return;
      try {
        const idToken = await user.getIdToken();
        const res = await fetch(`/api/admin/bot-deployments/${deploymentId}/sync-trade`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tradeId }),
        });
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
  const tradeTotalCount =
    tradesAggregates != null
      ? tradesAggregates.openTradeCount + tradesAggregates.closedTradeCount
      : closedTradeCount != null && openTradeCount != null
        ? openTradeCount + closedTradeCount
        : null;

  if (!active) return null;

  return (
    <div className="px-4 py-3 bg-black/25 border-t border-white/[0.04]">
      {tradesError ? <p className="text-sm text-rose-400 mb-2">{tradesError}</p> : null}
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
        emptySubtitle="Trades will appear here once this bot starts placing orders"
      />
    </div>
  );
}
