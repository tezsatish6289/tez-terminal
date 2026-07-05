/**
 * Adapters that map the app's data shapes into the neutral {@link ScoreInputs}
 * the scoring engine consumes. Kept separate + client-safe (pure, no
 * `server-only`) so both the Fynn route and the SR-audit calibration table can
 * import them.
 */

import type { FynnContext } from "@/ai/flows/fynn-strategy-flow";
import type { SrZoneEvent } from "@/lib/sr-audit/types";
import type { ScoreInputs } from "@/lib/levels/strategy-score";

/** Extra live signals the zone doc doesn't persist (fetched separately). */
export interface FynnScoreExtras {
  ivPercentile?: number | null;
  putOiChangePct?: number | null;
  callOiChangePct?: number | null;
  newsScore?: number | null;
  pvtSlope?: number | null;
}

export function scoreInputsFromFynnContext(
  ctx: FynnContext,
  extras: FynnScoreExtras = {},
): ScoreInputs {
  return {
    spot: ctx.spot,
    maxPain: ctx.maxPain,
    supportLow: ctx.supportLow,
    supportHigh: ctx.supportHigh,
    resistanceLow: ctx.resistanceLow,
    resistanceHigh: ctx.resistanceHigh,
    putWallStrike: ctx.putWallStrike,
    putWallSize: ctx.putWallSize,
    callWallStrike: ctx.callWallStrike,
    callWallSize: ctx.callWallSize,
    atmIV: ctx.atmIV,
    ivPercentile: extras.ivPercentile ?? null,
    volRegimeFlag: ctx.volRegime,
    daysToExpiry: ctx.daysToExpiry,
    daysToEarnings: ctx.daysToEarnings,
    putOiChangePct: extras.putOiChangePct ?? null,
    callOiChangePct: extras.callOiChangePct ?? null,
    newsScore: extras.newsScore ?? null,
    pvtSlope: extras.pvtSlope ?? null,
  };
}

/** Days from an SR event's entry to its option expiry (DD/MM/YYYY), or null. */
function daysToExpiryFromEvent(event: Pick<SrZoneEvent, "zonesExpiry" | "eventAt">): number | null {
  if (!event.zonesExpiry) return null;
  const m = event.zonesExpiry.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const target = new Date(Number(yyyy), Number(mm) - 1, Number(dd)).getTime();
  const from = Date.parse(event.eventAt);
  if (!Number.isFinite(target) || !Number.isFinite(from)) return null;
  return Math.round((target - from) / 86_400_000);
}

/**
 * Map a recorded SR-audit event to score inputs, using the levels captured AT
 * ENTRY. Support entries treat the put cluster as the active wall, resistance
 * entries the call cluster. Bands are derived from the stored bull/bear zones.
 * News / PVT / IV-percentile aren't captured on historical rows → left null
 * (the engine renormalises over present signals).
 */
export function scoreInputsFromSrEvent(event: SrZoneEvent): ScoreInputs {
  return {
    spot: event.entrySpot ?? null,
    maxPain: event.maxPain ?? null,
    supportLow: event.bullZoneLow,
    supportHigh: event.bullZoneHigh,
    resistanceLow: event.bearZoneLow,
    resistanceHigh: event.bearZoneHigh,
    putWallStrike: event.putClusterStrike ?? null,
    putWallSize: event.putClusterSize ?? null,
    callWallStrike: event.callClusterStrike ?? null,
    callWallSize: event.callClusterSize ?? null,
    atmIV: event.atmIV ?? null,
    ivPercentile: null,
    volRegimeFlag: event.volRegimeFlag ?? null,
    daysToExpiry: daysToExpiryFromEvent(event),
    daysToEarnings: null,
    putOiChangePct: null,
    callOiChangePct: null,
    newsScore: null,
    pvtSlope: null,
  };
}
