import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { cloudRenderConfigured, triggerStoryRender } from "@/lib/videos/cloud-render";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/sr-audit/render  body: { storyId }
 * Kicks off a cloud render of the WinStory reel for one SR-audit success story.
 * Returns { async: true, renderId } to poll via /api/admin/videos/render-status.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let storyId: string;
  try {
    const body = await request.json();
    storyId = String(body?.storyId ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!storyId) {
    return NextResponse.json({ error: "storyId is required" }, { status: 400 });
  }

  if (!cloudRenderConfigured()) {
    return NextResponse.json(
      {
        rendered: false,
        reason: "NOT_CONFIGURED",
        message: "Cloud renderer not set up yet (deploy the Cloud Run Job + set VIDEO_RENDER_JOB).",
      },
      { status: 200 },
    );
  }

  try {
    const renderId = await triggerStoryRender({
      storyId,
      createdBy: auth.decoded.email ?? auth.decoded.uid,
    });
    return NextResponse.json(
      { rendered: false, async: true, renderId, message: "Cloud render started… this takes a few minutes." },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { rendered: false, reason: "CLOUD_TRIGGER_FAILED", message: e instanceof Error ? e.message : "Could not start the cloud render." },
      { status: 200 },
    );
  }
}
