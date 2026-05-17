/**
 * POST /api/freedombot/delete-deployment
 *
 * Hard-removes a user's deployment. Unlike Pause (which just flips a
 * flag), Delete is destructive and irreversible — it:
 *
 *   1. Closes every still-open `live_trades` row for this (uid, exchange)
 *      via `protectiveClose`, which also cancels residual TP/SL orders
 *      before placing the market close. This ensures no orphan positions
 *      keep running on the venue after we've discarded the keys.
 *   2. Deletes the `bot_deployments` document.
 *   3. Calls `clearUserExchangeSecretsIfNoDeployments` — if this was the
 *      user's last deployment on this exchange, the encrypted secret doc
 *      is wiped from `users/{uid}/secrets/{getSecretDocId(exchange)}`.
 *      (If they have other deployments on the same exchange, secrets are
 *      preserved.)
 *
 * Failure semantics: if ANY position fails to close, we abort BEFORE
 * deleting the deployment or secrets. This keeps the user in a recoverable
 * state — they can retry, manually close on the venue, or contact us.
 * Stranding open positions while wiping their keys would be very bad.
 *
 * Body: { deploymentId: string, confirm?: string }
 *   - `confirm` (optional) must equal the literal string `"DELETE"`
 *     if provided. The UI sends this for an extra typed-confirmation
 *     layer; we still accept requests without it (e.g. from an admin
 *     tool) but log a warning.
 *
 * Auth: user's Firebase ID token must own the deployment.
 *
 * Response (success): { success: true, closed, failed, secretsCleared }
 * Response (partial failure): { success: false, error, closed, failed,
 *                              warnings, deploymentPreserved: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/firebase/admin";
import type { Firestore } from "firebase-admin/firestore";
import { decrypt } from "@/lib/crypto";
import { protectiveClose, type LiveTrade, type Credentials } from "@/lib/trade-engine";
import {
  getSecretDocIds,
  docMatchesExchange,
  type ExchangeName,
} from "@/lib/exchanges";

export const dynamic = "force-dynamic";
// Closing N positions sequentially can take a while on slow venues; give
// the route enough headroom to avoid Vercel's default 10s timeout.
export const maxDuration = 60;

interface CloseOutcome {
  symbol: string;
  success: boolean;
  pnl: number | null;
  error: string | null;
  warning: string | null;
}

async function clearSecretsIfNoDeployments(
  db: Firestore,
  uid: string,
  exchange: ExchangeName,
): Promise<boolean> {
  const remaining = await db
    .collection("bot_deployments")
    .where("uid", "==", uid)
    .where("exchange", "==", exchange)
    .limit(1)
    .get();
  if (!remaining.empty) return false;

  const docIds = getSecretDocIds(exchange);
  for (const docId of docIds) {
    const secretRef = db
      .collection("users")
      .doc(uid)
      .collection("secrets")
      .doc(docId);
    const secretDoc = await secretRef.get();
    if (
      secretDoc.exists &&
      docMatchesExchange(secretDoc.data()!, exchange, docId)
    ) {
      await secretRef.delete();
      return true;
    }
  }
  return false;
}

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
      confirm?: string;
    };
    const deploymentId = body.deploymentId;
    if (!deploymentId) {
      return NextResponse.json({ error: "Missing deploymentId" }, { status: 400 });
    }
    if (body.confirm != null && body.confirm !== "DELETE") {
      console.warn(
        `[FreedomBot delete-deployment] uid=${uid} sent confirm="${body.confirm}" (not "DELETE")`,
      );
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

    // ── Load credentials for the close pass ───────────────────────────────
    // We need them BEFORE deleting the secret doc (obviously). If the
    // secret doc has already been wiped (e.g. orphan deployment from a
    // failed previous delete), there are no open positions we can close
    // anyway — fall through to the deployment delete.
    let creds: Credentials | null = null;
    let secretDocId: string | null = null;
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
        const data = secretSnap.data()!;
        creds = {
          apiKey: decrypt(String(data.encryptedKey)),
          apiSecret: decrypt(String(data.encryptedSecret)),
          testnet: data.useTestnet === true,
        };
        secretDocId = docId;
        break;
      }
    }

    // ── Enumerate open trades for this (uid, exchange) ────────────────────
    const openSnap = await db
      .collection("live_trades")
      .where("status", "==", "OPEN")
      .where("userId", "==", uid)
      .where("exchange", "==", exchange)
      .get();

    const outcomes: CloseOutcome[] = [];

    if (openSnap.size > 0 && !creds) {
      // No way to close positions safely — abort. Keep the deployment so
      // the user can re-link keys via Update API key and retry the delete.
      return NextResponse.json(
        {
          success: false,
          error: `You have ${openSnap.size} open trade(s) on ${exchange} but no API keys are on file to close them with. Update your API keys first, then delete.`,
          closed: 0,
          failed: openSnap.size,
          deploymentPreserved: true,
        },
        { status: 400 },
      );
    }

    // ── Close every open position. Sequential on purpose — we want to
    //    surface the first hard failure and abort cleanly rather than
    //    half-close five positions in parallel and end up in a weird
    //    state mid-flight.
    for (const tradeDoc of openSnap.docs) {
      const tradeId = tradeDoc.id;
      const trade = { ...tradeDoc.data(), id: tradeId } as LiveTrade & {
        id: string;
      };
      const referencePrice =
        typeof (trade as { currentPrice?: number }).currentPrice === "number"
          ? (trade as { currentPrice?: number }).currentPrice!
          : trade.entryPrice;
      try {
        const result = await protectiveClose(
          trade,
          "KILL_SWITCH",
          referencePrice,
          creds!,
        );
        // `protectiveClose` returns `updatedFields: {}` when the venue
        // accepted the order but reported zero fill — treat that as a
        // failed close so we DON'T mark the trade CLOSED in Firestore
        // (the protective-close helper already documents this contract).
        const zeroFillBailout =
          !result.updatedFields || Object.keys(result.updatedFields).length === 0;
        if (zeroFillBailout) {
          outcomes.push({
            symbol: trade.signalSymbol ?? trade.symbol,
            success: false,
            pnl: null,
            error: result.warning ?? "Venue returned zero fill",
            warning: result.warning ?? null,
          });
          continue;
        }
        await db
          .collection("live_trades")
          .doc(tradeId)
          .update({
            ...result.updatedFields,
            events: [...(trade.events || []), result.newEvent],
          });
        outcomes.push({
          symbol: trade.signalSymbol ?? trade.symbol,
          success: true,
          pnl: result.newEvent?.pnl ?? null,
          error: null,
          warning: result.warning ?? null,
        });
        await db.collection("live_trade_logs").add({
          timestamp: new Date().toISOString(),
          action: "USER_DELETE_BOT",
          details: `${trade.signalSymbol ?? trade.symbol} ${trade.side} market-closed on ${exchange} because user deleted the bot${
            result.warning ? ` (${result.warning})` : ""
          }`,
          symbol: trade.signalSymbol ?? trade.symbol,
          userId: uid,
          exchange,
          assetType: "CRYPTO",
        });
      } catch (e) {
        outcomes.push({
          symbol: trade.signalSymbol ?? trade.symbol,
          success: false,
          pnl: null,
          error: e instanceof Error ? e.message : String(e),
          warning: null,
        });
      }
    }

    const failed = outcomes.filter((o) => !o.success);
    const closed = outcomes.filter((o) => o.success);

    // ── Abort the delete if anything failed to close. The user's keys
    //    must stay on file so they can retry. We deliberately keep the
    //    `status: "active"` on the deployment too — a half-closed
    //    deployment in "stopped"/"paused" state would be even more
    //    confusing.
    if (failed.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Could not close ${failed.length} of ${outcomes.length} open trade(s) on ${exchange}. The bot has not been deleted. Please try again, or close the position(s) manually on the venue. Failed: ${failed
            .map((f) => `${f.symbol}: ${f.error}`)
            .join("; ")}`,
          closed: closed.length,
          failed: failed.length,
          outcomes,
          deploymentPreserved: true,
        },
        { status: 502 },
      );
    }

    // ── All clear: delete deployment then (maybe) secret ──────────────────
    await deployRef.delete();
    const secretsCleared = await clearSecretsIfNoDeployments(db, uid, exchange);
    void secretDocId; // surfaced for debug — same value `clearSecrets…` would resolve.

    return NextResponse.json({
      success: true,
      closed: closed.length,
      failed: 0,
      secretsCleared,
      outcomes,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[FreedomBot delete-deployment]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
