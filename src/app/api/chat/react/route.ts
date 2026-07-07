import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/chat/require-user";
import { resolveChatAccess } from "@/lib/chat/access";
import {
  canUserReactInRoom,
  isAllowedChatEmoji,
  isKnownRoom,
} from "@/lib/chat/constants";
import { toggleMessageReaction } from "@/lib/chat/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/chat/react
 * Body: { roomId, messageId, emoji }
 * Toggle the caller's reaction on a message (add if missing, remove if present).
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { roomId?: unknown; messageId?: unknown; emoji?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const roomId = typeof body.roomId === "string" ? body.roomId : "";
  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  const emoji = typeof body.emoji === "string" ? body.emoji.trim() : "";

  if (!isKnownRoom(roomId)) {
    return NextResponse.json({ error: "Unknown room" }, { status: 400 });
  }
  if (!messageId) {
    return NextResponse.json({ error: "Missing messageId." }, { status: 400 });
  }
  if (!isAllowedChatEmoji(emoji)) {
    return NextResponse.json({ error: "Invalid reaction." }, { status: 400 });
  }
  if (!canUserReactInRoom(roomId)) {
    return NextResponse.json({ error: "Reactions are not allowed here." }, { status: 403 });
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

  try {
    const reactions = await toggleMessageReaction(roomId, messageId, emoji, uid);
    return NextResponse.json({ reactions });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not update reaction.";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
