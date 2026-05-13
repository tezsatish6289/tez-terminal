import { NextRequest, NextResponse } from "next/server";
import type { DocumentData } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { sumLifetimeRealizedPnlForUserExchange } from "@/lib/freedombot/sum-lifetime-realized-pnl";

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
    const lifetimeRealizedPnl = await sumLifetimeRealizedPnlForUserExchange(db, uid, exchange);
    const currency = pnlCurrencyLabel(bot, exchange);
    const createdAt = (x.createdAt as { toDate?: () => Date } | null) ?? null;
    const createdIso = createdAt?.toDate?.()?.toISOString() ?? null;
    const status = String(x.status ?? "");

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
      lifetimeRealizedPnl,
      pnlCurrency: currency,
      pnlNote:
        "Lifetime realized PnL (closed trades only). Uses exchange-reported PnL when available; includes trading fees as reported by the exchange.",
    };

    return NextResponse.json({ deployment });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin Bot Deployment]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
