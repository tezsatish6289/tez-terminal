import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/firebase/admin";
import { getSecretDocId, getSecretDocIds, docMatchesExchange } from "@/lib/exchanges";
import type { ExchangeName } from "@/lib/exchanges";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const body = await req.json();
    const deploymentId = body.deploymentId as string | undefined;
    if (!deploymentId) {
      return NextResponse.json({ error: "Missing deploymentId" }, { status: 400 });
    }

    const db = getAdminFirestore();

    // Verify the deployment belongs to this user
    const deployDoc = await db.collection("bot_deployments").doc(deploymentId).get();
    if (!deployDoc.exists) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
    }
    const deployData = deployDoc.data()!;
    if (deployData.uid !== uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const exchange = deployData.exchange as string;

    // Mark deployment as stopped
    await deployDoc.ref.update({ status: "stopped", stoppedAt: new Date() });

    // Disable auto-trade in the trading engine secrets
    const docIds = getSecretDocIds(exchange as ExchangeName);
    for (const docId of docIds) {
      const secretRef = db.collection("users").doc(uid).collection("secrets").doc(docId);
      const secretDoc = await secretRef.get();
      if (secretDoc.exists && docMatchesExchange(secretDoc.data()!, exchange as ExchangeName)) {
        await secretRef.update({ autoTradeEnabled: false });
        break;
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
