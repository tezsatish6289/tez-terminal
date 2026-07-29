import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { buildFnoWatchlists } from "@/lib/watchlist/build-fno-watchlists";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/admin/watchlist/fno
 * Admin-only: NSE F&O universe + TradingView export payloads.
 * Query: ?refresh=1 to bypass cache and reload universe
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const refresh = request.nextUrl.searchParams.get("refresh") === "1";

  try {
    const data = await buildFnoWatchlists(refresh);
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin FNO watchlist]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
