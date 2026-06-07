import assert from "node:assert/strict";
import {
  classifyVolRegime,
  computeAtmIv,
  crossSectionalPercentile,
  daysUntil,
  ivPercentile,
  ivScaledHalfWidth,
  termStructureRatio,
} from "../../src/lib/zones/vol-regime";

// ── computeAtmIv ──────────────────────────────────────────────────────────
// Averages call+put across the nearest strikes to spot.
{
  const m = new Map<number, { callIV?: number | null; putIV?: number | null }>([
    [90, { callIV: 30, putIV: 32 }],
    [100, { callIV: 20, putIV: 22 }], // nearest to spot 101
    [110, { callIV: 28, putIV: 30 }],
    [105, { callIV: 24, putIV: 26 }], // 2nd nearest
  ]);
  // nearest two strikes: 100 (avg 21) and 105 (avg 25) → 23
  assert.equal(computeAtmIv(m, 101, 2), 23);
}

// Drops zero / insane IVs; null when nothing usable near spot.
{
  const m = new Map<number, { callIV?: number | null; putIV?: number | null }>([
    [100, { callIV: 0, putIV: 0 }],
    [105, { callIV: 999, putIV: null }],
  ]);
  assert.equal(computeAtmIv(m, 101, 2), null);
}

// Single usable leg still counts.
{
  const m = new Map<number, { callIV?: number | null; putIV?: number | null }>([
    [100, { callIV: 18, putIV: 0 }],
  ]);
  assert.equal(computeAtmIv(m, 100, 2), 18);
}

// ── ivPercentile / crossSectionalPercentile ───────────────────────────────
{
  const hist = Array.from({ length: 100 }, (_, i) => i); // 0..99
  assert.equal(ivPercentile(hist, 80), 80); // 80 values below 80
  assert.equal(ivPercentile(hist, 0), 0);
  // Below minimum sample → null
  assert.equal(ivPercentile([1, 2, 3], 2), null);
  assert.equal(crossSectionalPercentile(hist, 50, 20), 50);
}

// ── termStructureRatio ────────────────────────────────────────────────────
{
  assert.equal(termStructureRatio(22, 20), 1.1);
  assert.equal(termStructureRatio(20, 0), null); // guard divide-by-zero
  assert.equal(termStructureRatio(null, 20), null);
}

// ── daysUntil ─────────────────────────────────────────────────────────────
{
  const now = Date.parse("2026-06-07T00:00:00Z");
  assert.equal(daysUntil("2026-06-07T05:00:00Z", now), 0);
  assert.equal(daysUntil("2026-06-14T00:00:00Z", now), 7);
  assert.equal(daysUntil("2026-06-01T00:00:00Z", now), null); // past
  assert.equal(daysUntil(null, now), null);
}

// ── classifyVolRegime ─────────────────────────────────────────────────────
// No usable IV → UNKNOWN
{
  const r = classifyVolRegime({ atmIv: null });
  assert.equal(r.flag, "UNKNOWN");
}
// Illiquid → UNKNOWN even with an IV number
{
  const r = classifyVolRegime({ atmIv: 25, illiquid: true });
  assert.equal(r.flag, "UNKNOWN");
}
// Earnings within window wins over everything
{
  const r = classifyVolRegime({ atmIv: 25, daysToEarnings: 2, ivPercentile: 95 });
  assert.equal(r.flag, "EARNINGS");
  assert.match(r.reason, /Earnings in 2d/);
  assert.match(r.reason, /elevated/i); // notes co-incident elevation
}
// Earnings just outside window → not EARNINGS
{
  const r = classifyVolRegime({ atmIv: 25, daysToEarnings: 10, ivPercentile: 50 });
  assert.equal(r.flag, "CALM");
}
// High IV percentile, no earnings → ELEVATED
{
  const r = classifyVolRegime({ atmIv: 40, ivPercentile: 90 });
  assert.equal(r.flag, "ELEVATED");
}
// Term-structure inversion alone → ELEVATED
{
  const r = classifyVolRegime({ atmIv: 30, termRatio: 1.2 });
  assert.equal(r.flag, "ELEVATED");
}
// Everything normal → CALM
{
  const r = classifyVolRegime({ atmIv: 22, ivPercentile: 40, termRatio: 0.98, vixPercentile: 30 });
  assert.equal(r.flag, "CALM");
}

// ── ivScaledHalfWidth ─────────────────────────────────────────────────────
{
  const round = (n: number) => Math.round(n * 100) / 100;
  // σ formula: spot × IV/100 × √(days/365). 1000 × 0.25 × √(1/365) ≈ 13.08.
  assert.equal(ivScaledHalfWidth(1000, 25, { horizonDays: 1 }), round(1000 * 0.25 * Math.sqrt(1 / 365)));
  // Higher IV widens the band, lower IV tightens it.
  assert.ok(ivScaledHalfWidth(1000, 50, { horizonDays: 1 }) > ivScaledHalfWidth(1000, 20, { horizonDays: 1 }));
  // Cap: 80% IV would be ~41.8 but maxPct 2% of 1000 = 20.
  assert.equal(ivScaledHalfWidth(1000, 80, { horizonDays: 1, maxPct: 0.02 }), 20);
  // Floor: tiny IV clamps up to minPct 0.4% of 1000 = 4.
  assert.equal(ivScaledHalfWidth(1000, 1, { horizonDays: 1, minPct: 0.004 }), 4);
  // Unknown IV → flat fallback percentage of spot (legacy behaviour).
  assert.equal(ivScaledHalfWidth(1000, null, { fallbackPct: 0.0075 }), 7.5);
  // Unknown IV with absolute fallback (index points) takes precedence.
  assert.equal(ivScaledHalfWidth(25000, null, { fallbackAbs: 150 }), 150);
  // Strike-step floor: band must span at least one strike.
  assert.equal(ivScaledHalfWidth(1000, 1, { horizonDays: 1, strikeStep: 10 }), 10);
  // Bad spot → 0, never throws.
  assert.equal(ivScaledHalfWidth(0, 25), 0);
}

console.log("vol-regime.test.ts ok");
