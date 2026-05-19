/**
 * Wallet balance + exchangeUid heartbeat cron.
 *
 * Owns the per-deployment wallet refresh that used to live inside
 * `sync-live-trades`'s "step 3b" — it queried `bot_deployments` per pair on
 * every minute even when nothing changed, just to keep the admin dashboard's
 * displayed balance fresh. None of that work has anything to do with
 * managing open positions, so it shouldn't sit in the 1-min trading hot
 * path.
 *
 * Recommended cadence: every 15 minutes via cron-job.org. The actual
 * `getUsdtBalance` call to the venue is throttled per-deployment to once
 * every 30 minutes (`WALLET_REFRESH_THROTTLE_MS`), so the cron tick is
 * cheap on average — usually just a Firestore lookup per pair and a
 * "throttled" skip.
 *
 * Responsibilities per (user, exchange) pair:
 *   1. Look up the active `bot_deployments` doc.
 *   2. Lazily backfill `exchangeUid` for venues that expose a stable
 *      account id (Bybit / CoinDCX / Hyperliquid). One-shot per
 *      deployment; subsequent ticks short-circuit.
 *   3. Refresh wallet balance + status (`walletStatus`, `walletTotal`,
 *      `walletAvailable`, `walletError`, `walletCheckedAt`) via
 *      `refreshDeploymentWalletBalance`. Throttled to 30 min between calls.
 *
 * The opportunistic refresh path in `sync-live-trades` (fires right after a
 * fill or protective close lands) is untouched — that's the fast path so
 * the admin dashboard reflects post-trade balances immediately, without
 * waiting for this cron's 15-min cadence.
 *
 * Concurrency cap (5) deliberately preserved from the old code: CoinDCX is
 * the tightest at ~10 req/sec per IP, and we share Vercel/Cloud-Run's
 * outbound IP across every active deployment.
 *
 * Discovery mirrors `sync-live-trades`: `collectionGroup("secrets")` where
 * `autoTradeEnabled == true`. Users who've disabled auto-trade aren't
 * actively trading, so we don't refresh their wallet here — keeps load
 * proportional to active users.
 *
 * Not part of the P0 trading chain — no heartbeat / Telegram alerting.
 * If this job misses a cycle, the displayed balance is stale; trade
 * lifecycle is unaffected.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { decrypt } from "@/lib/crypto";
import { type Credentials } from "@/lib/trade-engine";
import {
  type ExchangeName,
  docMatchesExchange,
  getConnector,
} from "@/lib/exchanges";
import { refreshDeploymentWalletBalance } from "@/lib/freedombot/wallet-balance";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const WALLET_REFRESH_THROTTLE_MS = 30 * 60 * 1000;
const WALLET_REFRESH_CONCURRENCY = 5;

/** Same DOC_ID → exchange mapping `sync-live-trades` uses for pair discovery.
 *  Dhan deliberately excluded — Indian-market live trading is paused (matches
 *  sync-live-trades). Re-add `dhan: "DHAN"` here when reviving. */
const DOC_ID_TO_EXCHANGE: Record<string, ExchangeName> = {
  bybit:           "BYBIT",
  binance:         "BYBIT",   // legacy pre-migration doc
  binance_futures: "BINANCE",
  mexc:            "MEXC",
  coindcx:         "COINDCX",
  hyperliquid:     "HYPERLIQUID",
};

