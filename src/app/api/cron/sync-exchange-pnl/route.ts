/**
 * Exchange PnL reconciliation cron.
 *
 * Owns the backfill of `exchangeRealizedPnl` (and friends) for closed live
 * trades — historical accounting only, no impact on trade lifecycle. Used
 * to live inside `sync-live-trades`'s per-pair loop where it ran on every
 * tick for every (user, exchange) pair, even when no rows were waiting.
 * That was the dominant per-tick cost once the auto-resume scans were
 * moved out.
 *
 * Recommended cadence: every 5 minutes via cron-job.org. Latency on
 * exchange-reported PnL display is fine — the user-facing `realizedPnl`
 * is computed locally at close time and never blocks on this job.
 *
 * cron-job.org caps HTTP at 30s, so keyed GET returns 202 immediately and
 * runs the batch in the background via after() (same pattern as
 * suggest-stock-zones). Use ?sync=1 only for manual debugging.
 *
 * Design — trade-first, not pair-first:
 *   1. Single global query for `live_trades` where `status == CLOSED`
 *      and `exchangeRealizedPnl == null`, capped at MAX_PER_TICK.
 *   2. Group by (userId, exchange); lazily decrypt creds once per pair
 *      (so 50 stuck trades for the same user cost one secret read, not 50).
 *   3. Pairs whose secret doc doesn't exist or can't be decrypted are
 *      skipped this tick. We deliberately don't write any "give up" flag
 *      yet — that needs a Firestore composite index + display audit and
 *      ships as its own follow-up. Today's behavior matches what
 *      `sync-live-trades` did inside `syncUserTrades` step 0.
 *   4. Fan out reconciliation per pair with bounded concurrency. Each
 *      trade lookup wraps its own try/catch; one bad row never blocks
 *      the rest.
 *
 * Scales linearly with the number of trades waiting (not with the number
 * of users), so it stays cheap even at 1000+ deployments.
 *
 * Inline opportunistic reconciliation (`reconcileClosedTradePnlBestEffort`
 * called right after a fresh fill in `sync-live-trades`) is intentionally
 * untouched — it's the fast path; this cron is the safety net.
 */
