import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/chat/require-user";
import { resolveChatAccess } from "@/lib/chat/access";
import { moderateMessage, parseSymbolMentions } from "@/lib/chat/moderation";
import { editMessage, getMessage, softDeleteMessage } from "@/lib/chat/store";
import {
  CHAT_EDIT_WINDOW_MS,
  CHAT_MAX_MESSAGE_LENGTH,
  isKnownRoom,
} from "@/lib/chat/constants";

export const dynamic = "force-dynamic";

function roomFrom(request: NextRequest): string {
  return new URL(request.url).searchParams.get("roomId") ?? "";
}

/** PATCH /api/chat/message/[id]?roomId=... — author edits own message in window. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const roomId = roomFrom(request);
  if (!isKnownRoom(roomId)) {
    return NextResponse.json({ error: "Unknown room" }, { status: 400 });
  }

  let body: { text?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  if (text.length > CHAT_MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message exceeds ${CHAT_MAX_MESSAGE_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const message = await getMessage(roomId, id);
  if (!message || message.deleted) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }
  if (message.authorId !== auth.decoded.uid) {
    return NextResponse.json({ error: "You can only edit your own messages." }, { status: 403 });
  }
  if (Date.now() - message.createdAt > CHAT_EDIT_WINDOW_MS) {
    return NextResponse.json({ error: "Edit window has passed." }, { status: 403 });
  }

  // Banned users can't edit either.
  const access = await resolveChatAccess(auth.decoded.uid);
  if (access.isBanned) {
    return NextResponse.json({ error: "You are banned from chat." }, { status: 403 });
  }

  const moderation = moderateMessage(text);
  if (moderation.blocked) {
    return NextResponse.json({ error: moderation.reason ?? "Message blocked." }, { status: 422 });
  }

  await editMessage(roomId, id, {
    text,
    mentions: parseSymbolMentions(text),
    flagged: moderation.flagged,
  });

  return NextResponse.json({ ok: true });
}

/** DELETE /api/chat/message/[id]?roomId=... — author soft-deletes own message. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await params;
  const roomId = roomFrom(request);
  if (!isKnownRoom(roomId)) {
    return NextResponse.json({ error: "Unknown room" }, { status: 400 });
  }

  const message = await getMessage(roomId, id);
  if (!message) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }
  if (message.authorId !== auth.decoded.uid) {
    return NextResponse.json({ error: "You can only delete your own messages." }, { status: 403 });
  }

  await softDeleteMessage(roomId, id, "user");
  return NextResponse.json({ ok: true });
}
