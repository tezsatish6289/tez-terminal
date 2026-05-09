/**
 * Sum lifetime realized PnL for a user's closed production trades on one exchange.
 * Used by admin deployments list and post-reconcile refresh.
 */
import type { Firestore, Query, QueryDocumentSnapshot } from "firebase-admin/firestore";

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
      const t = doc.data();
      const pnl = t.exchangeRealizedPnl ?? t.realizedPnl ?? 0;
      total += typeof pnl === "number" && !Number.isNaN(pnl) ? pnl : 0;
    }
    if (snap.size < PAGE) break;
    lastDoc = snap.docs[snap.docs.length - 1];
  }

  return Math.round(total * 10000) / 10000;
}
