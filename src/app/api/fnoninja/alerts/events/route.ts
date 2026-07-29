import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import {
  SCORE_ALERT_EVENTS_COLLECTION,
  SCORE_ALERT_EVENTS_LIMIT,
} from "@/lib/alerts/constants";
import type { ScoreAlertEvent } from "@/lib/alerts/types";
import { requireUser } from "@/lib/chat/require-user";

export const dynamic = "force-dynamic";

function parseEvent(id: string, data: Record<string, unknown>): ScoreAlertEvent | null {
  if (typeof data.symbol !== "string" || typeof data.at !== "string") return null;
  const scope = data.scope === "index" ? "index" : data.scope === "stock" ? "stock" : null;
  const side =
    data.side === "support" || data.side === "resistance" ? data.side : null;
  if (!scope || !side) return null;
  return {
    id: typeof data.id === "string" ? data.id : id,
    symbol: data.symbol,
    label: typeof data.label === "string" ? data.label : data.symbol,
    scope,
    side,
    score: typeof data.score === "number" ? data.score : Number(data.score) || 0,
    minScore:
      data.minScore === 60 || data.minScore === 70 || data.minScore === 80
        ? data.minScore
        : 70,
    probabilityPct:
      typeof data.probabilityPct === "number"
        ? data.probabilityPct
        : Number(data.probabilityPct) || 0,
    at: data.at,
    readAt: typeof data.readAt === "string" ? data.readAt : null,
  };
}

/**
 * GET /api/fnoninja/alerts/events — recent score alerts + unread count.
 * POST { action: "mark_all_read" | "mark_read", id? }
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const col = getAdminFirestore()
    .collection(SCORE_ALERT_EVENTS_COLLECTION)
    .doc(auth.decoded.uid)
    .collection("items");

  const snap = await col.orderBy("at", "desc").limit(SCORE_ALERT_EVENTS_LIMIT).get();
  const events: ScoreAlertEvent[] = [];
  let unreadCount = 0;
  for (const doc of snap.docs) {
    const ev = parseEvent(doc.id, doc.data() as Record<string, unknown>);
    if (!ev) continue;
    events.push(ev);
    if (!ev.readAt) unreadCount += 1;
  }

  return NextResponse.json({ events, unreadCount });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { action?: string; id?: string };
  try {
    body = (await request.json()) as { action?: string; id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const uid = auth.decoded.uid;
  const col = getAdminFirestore()
    .collection(SCORE_ALERT_EVENTS_COLLECTION)
    .doc(uid)
    .collection("items");
  const now = new Date().toISOString();

  if (body.action === "mark_read") {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await col.doc(id).set({ readAt: now }, { merge: true });
    return NextResponse.json({ ok: true, id, readAt: now });
  }

  if (body.action === "mark_all_read") {
    const snap = await col.orderBy("at", "desc").limit(SCORE_ALERT_EVENTS_LIMIT).get();
    const batch = getAdminFirestore().batch();
    let marked = 0;
    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>;
      if (typeof data.readAt === "string" && data.readAt) continue;
      batch.set(doc.ref, { readAt: now }, { merge: true });
      marked += 1;
    }
    if (marked > 0) await batch.commit();
    return NextResponse.json({ ok: true, marked, readAt: now });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
