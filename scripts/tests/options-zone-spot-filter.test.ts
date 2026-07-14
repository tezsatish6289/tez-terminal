import assert from "node:assert/strict";
import {
  bearStrikeEligibleForSpot,
  bullStrikeEligibleForSpot,
  deriveClusterSearchRadius,
  deriveMaxPainAnchorSpan,
  filterHighestClusterCandidates,
  pickHighestClusterNearSpot,
} from "../../src/lib/options-zones";
import { applyStickyZones } from "../../src/lib/options-zone-sticky";

// Bull band entirely above spot — reject (BTC screenshot case)
{
  const strike = 65_000;
  const half = 929;
  const spot = 62_586;
  assert.equal(bullStrikeEligibleForSpot(strike, half, spot), false);
}

// Bull band with spot inside — allow
{
  const strike = 65_000;
  const half = 929;
  const spot = 64_500;
  assert.equal(bullStrikeEligibleForSpot(strike, half, spot), true);
}

// Bull band with spot at zone low — allow
{
  const strike = 65_000;
  const half = 929;
  const spot = strike - half;
  assert.equal(bullStrikeEligibleForSpot(strike, half, spot), true);
}

// Bear band entirely below spot — reject
{
  const strike = 75_000;
  const half = 929;
  const spot = 80_000;
  assert.equal(bearStrikeEligibleForSpot(strike, half, spot), false);
}

// Bear band with spot inside — allow
{
  const strike = 75_000;
  const half = 929;
  const spot = 75_500;
  assert.equal(bearStrikeEligibleForSpot(strike, half, spot), true);
}

// Compat helpers still compute the old IV span numbers
{
  const reach = 2_000;
  assert.equal(deriveClusterSearchRadius(reach), reach * 2.5);
  assert.equal(deriveMaxPainAnchorSpan(reach, 0), reach * 2.5);
  assert.equal(deriveMaxPainAnchorSpan(reach, 7_900), 7_900 + reach);
}

// Highest put below spot — prefers tall wall over nearer weak wall,
// including deep structural walls (no distance cutoff)
{
  const put = new Map<number, number>([
    [75_000, 4_000],  // nearer, weaker
    [70_000, 12_000],
    [60_000, 50_000], // farthest, strongest — should win
  ]);
  const call = new Map<number, number>();
  const input = {
    putOIByStrike: put,
    callOIByStrike: call,
    nearTermPutOI: put,
    nearTermCallOI: call,
    nearTermOiFloor: 10,
    spot: 76_500,
    side: "put" as const,
    zoneHalfWidthUsd: 500,
    minClusterOi: 1_000,
  };
  const pick = pickHighestClusterNearSpot(input);
  assert.equal(pick?.strike, 60_000);
  assert.equal(pick?.oi, 50_000);
  assert.notEqual(pick?.strike, 75_000);
}

// Highest call above spot — tallest wins even when far
{
  const call = new Map<number, number>([
    [78_000, 3_000],
    [80_000, 18_000],
    [120_000, 90_000],
  ]);
  const put = new Map<number, number>();
  const input = {
    putOIByStrike: put,
    callOIByStrike: call,
    nearTermPutOI: put,
    nearTermCallOI: call,
    nearTermOiFloor: 10,
    spot: 76_500,
    side: "call" as const,
    zoneHalfWidthUsd: 500,
    minClusterOi: 1_000,
  };
  const candidates = filterHighestClusterCandidates(input);
  assert.deepEqual(
    candidates.map(([s]) => s).sort((a, b) => a - b),
    [78_000, 80_000, 120_000],
  );
  const pick = pickHighestClusterNearSpot(input);
  assert.equal(pick?.strike, 120_000);
}

// Sticky releases when spot breaks below prior bull band
{
  const previous = {
    bullStrike: 65_000,
    bullZoneLow: 64_071,
    bullZoneHigh: 65_929,
    bullExitAbove: 65_929,
    bullOI: 10_000,
    bearStrike: null,
    bearZoneLow: null,
    bearZoneHigh: null,
    bearExitBelow: null,
    bearOI: null,
  };
  const fresh = {
    bullStrike: 60_000,
    bullZoneLow: 59_071,
    bullZoneHigh: 60_929,
    bullExitAbove: 60_929,
    bullOI: 8_000,
    bearStrike: null,
    bearZoneLow: null,
    bearZoneHigh: null,
    bearExitBelow: null,
    bearOI: null,
  };
  const { bands, meta } = applyStickyZones(
    62_586,
    fresh,
    previous,
    () => 10_000,
    1_000,
  );
  assert.equal(meta.bullLocked, false);
  assert.equal(bands.bullStrike, 60_000);
}

console.log("options-zone-spot-filter.test.ts ok");
