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
import { isIndexZonesCronWindow } from "@/lib/market-hours";
import { maybeRecordIndexSrZoneEvent } from "@/lib/sr-audit/record-event";

export function indexDocId(symbol: IndexKey): string {
  return `config/suggested_index_zones_${symbol}`;
}

function docId(symbol: IndexKey): string {
  return indexDocId(symbol);
}

/**
 * Serialize into the shared "suggested zones" snapshot shape consumed by the
 * levels page + ZonePriceLadder. `btcPrice` carries the index spot (the ladder
 * reads `deribitIndexPrice ?? btcPrice` for the current-price line); the
 * invalidation lines are derived on the client (one half-width outside each
 * band, same as crypto).
 */
function serializeSlice(z: IndexOptionsZones, dayIndex: number) {
  return {
    expiry: z.expiryUsed,
    maxPain: z.maxPain,
    totalOI: z.expiryOI ?? 0,
    dayIndex,
    bullZoneLow: z.bullZoneLow,
    bullZoneHigh: z.bullZoneHigh,
    bearZoneLow: z.bearZoneLow,
    bearZoneHigh: z.bearZoneHigh,
    bullStrike: z.bullStrike,
    bearStrike: z.bearStrike,
    halfWidthUsd: z.halfWidthPts,
    bullOI: z.bullOI,
    bearOI: z.bearOI,
    bullOIChange: z.bullOIChange,
    bearOIChange: z.bearOIChange,
  };
}

function serialize(primary: IndexOptionsZones, byExpiry: IndexOptionsZones[]) {
  const slices = (byExpiry.length ? byExpiry : [primary]).filter((z) => z.expiryUsed);
  const maxPainByExpiry = slices.map((z, i) => serializeSlice(z, i));
  return {
    symbol: primary.symbol,
    label: primary.label,
    bullStrike: primary.bullStrike,
    bearStrike: primary.bearStrike,
    bullZoneLow: primary.bullZoneLow,
    bullZoneHigh: primary.bullZoneHigh,
    bullExitAbove: primary.bullExitAbove,
    bearZoneLow: primary.bearZoneLow,
    bearZoneHigh: primary.bearZoneHigh,
    bearExitBelow: primary.bearExitBelow,
    bullOI: primary.bullOI,
    bearOI: primary.bearOI,
    bullOIChange: primary.bullOIChange,
    bearOIChange: primary.bearOIChange,
    maxPain: primary.maxPain,
    maxPainByExpiry,
    halfWidthUsd: primary.halfWidthPts,
    expiryUsed: primary.expiryUsed,
    expiryOI: primary.expiryOI,
    insufficientGap: primary.insufficientGap,
    atmIV: primary.atmIV,
    volRegimeFlag: primary.volRegime.flag,
    volRegimeReason: primary.volRegime.reason,
    daysToEarnings: null,
    btcPrice: primary.spot,
    deribitIndexPrice: null,
    source: "nse",
    nseFetchError: null,
    computedAt: primary.computedAt,
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
    const outcome = await refreshSingleIndexZone(db, key, cookies, vix.percentile);
    results[key] = outcome.status;
    if (outcome.error) errors[key] = outcome.error;
  }

  return { results, errors };
}

/** Refresh one index from NSE and persist. Preserves last-good doc on failure. */
export async function refreshSingleIndexZone(
  db: Firestore,
  key: IndexKey,
  cookies?: string,
  vixPercentile?: number | null,
): Promise<{ status: "ok" | "error"; error?: string }> {
  let sessionCookies = cookies ?? "";
  if (!sessionCookies) {
    try {
      sessionCookies = await getNseCookies();
    } catch (e) {
      const msg = `NSE session bootstrap failed: ${e instanceof Error ? e.message : String(e)}`;
      return { status: "error", error: msg };
    }
  }

  const vix =
    vixPercentile !== undefined
      ? { percentile: vixPercentile }
      : await loadIndiaVixState(db);

  try {
    const ivHist = await loadIvHistory(db, key);
    const { primary, byExpiry } = await computeIndexZones(key, sessionCookies, {
      ivHistory: ivHist.values,
      vixPercentile: vix.percentile,
    });
    await recordDailyAtmIv(db, key, primary.atmIV, ivHist);
    const hasBands = primary.bullZoneLow != null || primary.bearZoneLow != null;
    if (!hasBands) {
      const err = "No bull/bear bands derived (empty/illiquid chain)";
      await db.doc(docId(key)).set(
        { nseFetchError: err, computedAt: primary.computedAt },
        { merge: true },
      );
      return { status: "error", error: err };
    }
    await db.doc(docId(key)).set(serialize(primary, byExpiry));
    await maybeRecordIndexSrZoneEvent(db, primary);
    return { status: "ok" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.doc(docId(key)).set(
      { nseFetchError: msg, computedAt: new Date().toISOString(), label: INDEX_SPECS[key].label },
      { merge: true },
    );
    return { status: "error", error: msg };
  }
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

/**
 * Market-hours gate for suggest-stock-zones:
 *   • Mon–Fri 8:00–17:00 IST: refresh when oldest doc > INDEX_ZONES_STALE_MS (14 min).
 *   • Outside that window: skip (manual POST uses force).
 */
export async function maybeRefreshIndexZonesForCron(
  db: Firestore,
  opts?: { force?: boolean },
): Promise<IndexZonesRefreshResult | { skipped: string }> {
  if (opts?.force) {
    return maybeRefreshIndexZonesIfStale(db, { force: true });
  }

  if (isIndexZonesCronWindow()) {
    return maybeRefreshIndexZonesIfStale(db);
  }

  return { skipped: "outside_market_hours" };
}
