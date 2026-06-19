import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { loadEventCandles } from "@/lib/sr-audit/candle-snapshot";
import { SR_ZONE_EVENTS_COLLECTION } from "@/lib/sr-audit/constants";
import type { SrZoneEvent } from "@/lib/sr-audit/types";
import { qualifySuccessStory } from "@/lib/videos/success-story";

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
    const snapshot = await loadEventCandles(db, id);

    return NextResponse.json({
      candidate,
      candles: snapshot?.bars ?? [],
      levels: snapshot
        ? {
            entrySpot: snapshot.entrySpot,
            maxPain: snapshot.maxPain,
            invalidation: snapshot.invalidation,
            clusterStrike: snapshot.clusterStrike,
            bullZoneLow: snapshot.bullZoneLow,
            bullZoneHigh: snapshot.bullZoneHigh,
            bearZoneLow: snapshot.bearZoneLow,
            bearZoneHigh: snapshot.bearZoneHigh,
          }
        : null,
      hasSnapshot: !!snapshot,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin/sr-audit/story]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
