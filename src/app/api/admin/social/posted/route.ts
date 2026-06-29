import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getPostedContentMap } from "@/lib/social/schedule";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/social/posted?source=sr-audit
 * Returns { posted: { [contentId]: { at, status, platforms } } } so admin lists
 * can show a "Posted" badge next to content that already went to Buffer.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const source = (request.nextUrl.searchParams.get("source") ?? "").trim();
  if (!source) return NextResponse.json({ error: "source is required" }, { status: 400 });

  try {
    const posted = await getPostedContentMap(source);
    return NextResponse.json({ posted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load posted status";
    console.error("[admin/social/posted]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
