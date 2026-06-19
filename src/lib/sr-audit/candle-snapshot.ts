import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { getIndexCandles, getStockCandles, type Candle } from "@/lib/dhan-candles";
import {
  SR_STORY_CANDLE_INTERVAL,
  SR_ZONE_EVENT_CANDLES_COLLECTION,
} from "@/lib/sr-audit/constants";
import type { SrZoneEvent } from "@/lib/sr-audit/types";

/** Days of context to show *before* the cluster entry on the chart. */
const PRE_ENTRY_BUFFER_DAYS = 2;
/** Days of follow-through to keep *after* resolution (or now, if open). */
const POST_RESOLVE_BUFFER_DAYS = 1;
/** Hard cap so a snapshot doc can never approach Firestore's 1 MB limit. */
const MAX_BARS = 1200;

/** Compact bar for the stored snapshot (epoch seconds, OHLC only). */
export interface StorySnapshotBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

/** Doc shape in `sr_zone_event_candles/{eventId}` — self-contained for replay. */
export interface SrZoneEventCandles {
  symbol: string;
  scope: "stock" | "index";
  interval: string;
  /** Window bounds actually captured (epoch seconds). */
  fromTime: number;
  toTime: number;
  /** Levels copied so the chart can draw without re-reading the event doc. */
  entrySpot: number;
  maxPain: number | null;
  invalidation: number | null;
  clusterStrike: number | null;
  bullZoneLow: number | null;
  bullZoneHigh: number | null;
  bearZoneLow: number | null;
  bearZoneHigh: number | null;
  bars: StorySnapshotBar[];
  updatedAt: string;
}

function toBars(candles: Candle[]): StorySnapshotBar[] {
  return candles.map((c) => ({ t: c.time, o: c.open, h: c.high, l: c.low, c: c.close }));
}

/**
 * Capture (or refresh) the 15-min candle window for one event into
 * `sr_zone_event_candles/{eventId}`. Returns the number of bars stored, or null
 * if no candles were available (e.g. the move predates Dhan's ~30-day window).
 *
 * Best-effort: never throws into the scoring loop.
 */
export async function snapshotEventCandles(
  db: Firestore,
  eventId: string,
  event: SrZoneEvent,
): Promise<number | null> {
  try {
    const scope: "stock" | "index" = event.scope === "index" ? "index" : "stock";
    const result =
      scope === "index"
        ? await getIndexCandles(event.symbol, SR_STORY_CANDLE_INTERVAL)
        : await getStockCandles(event.symbol, SR_STORY_CANDLE_INTERVAL);

    if (!result.ok || !result.candles.length) return null;

    const eventSec = Math.floor(Date.parse(event.eventAt) / 1000);
    const fromSec = eventSec - PRE_ENTRY_BUFFER_DAYS * 86_400;
    const endRef = event.resolvedAt ? Date.parse(event.resolvedAt) : Date.now();
    const toSec = Math.floor(endRef / 1000) + POST_RESOLVE_BUFFER_DAYS * 86_400;

    let windowed = result.candles.filter((c) => c.time >= fromSec && c.time <= toSec);
    if (!windowed.length) return null;
    if (windowed.length > MAX_BARS) windowed = windowed.slice(-MAX_BARS);

    const doc: SrZoneEventCandles = {
      symbol: event.symbol,
      scope,
      interval: SR_STORY_CANDLE_INTERVAL,
      fromTime: windowed[0].time,
      toTime: windowed[windowed.length - 1].time,
      entrySpot: event.entrySpot,
      maxPain: event.maxPain ?? null,
      invalidation: event.invalidation ?? null,
      clusterStrike: event.clusterStrike ?? null,
      bullZoneLow: event.bullZoneLow,
      bullZoneHigh: event.bullZoneHigh,
      bearZoneLow: event.bearZoneLow,
      bearZoneHigh: event.bearZoneHigh,
      bars: toBars(windowed),
      updatedAt: new Date().toISOString(),
    };

    await db.collection(SR_ZONE_EVENT_CANDLES_COLLECTION).doc(eventId).set(doc);
    return doc.bars.length;
  } catch (e) {
    console.warn(
      `[sr-audit] candle snapshot ${event.symbol} (${eventId}) failed:`,
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}

/** Load a stored snapshot for replay / video build. */
export async function loadEventCandles(
  db: Firestore,
  eventId: string,
): Promise<SrZoneEventCandles | null> {
  try {
    const snap = await db.collection(SR_ZONE_EVENT_CANDLES_COLLECTION).doc(eventId).get();
    return snap.exists ? (snap.data() as SrZoneEventCandles) : null;
  } catch {
    return null;
  }
}
