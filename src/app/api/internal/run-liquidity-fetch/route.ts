/**
 * POST /api/internal/run-liquidity-fetch
 *
 * Called by the Cloud Run liquidity-ws server instead of hitting Bybit REST
 * API directly. Cloud Run's NAT gateway IPs are throttled by Bybit (~20-30s
 * per request). Firebase App Hosting uses different IPs with normal latency.
 *
 * This route fetches OI or OB data for a list of symbols from Bybit,
 * then batch-writes the results to Firestore liquidity_cache.
 *
 * Auth: Bearer token via LIQUIDITY_WS_SECRET env var.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { fetchOIContext } from "@/lib/liquidity/oi-context";
import { fetchOrderBookContext } from "@/lib/liquidity/orderbook-context";
import * as Sentry from "@sentry/nextjs";

const SECRET = process.env.LIQUIDITY_WS_SECRET ?? "";
const CHUNK = 10; // symbols per parallel batch
const BATCH_DELAY_MS = 200; // ms between batches

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!SECRET || auth !== `Bearer ${SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      type: "oi" | "ob";
      symbols: string[];
      prices?: Record<string, number>;
    };

    const { type, symbols, prices = {} } = body;
    if (!type || !Array.isArray(symbols) || symbols.length === 0) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const updates: Array<{ symbol: string; data: unknown }> = [];

    // Fetch in parallel batches — Firebase App Hosting reaches Bybit fine
    for (let i = 0; i < symbols.length; i += CHUNK) {
      const chunk = symbols.slice(i, i + CHUNK);
      const results = await Promise.allSettled(
        chunk.map(async (symbol) => {
          if (type === "oi") {
            const data = await fetchOIContext(symbol);
            return { symbol, data };
          } else {
            const price = prices[symbol] ?? 0;
            if (price <= 0) return { symbol, data: null };
            const data = await fetchOrderBookContext(symbol, price);
            return { symbol, data };
          }
        }),
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.data !== null) {
          updates.push({ symbol: r.value.symbol, data: r.value.data });
        }
      }
      if (i + CHUNK < symbols.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    if (updates.length === 0) {
      return NextResponse.json({ ok: true, count: 0, total: symbols.length });
    }

    // Batch-write to Firestore (max 500 per Firestore batch)
    const db = getAdminFirestore();
    const now = new Date().toISOString();
    const FIRESTORE_BATCH_LIMIT = 500;
    let written = 0;

    for (let i = 0; i < updates.length; i += FIRESTORE_BATCH_LIMIT) {
      const chunk = updates.slice(i, i + FIRESTORE_BATCH_LIMIT);
      const batch = db.batch();
      for (const { symbol, data } of chunk) {
        const ref = db.collection("liquidity_cache").doc(symbol);
        batch.set(
          ref,
          { symbol, updatedAt: now, [type]: data },
          { merge: true },
        );
      }
      await batch.commit();
      written += chunk.length;
    }

    return NextResponse.json({ ok: true, count: written, total: symbols.length });
  } catch (err) {
    console.error("[run-liquidity-fetch] Error:", err);
    Sentry.captureException(err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
