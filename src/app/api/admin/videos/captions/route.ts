import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getTopic } from "@/lib/videos/topics";
import { buildTopicSummary, TopicDataMissingError } from "@/lib/videos/build-topic-summary";
import { generateCaptionsFromSummary } from "@/lib/videos/generate-captions";

export const dynamic = "force-dynamic";
/** Caption generation calls Gemini; give it headroom. */
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let topicId: string;
  try {
    const body = await request.json();
    topicId = String(body?.topicId ?? "");
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const topic = getTopic(topicId);
  if (!topic) {
    return NextResponse.json({ error: "Unknown topic" }, { status: 400 });
  }

  let summary;
  try {
    summary = await buildTopicSummary(topic);
  } catch (e) {
    if (e instanceof TopicDataMissingError) {
      return NextResponse.json(
        {
          error: `No data for "${topic.label}" yet. Generate the video first (which fetches the data), then try again.`,
          code: "DATA_MISSING",
        },
        { status: 409 },
      );
    }
    const msg = e instanceof Error ? e.message : "Failed to read topic data";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (summary.stocks.length === 0) {
    return NextResponse.json(
      { error: "Topic data has no stocks — nothing to caption.", code: "EMPTY", summary },
      { status: 409 },
    );
  }

  try {
    const captions = await generateCaptionsFromSummary(summary);
    return NextResponse.json({ summary, captions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Caption generation failed";
    console.error("[admin/videos/captions]", msg);
    const lower = msg.toLowerCase();
    if (lower.includes("api key") || lower.includes("api_key") || lower.includes("failed_precondition")) {
      return NextResponse.json(
        {
          error:
            "Gemini API key not configured. Add GOOGLE_GENAI_API_KEY to .env.local and restart the dev server (env files are only read at startup).",
          code: "NO_API_KEY",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
