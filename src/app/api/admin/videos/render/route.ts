import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getTopic } from "@/lib/videos/topics";
import { canRenderLocally, fetchBaseUrl, renderCommand, runRender } from "@/lib/videos/render";

export const dynamic = "force-dynamic";
/** A full render takes minutes; only ever runs on a local dev machine. */
export const maxDuration = 600;

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let topicId: string;
  let refreshData = true;
  try {
    const body = await request.json();
    topicId = String(body?.topicId ?? "");
    if (typeof body?.refreshData === "boolean") refreshData = body.refreshData;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const topic = getTopic(topicId);
  if (!topic) {
    return NextResponse.json({ error: "Unknown topic" }, { status: 400 });
  }

  const baseUrl = fetchBaseUrl();

  if (!(await canRenderLocally())) {
    return NextResponse.json(
      {
        rendered: false,
        reason: "NOT_LOCAL",
        message:
          "Rendering runs on your local machine (this server can't render video). Run the command below in the repo, then reload to preview.",
        command: renderCommand(topic, baseUrl),
      },
      { status: 200 },
    );
  }

  const result = await runRender(topic, { baseUrl, refreshData });

  const messageFor = (reason: string | null): string | null => {
    if (reason === "NO_DATA")
      return `The data source (${baseUrl}) returned no qualifying stocks for this topic right now, so there's nothing to put in the video. Try later, or set VIDEO_FETCH_BASE_URL to a source that has data.`;
    if (reason === "FETCH_FAILED")
      return `Couldn't fetch data from ${baseUrl}. Check the URL / your connection.`;
    if (reason === "RENDER_FAILED")
      return `Render failed (exit ${result.code}). See the log or run the command manually.`;
    return null;
  };

  return NextResponse.json(
    {
      rendered: result.ok,
      reason: result.reason,
      message: messageFor(result.reason),
      code: result.code,
      stockCount: result.stockCount,
      log: result.log.slice(-6000),
      command: renderCommand(topic, baseUrl),
    },
    { status: 200 },
  );
}
