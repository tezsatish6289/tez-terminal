import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { buildWatchlists } from "@/lib/watchlist/build-watchlists";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/admin/watchlist
 * Admin-only: live multi-venue symbol universe + TradingView export payloads.
 * Query: ?refresh=1 to bypass cache
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const refresh = request.nextUrl.searchParams.get("refresh") === "1";

  try {
    const data = await buildWatchlists(refresh);
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin watchlist]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
