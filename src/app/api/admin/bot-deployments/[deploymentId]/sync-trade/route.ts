/**
 * POST /api/admin/bot-deployments/:deploymentId/sync-trade
 * Body: { tradeId: string }
 *
 * Admin variant of /api/freedombot/sync-trade. Same logic, but auth is the
 * admin guard and ownership is verified against the deployment's uid +
 * exchange instead of the calling user's uid. Lets admins click the per-row
 * refresh icon on /admin/bot-users/:deploymentId without needing to
 * impersonate the user.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ deploymentId: string }> },
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { deploymentId } = await context.params;
  if (!deploymentId) {
    return NextResponse.json({ error: "Missing deploymentId" }, { status: 400 });
  }

  try {
    const { tradeId } = (await request.json()) as { tradeId?: string };
    if (!tradeId) {
      return NextResponse.json({ error: "tradeId required" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const deployDoc = await db.collection("bot_deployments").doc(deploymentId).get();
    if (!deployDoc.exists) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
    }
    const dep = deployDoc.data()!;
    const uid = String(dep.uid ?? "");
    const exchange = String(dep.exchange ?? "").toUpperCase() as ExchangeName;
    if (!uid || !exchange) {
      return NextResponse.json({ error: "Invalid deployment data" }, { status: 400 });
    }

    const tradeDoc = await db.collection("live_trades").doc(tradeId).get();
    if (!tradeDoc.exists) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }
    const t = tradeDoc.data()!;
    if (t.userId !== uid) {
      return NextResponse.json({ error: "Trade not owned by this deployment" }, { status: 403 });
    }
    if (String(t.exchange ?? "").toUpperCase() !== exchange) {
      return NextResponse.json({ error: "Trade exchange mismatch" }, { status: 403 });
    }
    if (t.testnet !== false) {
      return NextResponse.json({ error: "Testnet trade" }, { status: 400 });
    }

    const symbol = String(t.signalSymbol ?? t.symbol ?? "");
    if (!symbol) {
      return NextResponse.json({ error: "No symbol on trade" }, { status: 400 });
    }

    const creds = await loadCryptoCredentials(db, uid, exchange);
    if (!creds) {
      return NextResponse.json({ error: "No credentials found" }, { status: 400 });
    }

    const connector = getConnector(exchange);
    const normalizedSymbol = connector.normalizeSymbol(symbol);
    const nowIso = new Date().toISOString();

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

    if (t.status === "CLOSED") {
      if (typeof connector.getClosedPnl !== "function") {
        return NextResponse.json({
          status: "closed",
          pnlReconciled: false,
          reason: "exchange_no_closed_pnl_api",
        });
      }
      const closedAtIso = String(t.closedAt ?? nowIso);
      const recon = await reconcileTradeExchangePnl(
        db,
        tradeId,
        buildTradeDescriptor(closedAtIso),
        creds,
        exchange,
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

    const position = await connector.getPosition(normalizedSymbol, creds);
    if (position) {
      const unrealizedPnl = parseFloat(position.unRealizedProfit ?? "0");
      const markPrice = parseFloat(position.markPrice ?? "0");
      await tradeDoc.ref.update({
        unrealizedPnl: isFinite(unrealizedPnl) ? Number(unrealizedPnl.toFixed(6)) : 0,
        currentPrice: isFinite(markPrice) && markPrice > 0 ? markPrice : t.currentPrice,
        lastSyncedAt: nowIso,
      });
      return NextResponse.json({ status: "open", unrealizedPnl });
    }

    const cleanup = await cancelResidualExitOrders(connector, normalizedSymbol, creds);
    const residualPending = !cleanup.success;

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
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Admin Sync Trade]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
