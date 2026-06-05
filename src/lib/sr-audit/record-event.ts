import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import type { EquityOptionsZones } from "@/lib/equity-options-zones";
import { storedSourceToPublic } from "@/lib/levels/levels-source";
import type { StockZoneAggregateEntry } from "@/lib/equity-zones-store";
import { computeZoneSlAnchors } from "@/lib/zone-bot-engine";
import {
  SR_EVENT_DEBOUNCE_MS,
  SR_ZONE_EVENTS_COLLECTION,
} from "@/lib/sr-audit/constants";
import type { SrZoneEvent, SrZoneSide } from "@/lib/sr-audit/types";

function invalidationForStatus(
  zones: EquityOptionsZones,
): number | null {
  const { bullSl, bearSl } = computeZoneSlAnchors({
    halfWidthUsd: zones.halfWidth > 0 ? zones.halfWidth : null,
    bullZoneLow: zones.bullZoneLow,
    bullZoneHigh: zones.bullZoneHigh,
    bearZoneLow: zones.bearZoneLow,
    bearZoneHigh: zones.bearZoneHigh,
  });
  if (zones.status === "IN_BULL") return bullSl;
  if (zones.status === "IN_BEAR") return bearSl;
  return null;
}

async function hasOpenEvent(
  db: Firestore,
  symbol: string,
  side: SrZoneSide,
): Promise<boolean> {
  const snap = await db
    .collection(SR_ZONE_EVENTS_COLLECTION)
    .where("symbol", "==", symbol)
    .where("side", "==", side)
    .where("state", "==", "open")
    .limit(1)
    .get();
  return !snap.empty;
}

async function recentlyResolved(
  db: Firestore,
  symbol: string,
  side: SrZoneSide,
): Promise<boolean> {
  const snap = await db
    .collection(SR_ZONE_EVENTS_COLLECTION)
    .where("symbol", "==", symbol)
    .where("side", "==", side)
    .where("state", "==", "resolved")
    .limit(5)
    .get();
  if (snap.empty) return false;
  let latest = 0;
  for (const doc of snap.docs) {
    const resolvedAt = doc.data().resolvedAt as string | undefined;
    const t = resolvedAt ? Date.parse(resolvedAt) : NaN;
    if (Number.isFinite(t) && t > latest) latest = t;
  }
  return latest > 0 && Date.now() - latest < SR_EVENT_DEBOUNCE_MS;
}

/**
 * Append an in-zone SR audit event when status newly enters IN_BULL / IN_BEAR.
 * Called after zone persist — does not alter zone computation.
 */
export async function maybeRecordSrZoneEvent(
  db: Firestore,
  zones: EquityOptionsZones,
  source: "nse_equity" | "dhan_equity",
  prev: StockZoneAggregateEntry | undefined,
): Promise<void> {
  const status = zones.status;
  if (status !== "IN_BULL" && status !== "IN_BEAR") return;
  if (prev?.status === status) return;

  const side: SrZoneSide = status === "IN_BULL" ? "support" : "resistance";
  const symbol = zones.symbol.toUpperCase();
  const spot = zones.spot;
  if (!Number.isFinite(spot) || spot <= 0) return;

  try {
    if (await hasOpenEvent(db, symbol, side)) return;
    if (await recentlyResolved(db, symbol, side)) return;

    const now = new Date().toISOString();
    const invalidation = invalidationForStatus(zones);
    const doc: SrZoneEvent = {
      symbol,
      label: zones.label || symbol,
      side,
      entryKind: "at",
      eventAt: now,
      entrySpot: spot,
      bullZoneLow: zones.bullZoneLow,
      bullZoneHigh: zones.bullZoneHigh,
      bearZoneLow: zones.bearZoneLow,
      bearZoneHigh: zones.bearZoneHigh,
      halfWidth: zones.halfWidth > 0 ? zones.halfWidth : null,
      invalidation,
      maxPain: zones.maxPain,
      levelsSource: storedSourceToPublic(source),
      statusAtEntry: status,
      state: "open",
      createdAt: now,
      updatedAt: now,
    };

    await db.collection(SR_ZONE_EVENTS_COLLECTION).add(doc);
  } catch (e) {
    console.warn(
      `[sr-audit] record ${symbol} failed:`,
      e instanceof Error ? e.message : String(e),
    );
  }
}
