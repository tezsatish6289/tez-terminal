import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { uploadPublicMp4, uploadPublicPng } from "@/lib/social/video-storage";
import { scheduleToBuffer, type ScheduleTiming } from "@/lib/social/schedule";
import type { SocialPlatformId } from "@/lib/social/platforms";
import { SOCIAL_PLATFORMS } from "@/lib/social/platforms";

export const dynamic = "force-dynamic";
/** Uploads an MP4 to Storage then makes several Buffer calls — give it headroom. */
export const maxDuration = 120;

const VALID_PLATFORMS = new Set<string>(SOCIAL_PLATFORMS.map((p) => p.id));

interface SchedulePayload {
  source: string;
  contentId: string;
  contentLabel: string;
  captions: Partial<Record<SocialPlatformId, string>>;
  platforms: SocialPlatformId[];
  timing: ScheduleTiming;
  /** Use an already-public URL instead of uploading a file. */
  videoUrl?: string;
  /** Already-public image URL for image posts. */
  imageUrl?: string;
}

/**
 * POST /api/admin/social/schedule  (multipart/form-data)
 *   - video?:   MP4 file to host publicly (omit if videoUrl is provided)
 *   - payload:  JSON string (SchedulePayload)
 *
 * Uploads the video to public Storage (if a file is sent), then creates one
 * Buffer post per selected channel with its clamped caption + jittered time.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  let payload: SchedulePayload;
  try {
    payload = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return NextResponse.json({ error: "Invalid or missing payload JSON" }, { status: 400 });
  }

  // Validate the essentials.
  if (!payload.contentId || !payload.source) {
    return NextResponse.json({ error: "payload.source and payload.contentId are required" }, { status: 400 });
  }
  const platforms = (payload.platforms ?? []).filter((p) => VALID_PLATFORMS.has(p));
  if (platforms.length === 0) {
    return NextResponse.json({ error: "Select at least one connected platform" }, { status: 400 });
  }
  if (payload.timing?.mode === "scheduled") {
    if (!payload.timing.baseIso || Number.isNaN(Date.parse(payload.timing.baseIso))) {
      return NextResponse.json({ error: "A valid baseIso is required for scheduled posts" }, { status: 400 });
    }
  } else if (payload.timing?.mode !== "now") {
    return NextResponse.json({ error: "timing.mode must be 'now' or 'scheduled'" }, { status: 400 });
  }

  // Resolve the public video URL — upload a file, or trust a supplied URL.
  let videoUrl = payload.videoUrl?.trim();
  const file = form.get("video");
  if (file && typeof file !== "string") {
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      const uploaded = await uploadPublicMp4(bytes, { source: payload.source, id: payload.contentId });
      videoUrl = uploaded.url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Video upload failed";
      return NextResponse.json({ error: `Could not host the video: ${msg}` }, { status: 500 });
    }
  }

  // Resolve the public image URL — upload a file, or trust a supplied URL.
  let imageUrl = payload.imageUrl?.trim();
  const imageFile = form.get("image");
  if (imageFile && typeof imageFile !== "string") {
    try {
      const bytes = Buffer.from(await imageFile.arrayBuffer());
      const uploaded = await uploadPublicPng(bytes, { source: payload.source, id: payload.contentId });
      imageUrl = uploaded.url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Image upload failed";
      return NextResponse.json({ error: `Could not host the image: ${msg}` }, { status: 500 });
    }
  }

  if (!videoUrl && !imageUrl) {
    return NextResponse.json(
      { error: "No media provided — attach a video/image file or pass a public videoUrl/imageUrl" },
      { status: 400 },
    );
  }

  try {
    const result = await scheduleToBuffer({
      source: payload.source,
      contentId: payload.contentId,
      contentLabel: payload.contentLabel ?? payload.contentId,
      videoUrl,
      imageUrl,
      captions: payload.captions ?? {},
      platforms,
      timing: payload.timing,
      createdBy: auth.decoded.email ?? auth.decoded.uid,
    });
    return NextResponse.json({ ...result, videoUrl, imageUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Scheduling failed";
    console.error("[admin/social/schedule]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
