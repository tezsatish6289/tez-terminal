import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import type { SimTrade } from "@/lib/simulator";
import { forceCloseSimTrade } from "@/lib/admin/force-close-sim-trade";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/sim/force-close?simTradeId=...
 * Auth: admin only.
 *
 * Read-only preflight. Returns the blast-radius the caller would inflict
 * if they POSTed to this endpoint with the same `simTradeId`.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const simTradeId = searchParams.get("simTradeId");
    if (!simTradeId || typeof simTradeId !== "string") {
      return NextResponse.json({ error: "Missing simTradeId" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const simDoc = await db.collection("simulator_trades").doc(simTradeId).get();
    if (!simDoc.exists) {
      return NextResponse.json({ error: "Sim trade not found" }, { status: 404 });
    }
    const simTrade = { id: simDoc.id, ...simDoc.data() } as SimTrade;

    const liveSnap = await db
      .collection("live_trades")
      .where("simTradeId", "==", simTradeId)
      .where("status", "==", "OPEN")
      .get();

    type MirrorRow = {
      id: string;
      userId: string;
      exchange: string;
      side: string;
      qty: number;
      status: string;
    };
    const liveMirrors: MirrorRow[] = liveSnap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        userId: String(data.userId ?? ""),
        exchange: String(data.exchange ?? ""),
        side: String(data.side ?? ""),
        qty: Number(data.positionSize ?? data.quantity ?? 0),
        status: String(data.status ?? "OPEN"),
      };
    });

    const userIds = new Set(liveMirrors.map((m) => m.userId).filter(Boolean));
    const byExchange: Record<string, number> = {};
    for (const m of liveMirrors) {
      byExchange[m.exchange] = (byExchange[m.exchange] ?? 0) + 1;
    }

    return NextResponse.json({
      simTrade: {
        id: simTrade.id,
        symbol: simTrade.symbol,
        side: simTrade.side,
        status: simTrade.status,
        currentPrice: simTrade.currentPrice ?? simTrade.entryPrice,
        entryPrice: simTrade.entryPrice,
      },
      liveMirrors,
      summary: {
        liveMirrorCount: liveMirrors.length,
        userCount: userIds.size,
        byExchange,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[force-close GET preflight]", msg);
    return NextResponse.json(
      { error: `Preflight failed: ${msg}` },
      { status: 500 },
    );
  }
}

/**
 * POST /api/sim/force-close
 * Body: { simTradeId: string }
 * Auth: admin only (Firebase ID token + admin_user_roles membership).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => null);
    const simTradeId =
      body && typeof body === "object" ? (body as { simTradeId?: unknown }).simTradeId : undefined;
    if (!simTradeId || typeof simTradeId !== "string") {
      return NextResponse.json({ error: "Missing simTradeId" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const result = await forceCloseSimTrade(db, simTradeId);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Sim trade not found") {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    console.error("[force-close POST]", msg, e);
    return NextResponse.json(
      {
        error: `Force close failed: ${msg}`,
        retrySafe: true,
        hint: "If the sim doc is already CLOSED, sync-live-trades will reconcile any open mirrors within 60s. Otherwise, retry the kill switch — the operation is idempotent.",
      },
      { status: 500 },
    );
  }
}
