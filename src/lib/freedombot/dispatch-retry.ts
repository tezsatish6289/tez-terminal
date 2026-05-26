import {
  FieldValue,
  type DocumentSnapshot,
  type Firestore,
} from "firebase-admin/firestore";
import { decrypt } from "../crypto";
import {
  docMatchesExchange,
  getConnector,
  getSecretDocId,
  type ExchangeCredentials,
  type ExchangeName,
} from "../exchanges";
import { executeTrade as executeExchangeTrade, type Credentials } from "../trade-engine";
import { type SimTrade } from "../simulator";
import { applyTradeChangeToAggregates } from "./aggregates";
import {
  deployKeyForBotSource,
  loadTradingPrefsForDeployment,
} from "./deployment-cap";

/**
 * Retry sweeper for the dispatch_state collection (introduced in the
 * A3 idempotency PR).
 *
 * Background: when `executeForAllUsers` finishes a per-task fan-out,
 * it writes a dispatch_state doc with status EXECUTED or FAILED. The
 * FAILED status captures the why (timeout, network error, exchange
 * outage, etc.) but historically the ticket just sat there — a paid
 * signal that hit a 30-second Bybit blip was permanently lost.
 *
 * This module runs from inside the existing `sync-live-trades` cron
 * (no new cron job) and walks recent FAILED tickets matching a small
 * set of *known transient* reasons. For each it:
 *
 *   1. Pulls the original SimTrade.
 *   2. Decrypts the user's exchange credentials.
 *   3. CRITICAL: queries the exchange to see if a position already
 *      exists for the symbol — i.e. the first attempt may have placed
 *      the order silently before timing out. If so, marks the ticket
 *      NEEDS_REVIEW and bails. Auto-replay against a silent fill is
 *      exactly how you double-open a trade.
 *   4. Otherwise replays `executeTrade` directly (not the full fan-out
 *      — we already know the one user/exchange we want), writes the
 *      live_trades doc, and finalizes the ticket to EXECUTED.
 *
 * Bounded by:
 *   - MAX_ATTEMPTS         — give up after N retries (status stays FAILED)
 *   - MAX_RETRIES_PER_TICK — never block the cron more than this many
 *   - RETRY_WINDOW_MS      — don't touch stale tickets (older than this)
 *   - MIN_AGE_MS           — let transients settle before first retry
 *   - RETRIABLE_REASON_PATTERNS — opt-in allowlist of error strings
 *
 * Wrapped by the caller in try/catch. A bug here MUST NOT break the
 * close-side reconciliation logic in sync-live-trades.
 */

const RETRY_WINDOW_MS = 10 * 60 * 1000;
const MIN_AGE_MS = 60 * 1000;
const MAX_ATTEMPTS = 3;
const MAX_RETRIES_PER_TICK = 5;

const RETRIABLE_REASON_PATTERNS: RegExp[] = [
  /timeout/i,
  /timed out/i,
  /network/i,
  /\bconnect/i,
  /ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN/i,
  /\b(502|503|504)\b/,
  /service unavailable/i,
  /try again/i,
  /temporarily/i,
  /rate.?limit/i,
];

export function isRetriableReason(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return RETRIABLE_REASON_PATTERNS.some((p) => p.test(reason));
}

export interface DispatchRetryResult {
  dispatchKey: string;
  userId: string;
  exchange: string;
  outcome:
    | "EXECUTED"
    | "NEEDS_REVIEW"
    | "RETRY_FAILED"
    | "ABORTED";
  detail?: string;
}

export interface DispatchRetryReport {
  scanned: number;
  candidates: number;
  retried: number;
  succeeded: number;
  needsReview: number;
  failed: number;
  results: DispatchRetryResult[];
}

