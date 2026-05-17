/**
 * POST /api/freedombot/test-connection
 *
 * User-driven wallet-balance refresh. Doubles as a connection liveness
 * test — if `getUsdtBalance` succeeds, the credentials are valid and the
 * venue is reachable. If it fails, the deployment's `walletStatus` flips
 * to "invalid" and the dashboard renders the recovery UI (Update API key).
 *
 * Body: { deploymentId: string, force?: boolean }
 *   - `force: true`  -> bypass the 60s throttle (user clicked "Test now"
 *                       explicitly inside the Settings panel).
 *   - `force: false` -> apply the throttle (called automatically on
 *                       dashboard load — avoids hammering the venue if a
 *                       user pinball-clicks around the app).
 *
 * Auth: user's Firebase ID token must own the deployment.
 *
 * Response:
 *   { ok: true, total, available, currency, status: "valid"|"invalid",
 *     error: string|null, checkedAt, skipped: boolean }
 *
 * The cron's 30-min heartbeat continues independently; this route is only
 * for user-facing freshness. Both write to the same `bot_deployments`
 * fields (`walletTotal`, `walletAvailable`, `walletStatus`, `walletError`,
 * `walletCheckedAt`) so admin + user dashboards always agree.
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

export const dynamic = "force-dynamic";

const AUTO_REFRESH_THROTTLE_MS = 60 * 1000;

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

    const body = (await req.json().catch(() => ({}))) as {
      deploymentId?: string;
      force?: boolean;
    };
    const deploymentId = body.deploymentId;
    const force = body.force === true;

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
    if (!exchange) {
      return NextResponse.json({ error: "Deployment is missing exchange" }, { status: 400 });
    }

    // Locate the user's secret doc for this exchange. Single doc per
    // (user, exchange) per the deploy + update-credentials routes —
    // `getSecretDocIds` returns historical alternatives we tolerate.
    const docIds = getSecretDocIds(exchange);
    let secretSnap: FirebaseFirestore.DocumentSnapshot | null = null;
    for (const docId of docIds) {
      const ref = db.collection("users").doc(uid).collection("secrets").doc(docId);
      const snap = await ref.get();
      if (snap.exists && docMatchesExchange(snap.data()!, exchange, docId)) {
        secretSnap = snap;
        break;
      }
    }

    if (!secretSnap) {
      // Mark the deployment as invalid so the dashboard shows the
      // recovery UI. We can't fetch a balance without keys.
      const checkedAt = new Date().toISOString();
      await deployRef
        .update({
          walletStatus: "invalid",
          walletError: "No API keys on file for this exchange. Please re-deploy.",
          walletCheckedAt: checkedAt,
        })
        .catch(() => {});
      return NextResponse.json({
        ok: false,
        skipped: false,
        status: "invalid",
        total: null,
        available: null,
        currency: null,
        error: "No API keys on file for this exchange. Please re-deploy.",
        checkedAt,
      });
    }

    const secretData = secretSnap.data()!;
    const creds = {
      apiKey: decrypt(String(secretData.encryptedKey)),
      apiSecret: decrypt(String(secretData.encryptedSecret)),
      testnet: secretData.useTestnet === true,
    };

    const result = await refreshDeploymentWalletBalance(
      db,
      deployRef,
      exchange,
      creds,
      force
        ? undefined
        : {
            skipIfCheckedWithinMs: AUTO_REFRESH_THROTTLE_MS,
            existingCheckedAt:
              typeof deployData.walletCheckedAt === "string"
                ? deployData.walletCheckedAt
                : null,
          },
    );

    // When throttled, surface the cached values from the doc so the UI can
    // render something immediately without a second read.
    if (result.skipped) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        status: deployData.walletStatus ?? null,
        total:
          typeof deployData.walletTotal === "number" ? deployData.walletTotal : null,
        available:
          typeof deployData.walletAvailable === "number"
            ? deployData.walletAvailable
            : null,
        currency: result.currency,
        error: typeof deployData.walletError === "string" ? deployData.walletError : null,
        checkedAt:
          typeof deployData.walletCheckedAt === "string"
            ? deployData.walletCheckedAt
            : null,
      });
    }

    return NextResponse.json({
      ok: result.ok,
      skipped: false,
      status: result.status,
      total: result.total,
      available: result.available,
      currency: result.currency,
      error: result.error,
      checkedAt: result.checkedAt,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[FreedomBot test-connection]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
