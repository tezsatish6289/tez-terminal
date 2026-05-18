/**
 * POST /api/admin/migrate-trading-defaults
 *
 * One-time (idempotent) migration: writes current platform defaults onto every
 * secrets doc that still has the legacy defaults (0.5% risk, 5% daily loss)
 * or missing fields. Custom choices (e.g. 0.25% risk, 2% daily cap) are left
 * unchanged.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { secretNeedsTradingDefaultsMigration } from "@/lib/freedombot/trading-prefs";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const db = getAdminFirestore();
    const snap = await db.collectionGroup("secrets").get();

    let scanned = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const doc of snap.docs) {
      scanned++;
      const data = doc.data() as Record<string, unknown>;
      const patch = secretNeedsTradingDefaultsMigration(data);
      if (Object.keys(patch).length === 0) continue;

      try {
        await doc.ref.update(patch);
        updated++;
      } catch (e) {
        errors.push(
          `${doc.ref.path}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    return NextResponse.json({
      success: true,
      scanned,
      updated,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[migrate-trading-defaults]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
