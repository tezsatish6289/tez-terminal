/**
 * Shared zone-status derivation.
 *
 * Single source of truth for "is this symbol in a zone right now?" used by the
 * cross-tab **In Zone** view (indices + crypto + stocks). Pure + dependency-free
 * so it runs on server (cron) and client (UI badges) identically.
 */

import { computeZoneSlAnchors } from "@/lib/zone-bot-engine";

export type ZoneStatus =
  | "IN_BULL"   // spot inside the bull (support) band
  | "IN_BEAR"   // spot inside the bear (resistance) band
  | "NEAR"      // spot within `nearPct` of a band edge
  | "NEUTRAL"   // bands exist, spot is between/outside them
  | "ILLIQUID"; // not enough data / no bands

export interface ZoneBands {
  spot: number | null;
  bullLow: number | null;
  bullHigh: number | null;
  bearLow: number | null;
  bearHigh: number | null;
}

function inRange(x: number, lo: number | null, hi: number | null): boolean {
  return lo != null && hi != null && x >= Math.min(lo, hi) && x <= Math.max(lo, hi);
}

function nearEdge(x: number, edges: (number | null)[], tol: number): boolean {
  return edges.some((e) => e != null && Math.abs(x - e) <= tol);
}

/**
 * Classify a symbol's current zone state.
 * @param nearPct fraction of spot used as the "near a band" tolerance (default 0.5%).
 */
export function deriveZoneStatus(bands: ZoneBands, nearPct = 0.005): ZoneStatus {
  const { spot, bullLow, bullHigh, bearLow, bearHigh } = bands;
  const hasBands = bullLow != null || bearLow != null;
  if (spot == null || !Number.isFinite(spot) || spot <= 0 || !hasBands) return "ILLIQUID";

  if (inRange(spot, bullLow, bullHigh)) return "IN_BULL";
  if (inRange(spot, bearLow, bearHigh)) return "IN_BEAR";

  const tol = spot * nearPct;
  if (nearEdge(spot, [bullLow, bullHigh, bearLow, bearHigh], tol)) return "NEAR";

  return "NEUTRAL";
}

/** True for statuses that should surface on the "In Zone" tab. */
export function isInZoneStatus(status: ZoneStatus): boolean {
  return status === "IN_BULL" || status === "IN_BEAR" || status === "NEAR";
}

/** UI badge key — splits generic NEAR into support vs resistance. */
export type ZoneDisplayKey =
  | "IN_BULL"
  | "IN_BEAR"
  | "NEAR_BULL"
  | "NEAR_BEAR"
  | "NEUTRAL"
  | "ILLIQUID";

export function zoneStatusDisplayKey(bands: ZoneBands): ZoneDisplayKey {
  const status = deriveZoneStatus(bands);
  if (status === "NEAR") {
    const spot = bands.spot;
    if (spot == null || !Number.isFinite(spot)) return "NEAR_BULL";
    return nearestBandKind(bands, spot) === "bull" ? "NEAR_BULL" : "NEAR_BEAR";
  }
  return status;
}

export type PocDirectionFilter =
  | "all"
  | "bull"
  | "bear"
  | "near_bull"
  | "near_bear";

export type SlideshowFilterCounts = Record<PocDirectionFilter, number>;

/** Closest band edge for NEAR classification (support vs resistance). */
export function nearestBandKind(bands: ZoneBands, spot: number): "bull" | "bear" {
  const edges: { kind: "bull" | "bear"; edge: number }[] = [];
  if (bands.bullLow != null) edges.push({ kind: "bull", edge: bands.bullLow });
  if (bands.bullHigh != null) edges.push({ kind: "bull", edge: bands.bullHigh });
  if (bands.bearLow != null) edges.push({ kind: "bear", edge: bands.bearLow });
  if (bands.bearHigh != null) edges.push({ kind: "bear", edge: bands.bearHigh });
  if (edges.length === 0) return "bull";
  let best = edges[0];
  let bestDist = Math.abs(spot - best.edge);
  for (let i = 1; i < edges.length; i++) {
    const d = Math.abs(spot - edges[i].edge);
    if (d < bestDist) {
      best = edges[i];
      bestDist = d;
    }
  }
  return best.kind;
}

export function isNearSupport(bands: ZoneBands): boolean {
  const spot = bands.spot;
  if (spot == null || !Number.isFinite(spot) || spot <= 0) return false;
  if (deriveZoneStatus(bands) !== "NEAR") return false;
  return nearestBandKind(bands, spot) === "bull";
}

