/**
 * Sum lifetime realised PnL for a user's closed production trades on one
 * exchange. Used by admin deployments list and post-reconcile refresh.
 *
 * Per-trade PnL is resolved via the shared `bestRealizedPnl` helper so the
 * lifetime header agrees with every per-row number on the user dashboard.
 */
import type { Firestore, Query, QueryDocumentSnapshot } from "firebase-admin/firestore";

import { bestRealizedPnl } from "./compute-best-pnl";

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
      const best = bestRealizedPnl(doc.data());
      if (best) total += best.value;
    }
    if (snap.size < PAGE) break;
    lastDoc = snap.docs[snap.docs.length - 1];
  }

  return Math.round(total * 10000) / 10000;
}
