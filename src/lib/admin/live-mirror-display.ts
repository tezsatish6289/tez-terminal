/**
 * Admin DTOs for live trades mirrored from open simulator positions.
 */
import { bestRealizedPnl } from "@/lib/freedombot/compute-best-pnl";
import type { Trade } from "@/lib/freedombot/trade-display";

export interface LiveMirrorTrade extends Trade {
  simTradeId: string;
  userId: string;
  email: string | null;
  displayName: string | null;
  deploymentId: string | null;
}

export function liveDocToMirrorTrade(
  docId: string,
  t: Record<string, unknown>,
  user: { email: string | null; displayName: string | null },
  deploymentId: string | null,
): LiveMirrorTrade {
  const isOpen = t.status === "OPEN";
  const internal = Number(t.realizedPnl ?? 0);
  const ex =
    typeof t.exchangeRealizedPnl === "number" && !Number.isNaN(t.exchangeRealizedPnl)
      ? Number(t.exchangeRealizedPnl)
      : null;
  const ov =
    typeof t.exchangeRealizedPnlOverride === "number" &&
    !Number.isNaN(t.exchangeRealizedPnlOverride)
      ? Number(t.exchangeRealizedPnlOverride)
      : null;
  const best = !isOpen ? bestRealizedPnl(t) : null;
  const unrealized =
    typeof t.unrealizedPnl === "number" && isOpen ? Number(t.unrealizedPnl) : 0;

  return {
    id: docId,
    simTradeId: String(t.simTradeId ?? ""),
    userId: String(t.userId ?? ""),
    email: user.email,
    displayName: user.displayName,
    deploymentId,
    exchange: (t.exchange as string) ?? null,
    symbol: (t.signalSymbol ?? t.symbol ?? "—") as string,
    side: t.side === "BUY" ? "LONG" : t.side === "SELL" ? "SHORT" : String(t.side ?? "—"),
    status: isOpen ? "open" : "closed",
    realizedPnl: best?.value ?? internal,
    realizedPnlSource: best?.source ?? null,
    realizedPnlInternal: internal,
    realizedPnlExchange: ex,
    exchangeRealizedPnlOverride: ov,
    exchangePnlReconciledAt: (t.exchangePnlReconciledAt as string) ?? null,
    unrealizedPnl: unrealized,
    positionSize: (t.positionSize as number) ?? null,
    leverage: (t.leverage as number) ?? 1,
    entryPrice: (t.entryPrice as number) ?? null,
    currentPrice: (t.exchangeAvgExitPrice as number) ?? (t.currentPrice as number) ?? null,
    capitalAtEntry: (t.capitalAtEntry as number) ?? null,
    blockchainTxHash: (t.blockchainTxHash as string) ?? null,
    openedAt: (t.openedAt as string) ?? null,
    closedAt: (t.closedAt as string) ?? null,
  };
}

export interface ExchangeMirrorSummary {
  exchange: string;
  count: number;
  users: Array<{
    userId: string;
    email: string | null;
    displayName: string | null;
    deploymentId: string | null;
    trades: LiveMirrorTrade[];
  }>;
}

export function buildExchangeSummary(mirrors: LiveMirrorTrade[]): ExchangeMirrorSummary[] {
  const byEx = new Map<string, LiveMirrorTrade[]>();
  for (const m of mirrors) {
    const ex = String(m.exchange ?? "UNKNOWN").toUpperCase();
    const list = byEx.get(ex) ?? [];
    list.push(m);
    byEx.set(ex, list);
  }

  return [...byEx.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([exchange, trades]) => {
      const byUser = new Map<string, LiveMirrorTrade[]>();
      for (const t of trades) {
        const list = byUser.get(t.userId) ?? [];
        list.push(t);
        byUser.set(t.userId, list);
      }
      const users = [...byUser.entries()].map(([userId, userTrades]) => ({
        userId,
        email: userTrades[0]?.email ?? null,
        displayName: userTrades[0]?.displayName ?? null,
        deploymentId: userTrades[0]?.deploymentId ?? null,
        trades: userTrades,
      }));
      users.sort((a, b) =>
        (a.displayName ?? a.email ?? a.userId).localeCompare(
          b.displayName ?? b.email ?? b.userId,
        ),
      );
      return { exchange, count: trades.length, users };
    });
}
