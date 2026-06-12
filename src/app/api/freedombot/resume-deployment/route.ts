/**
 * POST /api/freedombot/resume-deployment
 *
 * Reverses a pause:
 *   - `bot_deployments.status` flips back to "active"
 *   - `users/{uid}/secrets/{exchange}.autoTradeEnabled` flips to `true`
 *
 * Also handles legacy `stopped` deployments — the lifecycle collapse
 * (Stop and Pause are now the same thing) means a user with an old
 * `status: "stopped"` row uses this same endpoint to come back online.
 *
 * Opportunistically refreshes the wallet balance on resume so the
 * dashboard reflects the current state immediately (the cron's 30-min
 * throttle would otherwise leave a stale number visible).
 *
 * Body: { deploymentId: string }
 * Auth: user's Firebase ID token must own the deployment.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/firebase/admin";
import { decrypt } from "@/lib/crypto";
import {
  getSecretDocIds,
  docMatchesExchange,
  type ExchangeName,
} from "@/lib/exchanges";
import { refreshDeploymentWalletBalance } from "@/lib/freedombot/wallet-balance";
import { enableBotPatch } from "@/lib/freedombot/bot-enablement";

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
      status: "active",
      resumedAt: new Date().toISOString(),
      pausedAt: null,
    });

    // Re-enable the dispatcher's per-user kill switch and grab fresh
    // credentials for an opportunistic balance refresh below.
    let creds: { apiKey: string; apiSecret: string; testnet: boolean } | null = null;
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
        // Re-enable ONLY this bot's per-bot switch plus the shared master —
        // mirror of the per-bot pause (see `enableBotPatch`).
        await secretRef.update(enableBotPatch(String(deployData.bot ?? "")));
        const data = secretSnap.data()!;
        creds = {
          apiKey: decrypt(String(data.encryptedKey)),
          apiSecret: decrypt(String(data.encryptedSecret)),
          testnet: data.useTestnet === true,
        };
        break;
      }
    }

    // Best-effort wallet refresh on resume — gives the user an immediate
    // signal that their bot is back online and the connection is healthy.
    // Failure here doesn't block the resume.
    if (creds) {
      void refreshDeploymentWalletBalance(db, deployRef, exchange, creds).catch(
        () => {},
      );
    }

    return NextResponse.json({ success: true, status: "active" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[FreedomBot resume-deployment]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
