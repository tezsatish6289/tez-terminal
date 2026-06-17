import { NextRequest, NextResponse } from "next/server";
import { stat } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "@/lib/admin-auth";
import { VIDEO_TOPICS, VIDEO_PLATFORMS } from "@/lib/videos/topics";
import { canRenderLocally, fetchBaseUrl, renderCommand, videoDir } from "@/lib/videos/render";

export const dynamic = "force-dynamic";

async function fileInfo(rel: string): Promise<{ exists: boolean; modifiedAt: string | null; size: number | null }> {
  try {
    const s = await stat(path.join(videoDir(), rel));
    return { exists: true, modifiedAt: s.mtime.toISOString(), size: s.size };
  } catch {
    return { exists: false, modifiedAt: null, size: null };
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const baseUrl = fetchBaseUrl();
  const renderable = await canRenderLocally();

  const topics = await Promise.all(
    VIDEO_TOPICS.map(async (t) => {
      const [data, video] = await Promise.all([fileInfo(t.propsFile), fileInfo(t.outputFile)]);
      return {
        id: t.id,
        label: t.label,
        description: t.description,
        variant: t.variant,
        compositionId: t.compositionId,
        propsFile: t.propsFile,
        outputFile: t.outputFile,
        data,
        video,
        renderCommand: renderCommand(t, baseUrl),
      };
    }),
  );

  return NextResponse.json({
    topics,
    platforms: VIDEO_PLATFORMS,
    renderable,
    baseUrl,
    aiConfigured: Boolean(
      process.env.GOOGLE_GENAI_API_KEY ||
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY,
    ),
  });
}
