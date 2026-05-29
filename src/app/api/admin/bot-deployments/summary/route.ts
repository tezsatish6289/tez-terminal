import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import {
  computePlatformSummary,
  type PlatformSummaryPeriod,
} from "@/lib/freedombot/platform-summary";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/bot-deployments/summary?bot=CRYPTO&period=lifetime
 *
 * Headline metrics for the admin Bot Users page. Respects bot filter.
 * `from` / `to` are accepted but not applied yet (lifetime only).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const bot = searchParams.get("bot")?.trim().toUpperCase() || null;
    const period = (searchParams.get("period")?.trim().toLowerCase() ||
      "lifetime") as PlatformSummaryPeriod;
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (period !== "lifetime") {
      return NextResponse.json(
        { error: "Only period=lifetime is supported today" },
        { status: 400 },
      );
    }

    const db = getAdminFirestore();
    const summary = await computePlatformSummary(db, { bot, period, from, to });

    return NextResponse.json({
      period: summary.period,
      bot: summary.bot,
      from: from ?? null,
      to: to ?? null,
      rates: summary.rates,
      metrics: summary.metrics,
      segments: summary.segments,
      userIdsAll: summary.userIdsAll,
      userIdsActive: summary.userIdsActive,
      userIdsStoppedOnly: summary.userIdsStoppedOnly,
      accountsNoBot: summary.accountsNoBot,
      userDrilldown: summary.userDrilldown,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin Bot Summary]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
