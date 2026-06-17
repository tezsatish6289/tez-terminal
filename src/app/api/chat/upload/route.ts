import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/chat/require-user";
import { resolveChatAccess } from "@/lib/chat/access";
import { checkAndRecordImageUpload } from "@/lib/chat/rate-limit";
import { processAndUploadChatImage } from "@/lib/chat/image-upload";
import { CHAT_IMAGE_MAX_BYTES, isKnownRoom } from "@/lib/chat/constants";

export const dynamic = "force-dynamic";
// Image processing (sharp) requires the Node.js runtime, not the edge runtime.
export const runtime = "nodejs";

/**
 * POST /api/chat/upload  (multipart/form-data: roomId, file)
 *
 * Server-mediated image upload for community chat. Verifies the user, the
 * subscription gate and ban status, applies a stricter image rate limit, then
 * validates + re-encodes the image (stripping metadata) and stores it. Returns
 * the attachment metadata to be attached to a subsequent /api/chat/send call.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const roomId = typeof form.get("roomId") === "string" ? (form.get("roomId") as string) : "";
  if (!isKnownRoom(roomId)) {
    return NextResponse.json({ error: "Unknown room" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (file.size > CHAT_IMAGE_MAX_BYTES) {
    return NextResponse.json(
      { error: `Image exceeds ${Math.round(CHAT_IMAGE_MAX_BYTES / (1024 * 1024))}MB.` },
      { status: 413 },
    );
  }

  const uid = auth.decoded.uid;

  const access = await resolveChatAccess(uid);
  if (access.isBanned) {
    return NextResponse.json({ error: "You are banned from chat." }, { status: 403 });
  }
  if (!access.canChat) {
    return NextResponse.json(
      { error: "An active subscription or trial is required to chat." },
      { status: 403 },
    );
  }

  const rate = await checkAndRecordImageUpload(uid);
  if (!rate.ok) {
    return NextResponse.json(
      { error: "You're uploading images too quickly. Slow down.", retryAfterMs: rate.retryAfterMs },
      { status: 429 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await processAndUploadChatImage({ roomId, uid, buffer });
  if (result.error || !result.attachment) {
    return NextResponse.json({ error: result.error ?? "Upload failed." }, { status: 422 });
  }

  return NextResponse.json({ ok: true, attachment: result.attachment });
}
