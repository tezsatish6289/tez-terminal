/**
 * Compute + persist NSE index option zones for the public levels page.
 *
 * Refreshed by `/api/cron/suggest-stock-zones` during market hours when the
 * oldest index doc is stale (default >14 min). Writes one doc per index to
 * `config/suggested_index_zones_{SYMBOL}` in the same field shape as the crypto
 * `suggested_zones_*` docs, so freedombot.ai/levels can render both tabs with
 * the shared ZonePriceLadder.
 */

import type { Firestore } from "firebase-admin/firestore";
import {
  INDEX_KEYS,
  INDEX_SPECS,
  computeIndexZones,
  getNseCookies,
  type IndexKey,
  type IndexOptionsZones,
} from "@/lib/index-options-zones";
import { loadIndiaVixState } from "@/lib/india-vix";
import { loadIvHistory, recordDailyAtmIv } from "@/lib/iv-history";

function docId(symbol: IndexKey): string {
  return `config/suggested_index_zones_${symbol}`;
}

/**
 * Serialize into the shared "suggested zones" snapshot shape consumed by the
 * levels page + ZonePriceLadder. `btcPrice` carries the index spot (the ladder
 * reads `deribitIndexPrice ?? btcPrice` for the current-price line); the
 * invalidation lines are derived on the client (one half-width outside each
 * band, same as crypto).
 */
function serialize(z: IndexOptionsZones) {
  const maxPainByExpiry =
    z.maxPain != null && z.expiryUsed
      ? [{ expiry: z.expiryUsed, maxPain: z.maxPain, totalOI: z.expiryOI ?? 0, dayIndex: 0 }]
      : [];
  return {
    symbol: z.symbol,
    label: z.label,
    bullStrike: z.bullStrike,
    bearStrike: z.bearStrike,
    bullZoneLow: z.bullZoneLow,
    bullZoneHigh: z.bullZoneHigh,
    bullExitAbove: z.bullExitAbove,
    bearZoneLow: z.bearZoneLow,
    bearZoneHigh: z.bearZoneHigh,
    bearExitBelow: z.bearExitBelow,
    bullOI: z.bullOI,
    bearOI: z.bearOI,
    maxPain: z.maxPain,
    maxPainByExpiry,
    halfWidthUsd: z.halfWidthPts,
    expiryUsed: z.expiryUsed,
    expiryOI: z.expiryOI,
    insufficientGap: z.insufficientGap,
    atmIV: z.atmIV,
    volRegimeFlag: z.volRegime.flag,
    volRegimeReason: z.volRegime.reason,
    daysToEarnings: null, // indices have no earnings event
    btcPrice: z.spot,
    deribitIndexPrice: null,
    source: "nse",
    nseFetchError: null,
    computedAt: z.computedAt,
  };
}

export interface IndexZonesRefreshResult {
  results: Record<string, "ok" | "error">;
  errors: Record<string, string>;
}

/** Fetch NSE OI for all five indices and persist each. Never throws — failures
 *  are captured per-index and last-good docs are preserved. */
export async function refreshIndexZones(db: Firestore): Promise<IndexZonesRefreshResult> {
  const results: Record<string, "ok" | "error"> = {};
  const errors: Record<string, string> = {};

  let cookies = "";
  let cookieError: string | null = null;
  try {
    cookies = await getNseCookies();
  } catch (e) {
    cookieError = e instanceof Error ? e.message : String(e);
  }

  // India VIX percentile is the market-wide backdrop for every index regime.
  const vix = await loadIndiaVixState(db);

  for (const key of INDEX_KEYS) {
    if (cookieError) {
      results[key] = "error";
      errors[key] = `NSE session bootstrap failed: ${cookieError}`;
      continue;
    }
    try {
      const ivHist = await loadIvHistory(db, key);
      const zones = await computeIndexZones(key, cookies, {
        ivHistory: ivHist.values,
        vixPercentile: vix.percentile,
      });
      await recordDailyAtmIv(db, key, zones.atmIV, ivHist);
      const hasBands = zones.bullZoneLow != null || zones.bearZoneLow != null;
      if (!hasBands) {
        // Don't overwrite last-good bands with an empty result.
        results[key] = "error";
        errors[key] = "No bull/bear bands derived (empty/illiquid chain)";
        await db.doc(docId(key)).set(
          { nseFetchError: errors[key], computedAt: zones.computedAt },
          { merge: true },
        );
        continue;
      }
      await db.doc(docId(key)).set(serialize(zones));
      results[key] = "ok";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results[key] = "error";
      errors[key] = msg;
      // Preserve previous doc; only stamp the error.
      await db.doc(docId(key)).set(
        { nseFetchError: msg, computedAt: new Date().toISOString(), label: INDEX_SPECS[key].label },
        { merge: true },
      );
    }
  }

  return { results, errors };
}

/** "ok=3/5 errors=2" summary for logs/heartbeat. */
export function summarizeIndexZones(r: IndexZonesRefreshResult): string {
  const ok = Object.values(r.results).filter((v) => v === "ok").length;
  const err = Object.keys(r.errors).length;
  return `indices ok=${ok}/${INDEX_KEYS.length}${err ? ` errors=${err}` : ""}`;
}

function envNum(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Max age of the oldest index doc before suggest-stock-zones triggers a refresh. */
export const INDEX_ZONES_STALE_MS = envNum("INDEX_ZONES_STALE_MS", 14 * 60_000);

/** Oldest `computedAt` age across all index docs; null if any doc is missing. */
export async function oldestIndexAgeMs(db: Firestore, nowMs = Date.now()): Promise<number | null> {
  const snaps = await Promise.all(INDEX_KEYS.map((k) => db.doc(docId(k)).get()));
  let oldest: number | null = null;
  for (const snap of snaps) {
    const raw = snap.data()?.computedAt;
    if (typeof raw !== "string") return null;
    const t = Date.parse(raw);
    if (!Number.isFinite(t)) return null;
    const age = nowMs - t;
    if (oldest == null || age > oldest) oldest = age;
  }
  return oldest;
}

/**
 * Refresh all index zones when stale (or when `force`). Used by suggest-stock-zones
 * so index levels do not depend on the crypto suggest-zones cron.
 */
export async function maybeRefreshIndexZonesIfStale(
  db: Firestore,
  opts?: { maxAgeMs?: number; force?: boolean },
): Promise<IndexZonesRefreshResult | { skipped: string }> {
  const maxAgeMs = opts?.maxAgeMs ?? INDEX_ZONES_STALE_MS;
  if (!opts?.force) {
    const oldest = await oldestIndexAgeMs(db);
    if (oldest != null && oldest < maxAgeMs) {
      return { skipped: `fresh_${Math.round(oldest / 60_000)}m` };
    }
  }
  return refreshIndexZones(db);
}