export function isNearResistance(bands: ZoneBands): boolean {
  const spot = bands.spot;
  if (spot == null || !Number.isFinite(spot) || spot <= 0) return false;
  if (deriveZoneStatus(bands) !== "NEAR") return false;
  return nearestBandKind(bands, spot) === "bear";
}

/** Minimum reward:risk from spot → POC vs band invalidation (Bull/Bear Inv.). */
export const MIN_POC_RISK_REWARD = 2;

/** Reward:risk from actual entry → day-0 max pain vs computed SL (zone bots). */
export function entryPocRiskRewardRatio(
  side: "BUY" | "SELL",
  entryPrice: number,
  stopLoss: number,
  poc: number,
): number | null {
  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(stopLoss) ||
    !Number.isFinite(poc) ||
    entryPrice <= 0
  ) {
    return null;
  }

  if (side === "BUY") {
    const risk = entryPrice - stopLoss;
    const reward = poc - entryPrice;
    if (risk <= 0 || reward <= 0) return null;
    return reward / risk;
  }

  const risk = stopLoss - entryPrice;
  const reward = entryPrice - poc;
  if (risk <= 0 || reward <= 0) return null;
  return reward / risk;
}

export function entryMeetsMinPocRR(
  side: "BUY" | "SELL",
  entryPrice: number,
  stopLoss: number,
  poc: number | null | undefined,
  minRatio = MIN_POC_RISK_REWARD,
): boolean {
  if (poc == null || !Number.isFinite(poc)) return false;
  const rr = entryPocRiskRewardRatio(side, entryPrice, stopLoss, poc);
  return rr != null && rr >= minRatio;
}

export function formatPocRR(rr: number | null): string {
  return rr != null && Number.isFinite(rr) ? `${rr.toFixed(1)}:1` : "n/a";
}

/** Zone strike proxy — same center the bands are built around (not live spot). */
function zoneBandCenter(bands: ZoneBands, side: "bull" | "bear"): number | null {
  if (side === "bull" && bands.bullLow != null && bands.bullHigh != null) {
    return (bands.bullLow + bands.bullHigh) / 2;
  }
  if (side === "bear" && bands.bearLow != null && bands.bearHigh != null) {
    return (bands.bearLow + bands.bearHigh) / 2;
  }
  return null;
}

/**
 * Reward:risk using invalidation anchors on the chart (one half-width outside the band).
 * Entry = zone center (OI cluster strike), target = POC — matches zone-bot TP-room math.
 * Live spot is only used for the directional gate, not RR sizing.
 */
export function pocRiskRewardRatio(
  bands: ZoneBands,
  poc: number,
  bandOffset: number | null | undefined,
  side: "bull" | "bear",
): number | null {
  const spot = bands.spot;
  if (spot == null || !Number.isFinite(spot) || spot <= 0 || !Number.isFinite(poc)) {
    return null;
  }

  const entry = zoneBandCenter(bands, side);
  if (entry == null || !Number.isFinite(entry)) return null;

  const { bullSl, bearSl } = computeZoneSlAnchors({
    halfWidthUsd: bandOffset ?? null,
    bullZoneLow: bands.bullLow,
    bullZoneHigh: bands.bullHigh,
    bearZoneLow: bands.bearLow,
    bearZoneHigh: bands.bearHigh,
  });

  if (side === "bull") {
    if (bullSl == null || poc <= entry) return null;
    const risk = entry - bullSl;
    const reward = poc - entry;
    if (risk <= 0 || reward <= 0) return null;
    return reward / risk;
  }

  if (bearSl == null || poc >= entry) return null;
  const risk = bearSl - entry;
  const reward = entry - poc;
  if (risk <= 0 || reward <= 0) return null;
  return reward / risk;
}

export function meetsMinPocRiskReward(
  bands: ZoneBands,
  poc: number | null | undefined,
  bandOffset: number | null | undefined,
  minRatio = MIN_POC_RISK_REWARD,
): boolean {
  if (poc == null || !Number.isFinite(poc)) return false;
  const status = deriveZoneStatus(bands);
  if (status === "IN_BULL") {
    const rr = pocRiskRewardRatio(bands, poc, bandOffset, "bull");
    return rr != null && rr >= minRatio;
  }
  if (status === "IN_BEAR") {
    const rr = pocRiskRewardRatio(bands, poc, bandOffset, "bear");
    return rr != null && rr >= minRatio;
  }
  return false;
}

/**
 * Actionable setup: spot inside the band on that side, max pain on the pull side,
 * and at least {@link MIN_POC_RISK_REWARD}:1 reward to POC from spot vs invalidation.
 * Re-derives zone status from bands + spot (ignores stale stored status).
 */
