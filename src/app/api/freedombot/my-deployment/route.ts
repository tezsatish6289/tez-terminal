import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore, getAdminAuth } from "@/firebase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const idToken = authHeader.replace("Bearer ", "").trim();
    if (!idToken) {
      return NextResponse.json({ deployment: null }, { status: 200 });
    }

    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken);
    const uid = decoded.uid;

    const db = getAdminFirestore();
    // Use the already-deployed (uid, createdAt DESC) index.
    // Fetch the most recent records and find the first active one in code
    // to avoid requiring a composite index that may still be building.
    const snap = await db
      .collection("bot_deployments")
      .where("uid", "==", uid)
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();

    const activeDoc = snap.docs.find((d) => d.data().status === "active");
    if (!activeDoc) {
      return NextResponse.json({ deployment: null });
    }

    const doc = activeDoc;
    const data = doc.data();

    return NextResponse.json({
      deployment: {
        id: doc.id,
        bot: data.bot,
        exchange: data.exchange,
        status: data.status,
        createdAt: data.createdAt?.toDate?.()?.toISOString() ?? null,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
