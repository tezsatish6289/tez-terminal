import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireUser } from "@/lib/chat/require-user";
import { SR_ZONE_EVENTS_COLLECTION } from "@/lib/sr-audit/constants";
import type { SrZoneEvent } from "@/lib/sr-audit/types";

export const dynamic = "force-dynamic";

const CLAIMS_COLLECTION = "success_story_trades";
const COUNTS_COLLECTION = "success_story_trade_counts";

/**
 * POST — record "I traded this" for social proof.
 * GET  — count (+ whether current user claimed) for a story, plus canonical MFE %.
 */
export async function GET(request: NextRequest) {
  const storyId = request.nextUrl.searchParams.get("storyId")?.trim();
  if (!storyId) {
    return NextResponse.json({ error: "storyId required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const [countSnap, eventSnap] = await Promise.all([
    db.collection(COUNTS_COLLECTION).doc(storyId).get(),
    db.collection(SR_ZONE_EVENTS_COLLECTION).doc(storyId).get(),
  ]);
  const count = Number((countSnap.data() as { count?: number } | undefined)?.count ?? 0);

  let movePct: number | null = null;
  if (eventSnap.exists) {
    const event = eventSnap.data() as SrZoneEvent;
    if (typeof event.maxFavorablePct === "number" && Number.isFinite(event.maxFavorablePct)) {
      movePct = event.maxFavorablePct;
    }
  }

  let claimed = false;
  const auth = await requireUser(request);
  if (auth.ok) {
    const claimId = `${storyId}_${auth.decoded.uid}`;
    const claimSnap = await db.collection(CLAIMS_COLLECTION).doc(claimId).get();
    claimed = claimSnap.exists;
  }

  return NextResponse.json({ storyId, count, claimed, movePct });
}

export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: { storyId?: unknown; symbol?: unknown; movePct?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const storyId = typeof body.storyId === "string" ? body.storyId.trim() : "";
  if (!storyId || storyId.length > 128) {
    return NextResponse.json({ error: "storyId required" }, { status: 400 });
  }

  const symbol =
    typeof body.symbol === "string" ? body.symbol.trim().toUpperCase().slice(0, 24) : "";
  const movePct =
    typeof body.movePct === "number" && Number.isFinite(body.movePct)
      ? body.movePct
      : typeof body.movePct === "string" && Number.isFinite(Number(body.movePct))
        ? Number(body.movePct)
        : null;

  const uid = auth.decoded.uid;
  const claimId = `${storyId}_${uid}`;
  const db = getAdminFirestore();
  const claimRef = db.collection(CLAIMS_COLLECTION).doc(claimId);
  const countRef = db.collection(COUNTS_COLLECTION).doc(storyId);

  const existing = await claimRef.get();
  if (existing.exists) {
    const countSnap = await countRef.get();
    const count = Number((countSnap.data() as { count?: number } | undefined)?.count ?? 0);
    return NextResponse.json({ ok: true, claimed: true, already: true, count });
  }

  const now = new Date().toISOString();
  await db.runTransaction(async (tx) => {
    tx.set(claimRef, {
      storyId,
      uid,
      email: auth.decoded.email ?? null,
      displayName: auth.decoded.name ?? null,
      symbol: symbol || null,
      movePct,
      createdAt: now,
    });
    tx.set(
      countRef,
      {
        storyId,
        count: FieldValue.increment(1),
        symbol: symbol || null,
        updatedAt: now,
      },
      { merge: true },
    );
  });

  const countSnap = await countRef.get();
  const count = Number((countSnap.data() as { count?: number } | undefined)?.count ?? 1);

  return NextResponse.json({ ok: true, claimed: true, already: false, count });
}
