/**
 * PATCH /api/freedombot/update-credentials
 *
 * Rotate API credentials for an existing deployment. Mirrors the safety
 * checks of `/api/freedombot/deploy` but reuses the **same** secret doc
 * (no new doc created — `users/{uid}/secrets/{getSecretDocId(exchange)}`
 * is the single source of truth per (user, exchange) by design).
 *
 * Flow:
 *   1. Verify the new keys with `connector.getUsdtBalance` BEFORE touching
 *      Firestore. Bad keys never get persisted — old keys keep running.
 *   2. Re-check the cross-user duplicate-key guard (someone else might
 *      have started using these keys since the original deploy).
 *   3. `update()` the existing secret doc with the new `encryptedKey` /
 *      `encryptedSecret` / `keyLastFour` / `savedAt`. Preserve all other
 *      fields: `autoTradeEnabled`, `riskPerTrade`, `maxConcurrentTrades`,
 *      `dailyLossLimit`, `useTestnet` — these are user preferences and
 *      must survive a key rotation.
 *   4. Mirror `keyFingerprint` + `keyLastFour` onto the deployment doc
 *      so the duplicate-key query on the next rotation still works and
 *      the admin dashboard renders the correct last-4 digits.
 *   5. Persist a fresh wallet-balance snapshot so the UI and admin dash
 *      both reflect the new connection state immediately.
 *
 * Body: { deploymentId: string, credentials: { apiKey, apiSecret } }
 * Auth: user's Firebase ID token must own the deployment.
 *
 * Errors:
 *   400  validation failure (bad keys, missing perms, network) — old keys
 *        are still on file, no writes happened.
 *   409  the new keys are already registered to a different user.
 *   403  the deployment isn't yours.
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAdminFirestore, getAdminAuth } from "@/firebase/admin";
import { encrypt } from "@/lib/crypto";
import {
  getConnector,
  getSecretDocId,
  type ExchangeName,
  type ExchangeCredentials,
} from "@/lib/exchanges";
import { persistWalletBalanceSnapshot } from "@/lib/freedombot/wallet-balance";

export const dynamic = "force-dynamic";

function computeFingerprint(
  exchange: string,
  primaryCredential: string,
  secret: string,
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${exchange}:${primaryCredential}`)
    .digest("hex");
}

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
      credentials?: Record<string, string>;
    };

    const deploymentId = body.deploymentId;
    const credentials = body.credentials;
    if (!deploymentId) {
      return NextResponse.json({ error: "Missing deploymentId" }, { status: 400 });
    }
    if (!credentials?.apiKey || !credentials?.apiSecret) {
      return NextResponse.json(
        { error: "Missing required credentials (apiKey, apiSecret)" },
        { status: 400 },
      );
    }

    const encryptionKey = process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
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

    const newFingerprint = computeFingerprint(exchange, credentials.apiKey, encryptionKey);

    // ── Cross-user duplicate-key guard ────────────────────────────────────
    // Re-run the same check the deploy route does. If somebody else hooked
    // these keys up between deploy and now (unlikely but possible), refuse.
    const duplicateSnap = await db
      .collection("bot_deployments")
      .where("exchange", "==", exchange)
      .where("keyFingerprint", "==", newFingerprint)
      .limit(2)
      .get();

    const conflict = duplicateSnap.docs.find(
      (d) => d.id !== deploymentId && d.data().uid !== uid,
    );
    if (conflict) {
      return NextResponse.json(
        {
          error:
            "These API keys are already registered to another FreedomBot account. Each exchange account can only be linked once.",
        },
        { status: 409 },
      );
    }

    // ── Validate the new keys BEFORE writing anything ─────────────────────
    const liveCreds: ExchangeCredentials = {
      apiKey: credentials.apiKey,
      apiSecret: credentials.apiSecret,
      testnet: false,
    };

    let validatedBalance: { total: number; available: number } | null = null;
    try {
      const connector = getConnector(exchange);
      const balance = await connector.getUsdtBalance(liveCreds);
      if (balance.total < 0) throw new Error("Unexpected negative balance");
      validatedBalance = { total: balance.total, available: balance.available };
      if (exchange === "HYPERLIQUID" && balance.total <= 0) {
        const describe =
          "describeZeroPerpBalance" in connector
            ? (connector as { describeZeroPerpBalance: (c: ExchangeCredentials) => Promise<string> })
                .describeZeroPerpBalance
            : null;
        throw new Error(
          describe
            ? await describe(liveCreds)
            : "No USDC in your Hyperliquid perps account. Deposit or transfer USDC to perps on app.hyperliquid.xyz before updating keys.",
        );
      }
    } catch (e) {
      return NextResponse.json(
        {
          error: `Could not verify your new ${exchange} API keys: ${
            e instanceof Error ? e.message : String(e)
          }. Please check they are correct and have futures trading permissions enabled. Your existing keys are unchanged.`,
        },
        { status: 400 },
      );
    }

    // ── Update the single secret doc in place ─────────────────────────────
    // We deliberately use `.update()` not `.set()` so unrelated fields
    // (autoTradeEnabled, riskPerTrade, dailyLossLimit, useTestnet, etc.)
    // survive the rotation. Per design constraint: ONE secret doc per
    // (user, exchange) — never create a new doc here.
    const docId = getSecretDocId(exchange);
    const secretRef = db.collection("users").doc(uid).collection("secrets").doc(docId);

    await secretRef.set(
      {
        exchange,
        encryptedKey: encrypt(credentials.apiKey),
        encryptedSecret: encrypt(credentials.apiSecret),
        keyLastFour: credentials.apiKey.slice(-4),
        savedAt: new Date().toISOString(),
      },
      { merge: true },
    );

    // Mirror identifying fields onto the deployment doc so the admin
    // dashboard's "key ending in" column and the next rotation's
    // duplicate-key check both work.
    await deployRef.update({
      keyFingerprint: newFingerprint,
      keyLastFour: credentials.apiKey.slice(-4),
      credentialsUpdatedAt: new Date().toISOString(),
    });

    // ── Seed the fresh wallet snapshot (skip an extra venue round-trip) ───
    if (validatedBalance) {
      await persistWalletBalanceSnapshot(deployRef, exchange, {
        ok: true,
        total: validatedBalance.total,
        available: validatedBalance.available,
      });
    }

    return NextResponse.json({
      success: true,
      keyLastFour: credentials.apiKey.slice(-4),
      wallet: validatedBalance
        ? {
            total: validatedBalance.total,
            available: validatedBalance.available,
          }
        : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[FreedomBot update-credentials]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
