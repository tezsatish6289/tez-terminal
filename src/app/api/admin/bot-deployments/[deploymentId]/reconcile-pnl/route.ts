import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import {
  loadCryptoCredentials,
  reconcileUserExchangeClosedPnl,
  exchangeSupportsClosedPnlReconciliation,
} from "@/lib/freedombot/reconcile-exchange-pnl";
import { getDeploymentAggregates } from "@/lib/freedombot/aggregates";
import type { ExchangeName } from "@/lib/exchanges";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/bot-deployments/:deploymentId/reconcile-pnl
 * Pulls closed PnL from the deployment's exchange API into live_trades and returns refreshed lifetime sum.
 */
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
    const db = getAdminFirestore();
    const deployDoc = await db.collection("bot_deployments").doc(deploymentId).get();
    if (!deployDoc.exists) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
    }

    const dep = deployDoc.data()!;
    const uid = String(dep.uid ?? "");
    const exchange = String(dep.exchange ?? "").toUpperCase() as ExchangeName;
    const deployBot = String(dep.bot ?? "CRYPTO");
    if (!uid || !exchange) {
      return NextResponse.json({ error: "Invalid deployment data" }, { status: 400 });
    }

    if (!exchangeSupportsClosedPnlReconciliation(exchange)) {
      // Cache may be missing on legacy rows — bootstrap on read.
      const agg = await getDeploymentAggregates(db, {
        uid,
        exchange,
        bot: deployBot,
        openTradeCount: dep.openTradeCount as number | undefined,
        closedTradeCount: dep.closedTradeCount as number | undefined,
        lifetimeRealizedPnl: dep.lifetimeRealizedPnl as number | undefined,
        aggregatesBot: dep.aggregatesBot as string | undefined,
      });
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "connector_has_no_closed_pnl_api",
        exchange,
        lifetimeRealizedPnl: agg.lifetimeRealizedPnl,
        openTradeCount: agg.openTradeCount,
        closedTradeCount: agg.closedTradeCount,
      });
    }

    const creds = await loadCryptoCredentials(db, uid, exchange);
    if (!creds) {
      return NextResponse.json(
        {
          ok: false,
          error: "No API credentials on file for this exchange — user must save keys in Settings.",
          exchange,
        },
        { status: 400 },
      );
    }

    const result = await reconcileUserExchangeClosedPnl(db, uid, exchange, creds);
    // reconcileUserExchangeClosedPnl already triggered a full aggregate
    // rebuild as part of its tail. Re-read so the response carries the
    // freshly-persisted numbers (cheap O(1) read).
    const refreshedDoc = await db.collection("bot_deployments").doc(deploymentId).get();
    const refreshed = refreshedDoc.data() ?? {};
    const agg = await getDeploymentAggregates(db, {
      uid,
      exchange,
      bot: deployBot,
      openTradeCount: refreshed.openTradeCount as number | undefined,
      closedTradeCount: refreshed.closedTradeCount as number | undefined,
      lifetimeRealizedPnl: refreshed.lifetimeRealizedPnl as number | undefined,
      aggregatesBot: refreshed.aggregatesBot as string | undefined,
    });

    return NextResponse.json({
      ok: true,
      exchange,
      userId: uid,
      deploymentId,
      reconciled: result.reconciled,
      errors: result.errors,
      totalClosedExchangePnl: result.totalClosedExchangePnl,
      lifetimeRealizedPnl: agg.lifetimeRealizedPnl,
      openTradeCount: agg.openTradeCount,
      closedTradeCount: agg.closedTradeCount,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin Reconcile PnL]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
