import { NextResponse } from "next/server";
import { loadMmi } from "@/lib/fnoninja/load-mmi";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const snapshot = await loadMmi();
    if (!snapshot) {
      return NextResponse.json(
        { error: "mmi_upstream_failed" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=180" },
    });
  } catch {
    return NextResponse.json(
      { error: "mmi_fetch_failed" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
