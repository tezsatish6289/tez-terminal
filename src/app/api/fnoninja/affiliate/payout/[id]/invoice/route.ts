import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireUser } from "@/lib/chat/require-user";
import { requireAdmin } from "@/lib/admin-auth";
import {
  FNO_AFFILIATE_PAYOUTS,
  buildReverseInvoiceHtml,
  fetchFnoAffiliateConfig,
  type AffiliatePayoutDoc,
} from "@/lib/fnoninja/affiliate";

export const dynamic = "force-dynamic";

/**
 * GET /api/fnoninja/affiliate/payout/:id/invoice
 * Download self-billing reverse invoice HTML (print → PDF).
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const auth = await requireUser(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const db = getAdminFirestore();
  const snap = await db.collection(FNO_AFFILIATE_PAYOUTS).doc(id).get();
  if (!snap.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const payout = snap.data() as AffiliatePayoutDoc;
  const isOwner = payout.referrerId === auth.decoded.uid;
  if (!isOwner) {
    const admin = await requireAdmin(request);
    if (!admin.ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await fetchFnoAffiliateConfig();
  const html = buildReverseInvoiceHtml({ payout, config });
  const filename = `${payout.invoiceNumber || id}.html`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
