/**
 * POST /api/internal/liquidity-cache
 *
 * Accepts sweep / OI / order-book data from the liquidity WS server and
 * writes it to the liquidity_cache Firestore collection using field-level
 * merges (same strategy as firestore-cache.ts).
 *
 * Body: { symbol: string, type: "sweep" | "oi" | "ob", data: object }
 * Auth: Bearer token via LIQUIDITY_WS_SECRET env var.
 */

import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

type CacheType = "sweep" | "oi" | "ob";
const VALID_TYPES = new Set<CacheType>(["sweep", "oi", "ob"]);

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.LIQUIDITY_WS_SECRET ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { symbol?: string; type?: string; data?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { symbol, type, data } = body;
  if (!symbol || !type || !data) {
    return NextResponse.json({ error: "Missing symbol, type, or data" }, { status: 400 });
  }
  if (!VALID_TYPES.has(type as CacheType)) {
    return NextResponse.json({ error: `Invalid type: ${type}` }, { status: 400 });
  }

  try {
    const db = getAdminFirestore();
    const update: Record<string, unknown> = {
      symbol,
      updatedAt: new Date().toISOString(),
      [type]: data,
    };
    await db
      .collection("liquidity_cache")
      .doc(symbol)
      .set(update, { merge: true });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[internal/liquidity-cache] Firestore write failed for ${symbol}:`, err);
    return NextResponse.json({ error: "Firestore write failed" }, { status: 500 });
  }
}
