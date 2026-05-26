import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sim-logs-recent
 *
 * Tiny diagnostic endpoint that fetches the most recent simulator_logs
 * rows directly from Firestore (server-side, no client cache or
 * deployment-scoped filter in the way). Optional ?action= filter.
 * Use during incident response when the cockpit log feed appears
 * frozen, to confirm whether the issue is "cron not writing" vs "UI
 * filter hiding rows".
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

  const db = getAdminFirestore();
  let q: FirebaseFirestore.Query = db
    .collection("simulator_logs")
    .orderBy("timestamp", "desc")
    .limit(limit);
  if (action) q = q.where("action", "==", action);

  try {
    const snap = await q.get();
    const rows = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        timestamp: data.timestamp,
        action: data.action,
        side: data.side,
        symbol: data.symbol,
        assetType: data.assetType,
        capital: data.capital,
        details:
          typeof data.details === "string"
            ? data.details.length > 240
              ? data.details.slice(0, 240) + "…"
              : data.details
            : data.details,
      };
    });

    return NextResponse.json({
      success: true,
      count: rows.length,
      rows,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
