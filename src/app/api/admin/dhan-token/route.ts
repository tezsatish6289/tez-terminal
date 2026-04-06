/**
 * Admin endpoint to manually seed / inspect the Dhan system token.
 *
 * GET  ?key=<CRON_SECRET>          → show current token status
 * POST ?key=<CRON_SECRET>  { accessToken, clientId }  → reseed token in Firestore
 *
 * Use POST when the token has expired and auto-renewal failed.
 * Generate a fresh token from: web.dhan.co → Profile → Access DhanHQ APIs → Generate Access Token
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

export const dynamic = "force-dynamic";

const FIRESTORE_DOC = "config/dhan_system_token";

function getJwtExpiry(token: string): { exp: number | null; expired: boolean } {
  try {
    const part = token.split(".")[1];
    if (!part) return { exp: null, expired: false };
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    const exp = typeof payload.exp === "number" ? payload.exp * 1000 : null;
    return { exp, expired: exp != null && Date.now() >= exp };
  } catch {
    return { exp: null, expired: false };
  }
}

function authorized(request: NextRequest): boolean {
  const key = request.nextUrl.searchParams.get("key");
  return key === process.env.CRON_SECRET;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminFirestore();
  const doc = await db.doc(FIRESTORE_DOC).get();

  if (!doc.exists) {
    return NextResponse.json({
      status: "NOT_CONFIGURED",
      message: "No token found in Firestore. POST a token to configure.",
    });
  }

  const data = doc.data()!;
  const { exp, expired } = getJwtExpiry(String(data.accessToken ?? ""));
  const ageMs = Date.now() - new Date(String(data.renewedAt)).getTime();

  return NextResponse.json({
    status: expired ? "EXPIRED" : "ACTIVE",
    clientId: data.clientId,
    renewedAt: data.renewedAt,
    issuedAt: data.issuedAt,
    renewCount: data.renewCount,
    tokenAgeHours: (ageMs / 3_600_000).toFixed(1),
    jwtExpiresAt: exp ? new Date(exp).toISOString() : "unknown",
    expired,
  });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { accessToken?: string; clientId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { accessToken, clientId } = body;
  if (!accessToken || !clientId) {
    return NextResponse.json(
      { error: "Both accessToken and clientId are required" },
      { status: 400 }
    );
  }

  const { exp, expired } = getJwtExpiry(accessToken);
  if (expired) {
    return NextResponse.json(
      { error: "The provided token is already expired. Generate a fresh one from web.dhan.co." },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const existing = await db.doc(FIRESTORE_DOC).get();
  const prev = existing.exists ? (existing.data()! as any) : null;

  const now = new Date().toISOString();
  await db.doc(FIRESTORE_DOC).set({
    accessToken,
    clientId,
    issuedAt: now,
    renewedAt: now,
    renewCount: (prev?.renewCount ?? 0) + 1,
  });

  return NextResponse.json({
    success: true,
    clientId,
    jwtExpiresAt: exp ? new Date(exp).toISOString() : "unknown",
    message: "Token seeded successfully. Indian stock prices will update on the next cron run.",
  });
}
