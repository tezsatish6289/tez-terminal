/**
 * /api/freedombot/levels/news?scope=stock&symbol=ASTRAL&window=28
 * /api/freedombot/levels/news?scope=index&symbol=NIFTY&window=28
 *
 * Default window is 28 days (4 weeks). Response includes AI sentiment score + label.
 *
 * AI-grounded recent news + citations for the levels chart side panel.
 * Cached server-side (Firestore + memory) so grounded calls are rare.
 */

import { NextRequest, NextResponse } from "next/server";
import { getLevelsNews } from "@/lib/levels/news";

export const dynamic = "force-dynamic";
export const revalidate = 0;
/** Grounded generation can take ~10-20s on a cache miss. */
export const maxDuration = 45;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") ?? "stock";
  const symbol = searchParams.get("symbol") ?? "";
  const window = searchParams.get("window");

  if (!symbol.trim()) {
    return NextResponse.json({ ok: false, error: "Missing symbol" }, { status: 400 });
  }

  try {
    const news = await getLevelsNews(scope, symbol, window);
    if (!news) {
      return NextResponse.json(
        { ok: false, error: "Unknown symbol" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { ok: true, news },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg || "Failed to load news" },
      { status: 500 },
    );
  }
}
