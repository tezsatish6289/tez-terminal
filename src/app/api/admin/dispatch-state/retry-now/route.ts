import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { retryFailedDispatches } from "@/lib/freedombot/dispatch-retry";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/dispatch-state/retry-now
 *
 * Manually fire the retry sweeper that normally piggy-backs on the
 * sync-live-trades cron (`src/lib/freedombot/dispatch-retry.ts`).
 *
 * Use cases:
 *   - validate the sweeper after deploying it (without waiting up to
 *     a minute for the cron to tick),
 *   - replay a known retriable failure on demand during incident
 *     response,
 *   - integration-test the per-ticket safety checks (exchange
 *     "already-open" detection, secrets revoked, etc.).
 *
 * Returns the full DispatchRetryReport including a results array with
 * an outcome per candidate ticket. Admin-gated; no UI surface.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const db = getAdminFirestore();
    const startedAt = new Date().toISOString();
    const report = await retryFailedDispatches(db);
    const finishedAt = new Date().toISOString();
    return NextResponse.json({
      success: true,
      startedAt,
      finishedAt,
      report,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin Dispatch Retry Now]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
