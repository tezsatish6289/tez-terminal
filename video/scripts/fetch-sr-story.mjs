#!/usr/bin/env node
/**
 * Build WinStory props for ONE SR-audit success story by reading Firestore
 * directly (the Cloud Run Job has firebase-admin + ADC, so it doesn't need the
 * admin HTTP API). Mirrors GET /api/admin/sr-audit/story:
 *   - event doc  → sr_zone_events/{id}
 *   - candles    → sr_zone_event_candles/{id} (denormalized levels + bars)
 *
 * Writes the props JSON to OUT_FILE (default out/sr-story.json). Exits non-zero
 * with a clear marker when the story is missing or has no candle snapshot.
 *
 * Env: STORY_ID (required), OUT_FILE, GOOGLE_CLOUD_PROJECT.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const VIDEO_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const STORY_ID = process.env.STORY_ID;
const OUT_FILE = process.env.OUT_FILE || "out/sr-story.json";
const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || undefined;

if (!STORY_ID) {
  console.error("[fetch-sr-story] STORY_ID is required");
  process.exit(1);
}

const app = getApps().length ? getApps()[0] : initializeApp({ credential: applicationDefault(), projectId: PROJECT });
const db = getFirestore(app);

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function main() {
  const eventSnap = await db.collection("sr_zone_events").doc(STORY_ID).get();
  if (!eventSnap.exists) {
    console.error("[fetch-sr-story] NO_DATA: event not found");
    process.exit(2);
  }
  const ev = eventSnap.data();

  const candleSnap = await db.collection("sr_zone_event_candles").doc(STORY_ID).get();
  const cd = candleSnap.exists ? candleSnap.data() : null;
  const bars = Array.isArray(cd?.bars) ? cd.bars : [];
  if (!bars.length) {
    console.error("[fetch-sr-story] NO_DATA: no candle snapshot stored for this event");
    process.exit(2);
  }

  // Prefer the candle doc's denormalized levels (what the replay draws); fall
  // back to the event doc field-by-field.
  const lv = cd ?? {};
  const props = {
    symbol: ev.symbol ?? "",
    label: ev.label ?? ev.symbol ?? "",
    scope: ev.scope === "index" ? "index" : "stock",
    side: lv.side ?? ev.side ?? "support",
    entrySpot: num(lv.entrySpot ?? ev.entrySpot) ?? 0,
    maxPain: num(lv.maxPain ?? ev.maxPain),
    invalidation: num(lv.invalidation ?? ev.invalidation),
    putClusterStrike: num(lv.putClusterStrike ?? ev.putClusterStrike),
    putClusterSize: num(lv.putClusterSize ?? ev.putClusterSize),
    callClusterStrike: num(lv.callClusterStrike ?? ev.callClusterStrike),
    callClusterSize: num(lv.callClusterSize ?? ev.callClusterSize),
    bullZoneLow: num(lv.bullZoneLow ?? ev.bullZoneLow),
    bullZoneHigh: num(lv.bullZoneHigh ?? ev.bullZoneHigh),
    bearZoneLow: num(lv.bearZoneLow ?? ev.bearZoneLow),
    bearZoneHigh: num(lv.bearZoneHigh ?? ev.bearZoneHigh),
    movePct: num(ev.maxFavorablePct) ?? 0,
    eventAt: ev.eventAt ?? "",
    pocHitAt: ev.pocHitAt ?? null,
    candles: bars.map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c })),
  };

  const outPath = join(VIDEO_DIR, OUT_FILE);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(props, null, 2));
  console.log(`[fetch-sr-story] wrote ${OUT_FILE} (${props.label}, ${bars.length} bars, +${props.movePct}%)`);
}

main().catch((e) => {
  console.error("[fetch-sr-story] FATAL:", e?.stack ?? e?.message ?? String(e));
  process.exit(1);
});
