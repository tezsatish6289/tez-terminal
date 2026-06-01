/**
 * /api/freedombot/levels
 *
 * Public read for the freedombot.ai/levels page. Returns the latest
 * algorithmically-derived bull/bear zones for:
 *   • NSE indices  → config/suggested_index_zones_{SYMBOL}  (suggest-zones cron, NSE pass)
 *   • Crypto       → config/suggested_zones_{asset}         (suggest-zones cron, Deribit pass)
 *
 * IMPORTANT: the stored docs carry the full derivation (strikes, OI, max-pain by
 * expiry, cluster shares, IV, source, …). We deliberately do NOT return them raw —
 * each doc is projected to a neutral, render-only payload (`PublicLevels`) so the
 * methodology never reaches the browser/network tab. Only the fields the public
 * ladder draws are exposed, under neutral key names.
 */

import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { INDEX_KEYS, INDEX_SPECS } from "@/lib/index-options-zones";
import type { PublicLevels } from "@/components/levels/ZonePriceLadder";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CRYPTO: { asset: string; label: string }[] = [
  { asset: "btc", label: "Bitcoin" },
  { asset: "eth", label: "Ethereum" },
  { asset: "sol", label: "Solana" },
  { asset: "xrp", label: "XRP" },
];

function num(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function bool(raw: unknown): boolean | null {
  return raw === true ? true : raw === false ? false : null;
}

/** Strip the stored doc down to the neutral fields the public ladder renders. */
function sanitize(raw: Record<string, unknown> | null): PublicLevels | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    spot: num(raw.deribitIndexPrice) ?? num(raw.btcPrice),
    poc: num(raw.maxPain),
    bullLow: num(raw.bullZoneLow),
    bullHigh: num(raw.bullZoneHigh),
    bearLow: num(raw.bearZoneLow),
    bearHigh: num(raw.bearZoneHigh),
    bandOffset: num(raw.halfWidthUsd),
    bullActive: bool(raw.bullActionable),
    bearActive: bool(raw.bearActionable),
    computedAt: typeof raw.computedAt === "string" ? raw.computedAt : null,
    unavailable: typeof raw.nseFetchError === "string" && raw.nseFetchError !== "",
  };
}

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
    data: sanitize(indexDocs[i]),
  }));

  const crypto = CRYPTO.map((c, i) => ({
    asset: c.asset,
    label: c.label,
    data: sanitize(cryptoDocs[i]),
  }));

  return NextResponse.json(
    { indices, crypto, updatedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
