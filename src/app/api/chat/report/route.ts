import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireUser } from "@/lib/chat/require-user";
import { getMessage } from "@/lib/chat/store";
import { isKnownRoom } from "@/lib/chat/constants";
import type { ChatReportDoc } from "@/lib/chat/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/chat/report
 * Body: { roomId, messageId, reason }
 * Files a message into the moderation queue (chat_reports).
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { roomId?: unknown; messageId?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const roomId = typeof body.roomId === "string" ? body.roomId : "";
  const messageId = typeof body.messageId === "string" ? body.messageId : "";
  const reason = (typeof body.reason === "string" ? body.reason : "").trim().slice(0, 500);

  if (!isKnownRoom(roomId) || !messageId) {
    return NextResponse.json({ error: "Invalid report target." }, { status: 400 });
  }

  const message = await getMessage(roomId, messageId);
  if (!message) {
    return NextResponse.json({ error: "Message not found." }, { status: 404 });
  }

  const report: ChatReportDoc = {
    roomId,
    messageId,
    reporterId: auth.decoded.uid,
    reason: reason || "(no reason given)",
    messageText: message.text,
    messageAuthorId: message.authorId,
    status: "open",
    createdAt: new Date().toISOString(),
  };

  await getAdminFirestore().collection("chat_reports").add(report);

  return NextResponse.json({ ok: true });
}
