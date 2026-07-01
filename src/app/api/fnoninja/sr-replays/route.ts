import { NextRequest, NextResponse } from "next/server";
import { listSrReplayShorts } from "@/lib/fnoninja/sr-replays";

export const dynamic = "force-dynamic";

/** GET /api/fnoninja/sr-replays?limit=24 */
export async function GET(request: NextRequest) {
  try {
    const raw = request.nextUrl.searchParams.get("limit");
    const limit = raw ? Math.min(Math.max(parseInt(raw, 10) || 24, 1), 100) : 24;
    const replays = await listSrReplayShorts(limit);
    return NextResponse.json(
      { replays, updatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load replays";
    console.error("[fnoninja/sr-replays]", msg);
    return NextResponse.json({ error: msg, replays: [] }, { status: 500 });
  }
}
