/**
 * Retention stats precompute cron.
 *
 * Walks closed production `live_trades` for crypto bot deployments, computes
 * per-exchange p90 days-to-sustained-profit, and writes
 * `config/freedombot_retention_stats_{EXCHANGE}`.
 *
 * Recommended cadence: once daily at 00:30 UTC via cron-job.org.
 * Not on the P0 trading chain — dashboard uses fallback copy if this misses.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { recomputeAllRetentionStats } from "@/lib/freedombot/retention-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || key !== cronSecret) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const startedAt = Date.now();

  try {
    const db = getAdminFirestore();
    const { statsByExchange, pairCount, tradeCount } =
      await recomputeAllRetentionStats(db);

    const exchanges = [...statsByExchange.entries()].map(([ex, s]) => ({
      exchange: ex,
      p90Days: s.p90DaysToSustainedProfit,
      sampleSize: s.sampleSize,
      source: s.source,
    }));

    const durationMs = Date.now() - startedAt;
    console.log(
      `[RetentionStats] ${pairCount} deployment pair(s), ${tradeCount} closed trade(s), ` +
        `${durationMs}ms — ${exchanges.map((e) => `${e.exchange}:${e.p90Days}d(n=${e.sampleSize})`).join(", ")}`,
    );

    return NextResponse.json({
      success: true,
      durationMs,
      pairCount,
      tradeCount,
      exchanges,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[RetentionStats cron]", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
