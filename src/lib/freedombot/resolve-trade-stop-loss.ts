import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";

/** Original hard stop on a live_trades row, with simulator_trades fallback. */
export async function resolveStopLossByTradeId(
  db: Firestore,
  docs: QueryDocumentSnapshot[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const needSim: Array<{ tradeId: string; simId: string }> = [];

  for (const d of docs) {
    const data = d.data();
    const sl = data.stopLoss;
    if (typeof sl === "number" && sl > 0 && Number.isFinite(sl)) {
      out.set(d.id, sl);
      continue;
    }
    const simId = data.simTradeId;
    if (typeof simId === "string" && simId.length > 0) {
      needSim.push({ tradeId: d.id, simId });
    }
  }

  if (needSim.length === 0) return out;

  const simSnaps = await db.getAll(
    ...needSim.map(({ simId }) => db.collection("simulator_trades").doc(simId)),
  );
  const simSlById = new Map<string, number>();
  for (const simDoc of simSnaps) {
    if (!simDoc.exists) continue;
    const simSl = simDoc.data()?.stopLoss;
    if (typeof simSl === "number" && simSl > 0 && Number.isFinite(simSl)) {
      simSlById.set(simDoc.id, simSl);
    }
  }

  for (const { tradeId, simId } of needSim) {
    const sl = simSlById.get(simId);
    if (sl != null) out.set(tradeId, sl);
  }

  return out;
}
