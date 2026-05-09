import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import {
  loadCryptoCredentials,
  reconcileUserExchangeClosedPnl,
  exchangeSupportsClosedPnlReconciliation,
} from "@/lib/freedombot/reconcile-exchange-pnl";
import { sumLifetimeRealizedPnlForUserExchange } from "@/lib/freedombot/sum-lifetime-realized-pnl";
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
    if (!uid || !exchange) {
      return NextResponse.json({ error: "Invalid deployment data" }, { status: 400 });
    }

    if (!exchangeSupportsClosedPnlReconciliation(exchange)) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "connector_has_no_closed_pnl_api",
        exchange,
        lifetimeRealizedPnl: await sumLifetimeRealizedPnlForUserExchange(db, uid, exchange),
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
    const lifetimeRealizedPnl = await sumLifetimeRealizedPnlForUserExchange(db, uid, exchange);

    return NextResponse.json({
      ok: true,
      exchange,
      userId: uid,
      deploymentId,
      reconciled: result.reconciled,
      errors: result.errors,
      totalClosedExchangePnl: result.totalClosedExchangePnl,
      lifetimeRealizedPnl,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin Reconcile PnL]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
