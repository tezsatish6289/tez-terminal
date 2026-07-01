import { NextRequest, NextResponse } from "next/server";
import { loadStoryReplayPayload } from "@/lib/sr-audit/load-story-replay";

export const dynamic = "force-dynamic";

/** GET /api/fnoninja/sr-replays/story?id=<eventId> */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const replay = await loadStoryReplayPayload(id);
    if (!replay) {
      return NextResponse.json({ error: "Story not found or not replayable" }, { status: 404 });
    }
    return NextResponse.json(
      { replay },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load story";
    console.error("[fnoninja/sr-replays/story]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
