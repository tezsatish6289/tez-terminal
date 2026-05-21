/**
 * Sticky zone bands — keep published bull/bear levels while spot trades inside
 * the band, so zones do not jump when price crosses the strike center.
 */

export interface ZoneBandSnapshot {
  bullStrike: number | null;
  bullZoneLow: number | null;
  bullZoneHigh: number | null;
  bullExitAbove: number | null;
  bullOI: number | null;
  bearStrike: number | null;
  bearZoneLow: number | null;
  bearZoneHigh: number | null;
  bearExitBelow: number | null;
  bearOI: number | null;
}

export interface StickyZoneMeta {
  bullLocked: boolean;
  bearLocked: boolean;
}

function spotInsideBand(
  spot: number,
  low: number | null,
  high: number | null,
): boolean {
  return (
    low != null &&
    high != null &&
    Number.isFinite(low) &&
    Number.isFinite(high) &&
    spot >= low &&
    spot <= high
  );
}

const LOCK_OI_RELEASE_RATIO = 0.5;

export function applyStickyZones(
  spot: number,
  fresh: ZoneBandSnapshot,
  previous: ZoneBandSnapshot | null,
  oiAtStrike: (side: "put" | "call", strike: number) => number,
  minClusterOi: number,
): { bands: ZoneBandSnapshot; meta: StickyZoneMeta } {
  let bullLocked = false;
  let bearLocked = false;

  let bullStrike = fresh.bullStrike;
  let bullZoneLow = fresh.bullZoneLow;
  let bullZoneHigh = fresh.bullZoneHigh;
  let bullExitAbove = fresh.bullExitAbove;
  let bullOI = fresh.bullOI;

  let bearStrike = fresh.bearStrike;
  let bearZoneLow = fresh.bearZoneLow;
  let bearZoneHigh = fresh.bearZoneHigh;
  let bearExitBelow = fresh.bearExitBelow;
  let bearOI = fresh.bearOI;

  const releaseOi = minClusterOi * LOCK_OI_RELEASE_RATIO;

  if (
    previous?.bullStrike != null &&
    previous.bullZoneLow != null &&
    previous.bullZoneHigh != null &&
    spotInsideBand(spot, previous.bullZoneLow, previous.bullZoneHigh)
  ) {
    const liveOi = oiAtStrike("put", previous.bullStrike);
    if (liveOi >= releaseOi) {
      bullLocked = true;
      bullStrike = previous.bullStrike;
      bullZoneLow = previous.bullZoneLow;
      bullZoneHigh = previous.bullZoneHigh;
      bullExitAbove = previous.bullExitAbove ?? previous.bullZoneHigh;
      bullOI = Math.round(liveOi) || previous.bullOI;
    }
  }

  if (
    previous?.bearStrike != null &&
    previous.bearZoneLow != null &&
    previous.bearZoneHigh != null &&
    spotInsideBand(spot, previous.bearZoneLow, previous.bearZoneHigh)
  ) {
    const liveOi = oiAtStrike("call", previous.bearStrike);
    if (liveOi >= releaseOi) {
      bearLocked = true;
      bearStrike = previous.bearStrike;
      bearZoneLow = previous.bearZoneLow;
      bearZoneHigh = previous.bearZoneHigh;
      bearExitBelow = previous.bearExitBelow ?? previous.bearZoneLow;
      bearOI = Math.round(liveOi) || previous.bearOI;
    }
  }

  return {
    bands: {
      bullStrike,
      bullZoneLow,
      bullZoneHigh,
      bullExitAbove,
      bullOI,
      bearStrike,
      bearZoneLow,
      bearZoneHigh,
      bearExitBelow,
      bearOI,
    },
    meta: { bullLocked, bearLocked },
  };
}

export function zoneBandSnapshotFromSuggested(
  raw: Record<string, unknown> | null | undefined,
): ZoneBandSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const num = (k: string): number | null => {
    const v = raw[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    return null;
  };
  if (num("bullStrike") == null && num("bearStrike") == null) return null;
  return {
    bullStrike: num("bullStrike"),
    bullZoneLow: num("bullZoneLow"),
    bullZoneHigh: num("bullZoneHigh"),
    bullExitAbove: num("bullExitAbove"),
    bullOI: num("bullOI"),
    bearStrike: num("bearStrike"),
    bearZoneLow: num("bearZoneLow"),
    bearZoneHigh: num("bearZoneHigh"),
    bearExitBelow: num("bearExitBelow"),
    bearOI: num("bearOI"),
  };
}
