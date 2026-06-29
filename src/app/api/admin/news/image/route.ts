import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { generateNewsImage } from "@/lib/news/generate-image";
import { buildImagePrompt } from "@/lib/news/draft";
import { uploadPublicPng } from "@/lib/social/video-storage";

export const dynamic = "force-dynamic";
/** Image generation + composite + upload. */
export const maxDuration = 120;

/**
 * POST /api/admin/news/image  body: { contentId, headline, imagePrompt? }
 * Generates the AI background, composes the branded card, hosts the PNG, and
 * returns its public URL for the Buffer scheduler.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let contentId = "";
  let headline = "";
  let imagePrompt = "";
  try {
    const body = await request.json();
    contentId = String(body?.contentId ?? "").trim();
    headline = String(body?.headline ?? "").trim();
    imagePrompt = String(body?.imagePrompt ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!contentId) return NextResponse.json({ error: "contentId is required" }, { status: 400 });
  if (!headline) return NextResponse.json({ error: "headline is required" }, { status: 400 });

  try {
    const png = await generateNewsImage({ headline, imagePrompt: imagePrompt || buildImagePrompt(headline) });
    const uploaded = await uploadPublicPng(png, { source: "news", id: contentId });
    return NextResponse.json({ imageUrl: uploaded.url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Image generation failed";
    console.error("[admin/news/image]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
