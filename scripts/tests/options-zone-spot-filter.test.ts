import assert from "node:assert/strict";
import {
  bearStrikeEligibleForSpot,
  bullStrikeEligibleForSpot,
  deriveMaxPainAnchorSpan,
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

// Anchor window — calm market (spot ≈ max pain): volatility term wins
{
  const reach = 2_000;
  const span = deriveMaxPainAnchorSpan(reach, 0);
  assert.equal(span, reach * 2.5);
}

// Anchor window — bear trend (spot far below max pain): trend term reaches
// spot plus one daily sigma beyond, so a window pinned to max pain no
// longer goes blind below price.
{
  const reach = 2_000;
  const gap = 7_900; // e.g. max pain $70,500 vs spot $62,586 (BTC)
  const span = deriveMaxPainAnchorSpan(reach, gap);
  assert.equal(span, gap + reach); // 9,900 > 5,000 volatility term
  assert.ok(span >= gap, "window must at least reach spot");
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
