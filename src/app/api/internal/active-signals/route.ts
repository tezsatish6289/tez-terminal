/**
 * GET /api/internal/active-signals
 *
 * Returns the list of active crypto signal symbols for the liquidity WS server.
 * Called by the Cloud Run liquidity-ws service every 60s instead of querying
 * Firestore directly (Cloud Run cannot reach firestore.googleapis.com due to
 * restricted VIP routing that requires Private Google Access).
 *
 * Auth: Bearer token via LIQUIDITY_WS_SECRET env var.
 */

import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";

const EXCLUDED_EXCHANGES = new Set(["NSE", "BSE", "MCX"]);

// In-memory cache to avoid fetching all signal documents on every 60s tick.
// Signal documents are large (candles, indicators, etc.) so projecting only
// the fields we need + caching cuts query time from several seconds to <100ms.
let cachedSymbols: string[] = [];
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.LIQUIDITY_WS_SECRET ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  if (now < cacheExpiresAt) {
    return NextResponse.json({ symbols: cachedSymbols, cached: true });
  }

  try {
    const db = getAdminFirestore();
    // Project only the 3 fields we need — avoids transferring large signal documents.
    const snap = await db
      .collection("signals")
      .where("status", "==", "ACTIVE")
      .select("symbol", "assetType", "exchange")
      .get();

    const symbolSet = new Set<string>();
    for (const doc of snap.docs) {
      const data = doc.data();
      const assetType: string = data.assetType ?? "CRYPTO";
      const symbol: string = data.symbol ?? "";
      const exchange: string = (data.exchange ?? "").toUpperCase();

      if (symbol && assetType !== "INDIAN_STOCKS" && !EXCLUDED_EXCHANGES.has(exchange)) {
        symbolSet.add(symbol.toUpperCase());
      }
    }
    const symbols = [...symbolSet];

    cachedSymbols = symbols;
    cacheExpiresAt = now + CACHE_TTL_MS;

    return NextResponse.json({ symbols });
  } catch (err) {
    console.error("[internal/active-signals] Firestore error:", err);
    // Return stale cache on error rather than failing completely
    if (cachedSymbols.length > 0) {
      return NextResponse.json({ symbols: cachedSymbols, cached: true, stale: true });
    }
    return NextResponse.json({ error: "Firestore query failed" }, { status: 500 });
  }
}
