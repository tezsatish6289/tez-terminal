/**
 * Shared zone-status derivation.
 *
 * Single source of truth for "is this symbol in a zone right now?" used by the
 * cross-tab **In Zone** view (indices + crypto + stocks). Pure + dependency-free
 * so it runs on server (cron) and client (UI badges) identically.
 */

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

export type PocDirectionFilter = "all" | "bull" | "bear";

/**
 * Actionable setup: spot inside the band on that side AND max pain on the pull side.
 * Re-derives zone status from bands + spot (ignores stale stored status).
 */
export function matchesDirectionalSetup(
  bands: ZoneBands,
  poc: number | null | undefined,
  filter: PocDirectionFilter,
): boolean {
  const spot = bands.spot;
  if (spot == null || poc == null || !Number.isFinite(spot) || !Number.isFinite(poc) || spot <= 0) {
    return false;
  }
  const status = deriveZoneStatus(bands);
  const bullOk = status === "IN_BULL" && poc > spot;
  const bearOk = status === "IN_BEAR" && poc < spot;
  if (filter === "all") return bullOk || bearOk;
  if (filter === "bull") return bullOk;
  return bearOk;
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
