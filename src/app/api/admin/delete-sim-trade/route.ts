import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { deleteSimTradeRecords } from "@/lib/admin/delete-sim-trade-records";

export const dynamic = "force-dynamic";

type Body = {
  simTradeId?: string;
  dry?: boolean;
  forceLiveDelete?: boolean;
  reconcile?: boolean;
};

/**
 * POST /api/admin/delete-sim-trade
 * Body: { simTradeId, dry?, forceLiveDelete?, reconcile? }
 * Auth: admin Firebase ID token.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const simTradeId = body.simTradeId?.trim();
  if (!simTradeId) {
    return NextResponse.json({ error: "simTradeId required" }, { status: 400 });
  }

  const dryRun = body.dry === true;
  const forceLiveDelete = body.forceLiveDelete === true;
  const reconcile = body.reconcile !== false;
  const db = getAdminFirestore();

  try {
    const result = await deleteSimTradeRecords({
      db,
      simTradeId,
      dryRun,
      forceLiveDelete,
    });

    if (!dryRun) {
      await db.collection("logs").add({
        timestamp: new Date().toISOString(),
        level: "INFO",
        message: `DELETE_SIM_TRADE: removed ${simTradeId} (${result.preview.symbol} ${result.preview.side}) by ${auth.decoded.email ?? auth.decoded.uid}`,
        webhookId: "ADMIN_DELETE_SIM_TRADE",
      });
    }

    let reconcileResult: unknown = null;
    if (!dryRun && reconcile) {
      const origin = new URL(request.url).origin;
      const cronSecret = process.env.CRON_SECRET;
      if (cronSecret) {
        const res = await fetch(
          `${origin}/api/admin/reconcile-capital?key=${encodeURIComponent(cronSecret)}`,
          { cache: "no-store" },
        );
        reconcileResult = await res.json().catch(() => ({ error: "reconcile failed" }));
      }
    }

    return NextResponse.json({ success: true, ...result, reconcileResult });
  } catch (e: unknown) {
    const err = e as Error & {
      openLiveTrades?: Array<{ id: string; exchange: string; userId: string }>;
      preview?: unknown;
    };
    if (err.openLiveTrades) {
      return NextResponse.json(
        {
          error: err.message,
          preview: err.preview,
          openLiveTrades: err.openLiveTrades,
        },
        { status: 409 },
      );
    }
    const msg = err instanceof Error ? err.message : "Delete failed";
    const status = msg.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
