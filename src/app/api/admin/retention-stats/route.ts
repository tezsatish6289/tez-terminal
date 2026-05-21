import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import {
  FREEDOMBOT_RETENTION_EXCHANGES,
  normalizeRetentionDoc,
  type RetentionExchangeStats,
} from "@/lib/freedombot/retention-stats";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/retention-stats
 * Precomputed p90 stats per exchange for admin previews.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const db = getAdminFirestore();
    const stats: Record<string, RetentionExchangeStats> = {};

    await Promise.all(
      FREEDOMBOT_RETENTION_EXCHANGES.map(async (exchange) => {
        const snap = await db
          .collection("config")
          .doc(`freedombot_retention_stats_${exchange}`)
          .get();
        stats[exchange] = normalizeRetentionDoc(
          exchange,
          snap.exists ? (snap.data() as Record<string, unknown>) : undefined,
        );
      }),
    );

    return NextResponse.json({ stats });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin retention-stats]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
