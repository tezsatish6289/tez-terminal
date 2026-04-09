/**
 * Firestore Cache — read/write for liquidity_cache collection
 *
 * Collection: liquidity_cache/{SYMBOL}  (e.g. "BTCUSDT")
 *
 * Write strategy: field-level merges, never full overwrites.
 * Each timer in the WS server only touches its own fields,
 * so sweep (5s), OI (30s), and order book (60s) writers
 * never clobber each other.
 *
 * Read strategy: batchReadLiquidityCache uses Firestore getAll()
 * so the scoring cron fetches all symbols in a single round-trip.
 */

import type { Firestore } from "firebase-admin/firestore";
import type {
  LiquidityCache,
  SweepDetection,
  OIContext,
  OrderBookContext,
} from "./types";

const COLLECTION = "liquidity_cache";

// ── Writes (field-level merge) ────────────────────────────────

export async function writeSweepUpdate(
  db: Firestore,
  symbol: string,
  sweep: SweepDetection,
): Promise<void> {
  await db
    .collection(COLLECTION)
    .doc(symbol)
    .set({ sweep, symbol, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function writeOIUpdate(
  db: Firestore,
  symbol: string,
  oi: OIContext,
): Promise<void> {
  await db
    .collection(COLLECTION)
    .doc(symbol)
    .set({ oi, updatedAt: new Date().toISOString() }, { merge: true });
}

export async function writeOBUpdate(
  db: Firestore,
  symbol: string,
  ob: OrderBookContext,
): Promise<void> {
  await db
    .collection(COLLECTION)
    .doc(symbol)
    .set({ ob, updatedAt: new Date().toISOString() }, { merge: true });
}

// ── Reads ─────────────────────────────────────────────────────

export async function readLiquidityCache(
  db: Firestore,
  symbol: string,
): Promise<LiquidityCache | null> {
  const doc = await db.collection(COLLECTION).doc(symbol).get();
  if (!doc.exists) return null;
  return doc.data() as LiquidityCache;
}

/**
 * Batch-read liquidity cache for multiple symbols in a single Firestore
 * round-trip. Used by sync-simulator to avoid N sequential reads.
 */
export async function batchReadLiquidityCache(
  db: Firestore,
  symbols: string[],
): Promise<Map<string, LiquidityCache>> {
  const result = new Map<string, LiquidityCache>();
  if (symbols.length === 0) return result;

  const refs = symbols.map((s) => db.collection(COLLECTION).doc(s));
  const docs = await db.getAll(...refs);

  for (const doc of docs) {
    if (doc.exists) {
      result.set(doc.id, doc.data() as LiquidityCache);
    }
  }

  return result;
}
