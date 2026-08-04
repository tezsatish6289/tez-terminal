import "server-only";

import { getAdminFirestore } from "@/firebase/admin";
import { loadEventCandles } from "@/lib/sr-audit/candle-snapshot";
import { SR_ZONE_EVENTS_COLLECTION } from "@/lib/sr-audit/constants";
import { mfePctFromStoryBars } from "@/lib/sr-audit/score-logic";
import type { StoryReplayData } from "@/lib/sr-audit/story-replay-types";
import type { SrZoneEvent } from "@/lib/sr-audit/types";
import { qualifySuccessStory } from "@/lib/videos/success-story";

/** Full candle replay payload for one qualified SR success story. */
export async function loadStoryReplayPayload(eventId: string): Promise<StoryReplayData | null> {
  const db = getAdminFirestore();
  const docSnap = await db.collection(SR_ZONE_EVENTS_COLLECTION).doc(eventId).get();
  if (!docSnap.exists) return null;

  const event = { id: docSnap.id, ...(docSnap.data() as SrZoneEvent) };
  const candidate = qualifySuccessStory(event);
  if (!candidate) return null;

  const snapshot = await loadEventCandles(db, eventId);
  if (!snapshot?.bars?.length) return null;

  const entrySpot = snapshot.entrySpot ?? candidate.entrySpot;
  const maxPain = snapshot.maxPain ?? candidate.maxPain;
  // Canonical headline % = MFE from the bars drawn on the chart (not sticky 5-min score).
  const chartMfe = mfePctFromStoryBars(
    {
      side: candidate.side,
      entrySpot,
      invalidation: snapshot.invalidation ?? candidate.invalidation,
      maxPain,
      eventAt: candidate.eventAt,
    },
    snapshot.bars,
  );
  const movePct =
    chartMfe != null && Number.isFinite(chartMfe) ? chartMfe : candidate.movePct;

  return {
    symbol: candidate.symbol,
    label: candidate.label,
    scope: candidate.scope,
    side: candidate.side,
    entrySpot,
    maxPain,
    invalidation: snapshot.invalidation ?? candidate.invalidation,
    putClusterStrike: snapshot.putClusterStrike ?? candidate.putClusterStrike,
    putClusterSize: snapshot.putClusterSize ?? candidate.putClusterSize,
    callClusterStrike: snapshot.callClusterStrike ?? candidate.callClusterStrike,
    callClusterSize: snapshot.callClusterSize ?? candidate.callClusterSize,
    bullZoneLow: snapshot.bullZoneLow ?? null,
    bullZoneHigh: snapshot.bullZoneHigh ?? null,
    bearZoneLow: snapshot.bearZoneLow ?? null,
    bearZoneHigh: snapshot.bearZoneHigh ?? null,
    zonesExpiry: candidate.zonesExpiry,
    atmIV: candidate.atmIV,
    entryRr: candidate.entryRr,
    movePct,
    maxPainDistancePct: candidate.maxPainDistancePct,
    eventAt: candidate.eventAt,
    pocHitAt: candidate.pocHitAt,
    resolvedAt: candidate.resolvedAt,
    resolveReason: candidate.resolveReason,
    finalPnlPct: candidate.finalPnlPct,
    candles: snapshot.bars.map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c })),
  };
}
