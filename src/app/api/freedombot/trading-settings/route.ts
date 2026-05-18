/**
 * PATCH /api/freedombot/trading-settings
 *
 * Update live risk controls stored on the user's exchange secret doc
 * (riskPerTrade, maxConcurrentTrades, dailyLossLimit). These values are
 * read by the trade engine on every signal — not the simulator defaults.
 *
 * Body: {
 *   deploymentId: string,
 *   riskPerTrade?: number,
 *   maxConcurrentTrades?: number,
 *   dailyLossLimit?: number,
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/firebase/admin";
import {
  findSecretRefForExchange,
  tradingPrefsFromSecret,
  validateTradingPrefsUpdate,
} from "@/lib/freedombot/trading-prefs";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const body = (await req.json().catch(() => ({}))) as {
      deploymentId?: string;
      riskPerTrade?: unknown;
      maxConcurrentTrades?: unknown;
      dailyLossLimit?: unknown;
    };

    if (!body.deploymentId) {
      return NextResponse.json({ error: "Missing deploymentId" }, { status: 400 });
    }

    const validated = validateTradingPrefsUpdate(body);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }

    const db = getAdminFirestore();
    const deployDoc = await db.collection("bot_deployments").doc(body.deploymentId).get();
    if (!deployDoc.exists) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
    }

    const deployData = deployDoc.data()!;
    if (deployData.uid !== uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const exchange = String(deployData.exchange ?? "");
    if (!exchange) {
      return NextResponse.json({ error: "Deployment is missing exchange" }, { status: 400 });
    }

    const secretRef = await findSecretRefForExchange(db, uid, exchange);
    if (!secretRef) {
      return NextResponse.json(
        { error: "Exchange credentials not found for this deployment" },
        { status: 400 },
      );
    }

    await secretRef.update(validated.updates);
    const fresh = await secretRef.get();
    const tradingPrefs = tradingPrefsFromSecret(
      fresh.data() as Record<string, unknown> | undefined,
    );

    return NextResponse.json({ success: true, tradingPrefs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
