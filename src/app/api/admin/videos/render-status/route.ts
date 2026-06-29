import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { readRenderStatus } from "@/lib/videos/cloud-render";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/videos/render-status?renderId=...
 * Polled by /admin/videos while a Cloud Run Job render is in flight. Returns the
 * `video_renders/{renderId}` doc (status: queued | rendering | ready | failed),
 * including the public MP4 `url` once ready.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const renderId = new URL(request.url).searchParams.get("renderId")?.trim();
  if (!renderId) {
    return NextResponse.json({ error: "renderId is required" }, { status: 400 });
  }

  const status = await readRenderStatus(renderId);
  if (!status) {
    return NextResponse.json({ error: "Unknown renderId" }, { status: 404 });
  }
  return NextResponse.json({ renderId, ...status });
}
