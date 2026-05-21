import type { Firestore } from "firebase-admin/firestore";

export type SignalSide = "BUY" | "SELL";

export type RetireSignalsResult = {
  retired: number;
  inUse: number;
  eligible: number;
  retiredIds: string[];
};

/** Signal IDs with an open sim or live trade — must not be retired. */
export async function loadInUseSignalIds(db: Firestore): Promise<Set<string>> {
  const [simSnap, liveSnap] = await Promise.all([
    db.collection("simulator_trades").where("status", "==", "OPEN").get(),
    db.collection("live_trades").where("status", "==", "OPEN").get(),
  ]);
  const ids = new Set<string>();
  for (const d of simSnap.docs) {
    const sid = d.data().signalId;
    if (typeof sid === "string" && sid) ids.add(sid);
  }
  for (const d of liveSnap.docs) {
    const sid = d.data().signalId;
    if (typeof sid === "string" && sid) ids.add(sid);
  }
  return ids;
}

export type RetirePreview = {
  side: SignalSide;
  assetType: string | null;
  active: number;
  inUse: number;
  eligible: number;
};

/** Count ACTIVE signals on a side that can be retired (no open sim/live). */
export async function previewRetireSignals(
  db: Firestore,
  side: SignalSide,
  assetType?: string | null,
): Promise<RetirePreview> {
  const inUseIds = await loadInUseSignalIds(db);
  const snap = await db.collection("signals").where("status", "==", "ACTIVE").get();

  let active = 0;
  let inUse = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.type !== side) continue;
    if (assetType && d.assetType !== assetType) continue;
    active++;
    if (inUseIds.has(doc.id)) inUse++;
  }

  return {
    side,
    assetType: assetType ?? null,
    active,
    inUse,
    eligible: active - inUse,
  };
}

/**
 * Retire ACTIVE signals on one side that are not linked to any open sim/live trade.
 * Mirrors webhook supersession guards — only skips signals still in use.
 */
export async function retireUnusedSignals(
  db: Firestore,
  side: SignalSide,
  options?: { assetType?: string | null; retiredBy?: string },
): Promise<RetireSignalsResult> {
  const inUseIds = await loadInUseSignalIds(db);
  const snap = await db.collection("signals").where("status", "==", "ACTIVE").get();

  const timestamp = new Date().toISOString();
  const retiredBy = options?.retiredBy ?? "admin";
  const assetType = options?.assetType;

  let batch = db.batch();
  let batchCount = 0;
  let retired = 0;
  let inUse = 0;
  const retiredIds: string[] = [];

  const flush = async () => {
    if (batchCount === 0) return;
    await batch.commit();
    batch = db.batch();
    batchCount = 0;
  };

  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.type !== side) continue;
    if (assetType && d.assetType !== assetType) continue;

    if (inUseIds.has(doc.id)) {
      inUse++;
      continue;
    }

    batch.update(doc.ref, {
      status: "INACTIVE",
      retiredAt: timestamp,
      retiredBy,
      retiredReason: "MANUAL_RETIRE",
    });
    retiredIds.push(doc.id);
    retired++;
    batchCount++;

    if (batchCount >= 400) await flush();
  }

  await flush();

  if (retired > 0) {
    await db.collection("logs").add({
      timestamp,
      level: "INFO",
      message: `Retired ${retired} unused ${side} signal(s)`,
      details: assetType
        ? `Manual retire on ${assetType}: ${retired} retired, ${inUse} kept (open sim/live). IDs: [${retiredIds.slice(0, 20).join(", ")}${retiredIds.length > 20 ? "…" : ""}]`
        : `Manual retire all assets: ${retired} retired, ${inUse} kept (open sim/live)`,
    });
  }

  return {
    retired,
    inUse,
    eligible: retired + inUse,
    retiredIds,
  };
}
