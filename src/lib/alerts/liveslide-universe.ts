import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { zoneDocPath } from "@/lib/alerts/levels-from-doc";
import { favslideEntryKey, type FavslideEntry } from "@/lib/fnoninja/favslide";
import { INDEX_KEYS } from "@/lib/index-specs";
import {
  deriveZoneStatus,
  isInZoneStatus,
  type ZoneStatus,
} from "@/lib/zones/zone-status";

const STOCK_AGGREGATE_DOC = "config/zone_status_stocks";

/**
 * Current livelist universe: indices + stocks that are at/near a zone
 * (same geographic gate as the liveslide UI; score floor applied later).
 */
export async function loadLiveslideEntries(db: Firestore): Promise<FavslideEntry[]> {
  const out = new Map<string, FavslideEntry>();

  const indexRefs = INDEX_KEYS.map((k) => db.doc(zoneDocPath("index", k)));
  const indexSnaps = await db.getAll(...indexRefs);
  for (let i = 0; i < INDEX_KEYS.length; i++) {
    const key = INDEX_KEYS[i]!;
    const raw = indexSnaps[i]?.exists
      ? (indexSnaps[i]!.data() as Record<string, unknown>)
      : null;
    if (!raw) continue;

    const status = raw.status;
    if (typeof status === "string" && isInZoneStatus(status as ZoneStatus)) {
      const entry: FavslideEntry = { scope: "index", symbol: key };
      out.set(favslideEntryKey(entry), entry);
      continue;
    }

    const spot =
      typeof raw.deribitIndexPrice === "number"
        ? raw.deribitIndexPrice
        : typeof raw.btcPrice === "number"
          ? raw.btcPrice
          : null;
    const bands = {
      spot,
      bullLow: typeof raw.bullZoneLow === "number" ? raw.bullZoneLow : null,
      bullHigh: typeof raw.bullZoneHigh === "number" ? raw.bullZoneHigh : null,
      bearLow: typeof raw.bearZoneLow === "number" ? raw.bearZoneLow : null,
      bearHigh: typeof raw.bearZoneHigh === "number" ? raw.bearZoneHigh : null,
    };
    if (isInZoneStatus(deriveZoneStatus(bands))) {
      const entry: FavslideEntry = { scope: "index", symbol: key };
      out.set(favslideEntryKey(entry), entry);
    }
  }

  const agg = await db.doc(STOCK_AGGREGATE_DOC).get();
  const entries = (agg.data()?.entries ?? {}) as Record<
    string,
    { status?: string; symbol?: string }
  >;
  for (const [sym, row] of Object.entries(entries)) {
    const status = row?.status;
    if (typeof status !== "string" || !isInZoneStatus(status as ZoneStatus)) continue;
    const symbol = (row.symbol || sym).toUpperCase();
    const entry: FavslideEntry = { scope: "stock", symbol };
    out.set(favslideEntryKey(entry), entry);
  }

  return [...out.values()];
}
