import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/chat/require-user";
import { resolveChatAccess } from "@/lib/chat/access";
import { checkAndRecordPost } from "@/lib/chat/rate-limit";
import { moderateMessage, parseMentions } from "@/lib/chat/moderation";
import { createMessage } from "@/lib/chat/store";
import { resolveUploadedAttachment } from "@/lib/chat/image-upload";
import {
  CHAT_MAX_ATTACHMENTS,
  CHAT_MAX_MESSAGE_LENGTH,
  isKnownRoom,
} from "@/lib/chat/constants";
import type { ChatAttachment } from "@/lib/chat/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/chat/send
 * Body: { roomId, text, attachmentPaths? }
 * Single enforcement point for community chat writes: verifies the user, the
 * subscription gate (canChat) and ban status, rate limits, runs the pre-send
 * content filter, re-validates any uploaded attachments, then dual-writes to
 * RTDB + Firestore. A message may contain text, attachments, or both.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { roomId?: unknown; text?: unknown; attachmentPaths?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const roomId = typeof body.roomId === "string" ? body.roomId : "";
  const rawText = typeof body.text === "string" ? body.text : "";
  const attachmentPaths = Array.isArray(body.attachmentPaths)
    ? body.attachmentPaths.filter((p): p is string => typeof p === "string")
    : [];

  if (!isKnownRoom(roomId)) {
    return NextResponse.json({ error: "Unknown room" }, { status: 400 });
  }

  const text = rawText.trim();
  if (!text && attachmentPaths.length === 0) {
    return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  }
  if (text.length > CHAT_MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message exceeds ${CHAT_MAX_MESSAGE_LENGTH} characters.` },
      { status: 400 },
    );
  }
  if (attachmentPaths.length > CHAT_MAX_ATTACHMENTS) {
    return NextResponse.json(
      { error: `A message can include at most ${CHAT_MAX_ATTACHMENTS} images.` },
      { status: 400 },
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

  // Only moderate the text portion; images rely on report + moderator review.
  const moderation = text
    ? moderateMessage(text)
    : { blocked: false, flagged: false, reason: null };
  if (moderation.blocked) {
    return NextResponse.json({ error: moderation.reason ?? "Message blocked." }, { status: 422 });
  }

  // Re-read each attachment from Storage so the persisted metadata is trusted
  // (the client only sends opaque paths under its own folder).
  let attachments: ChatAttachment[] = [];
  if (attachmentPaths.length) {
    const resolved = await Promise.all(
      attachmentPaths.map((path) => resolveUploadedAttachment({ roomId, uid, path })),
    );
    if (resolved.some((a) => a === null)) {
      return NextResponse.json({ error: "An attached image is missing or invalid." }, { status: 400 });
    }
    attachments = resolved as ChatAttachment[];
  }

  const rate = await checkAndRecordPost(uid);
  if (!rate.ok) {
    return NextResponse.json(
      { error: "You're sending messages too quickly. Slow down.", retryAfterMs: rate.retryAfterMs },
      { status: 429 },
    );
  }

  const message = await createMessage({
    roomId,
    authorId: uid,
    authorName: auth.decoded.name ?? "Trader",
    authorPhoto: auth.decoded.picture ?? null,
    text,
    mentions: text ? parseMentions(text) : [],
    flagged: moderation.flagged,
    attachments,
  });

  return NextResponse.json({ ok: true, message });
}
