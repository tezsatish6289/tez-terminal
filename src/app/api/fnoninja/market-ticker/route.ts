import { NextResponse } from "next/server";
import { getMarketTickerItems } from "@/lib/fnoninja/market-ticker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const items = await getMarketTickerItems();
    return NextResponse.json(
      { items, updatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
    );
  } catch {
    return NextResponse.json(
      { items: [], updatedAt: new Date().toISOString() },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }
}
