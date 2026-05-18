/**
 * POST /api/admin/bot-deployments/:deploymentId/re-enable-mirroring
 *
 * Re-enables live signal mirroring for a user whose autoTradeEnabled was
 * turned off (legacy daily-loss kill switch) while the deployment stayed active.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { resumeLiveMirroringForDeployment } from "@/lib/freedombot/auto-resume-mirroring";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ deploymentId: string }> },
) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { deploymentId } = await context.params;
  if (!deploymentId) {
    return NextResponse.json({ error: "Missing deploymentId" }, { status: 400 });
  }

  try {
    const db = getAdminFirestore();
    const deployDoc = await db.collection("bot_deployments").doc(deploymentId).get();
    if (!deployDoc.exists) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
    }

    const data = deployDoc.data()!;
    const uid = String(data.uid ?? "");
    const exchange = String(data.exchange ?? "");
    if (!uid || !exchange) {
      return NextResponse.json({ error: "Invalid deployment data" }, { status: 400 });
    }

    const result = await resumeLiveMirroringForDeployment(db, uid, exchange);
    if (!result.resumed) {
      return NextResponse.json(
        { success: false, error: result.reason ?? "Could not re-enable mirroring" },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, message: "Live mirroring re-enabled" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    console.error("[Admin re-enable-mirroring]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
