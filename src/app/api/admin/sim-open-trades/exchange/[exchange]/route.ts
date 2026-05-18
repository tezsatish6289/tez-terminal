import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { loadMirrorsForSimTradeIds } from "@/lib/admin/load-sim-live-mirrors";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sim-open-trades/exchange/:exchange?simTradeIds=a,b,c
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ exchange: string }> },
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { exchange } = await context.params;
  const exchangeUpper = exchange?.toUpperCase() ?? "";
  if (!exchangeUpper) {
    return NextResponse.json({ error: "Missing exchange" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const simTradeIds = (searchParams.get("simTradeIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (simTradeIds.length === 0) {
    return NextResponse.json({ error: "simTradeIds query required" }, { status: 400 });
  }

  try {
    const db = getAdminFirestore();
    const mirrorData = await loadMirrorsForSimTradeIds(db, simTradeIds);
    const mirrors = mirrorData.mirrors.filter(
      (m) => String(m.exchange ?? "").toUpperCase() === exchangeUpper,
    );

    const byUser = new Map<string, typeof mirrors>();
    for (const m of mirrors) {
      const list = byUser.get(m.userId) ?? [];
      list.push(m);
      byUser.set(m.userId, list);
    }

    const users = [...byUser.entries()]
      .map(([userId, trades]) => ({
        userId,
        email: trades[0]?.email ?? null,
        displayName: trades[0]?.displayName ?? null,
        deploymentId: trades[0]?.deploymentId ?? null,
        trades,
      }))
      .sort((a, b) =>
        (a.displayName ?? a.email ?? a.userId).localeCompare(
          b.displayName ?? b.email ?? b.userId,
        ),
      );

    const totalUnrealizedPnl = mirrors.reduce((s, m) => s + (m.unrealizedPnl ?? 0), 0);

    return NextResponse.json({
      exchange: exchangeUpper,
      simTradeIds,
      users,
      analytics: {
        userCount: users.length,
        mirrorCount: mirrors.length,
        totalUnrealizedPnl,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin sim-open-trades exchange]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
