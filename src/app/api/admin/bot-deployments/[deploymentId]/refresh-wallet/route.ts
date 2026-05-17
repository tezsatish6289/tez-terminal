/**
 * POST /api/admin/bot-deployments/:deploymentId/refresh-wallet
 *
 * Admin-only manual wallet refresh. Bypasses the cron's throttle so an
 * admin clicking the dashboard "refresh" button gets a fresh balance
 * immediately. Returns the updated wallet snapshot in the response so the
 * client can render without a follow-up fetch.
 *
 * Auth: `requireAdmin` (admin email allowlist).
 * Scope: only refreshes the targeted deployment — no cascading work.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { loadCryptoCredentials } from "@/lib/freedombot/reconcile-exchange-pnl";
import { refreshDeploymentWalletBalance } from "@/lib/freedombot/wallet-balance";
import type { ExchangeName } from "@/lib/exchanges";

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
    const db = getAdminFirestore();
    const deployRef = db.collection("bot_deployments").doc(deploymentId);
    const deployDoc = await deployRef.get();
    if (!deployDoc.exists) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
    }

    const dep = deployDoc.data()!;
    const uid = String(dep.uid ?? "");
    const exchange = String(dep.exchange ?? "").toUpperCase() as ExchangeName;
    if (!uid || !exchange) {
      return NextResponse.json({ error: "Invalid deployment data" }, { status: 400 });
    }

    const creds = await loadCryptoCredentials(db, uid, exchange);
    if (!creds) {
      // No usable credentials means the exchange link is effectively broken.
      // Persist that fact onto the deployment so the dashboard shows the
      // status without the admin having to click again.
      const checkedAt = new Date().toISOString();
      await deployRef
        .update({
          walletStatus: "invalid",
          walletError: "No credentials found for this deployment.",
          walletCheckedAt: checkedAt,
        })
        .catch(() => {});
      return NextResponse.json(
        {
          ok: false,
          status: "invalid",
          error: "No credentials found for this deployment.",
          checkedAt,
        },
        { status: 400 },
      );
    }

    const result = await refreshDeploymentWalletBalance(db, deployRef, exchange, creds);

    return NextResponse.json({
      ok: result.ok,
      status: result.status,
      total: result.total,
      available: result.available,
      currency: result.currency,
      error: result.error,
      checkedAt: result.checkedAt,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin Refresh Wallet]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
