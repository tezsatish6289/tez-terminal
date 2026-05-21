/**
 * GET /api/freedombot/retention-stats?exchange=BYBIT
 *
 * Returns precomputed p90 days-to-sustained-profit for the pause/delete
 * retention modal. Auth required; no per-user data in the response.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/firebase/admin";
import { readRetentionStatsForExchange } from "@/lib/freedombot/retention-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    await adminAuth.verifyIdToken(idToken);

    const exchange = new URL(req.url).searchParams.get("exchange")?.trim();
    if (!exchange) {
      return NextResponse.json({ error: "Missing exchange" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const stats = await readRetentionStatsForExchange(db, exchange);

    return NextResponse.json(stats, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("[FreedomBot retention-stats]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
