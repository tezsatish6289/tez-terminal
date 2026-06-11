import assert from "node:assert/strict";
import {
  formatZonesExpiryLabel,
  resolveZonesExpiryFromStored,
} from "../../src/lib/levels/zones-expiry-label";

assert.equal(formatZonesExpiryLabel("10-Jun-2026"), "10/06/2026");
assert.equal(formatZonesExpiryLabel("05-May-2026"), "05/05/2026");
assert.equal(formatZonesExpiryLabel("26-JUN-2025"), "26/06/2025");
assert.equal(formatZonesExpiryLabel("26-Jun-25"), "26/06/2025");
assert.equal(formatZonesExpiryLabel("10JUN2026"), "10/06/2026");
assert.equal(formatZonesExpiryLabel("2026-06-10"), "10/06/2026");
assert.equal(formatZonesExpiryLabel("2026-06-26"), "26/06/2026");
assert.equal(formatZonesExpiryLabel("26 Jun 2025"), "26/06/2025");

assert.equal(
  resolveZonesExpiryFromStored({ expiryUsed: "2026-06-26", maxPain: 370 }),
  "26/06/2026",
);

assert.equal(
  resolveZonesExpiryFromStored({
    maxPainByExpiry: [{ expiry: "29-May-2026", maxPain: 370, totalOI: 1, dayIndex: 0 }],
  }),
  "29/05/2026",
);

console.log("zones-expiry-label.test.ts: ok");
