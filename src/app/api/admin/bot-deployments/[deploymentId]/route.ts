import { NextRequest, NextResponse } from "next/server";
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { getDeploymentAggregates } from "@/lib/freedombot/aggregates";
import { loadTradingPrefsForDeployment } from "@/lib/freedombot/deployment-cap";
import { getSecretDocIds, docMatchesExchange } from "@/lib/exchanges";
import type { ExchangeName } from "@/lib/exchanges";
import { computeMirroringStatus, loadMirroringFieldsForExchange } from "@/lib/freedombot/mirroring-status";

export const dynamic = "force-dynamic";

const BOT_LABELS: Record<string, string> = {
  CRYPTO: "Crypto Bot",
  INDIAN_STOCKS: "Indian Stock Bot",
  GOLD: "Gold Bot",
  SILVER: "Silver Bot",
};

function pnlCurrencyLabel(bot: string, exchange: string): string {
  if (exchange === "HYPERLIQUID") return "USDC";
  if (
    bot === "CRYPTO" ||
    exchange === "BYBIT" ||
    exchange === "BINANCE" ||
    exchange === "MEXC" ||
    exchange === "COINDCX"
  ) {
    return "USDT";
  }
  if (bot === "INDIAN_STOCKS" || exchange === "DHAN") return "INR";
  return "USDT";
}

/**
 * GET /api/admin/bot-deployments/:deploymentId
 * One deployment row (same shape as entries in GET /api/admin/bot-deployments).
 */
export async function GET(
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

    const x = deployDoc.data()!;
    const uid = String(x.uid ?? "");
    const bot = String(x.bot ?? "");
    const exchange = String(x.exchange ?? "");
    if (!uid || !exchange) {
      return NextResponse.json({ error: "Invalid deployment data" }, { status: 400 });
    }

    const userSnap = await db.collection("users").doc(uid).get();
    const u: DocumentData | undefined = userSnap.exists ? userSnap.data() : undefined;
    const email = (u?.email as string) ?? (x.email as string) ?? null;
    const displayName = (u?.displayName as string) ?? (x.displayName as string) ?? null;
    // Cached on the deployment doc; bootstraps with a full rebuild if missing.
    const aggregates = await getDeploymentAggregates(db, {
      uid,
      exchange,
      bot,
      openTradeCount: x.openTradeCount as number | undefined,
      closedTradeCount: x.closedTradeCount as number | undefined,
      lifetimeRealizedPnl: x.lifetimeRealizedPnl as number | undefined,
      aggregatesBot: x.aggregatesBot as string | undefined,
    });
    const currency = pnlCurrencyLabel(bot, exchange);
    const createdAt = (x.createdAt as { toDate?: () => Date } | null) ?? null;
    const createdIso = createdAt?.toDate?.()?.toISOString() ?? null;
    const status = String(x.status ?? "");

    const walletStatusRaw = x.walletStatus;
    const walletStatus: "valid" | "invalid" | null =
      walletStatusRaw === "valid" || walletStatusRaw === "invalid" ? walletStatusRaw : null;

    const mirroringFields = await loadMirroringFieldsForExchange(db, uid, exchange);
    const mirroring = computeMirroringStatus(status === "active", mirroringFields);
    // Per-deployment prefs live on the deployment doc itself now —
    // see `src/lib/freedombot/deployment-cap.ts`. The resolver still
    // falls back to the legacy secrets value and per-bot defaults for
    // deployments that pre-date the migration.
    const tradingPrefs = await loadTradingPrefsForDeployment(
      db,
      uid,
      exchange,
      bot,
      x,
    );

    const deployment = {
      deploymentId: deployDoc.id,
      userId: uid,
      email,
      displayName,
      bot,
      botLabel: BOT_LABELS[bot] ?? bot,
      exchange,
      firstDeployedAt: createdIso,
      deploymentStatus: status,
      running: status === "active",
      /** Secrets-doc switch the live dispatcher reads (can be false after kill switch). */
      autoTradeEnabled: mirroring.autoTradeEnabled,
      dailyLossHaltedToday: mirroring.dailyLossHaltedToday,
      liveMirroringActive: mirroring.liveMirroringActive,
      mirroringStatus: mirroring.status,
      mirroringLabel: mirroring.label,
      tradingPrefs,
      lifetimeRealizedPnl: aggregates.lifetimeRealizedPnl,
      openTradeCount: aggregates.openTradeCount,
      closedTradeCount: aggregates.closedTradeCount,
      aggregatesSource: aggregates.source,
      pnlCurrency: currency,
      pnlNote:
        "Lifetime realized PnL (closed trades only). Uses exchange-reported PnL when available; includes trading fees as reported by the exchange.",
      // Wallet / connection-health snapshot. `null` when the deployment
      // pre-dates wallet tracking — the cron fills these in on its next
      // tick or the admin can hit the manual refresh button.
      wallet: walletStatus
        ? {
            total: typeof x.walletTotal === "number" ? x.walletTotal : null,
            available: typeof x.walletAvailable === "number" ? x.walletAvailable : null,
            currency: typeof x.walletCurrency === "string" ? x.walletCurrency : currency,
            status: walletStatus,
            error: typeof x.walletError === "string" ? x.walletError : null,
            checkedAt: typeof x.walletCheckedAt === "string" ? x.walletCheckedAt : null,
          }
        : null,
    };

    return NextResponse.json({ deployment });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin Bot Deployment]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function clearUserExchangeSecretsIfNoDeployments(
  db: Firestore,
  uid: string,
  exchange: string,
): Promise<boolean> {
  const remaining = await db
    .collection("bot_deployments")
    .where("uid", "==", uid)
    .where("exchange", "==", exchange)
    .limit(1)
    .get();

  if (!remaining.empty) return false;

  const exchangeName = exchange as ExchangeName;
  const docIds = getSecretDocIds(exchangeName);
  for (const docId of docIds) {
    const secretRef = db.collection("users").doc(uid).collection("secrets").doc(docId);
    const secretDoc = await secretRef.get();
    if (secretDoc.exists && docMatchesExchange(secretDoc.data()!, exchangeName, docId)) {
      await secretRef.delete();
      return true;
    }
  }
  return false;
}

/**
 * DELETE /api/admin/bot-deployments/:deploymentId
 * Removes the deployment record. Clears stored exchange credentials when this was
 * the user's last deployment on that exchange so they must deploy again.
 */
export async function DELETE(
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

    const data = deployDoc.data()!;
    const uid = String(data.uid ?? "");
    const exchange = String(data.exchange ?? "");
    if (!uid || !exchange) {
      return NextResponse.json({ error: "Invalid deployment data" }, { status: 400 });
    }

    await deployRef.delete();
    const secretsCleared = await clearUserExchangeSecretsIfNoDeployments(db, uid, exchange);

    return NextResponse.json({ success: true, secretsCleared });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin Bot Deployment Delete]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
