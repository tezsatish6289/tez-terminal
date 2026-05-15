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
  reconcileTradeExchangePnl,
} from "@/lib/freedombot/reconcile-exchange-pnl";
import {
  getConnector,
  type ExchangeName,
} from "@/lib/exchanges";
import { cancelResidualExitOrders } from "@/lib/trade-engine";

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

    // Build the trade descriptor used by reconcileTradeExchangePnl. Includes
    // every order id we've ever touched on this trade (entry / SL / TPs / close
    // / historical SLs from trailing) so Bybit's order-id match has the best
    // possible chance of finding the closed-PnL row.
    const buildTradeDescriptor = (closedAt: string) => ({
      symbol: normalizedSymbol,
      openedAt: String(t.openedAt ?? new Date(0).toISOString()),
      closedAt,
      side: (String(t.side ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY") as "BUY" | "SELL",
      entryOrderId: typeof t.entryOrderId === "string" ? t.entryOrderId : undefined,
      slOrderId: typeof t.slOrderId === "string" ? t.slOrderId : null,
      tp1OrderId: typeof t.tp1OrderId === "string" ? t.tp1OrderId : null,
      tp2OrderId: typeof t.tp2OrderId === "string" ? t.tp2OrderId : null,
      tp3OrderId: typeof t.tp3OrderId === "string" ? t.tp3OrderId : null,
      closeOrderId: typeof t.closeOrderId === "string" ? t.closeOrderId : null,
      historicalSlOrderIds: Array.isArray(t.historicalSlOrderIds)
        ? (t.historicalSlOrderIds as string[])
        : [],
    });

    // ── Case 1: trade already CLOSED in Firestore — reconcile PnL only ──────
    if (t.status === "CLOSED") {
      if (typeof connector.getClosedPnl !== "function") {
        return NextResponse.json({ status: "closed", pnlReconciled: false, reason: "exchange_no_closed_pnl_api" });
      }
      const closedAtIso = String(t.closedAt ?? nowIso);
      const recon = await reconcileTradeExchangePnl(
        db,
        tradeId,
        buildTradeDescriptor(closedAtIso),
        creds,
        exchange,
        // Slightly more retries than the cron's tick so a manual click is more
        // likely to succeed when the venue is just lagging.
        { maxAttempts: 6, delayMs: 800 },
      );
      if (!recon.reconciled) {
        return NextResponse.json({
          status: "closed",
          pnlReconciled: false,
          reason: recon.reason ?? "no_closed_pnl_rows_in_window",
          attempts: recon.attempts,
        });
      }
      return NextResponse.json({
        status: "closed",
        pnlReconciled: true,
        exchangeRealizedPnl: recon.exchangeRealizedPnl,
        attempts: recon.attempts,
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

    // ── Case 3: position GONE on exchange but Firestore still OPEN → close ──
    // 1) Cancel any leftover SL/TP triggers (verified — see cancelResidualExitOrders).
    //    Reduce-only conditional orders can outlive the position and fire against a
    //    future position on the same symbol if we leave them behind.
    const cleanup = await cancelResidualExitOrders(connector, normalizedSymbol, creds);
    const residualPending = !cleanup.success;

    // 2) Mark the trade CLOSED first WITHOUT touching exchangeRealizedPnl. We do
    //    this before reconciliation so the trade can never be left in OPEN state
    //    if Bybit hasn't indexed the closed-pnl row yet — the cron's backfill
    //    loop will fill it in within a minute.
    await tradeDoc.ref.update({
      status: "CLOSED",
      closedAt: nowIso,
      closeReason: "SYNCED_FROM_EXCHANGE",
      residualOrdersPendingCleanup: residualPending,
      slOrderId: null,
      tp1OrderId: null,
      tp2OrderId: null,
      tp3OrderId: null,
    });

    // 3) Try to reconcile exchange PnL right away (with retries). If it fails,
    //    we deliberately do NOT write `exchangeRealizedPnl: 0` — that would
    //    poison the cron backfill (which only retries trades where the field
    //    is null). The cron will pick this up on its next pass.
    if (typeof connector.getClosedPnl !== "function") {
      return NextResponse.json({
        status: "closed_now",
        pnlReconciled: false,
        reason: "exchange_no_closed_pnl_api",
        residualOrdersPendingCleanup: residualPending,
      });
    }

    const recon = await reconcileTradeExchangePnl(
      db,
      tradeId,
      buildTradeDescriptor(nowIso),
      creds,
      exchange,
      { maxAttempts: 6, delayMs: 800 },
    );

    if (!recon.reconciled) {
      return NextResponse.json({
        status: "closed_now",
        pnlReconciled: false,
        reason: recon.reason ?? "no_closed_pnl_rows_in_window",
        attempts: recon.attempts,
        residualOrdersPendingCleanup: residualPending,
      });
    }

    if (recon.exchangeAvgExitPrice != null && recon.exchangeAvgExitPrice > 0) {
      await tradeDoc.ref.update({ currentPrice: recon.exchangeAvgExitPrice });
    }

    return NextResponse.json({
      status: "closed_now",
      pnlReconciled: true,
      exchangeRealizedPnl: recon.exchangeRealizedPnl,
      avgExitPrice: recon.exchangeAvgExitPrice ?? null,
      attempts: recon.attempts,
      residualOrdersPendingCleanup: residualPending,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
