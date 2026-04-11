import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/firebase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken) {
      return NextResponse.json({ deployment: null }, { status: 200 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const db = getAdminFirestore();

    // Single equality filter — no composite index needed at all.
    // Sort and filter by status entirely in code.
    const snap = await db
      .collection("bot_deployments")
      .where("uid", "==", uid)
      .get();

    if (snap.empty) {
      return NextResponse.json({ deployment: null });
    }

    // Find the most recent active deployment
    const active = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string }))
      .filter((d) => d.status === "active")
      .sort((a, b) => {
        const aMs = (a.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
        const bMs = (b.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
        return bMs - aMs;
      });

    if (active.length === 0) {
      return NextResponse.json({ deployment: null });
    }

    const dep = active[0];

    return NextResponse.json({
      deployment: {
        id: dep.id,
        bot: dep.bot,
        exchange: dep.exchange,
        status: dep.status,
        createdAt: (dep.createdAt as { toDate?: () => Date })?.toDate?.()?.toISOString() ?? null,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
