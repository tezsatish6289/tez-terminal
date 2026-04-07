import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import type { SimTrade } from "./simulator";
import { sendMemoTransaction } from "./solana-wallet";

// ── Compact on-chain payload ──────────────────────────────────
//
// Each field is abbreviated to keep the JSON string as small as possible.
// Full payload example (≈ 170 bytes):
//   {"at":"CRYPTO","et":1712345678000,"xt":1712346000000,"s":"BTCUSDT","sd":"B","e":69420.5,"x":70100.0,"p":45.3200,"ex":"BINANCE","l":10,"ps":100.00}

interface TradePayload {
  at: string;    // assetType  (e.g. "CRYPTO", "FOREX", "INDIAN_STOCKS")
  et: number;    // entry time (Unix ms)
  xt: number;    // exit time  (Unix ms)
  s: string;     // symbol     (e.g. "BTCUSDT")
  sd: "B" | "S"; // side       (B = Buy, S = Sell)
  e: number;     // entry price
  x: number;     // exit price
  p: number;     // realizedPnl (4 decimal places)
  ex: string;    // exchange   (e.g. "BINANCE")
  l: number;     // leverage
  ps: number;    // position size
}

function buildPayload(trade: SimTrade): string {
  const payload: TradePayload = {
    at: trade.assetType ?? "CRYPTO",
    et: trade.openedAt ? new Date(trade.openedAt).getTime() : Date.now(),
    xt: trade.closedAt ? new Date(trade.closedAt).getTime() : Date.now(),
    s: trade.symbol,
    sd: trade.side === "BUY" ? "B" : "S",
    e: trade.entryPrice,
    x: trade.currentPrice ?? trade.entryPrice,
    p: Math.round(trade.realizedPnl * 10000) / 10000,
    ex: trade.exchange,
    l: trade.leverage,
    ps: trade.positionSize,
  };
  return JSON.stringify(payload);
}

// ── Blockchain fields that live on the simulator_trade document ──
//
// blockchainStatus:        "pending" | "processing" | "confirmed" | "failed"
// blockchainQueuedAt:      ISO timestamp — when the trade was first queued
// blockchainLastAttemptAt: ISO timestamp — updated at the start of each attempt
// blockchainRetryCount:    number — incremented on each failure
// blockchainNextRetryAt:   ISO timestamp | null — earliest time to retry (backoff)
// blockchainConfirmedAt:   ISO timestamp | null — when finalized on-chain
// blockchainError:         string | null — last error message
// txHash:                  string | null — Solana transaction signature

// ── Public helpers ────────────────────────────────────────────

/**
 * Marks a just-closed simulator trade for blockchain publication.
 * Call this immediately after writing the "CLOSED" status to Firestore.
 * Fire-and-forget: if this update fails the blockchain-publish cron will
 * still be able to recover closed trades that are missing blockchainStatus.
 */
export async function markTradeForBlockchain(
  db: Firestore,
  tradeId: string
): Promise<void> {
  try {
    await db.collection("simulator_trades").doc(tradeId).update({
      blockchainStatus: "pending",
      blockchainQueuedAt: new Date().toISOString(),
      blockchainRetryCount: 0,
      blockchainNextRetryAt: null,
      blockchainLastAttemptAt: null,
      blockchainConfirmedAt: null,
      blockchainError: null,
      txHash: null,
    });
  } catch (err) {
    // Non-critical: the trade close already succeeded; the blockchain-publish
    // cron will pick it up as a "CLOSED" trade missing blockchainStatus.
    console.error(
      `[BlockchainLogger] Failed to mark trade ${tradeId} for publishing:`,
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Processes a single simulator trade from the blockchain queue.
 * Builds the compact payload, checks wallet balance, sends the Memo tx,
 * and writes the result (txHash or retry schedule) back to Firestore.
 */
export async function publishTrade(
  db: Firestore,
  tradeDoc: QueryDocumentSnapshot
): Promise<void> {
  const tradeId = tradeDoc.id;
  const data = tradeDoc.data() as SimTrade & Record<string, unknown>;

  // Lock the document so a concurrent cron run won't double-process it
  await db.collection("simulator_trades").doc(tradeId).update({
    blockchainStatus: "processing",
    blockchainLastAttemptAt: new Date().toISOString(),
  });

  const memo = buildPayload(data as unknown as SimTrade);
  console.log(`[BlockchainLogger] Sending trade ${tradeId} on-chain: ${memo}`);

  const result = await sendMemoTransaction(memo);

  if (result.success) {
    await db.collection("simulator_trades").doc(tradeId).update({
      blockchainStatus: "confirmed",
      txHash: result.txHash,
      blockchainConfirmedAt: new Date().toISOString(),
      blockchainError: null,
    });
    console.log(
      `[BlockchainLogger] ✅ Trade ${tradeId} confirmed on-chain: ${result.txHash}`
    );
  } else {
    const retryCount = ((data.blockchainRetryCount as number) ?? 0) + 1;

    // Exponential backoff: 1m → 2m → 4m → 8m → 16m → 30m (capped)
    const backoffMs = Math.min(
      Math.pow(2, retryCount - 1) * 60_000,
      30 * 60_000
    );
    const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();

    await db.collection("simulator_trades").doc(tradeId).update({
      blockchainStatus: "failed",
      blockchainRetryCount: retryCount,
      blockchainNextRetryAt: nextRetryAt,
      blockchainError: result.error,
    });

    console.warn(
      `[BlockchainLogger] ❌ Trade ${tradeId} failed (attempt ${retryCount}), ` +
        `next retry at ${nextRetryAt}. Error: ${result.error}`
    );
  }
}
