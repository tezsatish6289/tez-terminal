/**
 * Resolve the "toe-dip" anchor for event-anchored PVT: the timestamp at which a
 * symbol most recently entered a cluster and is still sitting in it (an open SR
 * zone event). The scoring engine measures PVT from this moment to now, so a
 * symbol with no open event has no dip to confirm and PVT abstains.
 *
 * Queries the existing symbol+side+state composite index (one limit-1 read per
 * side) rather than a new symbol+state index, then takes the more recent dip.
 */

import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { SR_ZONE_EVENTS_COLLECTION } from "@/lib/sr-audit/constants";
import type { SrZoneEvent, SrZoneSide } from "@/lib/sr-audit/types";

/** Epoch-seconds of the symbol's most recent open-event entry, or null. */
export async function getOpenSrEventAnchorSec(
  db: Firestore,
  symbol: string,
): Promise<number | null> {
  const sym = symbol.toUpperCase();
  try {
    const sides: SrZoneSide[] = ["support", "resistance"];
    const snaps = await Promise.all(
      sides.map((side) =>
        db
          .collection(SR_ZONE_EVENTS_COLLECTION)
          .where("symbol", "==", sym)
          .where("side", "==", side)
          .where("state", "==", "open")
          .limit(1)
          .get(),
      ),
    );
    let latest: number | null = null;
    for (const snap of snaps) {
      const data = snap.docs[0]?.data() as SrZoneEvent | undefined;
      const at = data?.eventAt ? Date.parse(data.eventAt) : NaN;
      if (Number.isFinite(at)) {
        const sec = Math.floor(at / 1000);
        if (latest == null || sec > latest) latest = sec;
      }
    }
    return latest;
  } catch {
    return null;
  }
}
