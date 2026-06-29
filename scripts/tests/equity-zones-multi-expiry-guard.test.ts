import assert from "node:assert/strict";
import { resolveMaxPainByExpiry } from "../../src/lib/equity-zones-store";

// Fixed "now" so expiry filtering is deterministic. Treat 2026-06-29 as today:
// 30-Jun/28-Jul/25-Aug are active; 30-May is expired.
const NOW = Date.parse("2026-06-29T12:00:00+05:30");

type Slice = Parameters<typeof resolveMaxPainByExpiry>[0][number];
const slice = (expiry: string, dayIndex: number): Slice =>
  ({ expiry, maxPain: 1000, dayIndex } as unknown as Slice);

const dhanNearest = [slice("30-Jun-2026", 0)];
const nseMulti = [slice("30-Jun-2026", 0), slice("28-Jul-2026", 1), slice("25-Aug-2026", 2)];

// 1) Dhan single-expiry downgrade preserves the richer stored multi-expiry map.
{
  const out = resolveMaxPainByExpiry(dhanNearest, nseMulti, "dhan_equity", NOW);
  assert.equal(out.length, 3, "should keep all 3 stored expiries");
  assert.deepEqual(out.map((s) => s.expiry), ["30-Jun-2026", "28-Jul-2026", "25-Aug-2026"]);
  assert.deepEqual(out.map((s) => s.dayIndex), [0, 1, 2], "dayIndex re-stamped");
}

// 2) Expired stored slices are dropped before preserving.
{
  const stale = [slice("30-May-2026", 0), slice("28-Jul-2026", 1), slice("25-Aug-2026", 2)];
  const out = resolveMaxPainByExpiry(dhanNearest, stale, "dhan_equity", NOW);
  assert.deepEqual(out.map((s) => s.expiry), ["28-Jul-2026", "25-Aug-2026"], "expired 30-May dropped");
  assert.deepEqual(out.map((s) => s.dayIndex), [0, 1]);
}

// 3) A genuine NSE refresh always wins, even if it has fewer expiries.
{
  const nseSingle = [slice("30-Jun-2026", 0)];
  const out = resolveMaxPainByExpiry(nseSingle, nseMulti, "nse_equity", NOW);
  assert.deepEqual(out, nseSingle, "nse_equity is the truth — never preserved over");
}

// 4) A fresh multi-expiry Dhan write (>1) is not downgraded; it wins as-is.
{
  const dhanMulti = [slice("30-Jun-2026", 0), slice("28-Jul-2026", 1)];
  const out = resolveMaxPainByExpiry(dhanMulti, nseMulti, "dhan_equity", NOW);
  assert.deepEqual(out, dhanMulti);
}

// 5) No richer stored map (cold start / equal length) → keep the fresh Dhan slice.
{
  assert.deepEqual(resolveMaxPainByExpiry(dhanNearest, [], "dhan_equity", NOW), dhanNearest);
  assert.deepEqual(resolveMaxPainByExpiry(dhanNearest, undefined, "dhan_equity", NOW), dhanNearest);
  assert.deepEqual(
    resolveMaxPainByExpiry(dhanNearest, [slice("30-Jun-2026", 0)], "dhan_equity", NOW),
    dhanNearest,
    "equal length is not a downgrade",
  );
}

// 6) Stored map with only expired slices → fresh Dhan wins (no resurrection of dead expiries).
{
  const allExpired = [slice("30-May-2026", 0), slice("29-May-2026", 1)];
  assert.deepEqual(resolveMaxPainByExpiry(dhanNearest, allExpired, "dhan_equity", NOW), dhanNearest);
}

console.log("equity-zones-multi-expiry-guard.test.ts ok");
