/**
 * POST /api/internal/liquidity-cache/batch
 *
 * Accepts an array of liquidity cache updates and writes them all to
 * Firestore in a single batch commit. Used by the WS server for OI and
 * order-book cycles to avoid making 120 individual HTTP requests per cycle.
 *
 * Body: { updates: Array<{ symbol: string, type: "sweep"|"oi"|"ob", data: object }> }
 * Auth: Bearer token via LIQUIDITY_WS_SECRET env var.
 */

import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

type CacheType = "sweep" | "oi" | "ob";
const VALID_TYPES = new Set<CacheType>(["sweep", "oi", "ob"]);
const MAX_UPDATES = 400; // Firestore batch limit is 500 operations

interface UpdateItem {
  symbol?: string;
  type?: string;
  data?: unknown;
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.LIQUIDITY_WS_SECRET ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { updates?: UpdateItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates = body.updates;
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "Missing or empty updates array" }, { status: 400 });
  }
  if (updates.length > MAX_UPDATES) {
    return NextResponse.json({ error: `Too many updates (max ${MAX_UPDATES})` }, { status: 400 });
  }

  const now = new Date().toISOString();
  const valid = updates.filter(
    (u): u is { symbol: string; type: CacheType; data: unknown } =>
      typeof u.symbol === "string" &&
      typeof u.type === "string" &&
      VALID_TYPES.has(u.type as CacheType) &&
      u.data !== undefined,
  );

  if (valid.length === 0) {
    return NextResponse.json({ error: "No valid updates" }, { status: 400 });
  }

  try {
    const db = getAdminFirestore();
    const batch = db.batch();

    for (const { symbol, type, data } of valid) {
      const ref = db.collection("liquidity_cache").doc(symbol);
      batch.set(ref, { symbol, updatedAt: now, [type]: data }, { merge: true });
    }

    await batch.commit();
    return NextResponse.json({ ok: true, count: valid.length });
  } catch (err) {
    console.error("[internal/liquidity-cache/batch] Firestore batch write failed:", err);
    return NextResponse.json({ error: "Firestore batch write failed" }, { status: 500 });
  }
}
