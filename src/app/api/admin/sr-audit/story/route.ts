import { NextRequest, NextResponse } from "next/server";
import { loadStoryReplayPayload } from "@/lib/sr-audit/load-story-replay";
import { requireAdmin } from "@/lib/admin-auth";
import { qualifySuccessStory } from "@/lib/videos/success-story";
import { getAdminFirestore } from "@/firebase/admin";
import { SR_ZONE_EVENTS_COLLECTION } from "@/lib/sr-audit/constants";
import type { SrZoneEvent } from "@/lib/sr-audit/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sr-audit/story?id=<eventId>
 * Returns the full success-story payload for one event: the qualified candidate
 * plus the stored 15-min candle snapshot. Powers the in-page Replay and the
 * downloadable Remotion props ("Create story").
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const db = getAdminFirestore();
    const docSnap = await db.collection(SR_ZONE_EVENTS_COLLECTION).doc(id).get();
    if (!docSnap.exists) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const event = { id: docSnap.id, ...(docSnap.data() as SrZoneEvent) };
    const candidate = qualifySuccessStory(event);
    const replay = await loadStoryReplayPayload(id);

    return NextResponse.json({
      candidate,
      candles: replay?.candles ?? [],
      levels: replay
        ? {
            side: replay.side,
            entrySpot: replay.entrySpot,
            maxPain: replay.maxPain,
            invalidation: replay.invalidation,
            clusterStrike: replay.side === "support" ? replay.putClusterStrike : replay.callClusterStrike,
            putClusterStrike: replay.putClusterStrike,
            putClusterSize: replay.putClusterSize,
            callClusterStrike: replay.callClusterStrike,
            callClusterSize: replay.callClusterSize,
            bullZoneLow: replay.bullZoneLow,
            bullZoneHigh: replay.bullZoneHigh,
            bearZoneLow: replay.bearZoneLow,
            bearZoneHigh: replay.bearZoneHigh,
          }
        : null,
      hasSnapshot: !!replay?.candles.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin/sr-audit/story]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