interface UserExchangePair {
  userId:   string;
  exchange: ExchangeName;
  creds:    Credentials;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || key !== cronSecret) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const db = getAdminFirestore();
  const startedAt = Date.now();

  try {
    // 1. Discover pairs the same way sync-live-trades does — one
    //    collection-group query against the `secrets` subcollection.
    let enabledSnap: FirebaseFirestore.QuerySnapshot;
    try {
      enabledSnap = await db
        .collectionGroup("secrets")
        .where("autoTradeEnabled", "==", true)
        .get();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[WalletBalances] FATAL: secrets query failed:", msg);
      return NextResponse.json(
        { success: false, error: msg, hint: "collectionGroup(secrets) query failed — likely missing index" },
        { status: 500 },
      );
    }

    const pairs: UserExchangePair[] = [];
    const seen = new Set<string>();

    const enabledChecks = enabledSnap.docs.map(async (secretDoc) => {
      const data = secretDoc.data() ?? {};
      const userId = secretDoc.ref.parent.parent?.id;
      if (!userId) return;

      const exchangeName = DOC_ID_TO_EXCHANGE[secretDoc.id];
      if (!exchangeName) return;
      if (!docMatchesExchange(data, exchangeName, secretDoc.id)) return;

      const dedupeKey = `${userId}::${exchangeName}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);

      try {
        pairs.push({
          userId,
          exchange: exchangeName,
          creds: {
            apiKey: decrypt(data.encryptedKey),
            apiSecret: decrypt(data.encryptedSecret),
            testnet: data.useTestnet === true,
          },
        });
      } catch {
        // skip this exchange for this user
      }
    });

    await Promise.all(enabledChecks);

    if (pairs.length === 0) {
      return NextResponse.json({
        success: true,
        pairs: 0,
        attempted: 0,
        valid: 0,
        invalid: 0,
        throttled: 0,
        missingDeployment: 0,
        durationMs: Date.now() - startedAt,
      });
    }

    // 2. Fan out per pair, capped concurrency. Each worker does one
    //    bot_deployments lookup + (optional) exchangeUid backfill +
    //    wallet refresh.
    const stats = {
      attempted: 0,
      throttled: 0,
      valid: 0,
      invalid: 0,
      missingDeployment: 0,
    };

    let nextIdx = 0;
    const runOne = async (pair: UserExchangePair) => {
      try {
        const deploySnap = await db
          .collection("bot_deployments")
          .where("uid", "==", pair.userId)
          .where("exchange", "==", pair.exchange)
          .where("status", "==", "active")
          .limit(1)
          .get();

        if (deploySnap.empty) {
          stats.missingDeployment++;
          return;
        }
        const deployDoc = deploySnap.docs[0];
        const deployData = deployDoc.data();

        // (1) exchangeUid backfill — only for venues that expose it.
        if (
          (pair.exchange === "BYBIT" ||
            pair.exchange === "COINDCX" ||
            pair.exchange === "HYPERLIQUID") &&
          !deployData.exchangeUid
        ) {
          try {
            const connector = getConnector(pair.exchange) as {
              getAccountUid?: (c: Credentials) => Promise<string | null>;
            };
            if (connector.getAccountUid) {
              const exchangeUid = await connector.getAccountUid(pair.creds);
              if (exchangeUid) {
                await deployDoc.ref.update({ exchangeUid });
                console.log(
                  `[WalletBalances] Backfilled exchangeUid for user ${pair.userId} (${pair.exchange})`,
                );
              }
            }
          } catch {
            // best-effort
          }
        }

        // (2) Wallet-balance heartbeat — throttled per deployment.
        const lastCheckedAt =
          typeof deployData.walletCheckedAt === "string"
            ? deployData.walletCheckedAt
            : null;
        stats.attempted++;
        const refreshResult = await refreshDeploymentWalletBalance(
          db,
          deployDoc.ref,
          pair.exchange,
          pair.creds,
          {
            skipIfCheckedWithinMs: WALLET_REFRESH_THROTTLE_MS,
            existingCheckedAt: lastCheckedAt,
          },
        );
        if (refreshResult.skipped) stats.throttled++;
        else if (refreshResult.status === "valid") stats.valid++;
        else if (refreshResult.status === "invalid") stats.invalid++;
      } catch (e) {
        console.warn(
          `[WalletBalances] Refresh failed for ${pair.userId}/${pair.exchange}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    };

    const worker = async () => {
      while (nextIdx < pairs.length) {
        const myIdx = nextIdx++;
        await runOne(pairs[myIdx]!);
      }
    };

    const workers: Promise<void>[] = [];
    const workerCount = Math.min(WALLET_REFRESH_CONCURRENCY, pairs.length);
    for (let w = 0; w < workerCount; w++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    const durationMs = Date.now() - startedAt;
    console.log(
      `[WalletBalances] pairs=${pairs.length} valid=${stats.valid} invalid=${stats.invalid} ` +
        `throttled=${stats.throttled} no-deployment=${stats.missingDeployment} (${durationMs}ms)`,
    );

    return NextResponse.json({
      success: true,
      pairs: pairs.length,
      attempted: stats.attempted,
      valid: stats.valid,
      invalid: stats.invalid,
      throttled: stats.throttled,
      missingDeployment: stats.missingDeployment,
      durationMs,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[WalletBalances] FAILED:", msg);
    return NextResponse.json(
      { success: false, error: msg, durationMs: Date.now() - startedAt },
      { status: 500 },
    );
  }
}
