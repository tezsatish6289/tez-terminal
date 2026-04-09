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

export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = process.env.LIQUIDITY_WS_SECRET ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getAdminFirestore();
    const snap = await db.collection("signals").where("status", "==", "ACTIVE").get();

    const symbols: string[] = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      const assetType: string = data.assetType ?? "CRYPTO";
      const symbol: string = data.symbol ?? "";
      const exchange: string = (data.exchange ?? "").toUpperCase();

      if (symbol && assetType !== "INDIAN_STOCKS" && !EXCLUDED_EXCHANGES.has(exchange)) {
        symbols.push(symbol.toUpperCase());
      }
    }

    return NextResponse.json({ symbols });
  } catch (err) {
    console.error("[internal/active-signals] Firestore error:", err);
    return NextResponse.json({ error: "Firestore query failed" }, { status: 500 });
  }
}
