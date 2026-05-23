import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  publicLivePassphraseConfigured,
} from "@/lib/public-live-gate";

export const dynamic = "force-dynamic";

/**
 * GET /api/settings/public-live-meta
 * Admin-only: whether PUBLIC_LIVE_PASSPHRASE is set and its value
 * (shown in simulator config so operators know what to type).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const configured = publicLivePassphraseConfigured();
  return NextResponse.json({
    configured,
    passphrase: configured ? process.env.PUBLIC_LIVE_PASSPHRASE ?? null : null,
  });
}
