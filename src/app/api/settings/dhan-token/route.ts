import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

const FIRESTORE_DOC = "config/dhan_system_token";

/**
 * GET: Check token status (age, renewal count, whether it's configured).
 */
export async function GET() {
  const db = getAdminFirestore();
  const doc = await db.doc(FIRESTORE_DOC).get();

  if (!doc.exists) {
    return NextResponse.json({
      configured: false,
      message: "No Dhan token configured. POST to seed one.",
    });
  }

  const data = doc.data()!;
  const renewedAt = new Date(data.renewedAt).getTime();
  const ageHours = (Date.now() - renewedAt) / 3600000;

  return NextResponse.json({
    configured: true,
    clientId: data.clientId,
    ageHours: Math.round(ageHours * 10) / 10,
    renewedAt: data.renewedAt,
    issuedAt: data.issuedAt,
    renewCount: data.renewCount ?? 0,
    healthy: ageHours < 24,
  });
}

/**
 * POST: Seed or update the system Dhan token.
 * Body: { accessToken: string, clientId: string }
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { accessToken, clientId } = body;

  if (!accessToken || !clientId) {
    return NextResponse.json(
      { success: false, error: "accessToken and clientId are required" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const now = new Date().toISOString();

  await db.doc(FIRESTORE_DOC).set({
    accessToken,
    clientId,
    issuedAt: now,
    renewedAt: now,
    renewCount: 0,
  });

  return NextResponse.json({ success: true, message: "Dhan token saved. Auto-renewal will keep it alive." });
}
