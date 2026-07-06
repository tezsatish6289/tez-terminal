/**
 * Confirmed bullish / bearish signal for the levels bubble map.
 *
 * Stacks three independent confirmations that (empirically) mark a high-quality
 * reversal off an OI cluster:
 *   • location — price dipped the cluster (an open SR zone event exists),
 *   • flow     — PVT has moved the confirming way since that dip, and
 *   • follow-through — price has left the cluster with room to the opposite wall.
 *
 *   bullish  = put-cluster dip + PVT up   + spot back above the dipped put wall
 *              + spot still below the current call wall (room to run up)
 *   bearish  = call-cluster dip + PVT down + spot back below the dipped call wall
 *              + spot still above the current put wall (room to fall)
 *
 * The dip anchor, its original cluster and the PVT reads come from the open SR
 * event (maintained hourly by the outcome cron); the geometry is checked against
 * the symbol's current zone doc, so it stays fresh as price moves between walls.
 */

import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { SR_ZONE_EVENTS_COLLECTION } from "@/lib/sr-audit/constants";
import { stockDocId } from "@/lib/equity-zones-store";
import { normalizeIndexKey } from "@/lib/index-zones-on-demand";
import type { SrZoneEvent } from "@/lib/sr-audit/types";
import { evalConfirmedSignal, type ConfirmedSignal } from "@/lib/levels/confirmed-signal-core";

export { evalConfirmedSignal, type ConfirmedSignal } from "@/lib/levels/confirmed-signal-core";

function n(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

/** Original dipped-cluster wall for an event (put wall for support, call for resistance). */
function originalClusterOf(ev: SrZoneEvent): number | null {
  const strike = ev.side === "support" ? ev.putClusterStrike : ev.callClusterStrike;
  return n(strike) ?? n(ev.clusterStrike);
}

function currentZonePath(scope: "stock" | "index", symbol: string): string | null {
  if (scope === "index") {
    const key = normalizeIndexKey(symbol);
    return key ? `config/suggested_index_zones_${key}` : null;
  }
  return stockDocId(symbol);
}

/**
 * Build the symbol → signal map from currently-open SR events. Bounded by the
 * open-event count (tens), reading each symbol's current zone doc once (deduped).
 */
export async function buildConfirmedSignals(
  db: Firestore,
): Promise<Record<string, ConfirmedSignal>> {
  const out: Record<string, ConfirmedSignal> = {};
  let snap;
  try {
    snap = await db
      .collection(SR_ZONE_EVENTS_COLLECTION)
      .where("state", "==", "open")
      .limit(300)
      .get();
  } catch {
    return out;
  }

  const docCache = new Map<string, Record<string, unknown> | null>();
  const readCurrent = async (path: string): Promise<Record<string, unknown> | null> => {
    if (docCache.has(path)) return docCache.get(path) ?? null;
    let raw: Record<string, unknown> | null = null;
    try {
      const doc = await db.doc(path).get();
      raw = doc.exists ? (doc.data() as Record<string, unknown>) : null;
    } catch {
      raw = null;
    }
    docCache.set(path, raw);
    return raw;
  };

  for (const d of snap.docs) {
    const ev = d.data() as SrZoneEvent;
    if (ev.entryPvt == null || ev.currentPvt == null) continue;
    const originalCluster = originalClusterOf(ev);
    if (originalCluster == null) continue;
    const scope = ev.scope === "index" ? "index" : "stock";
    const path = currentZonePath(scope, ev.symbol);
    if (!path) continue;
    const raw = await readCurrent(path);
    if (!raw) continue;

    const sig = evalConfirmedSignal({
      side: ev.side,
      entryPvt: ev.entryPvt,
      currentPvt: ev.currentPvt,
      originalCluster,
      spot: n(raw.deribitIndexPrice) ?? n(raw.btcPrice),
      currentPutStrike: n(raw.bullStrike),
      currentCallStrike: n(raw.bearStrike),
    });
    if (sig) out[ev.symbol.toUpperCase()] = sig;
  }

  return out;
}

/** 30s TTL cache so concurrent 60s polls don't recompute per request. */
let signalsCache: { at: number; data: Record<string, ConfirmedSignal> } | null = null;

export async function getConfirmedSignalsCached(
  db: Firestore,
): Promise<Record<string, ConfirmedSignal>> {
  if (signalsCache && Date.now() - signalsCache.at < 30_000) return signalsCache.data;
  const data = await buildConfirmedSignals(db);
  signalsCache = { at: Date.now(), data };
  return data;
}
