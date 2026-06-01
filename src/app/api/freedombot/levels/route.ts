/**
 * /api/freedombot/levels
 *
 * Public read for the freedombot.ai/levels page. Returns the latest
 * algorithmically-derived bull/bear zones for:
 *   • NSE indices  → config/suggested_index_zones_{SYMBOL}  (suggest-index-zones cron)
 *   • Crypto       → config/suggested_zones_{asset}         (suggest-zones cron)
 *
 * Docs are returned raw and normalized client-side with normalizeSuggestedZones
 * so the same ZonePriceLadder renders both tabs.
 */

import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { INDEX_KEYS, INDEX_SPECS } from "@/lib/index-options-zones";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CRYPTO: { asset: string; label: string }[] = [
  { asset: "btc", label: "Bitcoin" },
  { asset: "eth", label: "Ethereum" },
  { asset: "sol", label: "Solana" },
  { asset: "xrp", label: "XRP" },
];

async function readDoc(path: string): Promise<Record<string, unknown> | null> {
  try {
    const snap = await getAdminFirestore().doc(path).get();
    return snap.exists ? (snap.data() as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const [indexDocs, cryptoDocs] = await Promise.all([
    Promise.all(INDEX_KEYS.map((k) => readDoc(`config/suggested_index_zones_${k}`))),
    Promise.all(CRYPTO.map((c) => readDoc(`config/suggested_zones_${c.asset}`))),
  ]);

  const indices = INDEX_KEYS.map((k, i) => ({
    symbol: k,
    label: INDEX_SPECS[k].label,
    data: indexDocs[i],
  }));

  const crypto = CRYPTO.map((c, i) => ({
    asset: c.asset,
    label: c.label,
    data: cryptoDocs[i],
  }));

  return NextResponse.json(
    { indices, crypto, updatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
