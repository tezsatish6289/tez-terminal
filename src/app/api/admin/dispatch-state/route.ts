import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

type DispatchRow = {
  id: string;
  simTradeId: string;
  userId: string;
  exchange: string;
  bot: string;
  botSource: string;
  symbol: string;
  side: string;
  status: "DISPATCHING" | "EXECUTED" | "FAILED" | string;
  reason: string | null;
  liveTradeId: string | null;
  attemptCount: number;
  createdAt: string | null;
  updatedAt: string | null;
};

/**
 * GET /api/admin/dispatch-state?simTradeId=…
 * GET /api/admin/dispatch-state?userId=…&limit=50
 *
 * Read-only inspection of the dispatch_state collection introduced by the
 * idempotency PR. One doc is created per (simTradeId × userId × exchange)
 * tuple at the moment `executeForAllUsers` claims a slot, then transitions
 * DISPATCHING → EXECUTED|FAILED.
 *
 * Designed to avoid composite-index dependencies: queries use a single
 * equality filter and we sort results in memory. Fine for the tiny page
 * sizes this collection produces per signal (≤ active deployments).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const simTradeId = searchParams.get("simTradeId")?.trim() || null;
    const userId = searchParams.get("userId")?.trim() || null;
    const limit = Math.min(
      500,
      Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10) || 100),
    );

    if (!simTradeId && !userId) {
      return NextResponse.json(
        { error: "Provide simTradeId or userId query param" },
        { status: 400 },
      );
    }

    const db = getAdminFirestore();
    let q: FirebaseFirestore.Query = db.collection("dispatch_state");
    if (simTradeId) {
      q = q.where("simTradeId", "==", simTradeId);
    } else if (userId) {
      q = q.where("userId", "==", userId).limit(limit);
    }

    const snap = await q.get();
    const items: DispatchRow[] = snap.docs.map((d) => {
      const x = d.data();
      const createdAt = x.createdAt as { toDate?: () => Date } | undefined;
      const updatedAt = x.updatedAt as { toDate?: () => Date } | undefined;
      return {
        id: d.id,
        simTradeId: String(x.simTradeId ?? ""),
        userId: String(x.userId ?? ""),
        exchange: String(x.exchange ?? ""),
        bot: String(x.bot ?? ""),
        botSource: String(x.botSource ?? ""),
        symbol: String(x.symbol ?? ""),
        side: String(x.side ?? ""),
        status: String(x.status ?? ""),
        reason: typeof x.reason === "string" ? x.reason : null,
        liveTradeId:
          typeof x.liveTradeId === "string" ? x.liveTradeId : null,
        attemptCount:
          typeof x.attemptCount === "number" ? x.attemptCount : 1,
        createdAt: createdAt?.toDate?.()?.toISOString() ?? null,
        updatedAt: updatedAt?.toDate?.()?.toISOString() ?? null,
      };
    });

    items.sort((a, b) => {
      const ta = a.createdAt ?? "";
      const tb = b.createdAt ?? "";
      return tb.localeCompare(ta);
    });
    const trimmed = items.slice(0, limit);

    const summary = trimmed.reduce<Record<string, number>>((acc, it) => {
      acc[it.status] = (acc[it.status] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      items: trimmed,
      count: trimmed.length,
      totalScanned: items.length,
      summary,
      filter: simTradeId ? { simTradeId } : { userId },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin Dispatch State]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
