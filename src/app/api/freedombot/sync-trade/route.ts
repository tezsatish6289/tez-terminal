/**
 * /api/freedombot/sync-trade?tradeId=xxx
 *
 * Checks a single live_trade against the exchange in real time:
 *  - If the position is still open → updates unrealized PnL from mark price.
 *  - If the position is closed on exchange but Firestore still shows OPEN →
 *    fetches the realized PnL, marks the trade CLOSED, and sets exit price.
 *
 * Supported exchanges: any that implement getPosition + getClosedPnl
 * (currently Bybit and CoinDCX).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/firebase/admin";
import {
  loadCryptoCredentials,
  computeClosedTradeExchangePnlMetrics,
  selectClosedPnlRecordsForTrade,
  bybitReconcileOrderIdsFromLiveTrade,
  EXCHANGE_PNL_PRE_OPEN_LOOKBACK_MS,
} from "@/lib/freedombot/reconcile-exchange-pnl";
import {
  getConnector,
  type ExchangeName,
} from "@/lib/exchanges";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const { tradeId } = await req.json() as { tradeId?: string };
    if (!tradeId) return NextResponse.json({ error: "tradeId required" }, { status: 400 });

    const db = getAdminFirestore();

    // Load the trade doc and verify ownership
    const tradeDoc = await db.collection("live_trades").doc(tradeId).get();
    if (!tradeDoc.exists) return NextResponse.json({ error: "Trade not found" }, { status: 404 });

    const t = tradeDoc.data()!;
    if (t.userId !== uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (t.testnet !== false) return NextResponse.json({ error: "Testnet trade" }, { status: 400 });

    const exchange = (t.exchange ?? "BYBIT") as ExchangeName;
    const symbol = String(t.signalSymbol ?? t.symbol ?? "");
    if (!symbol) return NextResponse.json({ error: "No symbol on trade" }, { status: 400 });

    // Load exchange credentials
    const creds = await loadCryptoCredentials(db, uid, exchange);
    if (!creds) return NextResponse.json({ error: "No credentials found" }, { status: 400 });

    const connector = getConnector(exchange);
    const normalizedSymbol = connector.normalizeSymbol(symbol);
    const nowIso = new Date().toISOString();
    const tradeWindowOpts = {
      tradeSide: (String(t.side ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY") as "BUY" | "SELL",
      matchAnyOrderId:
        exchange === "BYBIT"
          ? bybitReconcileOrderIdsFromLiveTrade(t as Record<string, unknown>)
          : undefined,
    };

    // ── Case 1: trade already CLOSED in Firestore — reconcile PnL only ──────
    if (t.status === "CLOSED") {
      if (typeof connector.getClosedPnl !== "function") {
        return NextResponse.json({ status: "closed", pnlReconciled: false, reason: "exchange_no_closed_pnl_api" });
      }
      const openedAtMs = new Date(String(t.openedAt ?? 0)).getTime();
      const closedAtMs = t.closedAt ? new Date(String(t.closedAt)).getTime() : Date.now();
      const records = await connector.getClosedPnl!(
        normalizedSymbol,
        creds,
        Math.max(0, openedAtMs - EXCHANGE_PNL_PRE_OPEN_LOOKBACK_MS),
      );
      const metrics = computeClosedTradeExchangePnlMetrics(
        records,
        openedAtMs,
        closedAtMs,
        tradeWindowOpts,
      );
      if (metrics.recordCount === 0) {
        return NextResponse.json({
          status: "closed",
          pnlReconciled: false,
          reason: "no_closed_pnl_rows_in_window",
        });
      }
      await tradeDoc.ref.update({
        exchangeRealizedPnl: Number(metrics.exchangeRealizedPnl.toFixed(6)),
        exchangePnlReconciledAt: nowIso,
        exchangePnlSource: "exchange_closed_pnl_api",
        ...(metrics.exchangeAvgEntryPrice != null
          ? { exchangeAvgEntryPrice: metrics.exchangeAvgEntryPrice }
          : {}),
        ...(metrics.exchangeAvgExitPrice != null
          ? { exchangeAvgExitPrice: metrics.exchangeAvgExitPrice }
          : {}),
        ...(metrics.exchangeQty != null ? { exchangeQty: metrics.exchangeQty } : {}),
      });
      return NextResponse.json({
        status: "closed",
        pnlReconciled: true,
        exchangeRealizedPnl: Number(metrics.exchangeRealizedPnl.toFixed(6)),
      });
    }

    // ── Case 2: trade is OPEN in Firestore — check live position ────────────
    const position = await connector.getPosition(normalizedSymbol, creds);

    if (position) {
      // Position still open — update unrealized PnL from mark price
      const unrealizedPnl = parseFloat(position.unRealizedProfit ?? "0");
      const markPrice = parseFloat(position.markPrice ?? "0");
      await tradeDoc.ref.update({
        unrealizedPnl: isFinite(unrealizedPnl) ? Number(unrealizedPnl.toFixed(6)) : 0,
        currentPrice:  isFinite(markPrice) && markPrice > 0 ? markPrice : t.currentPrice,
        lastSyncedAt: nowIso,
      });
      return NextResponse.json({ status: "open", unrealizedPnl });
    }

    // Position is GONE on exchange but Firestore still says OPEN → close it
    let exchangePnl = 0;
    let avgExitPrice: number | null = null;

    // Cancel any leftover SL/TP orders on the exchange. The position is already
    // gone, so cancelAllOrders will use the getOpenOrders fallback internally.
    try {
      await connector.cancelAllOrders(normalizedSymbol, creds);
    } catch {
      // best effort — don't block the sync if cancel fails
    }

    if (typeof connector.getClosedPnl === "function") {
      const openedAtMs = new Date(String(t.openedAt ?? 0)).getTime();
      const closedAtMs = Date.now();
      const records = await connector.getClosedPnl!(
        normalizedSymbol,
        creds,
        Math.max(0, openedAtMs - EXCHANGE_PNL_PRE_OPEN_LOOKBACK_MS),
      );
      const metrics = computeClosedTradeExchangePnlMetrics(
        records,
        openedAtMs,
        closedAtMs,
        tradeWindowOpts,
      );
      exchangePnl = metrics.exchangeRealizedPnl;
      const lastInWin = selectClosedPnlRecordsForTrade(
        records,
        openedAtMs,
        closedAtMs,
        tradeWindowOpts,
      ).sort(
        (a, b) => (b.createdTime ?? 0) - (a.createdTime ?? 0),
      )[0];
      avgExitPrice = lastInWin
        ? (parseFloat(String(lastInWin.avgExitPrice ?? 0)) || null)
        : null;
    }

    await tradeDoc.ref.update({
      status: "CLOSED",
      closedAt: nowIso,
      closeReason: "SYNCED_FROM_EXCHANGE",
      exchangeRealizedPnl: Number(exchangePnl.toFixed(6)),
      exchangePnlReconciledAt: nowIso,
      exchangePnlSource: "exchange_closed_pnl_api",
      ...(avgExitPrice ? { exchangeAvgExitPrice: avgExitPrice, currentPrice: avgExitPrice } : {}),
    });

    return NextResponse.json({
      status: "closed_now",
      exchangeRealizedPnl: Number(exchangePnl.toFixed(6)),
      avgExitPrice,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
