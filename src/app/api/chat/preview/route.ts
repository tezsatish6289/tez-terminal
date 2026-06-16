import { NextResponse } from "next/server";
import { getAdminDatabase } from "@/firebase/admin";
import { GENERAL_ROOM_ID } from "@/lib/chat/constants";
import type { ChatMessage } from "@/lib/chat/types";

export const dynamic = "force-dynamic";

/**
 * Public, sanitized preview of the most recent community-chat messages for the
 * landing page. Reads server-side (Admin SDK) so non-subscribers can see a
 * teaser without the security rules blocking them. We deliberately expose only
 * first name + text, and skip deleted/flagged/empty messages, to avoid leaking
 * full identities or unreviewed content.
 */
interface PreviewMessage {
  id: string;
  name: string;
  text: string;
  createdAt: number;
}

export async function GET() {
  try {
    const snap = await getAdminDatabase()
      .ref(`rooms/${GENERAL_ROOM_ID}/messages`)
      .orderByKey()
      .limitToLast(12)
      .once("value");

    const out: PreviewMessage[] = [];
    snap.forEach((child) => {
      const v = child.val() as ChatMessage | null;
      if (!v || v.deleted || v.flagged) return;
      const text = (v.text ?? "").trim();
      if (!text) return;
      out.push({
        id: v.id ?? (child.key as string),
        name: (v.authorName ?? "Member").trim().split(/\s+/)[0] || "Member",
        text: text.length > 220 ? `${text.slice(0, 217)}…` : text,
        createdAt: typeof v.createdAt === "number" ? v.createdAt : 0,
      });
    });

    out.sort((a, b) => a.createdAt - b.createdAt);

    return NextResponse.json(
      { messages: out.slice(-6) },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      },
    );
  } catch (e) {
    console.error("[chat] preview failed", e);
    return NextResponse.json({ messages: [] });
  }
}
