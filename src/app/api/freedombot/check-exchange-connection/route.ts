import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/firebase/admin";
import { fetchExchangeWalletBalance, type ExchangeName } from "@/lib/exchanges";
import { loadUserExchangeSecret } from "@/lib/freedombot/user-exchange-secret";

export const dynamic = "force-dynamic";

/**
 * POST /api/freedombot/check-exchange-connection
 *
 * Used during deploy to offer reusing stored API keys for an exchange.
 * Body: { exchange: string }
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const uid = decoded.uid;

    const body = (await req.json().catch(() => ({}))) as { exchange?: string };
    const exchange = String(body.exchange ?? "").toUpperCase() as ExchangeName;
    if (!exchange) {
      return NextResponse.json({ error: "Missing exchange" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const loaded = await loadUserExchangeSecret(db, uid, exchange);
    if (!loaded) {
      return NextResponse.json({ hasExisting: false, valid: false });
    }

    try {
      const balance = await fetchExchangeWalletBalance(exchange, loaded.creds);
      if (balance.total < 0) throw new Error("Unexpected negative balance");
      if (exchange === "HYPERLIQUID" && balance.total <= 0) {
        throw new Error(
          "No USDC in your Hyperliquid perps account. Deposit or transfer USDC before deploying.",
        );
      }

      return NextResponse.json({
        hasExisting: true,
        valid: true,
        keyLastFour: loaded.keyLastFour,
        total: balance.total,
        available: balance.available,
        lockedInUse: balance.lockedInUse,
      });
    } catch (e) {
      return NextResponse.json({
        hasExisting: true,
        valid: false,
        keyLastFour: loaded.keyLastFour,
        error: e instanceof Error ? e.message : "Connection test failed",
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
