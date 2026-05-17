/**
 * POST /api/freedombot/pause-deployment
 *
 * Soft-stops the bot:
 *   - `bot_deployments.status` flips to "paused" (lifecycle: active ⇄ paused)
 *   - `users/{uid}/secrets/{exchange}.autoTradeEnabled` flips to `false`,
 *     which is the dispatcher's authoritative kill switch — new signals
 *     won't open positions for this user on this exchange.
 *
 * Deliberately does NOT close open positions or cancel exit orders.
 * The user expectation (confirmed at design time) is: "pause stops new
 * entries; open trades keep running until TP/SL." If they want to flatten
 * everything they should Delete.
 *
 * Body: { deploymentId: string }
 * Auth: user's Firebase ID token must own the deployment.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/firebase/admin";
import {
  getSecretDocIds,
  docMatchesExchange,
  type ExchangeName,
} from "@/lib/exchanges";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const body = (await req.json().catch(() => ({}))) as { deploymentId?: string };
    const deploymentId = body.deploymentId;
    if (!deploymentId) {
      return NextResponse.json({ error: "Missing deploymentId" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const deployRef = db.collection("bot_deployments").doc(deploymentId);
    const deployDoc = await deployRef.get();
    if (!deployDoc.exists) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
    }

    const deployData = deployDoc.data()!;
    if (deployData.uid !== uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const exchange = String(deployData.exchange ?? "").toUpperCase() as ExchangeName;

    await deployRef.update({
      status: "paused",
      pausedAt: new Date().toISOString(),
    });

    // Flip the dispatcher's per-user kill switch. This is the field that
    // `live-execution.ts` checks before placing new entries — flipping
    // status alone is not enough.
    const docIds = getSecretDocIds(exchange);
    for (const docId of docIds) {
      const secretRef = db
        .collection("users")
        .doc(uid)
        .collection("secrets")
        .doc(docId);
      const secretSnap = await secretRef.get();
      if (
        secretSnap.exists &&
        docMatchesExchange(secretSnap.data()!, exchange, docId)
      ) {
        await secretRef.update({ autoTradeEnabled: false });
        break;
      }
    }

    return NextResponse.json({ success: true, status: "paused" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[FreedomBot pause-deployment]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