import { after, NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/firebase/admin";
import { type LiveTrade, type Credentials } from "@/lib/trade-engine";
import { decrypt } from "@/lib/crypto";
import {
  type ExchangeName,
  getSecretDocIds,
  docMatchesExchange,
  getConnector,
} from "@/lib/exchanges";
import {
  computeClosedTradeExchangePnlMetrics,
  exchangeReconcileOrderIdsFromLiveTrade,
  coindcxClosedPnlWindowOpts,
  bybitClosedPnlWindowOpts,
  bybitClosedPnlApiEndMs,
  exchangeClosedPnlFetchStartMs,
  exchangeSupportsClosedPnlReconciliation,
} from "@/lib/freedombot/reconcile-exchange-pnl";

export const dynamic = "force-dynamic";
export const revalidate = 0;
/** Background batch after() may run up to platform limit (apphosting timeoutSeconds). */
export const maxDuration = 120;

/** Hard cap per tick. With background after(), we can process more rows per
 *  run (up to ~120s on App Hosting). Raise once we add per-call AbortSignal +
 *  venue rate-limit awareness. */
const MAX_PER_TICK = 200;

/** Per-pair worker concurrency. Keeps us under venue IP rate limits
 *  (CoinDCX is the tightest at ~10 req/s; Bybit allows ~120 req/s). */
const RECONCILE_CONCURRENCY = 4;

interface PairKey {
  userId: string;
  exchange: ExchangeName;
}

export interface ExchangePnlReconcileSummary {
  success: boolean;
  processed: number;
  reconciled: number;
  zeroRecord: number;
  skippedNoCreds: number;
  errors: number;
  pairs?: number;
  durationMs: number;
  error?: string;
}

export async function runExchangePnlReconcileBatch(
  db: FirebaseFirestore.Firestore,
): Promise<ExchangePnlReconcileSummary> {
  const startedAt = Date.now();

  let processed = 0;
  let reconciled = 0;
  let zeroRecord = 0;
  let skippedNoCreds = 0;
  let errors = 0;

  try {
    // 1. Single global query for trades waiting on exchange PnL backfill.
    const snap = await db
      .collection("live_trades")
      .where("status", "==", "CLOSED")
      .where("exchangeRealizedPnl", "==", null)
      .limit(MAX_PER_TICK)
      .get();

    if (snap.empty) {
      return {
        success: true,
        processed: 0,
        reconciled: 0,
        zeroRecord: 0,
        skippedNoCreds: 0,
        errors: 0,
        durationMs: Date.now() - startedAt,
      };
    }

    // 2. Bucket trades by (userId, exchange) so we decrypt creds once
    //    per pair, not once per trade.
    const tradesByPair = new Map<string, FirebaseFirestore.QueryDocumentSnapshot[]>();
    const pairMeta = new Map<string, PairKey>();

    for (const doc of snap.docs) {
      const data = doc.data() as Partial<LiveTrade>;
      const userId = typeof data.userId === "string" ? data.userId : null;
      const exchange = (typeof data.exchange === "string" ? data.exchange : "").toUpperCase();
      if (!userId || !exchange) continue;
      if (!exchangeSupportsClosedPnlReconciliation(exchange as ExchangeName)) continue;

      const k = `${userId}::${exchange}`;
      if (!pairMeta.has(k)) {
        pairMeta.set(k, { userId, exchange: exchange as ExchangeName });
        tradesByPair.set(k, []);
      }
      tradesByPair.get(k)!.push(doc);
    }

    if (tradesByPair.size === 0) {
      return {
        success: true,
        processed: snap.size,
        reconciled: 0,
        zeroRecord: 0,
        skippedNoCreds: 0,
        errors: 0,
        durationMs: Date.now() - startedAt,
      };
    }

    // 3. Lazy creds lookup per pair. Walks the user's secret docs for
    //    that exchange and returns decrypted creds on first match.
    //    `null` means "no usable creds for this pair, skip this tick".
    const credsCache = new Map<string, Credentials | null>();

    async function getCredsFor(pair: PairKey): Promise<Credentials | null> {
      const k = `${pair.userId}::${pair.exchange}`;
      if (credsCache.has(k)) return credsCache.get(k)!;

      let result: Credentials | null = null;
      for (const docId of getSecretDocIds(pair.exchange)) {
        try {
          const secretSnap = await db
            .collection("users")
            .doc(pair.userId)
            .collection("secrets")
            .doc(docId)
            .get();
          if (!secretSnap.exists) continue;
          const data = secretSnap.data()!;
          if (!docMatchesExchange(data, pair.exchange, docId)) continue;
          result = {
            apiKey: decrypt(data.encryptedKey),
            apiSecret: decrypt(data.encryptedSecret),
            testnet: data.useTestnet === true,
          };
          break;
        } catch {
          // try next doc id
        }
      }
      credsCache.set(k, result);
      return result;
    }

    // 4. Reconcile a single trade with the venue's PnL records.
    async function reconcileOne(
      doc: FirebaseFirestore.QueryDocumentSnapshot,
      pair: PairKey,
      creds: Credentials,
    ): Promise<"reconciled" | "zero" | "error"> {
      const lt = { id: doc.id, ...doc.data() } as LiveTrade;
      const nowIso = new Date().toISOString();

      try {
        const openedAtMs = new Date(lt.openedAt).getTime();
        const closedAtMs = lt.closedAt ? new Date(lt.closedAt).getTime() : Date.now();
        if (!Number.isFinite(openedAtMs) || !Number.isFinite(closedAtMs)) {
          // Track the attempt so stuck rows surface in Firestore.
          await doc.ref.update({
            exchangePnlReconcileAttempts: FieldValue.increment(1),
            exchangePnlReconcileLastAttemptAt: nowIso,
            exchangePnlReconcileLastError: "invalid_timestamps",
          });
          return "error";
        }

        const connector = getConnector(pair.exchange);
        if (!connector.getClosedPnl) {
          await doc.ref.update({
            exchangePnlReconcileAttempts: FieldValue.increment(1),
            exchangePnlReconcileLastAttemptAt: nowIso,
            exchangePnlReconcileLastError: "connector_unsupported",
          });
          return "error";
        }

        const endArg =
          pair.exchange === "BYBIT" ? bybitClosedPnlApiEndMs(closedAtMs) : undefined;
        const records = await connector.getClosedPnl(
          lt.symbol,
          creds,
          exchangeClosedPnlFetchStartMs(pair.exchange, openedAtMs),
          endArg,
        );

        const metrics = computeClosedTradeExchangePnlMetrics(
          records,
          openedAtMs,
          closedAtMs,
          {
            tradeSide:
              String(lt.side ?? "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY",
            // Both Bybit and CoinDCX expose the order id on their PnL rows now,
            // so prefer exact id match for either venue.
            matchAnyOrderId:
              pair.exchange === "BYBIT" || pair.exchange === "COINDCX"
                ? exchangeReconcileOrderIdsFromLiveTrade(
                    lt as unknown as Record<string, unknown>,
                  )
                : undefined,
            ...(pair.exchange === "COINDCX" ? coindcxClosedPnlWindowOpts() : {}),
            ...(pair.exchange === "BYBIT" ? bybitClosedPnlWindowOpts() : {}),
          },
        );

        if (metrics.recordCount === 0) {
          await doc.ref.update({
            exchangePnlReconcileAttempts: FieldValue.increment(1),
            exchangePnlReconcileLastAttemptAt: nowIso,
          });
          return "zero";
        }

        const patch: Record<string, unknown> = {
          exchangeRealizedPnl: Number(metrics.exchangeRealizedPnl.toFixed(6)),
          exchangePnlReconciledAt: nowIso,
          exchangePnlSource: "exchange_closed_pnl_api",
          exchangePnlReconcileLastAttemptAt: nowIso,
        };
        if (metrics.exchangeAvgEntryPrice != null) {
          patch.exchangeAvgEntryPrice = metrics.exchangeAvgEntryPrice;
        }
        if (metrics.exchangeAvgExitPrice != null) {
          patch.exchangeAvgExitPrice = metrics.exchangeAvgExitPrice;
        }
        if (metrics.exchangeQty != null) {
          patch.exchangeQty = metrics.exchangeQty;
        }
        await doc.ref.update(patch);
        return "reconciled";
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        try {
          await doc.ref.update({
            exchangePnlReconcileAttempts: FieldValue.increment(1),
            exchangePnlReconcileLastAttemptAt: nowIso,
            exchangePnlReconcileLastError: errMsg.slice(0, 400),
          });
        } catch {
          // best effort — never let logging failure mask the real error
        }
        return "error";
      }
    }

    // 5. Fan out across pairs with bounded concurrency.
    const pairKeys = Array.from(tradesByPair.keys());
    let nextIdx = 0;

    const worker = async () => {
      while (nextIdx < pairKeys.length) {
        const myIdx = nextIdx++;
        const pairKey = pairKeys[myIdx]!;
        const pair = pairMeta.get(pairKey)!;
        const trades = tradesByPair.get(pairKey)!;

        const creds = await getCredsFor(pair);
        if (!creds) {
          // No usable creds for this pair (keys revoked, account deleted,
          // doc missing). Skip this tick — same behavior as the old
          // syncUserTrades path: if discovery doesn't surface the pair,
          // its trades just sit and get retried next tick. Give-up logic
          // ships as a separate PR with a proper indexed query.
          skippedNoCreds += trades.length;
          processed += trades.length;
          continue;
        }

        // Serially within a pair to stay polite to that venue's rate limit.
        for (const doc of trades) {
          processed++;
          const outcome = await reconcileOne(doc, pair, creds);
          if (outcome === "reconciled") reconciled++;
          else if (outcome === "zero") zeroRecord++;
          else errors++;
        }
      }
    };

    const workerCount = Math.min(RECONCILE_CONCURRENCY, pairKeys.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    const durationMs = Date.now() - startedAt;
    console.log(
      `[ExchangePnl] processed=${processed} reconciled=${reconciled} zero=${zeroRecord} ` +
        `skippedNoCreds=${skippedNoCreds} errors=${errors} pairs=${pairKeys.length} (${durationMs}ms)`,
    );

    return {
      success: true,
      processed,
      reconciled,
      zeroRecord,
      skippedNoCreds,
      errors,
      pairs: pairKeys.length,
      durationMs,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ExchangePnl] FAILED:", msg);
    return {
      success: false,
      error: msg,
      durationMs: Date.now() - startedAt,
      processed,
      reconciled,
      zeroRecord,
      skippedNoCreds,
      errors,
    };
  }
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

  const sync = searchParams.get("sync") === "1";
  const db = getAdminFirestore();

  if (sync) {
    const summary = await runExchangePnlReconcileBatch(db);
    return NextResponse.json(summary, { status: summary.success ? 200 : 500 });
  }

  after(async () => {
    await runExchangePnlReconcileBatch(db);
  });

  return NextResponse.json(
    {
      success: true,
      accepted: true,
      mode: "background",
      hint: "Batch runs after response (cron-job.org 30s HTTP cap). Check server logs for [ExchangePnl].",
    },
    { status: 202 },
  );
}