export async function retryFailedDispatches(
  db: Firestore,
): Promise<DispatchRetryReport> {
  const report: DispatchRetryReport = {
    scanned: 0,
    candidates: 0,
    retried: 0,
    succeeded: 0,
    needsReview: 0,
    failed: 0,
    results: [],
  };

  let snap;
  try {
    snap = await db
      .collection("dispatch_state")
      .where("status", "==", "FAILED")
      .limit(100)
      .get();
  } catch (e) {
    console.warn(
      `[DispatchRetry] query failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return report;
  }
  report.scanned = snap.size;

  const now = Date.now();
  const candidates: DocumentSnapshot[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() ?? {};
    const attemptCount =
      typeof data.attemptCount === "number" ? data.attemptCount : 1;
    if (attemptCount >= MAX_ATTEMPTS) continue;

    const createdAt = (
      data.createdAt as { toDate?: () => Date } | undefined
    )?.toDate?.();
    if (!createdAt) continue;
    const ageMs = now - createdAt.getTime();
    if (ageMs < MIN_AGE_MS) continue;
    if (ageMs > RETRY_WINDOW_MS) continue;

    if (
      !isRetriableReason(
        typeof data.reason === "string" ? data.reason : null,
      )
    )
      continue;

    const exchange = String(data.exchange ?? "");
    if (exchange === "DHAN") continue;

    candidates.push(doc);
    if (candidates.length >= MAX_RETRIES_PER_TICK) break;
  }
  report.candidates = candidates.length;

  for (const doc of candidates) {
    const result = await retryOneDispatch(db, doc);
    report.retried++;
    if (result.outcome === "EXECUTED") report.succeeded++;
    else if (result.outcome === "NEEDS_REVIEW") report.needsReview++;
    else report.failed++;
    report.results.push(result);
  }

  return report;
}

async function retryOneDispatch(
  db: Firestore,
  ticketDoc: DocumentSnapshot,
): Promise<DispatchRetryResult> {
  const data = ticketDoc.data() ?? {};
  const dispatchKey = ticketDoc.id;
  const userId = String(data.userId ?? "");
  const exchange = String(data.exchange ?? "") as ExchangeName;
  const simTradeId = String(data.simTradeId ?? "");
  const botSource = String(data.botSource ?? "PATTERN");
  const attemptCount =
    typeof data.attemptCount === "number" ? data.attemptCount : 1;

  const out = (
    outcome: DispatchRetryResult["outcome"],
    detail?: string,
  ): DispatchRetryResult => ({ dispatchKey, userId, exchange, outcome, detail });

  if (!userId || !exchange || !simTradeId) {
    return out("ABORTED", "missing key fields on ticket");
  }

  // 1. Original SimTrade. If gone (rare — cleanup, manual delete), abort.
  let simTrade: SimTrade;
  try {
    const simSnap = await db
      .collection("simulator_trades")
      .doc(simTradeId)
      .get();
    if (!simSnap.exists) {
      await ticketDoc.ref.update({
        reason: "RETRY_ABORTED: sim trade missing",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return out("ABORTED", "sim trade missing");
    }
    simTrade = { id: simSnap.id, ...simSnap.data() } as SimTrade;
  } catch (e) {
    return out("ABORTED", `sim read failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. User's exchange credentials. Mirrors the load path in
  //    executeForAllUsers but for a single (uid, exchange) pair.
  const secretDocId = getSecretDocId(exchange);
  let secretSnap;
  try {
    secretSnap = await db
      .collection("users")
      .doc(userId)
      .collection("secrets")
      .doc(secretDocId)
      .get();
  } catch (e) {
    return out("ABORTED", `secrets read failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!secretSnap.exists) {
    await ticketDoc.ref.update({
      status: "NEEDS_REVIEW",
      reason: "RETRY_ABORTED: secrets doc missing",
      attemptCount: attemptCount + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return out("NEEDS_REVIEW", "secrets doc missing");
  }
  const secretData = secretSnap.data() ?? {};
  if (!docMatchesExchange(secretData, exchange, secretDocId)) {
    return out("ABORTED", "secrets doc does not match exchange");
  }
  if (secretData.autoTradeEnabled !== true) {
    await ticketDoc.ref.update({
      status: "NEEDS_REVIEW",
      reason: "RETRY_ABORTED: autoTradeEnabled flipped to false",
      attemptCount: attemptCount + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return out("NEEDS_REVIEW", "autoTrade now off");
  }

  // 3. Decrypt creds. Dhan was filtered out upstream.
  let apiKey: string;
  let apiSecret: string;
  try {
    apiKey = decrypt(secretData.encryptedKey);
    apiSecret = decrypt(secretData.encryptedSecret);
  } catch (e) {
    return out(
      "ABORTED",
      `decrypt failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const deployKey = deployKeyForBotSource(botSource);
  const prefs = await loadTradingPrefsForDeployment(
    db,
    userId,
    exchange,
    deployKey,
  );
  const creds: Credentials = {
    apiKey,
    apiSecret,
    testnet: secretData.useTestnet === true,
    riskPerTradePct: prefs.riskPerTrade,
  };

  // 4. SAFETY: ask the exchange whether a position already exists. The
  //    original failure could have been a lost ACK after a successful
  //    fill (the worst kind of "transient" — the order is real, we just
  //    don't know it). Auto-replay against that would double the user's
  //    exposure. If we see any position on this symbol, hand off to
  //    NEEDS_REVIEW for manual reconciliation. We never auto-write a
  //    live_trades doc from a position we discovered post-hoc because
  //    we don't have the true entry / SL / TP / quantity.
  try {
    const connector = getConnector(exchange);
    const exchangeSymbol = connector.normalizeSymbol(simTrade.symbol);
    const pos = await connector
      .getPosition(exchangeSymbol, creds as ExchangeCredentials)
      .catch(() => null);
    const alreadyOpen =
      pos && Math.abs(parseFloat(String(pos.positionAmt ?? 0))) > 0;
    if (alreadyOpen) {
      await ticketDoc.ref.update({
        status: "NEEDS_REVIEW",
        reason:
          "Position already exists on exchange — original attempt likely placed silently",
        attemptCount: attemptCount + 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
      await db
        .collection("live_trade_logs")
        .add({
          timestamp: new Date().toISOString(),
          action: "DISPATCH_RETRY_NEEDS_REVIEW",
          details: `${simTrade.symbol} ${simTrade.side} — retry aborted on ${exchange}: position already exists; manual reconciliation required (dispatchKey=${dispatchKey})`,
          signalId: simTrade.signalId ?? simTradeId,
          symbol: simTrade.symbol,
          userId,
          exchange,
          assetType: "CRYPTO",
        })
        .catch(() => {});
      return out("NEEDS_REVIEW", "position already on exchange");
    }
  } catch (e) {
    await ticketDoc.ref.update({
      attemptCount: attemptCount + 1,
      reason: `RETRY_SAFETY_CHECK_FAILED: ${
        e instanceof Error ? e.message : String(e)
      }`,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return out("RETRY_FAILED", "safety check error");
  }

  // 5. Replay the trade. Pass simulatorCapital=0 — the parameter is
  //    unused inside `executeTrade` (kept for signature compatibility).
  let liveResult;
  try {
    liveResult = await executeExchangeTrade(
      simTrade,
      userId,
      simTradeId,
      0,
      creds,
      exchange,
      undefined,
      botSource,
    );
  } catch (e) {
    await ticketDoc.ref.update({
      attemptCount: attemptCount + 1,
      reason: `RETRY_EXCEPTION: ${
        e instanceof Error ? e.message : String(e)
      }`,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return out("RETRY_FAILED", e instanceof Error ? e.message : String(e));
  }

  if (!liveResult.success || !liveResult.trade) {
    await ticketDoc.ref.update({
      attemptCount: attemptCount + 1,
      reason: liveResult.error ?? "unknown failure",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return out(
      "RETRY_FAILED",
      liveResult.error ?? "executeTrade returned no trade",
    );
  }

  // 6. Persist live_trades. On write failure we emergency-close
  //    (mirrors the existing live-execution emergency path) so we
  //    never leave the exchange holding an untracked position.
  const liveTradeRef = db.collection("live_trades").doc();
  try {
    await liveTradeRef.set(liveResult.trade);
  } catch (e) {
    const connector = getConnector(exchange);
    try {
      await connector.cancelAllOrders(
        liveResult.trade.symbol,
        creds as ExchangeCredentials,
      );
    } catch {
      /* best effort */
    }
    try {
      await connector.placeMarketClose(
        liveResult.trade.symbol,
        liveResult.trade.side,
        liveResult.trade.quantity,
        creds as ExchangeCredentials,
      );
    } catch {
      /* best effort */
    }
    await ticketDoc.ref.update({
      attemptCount: attemptCount + 1,
      reason: "RETRY_WRITE_FAILED_CLOSED",
      updatedAt: FieldValue.serverTimestamp(),
    });
    await db
      .collection("live_trade_logs")
      .add({
        timestamp: new Date().toISOString(),
        action: "DISPATCH_RETRY_WRITE_FAILED_CLOSED",
        details: `${simTrade.symbol} ${simTrade.side} — retry write failed on ${exchange}; emergency-closed to avoid ghost position. err=${
          e instanceof Error ? e.message : String(e)
        }`,
        signalId: simTrade.signalId ?? simTradeId,
        symbol: simTrade.symbol,
        userId,
        exchange,
        assetType: "CRYPTO",
      })
      .catch(() => {});
    return out("RETRY_FAILED", "live_trades write failed; emergency-closed");
  }

  // 7. Best-effort aggregates bump (matches live-execution.ts).
  try {
    await applyTradeChangeToAggregates(db, null, {
      userId: liveResult.trade.userId,
      exchange: liveResult.trade.exchange,
      status: liveResult.trade.status,
      testnet: liveResult.trade.testnet,
      side: liveResult.trade.side,
      entryPrice: liveResult.trade.entryPrice,
      currentPrice: liveResult.trade.currentPrice,
      positionSize: liveResult.trade.positionSize,
      realizedPnl: liveResult.trade.realizedPnl,
      exchangeRealizedPnl: liveResult.trade.exchangeRealizedPnl,
      exchangeRealizedPnlOverride: liveResult.trade.exchangeRealizedPnlOverride,
      events: liveResult.trade.events,
    });
  } catch (e) {
    console.warn(
      `[DispatchRetry] aggregate bump failed: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }

  // 8. Finalize the ticket.
  await ticketDoc.ref.update({
    status: "EXECUTED",
    reason: null,
    liveTradeId: liveTradeRef.id,
    attemptCount: attemptCount + 1,
    updatedAt: FieldValue.serverTimestamp(),
  });

  await db
    .collection("live_trade_logs")
    .add({
      timestamp: new Date().toISOString(),
      action: "DISPATCH_RETRY_SUCCESS",
      details: `${simTrade.symbol} ${simTrade.side} — retry succeeded on ${exchange} (attempt ${attemptCount + 1}, dispatchKey=${dispatchKey})`,
      signalId: simTrade.signalId ?? simTradeId,
      symbol: simTrade.symbol,
      userId,
      exchange,
      assetType: "CRYPTO",
    })
    .catch(() => {});

  return out("EXECUTED", `liveTradeId=${liveTradeRef.id}`);
}
