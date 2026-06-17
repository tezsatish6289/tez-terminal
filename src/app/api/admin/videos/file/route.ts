import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "@/lib/admin-auth";
import { getTopic } from "@/lib/videos/topics";
import { videoDir } from "@/lib/videos/render";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const topicId = request.nextUrl.searchParams.get("topicId") ?? "";
  const topic = getTopic(topicId);
  if (!topic) {
    return NextResponse.json({ error: "Unknown topic" }, { status: 400 });
  }

  try {
    const buf = await readFile(path.join(videoDir(), topic.outputFile));
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(buf.length),
        "Content-Disposition": `inline; filename="${topic.id}.mp4"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Rendered video not found. Generate it first.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }
}
