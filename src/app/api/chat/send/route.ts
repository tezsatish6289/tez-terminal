import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/chat/require-user";
import { resolveChatAccess } from "@/lib/chat/access";
import { checkAndRecordPost } from "@/lib/chat/rate-limit";
import { moderateMessage, parseMentions } from "@/lib/chat/moderation";
import { createMessage } from "@/lib/chat/store";
import { CHAT_MAX_MESSAGE_LENGTH, isKnownRoom } from "@/lib/chat/constants";

export const dynamic = "force-dynamic";

/**
 * POST /api/chat/send
 * Body: { roomId, text }
 * Single enforcement point for community chat writes: verifies the user, the
 * subscription gate (canChat) and ban status, rate limits, runs the pre-send
 * content filter, then dual-writes to RTDB + Firestore.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { roomId?: unknown; text?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const roomId = typeof body.roomId === "string" ? body.roomId : "";
  const rawText = typeof body.text === "string" ? body.text : "";

  if (!isKnownRoom(roomId)) {
    return NextResponse.json({ error: "Unknown room" }, { status: 400 });
  }

  const text = rawText.trim();
  if (!text) {
    return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  }
  if (text.length > CHAT_MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message exceeds ${CHAT_MAX_MESSAGE_LENGTH} characters.` },
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

  const moderation = moderateMessage(text);
  if (moderation.blocked) {
    return NextResponse.json({ error: moderation.reason ?? "Message blocked." }, { status: 422 });
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
    mentions: parseMentions(text),
    flagged: moderation.flagged,
  });

  return NextResponse.json({ ok: true, message });
}
