import assert from "node:assert/strict";
import {
  filterActiveNseExpiries,
  isNseExpiryExpired,
  nseExpiryIstDateKey,
} from "../../src/lib/nse/expiry-dates";

assert.equal(nseExpiryIstDateKey("16-Jun-2026"), "2026-06-16");
assert.equal(nseExpiryIstDateKey("23-Jun-2026"), "2026-06-23");

const jun17Morning = Date.parse("2026-06-17T03:15:00.000Z"); // 08:45 IST
assert.equal(isNseExpiryExpired("16-Jun-2026", jun17Morning), true);
assert.equal(isNseExpiryExpired("23-Jun-2026", jun17Morning), false);
assert.equal(isNseExpiryExpired("16-Jun-2026", Date.parse("2026-06-16T10:00:00.000Z")), false);

assert.deepEqual(
  filterActiveNseExpiries(
    ["16-Jun-2026", "23-Jun-2026", "30-Jun-2026"],
    jun17Morning,
  ),
  ["23-Jun-2026", "30-Jun-2026"],
);

console.log("nse-expiry-dates.test.ts: ok");
