/**
 * PATCH /api/freedombot/trading-settings
 *
 * Update live risk controls for one deployment. Source of truth is
 * `bot_deployments/{deploymentId}.tradingPrefs.*`; the matching
 * `secrets/{exchange}` field is kept in sync as a transitional
 * fallback for code paths that haven't migrated yet (cleanup PR
 * removes the secrets writes once every reader is on the deployment
 * doc).
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
  validateTradingPrefsUpdate,
} from "@/lib/freedombot/trading-prefs";
import { loadTradingPrefsForDeployment } from "@/lib/freedombot/deployment-cap";

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
    const deployRef = db.collection("bot_deployments").doc(body.deploymentId);
    const deployDoc = await deployRef.get();
    if (!deployDoc.exists) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
    }

    const deployData = deployDoc.data()!;
    if (deployData.uid !== uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const exchange = String(deployData.exchange ?? "");
    const deployKey = String(deployData.bot ?? "CRYPTO");
    if (!exchange) {
      return NextResponse.json({ error: "Deployment is missing exchange" }, { status: 400 });
    }

    // Write the new values onto the deployment doc — this is the
    // source of truth the live dispatcher reads. We merge over the
    // existing `tradingPrefs` map so a partial update (e.g. cap only)
    // leaves the other fields alone.
    const existingPrefs =
      (deployData.tradingPrefs as Record<string, unknown> | undefined) ?? {};
    const mergedPrefs = { ...existingPrefs, ...validated.updates };
    await deployRef.update({
      tradingPrefs: mergedPrefs,
    });

    // Mirror to the secrets doc for legacy readers that haven't been
    // migrated yet (admin tools, sync-live-trades safety checks, etc.).
    // This is intentionally best-effort — the deployment doc is the
    // authoritative source. Failure to mirror does NOT fail the
    // request; the next PR drops these secret writes entirely.
    try {
      const secretRef = await findSecretRefForExchange(db, uid, exchange);
      if (secretRef) {
        await secretRef.update(validated.updates);
      }
    } catch (mirrorErr) {
      console.warn(
        `[trading-settings] secrets mirror skipped for ${uid}/${exchange}: ${
          mirrorErr instanceof Error ? mirrorErr.message : String(mirrorErr)
        }`,
      );
    }

    const tradingPrefs = await loadTradingPrefsForDeployment(
      db,
      uid,
      exchange,
      deployKey,
      // Pass the freshly-merged prefs so we don't re-read the doc.
      { ...deployData, tradingPrefs: mergedPrefs },
    );

    return NextResponse.json({ success: true, tradingPrefs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
