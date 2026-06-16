import { NextRequest, NextResponse } from "next/server";
import { getAdminDatabase, getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { hardDeleteMessage } from "@/lib/chat/store";
import { canChatFromSubscription } from "@/lib/chat/access";
import type { SubscriptionDoc } from "@/lib/subscription";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/chat/moderate
 * Returns the open moderation queue (reports).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getAdminFirestore();
  const snap = await db
    .collection("chat_reports")
    .where("status", "==", "open")
    .limit(100)
    .get();

  const reports = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown> & { id: string })
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));

  return NextResponse.json({ reports });
}

/**
 * POST /api/admin/chat/moderate
 * Body: { action: "delete" | "ban" | "unban" | "resolveReport", ... }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const db = getAdminFirestore();
  const now = new Date().toISOString();

  switch (action) {
    case "delete": {
      const roomId = String(body.roomId ?? "");
      const messageId = String(body.messageId ?? "");
      if (!roomId || !messageId) {
        return NextResponse.json({ error: "Missing roomId/messageId" }, { status: 400 });
      }
      await hardDeleteMessage(roomId, messageId);
      return NextResponse.json({ ok: true });
    }

    case "ban": {
      const userId = String(body.userId ?? "");
      const reason = String(body.reason ?? "").slice(0, 500) || "Violation of community rules.";
      if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });
      await db
        .collection("chat_members")
        .doc(userId)
        .set(
          { userId, isBanned: true, banReason: reason, canChat: false, updatedAt: now },
          { merge: true },
        );
      await getAdminDatabase().ref(`members/${userId}/canChat`).set(false);
      return NextResponse.json({ ok: true });
    }

    case "unban": {
      const userId = String(body.userId ?? "");
      if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });
      // Restore access based on current subscription state.
      const subSnap = await db.collection("subscriptions").doc(userId).get();
      const sub = subSnap.exists ? (subSnap.data() as SubscriptionDoc) : null;
      const canChat = canChatFromSubscription(sub);
      await db
        .collection("chat_members")
        .doc(userId)
        .set({ userId, isBanned: false, banReason: null, canChat, updatedAt: now }, { merge: true });
      await getAdminDatabase().ref(`members/${userId}/canChat`).set(canChat);
      return NextResponse.json({ ok: true });
    }

    case "resolveReport": {
      const reportId = String(body.reportId ?? "");
      const status = body.status === "dismissed" ? "dismissed" : "resolved";
      if (!reportId) return NextResponse.json({ error: "Missing reportId" }, { status: 400 });
      await db.collection("chat_reports").doc(reportId).update({ status });
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
