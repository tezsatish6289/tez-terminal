import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import type { SimTrade } from "./simulator";
import { sendMemoTransaction } from "./solana-wallet";

// ── Human-readable on-chain payload ──────────────────────────
//
// Full field names for public verifiability on Solana Explorer / Solscan.
// Example payload (≈ 220 bytes):
//   {"asset":"CRYPTO","entryTime":"2026-04-07T15:30:00.000Z","exitTime":"2026-04-07T16:45:00.000Z",
//    "symbol":"BTCUSDT","side":"BUY","entryPrice":69420.5,"exitPrice":70100.0,
//    "pnl":45.32,"exchange":"BINANCE","leverage":10,"positionSize":100.00}

interface TradePayload {
  asset: string;
  entryTime: string;
  exitTime: string;
  symbol: string;
  side: "BUY" | "SELL";
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  exchange: string;
  leverage: number;
  positionSize: number;
}

function buildPayload(trade: SimTrade): string {
  const payload: TradePayload = {
    asset: trade.assetType ?? "CRYPTO",
    entryTime: trade.openedAt ?? new Date().toISOString(),
    exitTime: trade.closedAt ?? new Date().toISOString(),
    symbol: trade.symbol,
    side: trade.side === "BUY" ? "BUY" : "SELL",
    entryPrice: trade.entryPrice,
    exitPrice: trade.currentPrice ?? trade.entryPrice,
    pnl: Math.round(trade.realizedPnl * 10000) / 10000,
    exchange: trade.exchange,
    leverage: trade.leverage,
    positionSize: trade.positionSize,
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