export function matchesDirectionalSetup(
  bands: ZoneBands,
  poc: number | null | undefined,
  filter: PocDirectionFilter,
  bandOffset?: number | null,
): boolean {
  const spot = bands.spot;
  if (spot == null || poc == null || !Number.isFinite(spot) || !Number.isFinite(poc) || spot <= 0) {
    return false;
  }
  const status = deriveZoneStatus(bands);
  const bullRr = pocRiskRewardRatio(bands, poc, bandOffset, "bull");
  const bearRr = pocRiskRewardRatio(bands, poc, bandOffset, "bear");
  const bullOk =
    status === "IN_BULL" &&
    poc > spot &&
    bullRr != null &&
    bullRr >= MIN_POC_RISK_REWARD;
  const bearOk =
    status === "IN_BEAR" &&
    poc < spot &&
    bearRr != null &&
    bearRr >= MIN_POC_RISK_REWARD;
  if (filter === "all") return bullOk || bearOk;
  if (filter === "bull") return bullOk;
  if (filter === "bear") return bearOk;
  return false;
}

/**
 * Near support: within tolerance of bull band, max pain above spot,
 * and at least {@link MIN_POC_RISK_REWARD}:1 to POC from band center vs invalidation.
 */
export function matchesNearBullSetup(
  bands: ZoneBands,
  poc: number | null | undefined,
  bandOffset?: number | null,
): boolean {
  const spot = bands.spot;
  if (spot == null || poc == null || !Number.isFinite(spot) || !Number.isFinite(poc) || spot <= 0) {
    return false;
  }
  if (!isNearSupport(bands)) return false;
  const rr = pocRiskRewardRatio(bands, poc, bandOffset, "bull");
  return poc > spot && rr != null && rr >= MIN_POC_RISK_REWARD;
}

/**
 * Near resistance: within tolerance of bear band, max pain below spot,
 * and at least {@link MIN_POC_RISK_REWARD}:1 to POC from band center vs invalidation.
 */
export function matchesNearBearSetup(
  bands: ZoneBands,
  poc: number | null | undefined,
  bandOffset?: number | null,
): boolean {
  const spot = bands.spot;
  if (spot == null || poc == null || !Number.isFinite(spot) || !Number.isFinite(poc) || spot <= 0) {
    return false;
  }
  if (!isNearResistance(bands)) return false;
  const rr = pocRiskRewardRatio(bands, poc, bandOffset, "bear");
  return poc < spot && rr != null && rr >= MIN_POC_RISK_REWARD;
}

/** Whether a bubble map tone passes min POC reward:risk for its geographic side. */
export function bubbleTonePassesMinRR(
  tone: "IN_BULL" | "IN_BEAR" | "NEAR_BULL" | "NEAR_BEAR",
  bands: ZoneBands,
  poc: number | null | undefined,
  bandOffset?: number | null,
): boolean {
  switch (tone) {
    case "IN_BULL":
      return matchesDirectionalSetup(bands, poc, "bull", bandOffset);
    case "IN_BEAR":
      return matchesDirectionalSetup(bands, poc, "bear", bandOffset);
    case "NEAR_BULL":
      return matchesNearBullSetup(bands, poc, bandOffset);
    case "NEAR_BEAR":
      return matchesNearBearSetup(bands, poc, bandOffset);
  }
}

/** Slideshow strip: actionable in-zone + qualified near support / near resistance. */
export function matchesSlideshowSetup(
  bands: ZoneBands,
  poc: number | null | undefined,
  filter: PocDirectionFilter,
  bandOffset?: number | null,
): boolean {
  const bullOk = matchesDirectionalSetup(bands, poc, "bull", bandOffset);
  const bearOk = matchesDirectionalSetup(bands, poc, "bear", bandOffset);
  const nearBullOk = matchesNearBullSetup(bands, poc, bandOffset);
  const nearBearOk = matchesNearBearSetup(bands, poc, bandOffset);

  switch (filter) {
    case "all":
      return bullOk || bearOk || nearBullOk || nearBearOk;
    case "bull":
      return bullOk;
    case "bear":
      return bearOk;
    case "near_bull":
      return nearBullOk;
    case "near_bear":
      return nearBearOk;
  }
}

/** Rank for sorting the In-Zone list (lower = more urgent / shown first). */
export function zoneStatusRank(status: ZoneStatus): number {
  switch (status) {
    case "IN_BULL": return 0;
    case "IN_BEAR": return 1;
    case "NEAR":    return 2;
    case "NEUTRAL": return 3;
    case "ILLIQUID":return 4;
  }
}
