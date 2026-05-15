/**
 * Sum lifetime realized PnL for a user's closed production trades on one exchange.
 * Used by admin deployments list and post-reconcile refresh.
 *
 * Priority for each trade's PnL:
 *   1. exchangeRealizedPnlOverride  (manual admin correction)
 *   2. exchangeRealizedPnl          (verified, net of fees)
 *   3. computed from prices         (gross of fees, deterministic)
 *   4. internal realizedPnl         (legacy fallback only)
 *
 * The internal-model fallback used to sit at position #2, which inflated the
 * lifetime number for any trade still awaiting venue reconciliation (the old
 * formula multiplied by leverage, ~10× inflation). The price-based fallback
 * matches what the venue itself reports up to fees.
 */
import type { Firestore, Query, QueryDocumentSnapshot } from "firebase-admin/firestore";

function computePnlFromPrices(t: Record<string, unknown>): number | null {
  const entry = typeof t.entryPrice === "number" ? (t.entryPrice as number) : null;
  // For closed trades the close handlers persist the actual exit fill into
  // `currentPrice`; `exchangeAvgExitPrice` (set by venue reconciliation) is
  // even better when present.
  const exit =
    typeof t.exchangeAvgExitPrice === "number"
      ? (t.exchangeAvgExitPrice as number)
      : typeof t.currentPrice === "number"
        ? (t.currentPrice as number)
        : null;
  const size = typeof t.positionSize === "number" ? (t.positionSize as number) : null;
  const side = typeof t.side === "string" ? (t.side as string) : null;
  if (entry == null || exit == null || size == null || side == null) return null;
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || !Number.isFinite(size)) return null;
  if (entry <= 0 || size <= 0) return null;
  const isLong = side === "BUY" || side === "LONG";
  return isLong ? size * (exit / entry - 1) : size * (1 - exit / entry);
}

function bestPnl(t: Record<string, unknown>): number {
  const ov = t.exchangeRealizedPnlOverride;
  if (typeof ov === "number" && !Number.isNaN(ov)) return ov;
  const ex = t.exchangeRealizedPnl;
  if (typeof ex === "number" && !Number.isNaN(ex)) return ex;
  const computed = computePnlFromPrices(t);
  if (computed != null) return computed;
  const internal = t.realizedPnl;
  if (typeof internal === "number" && !Number.isNaN(internal)) return internal;
  return 0;
}

export async function sumLifetimeRealizedPnlForUserExchange(
  db: Firestore,
  userId: string,
  exchange: string,
): Promise<number> {
  let total = 0;
  let lastDoc: QueryDocumentSnapshot | null = null;
  const PAGE = 400;

  while (true) {
    let q: Query = db
      .collection("live_trades")
      .where("userId", "==", userId)
      .where("exchange", "==", exchange)
      .where("status", "==", "CLOSED")
      .where("testnet", "==", false)
      .orderBy("openedAt", "asc")
      .limit(PAGE);

    if (lastDoc) {
      q = q.startAfter(lastDoc);
    }

    const snap = await q.get();
    for (const doc of snap.docs) {
      total += bestPnl(doc.data());
    }
    if (snap.size < PAGE) break;
    lastDoc = snap.docs[snap.docs.length - 1];
  }

  return Math.round(total * 10000) / 10000;
}
