import assert from "node:assert/strict";
import { appendDailyIv, istDateKey, IV_HISTORY_CAP } from "../../src/lib/iv-history";
import { appendDailyVix, parseVixHistory, vixDateKey } from "../../src/lib/india-vix";

// ── istDateKey ────────────────────────────────────────────────────────────
// 19:00 UTC on Jun 7 is already Jun 8 in IST (UTC+5:30).
{
  assert.equal(istDateKey(Date.parse("2026-06-07T19:00:00Z")), "2026-06-08");
  assert.equal(istDateKey(Date.parse("2026-06-07T10:00:00Z")), "2026-06-07");
}

// ── appendDailyIv ─────────────────────────────────────────────────────────
// Appends a new day.
{
  const out = appendDailyIv([{ date: "2026-06-06", iv: 20 }], "2026-06-07", 22);
  assert.equal(out.length, 2);
  assert.equal(out[1].iv, 22);
}
// Idempotent within the same day (dedup by last date).
{
  const start = [{ date: "2026-06-07", iv: 22 }];
  const out = appendDailyIv(start, "2026-06-07", 25);
  assert.equal(out.length, 1);
  assert.equal(out[0].iv, 22);
}
// Caps to the most recent N.
{
  const long = Array.from({ length: IV_HISTORY_CAP }, (_, i) => ({
    date: `d${i}`,
    iv: i,
  }));
  const out = appendDailyIv(long, "new", 999);
  assert.equal(out.length, IV_HISTORY_CAP);
  assert.equal(out[out.length - 1].iv, 999);
  assert.equal(out[0].iv, 1); // oldest dropped
}
// Ignores non-finite.
{
  const out = appendDailyIv([{ date: "d", iv: 10 }], "d2", Number.NaN);
  assert.equal(out.length, 1);
}

// ── appendDailyVix ────────────────────────────────────────────────────────
{
  const out = appendDailyVix([{ date: "2026-06-06", value: 12 }], "2026-06-07", 14);
  assert.equal(out.length, 2);
  const dedup = appendDailyVix(out, "2026-06-07", 99);
  assert.equal(dedup.length, 2);
  assert.equal(dedup[1].value, 14);
}

// ── vixDateKey ────────────────────────────────────────────────────────────
{
  assert.equal(vixDateKey("11-Apr-2025"), "2025-04-11");
  assert.equal(vixDateKey("2025-04-11"), "2025-04-11");
  assert.equal(vixDateKey("nonsense"), null);
  assert.equal(vixDateKey(null), null);
}

// ── parseVixHistory ───────────────────────────────────────────────────────
// Permissive across NSE field-name variants; ascending + deduped.
{
  const rows = [
    { EOD_TIMESTAMP: "11-Apr-2025", EOD_CLOSE_INDEX_VAL: 20.11 },
    { EOD_TIMESTAMP: "10-Apr-2025", EOD_CLOSE_INDEX_VAL: 21.5 },
    // dupe date, last wins
    { EOD_TIMESTAMP: "10-Apr-2025", EOD_CLOSE_INDEX_VAL: 22.0 },
    // alternate field names
    { date: "2025-04-12", close: 19.4 },
    // junk dropped
    { EOD_TIMESTAMP: "bad", EOD_CLOSE_INDEX_VAL: 5 },
    { EOD_TIMESTAMP: "13-Apr-2025", EOD_CLOSE_INDEX_VAL: 0 },
  ];
  const out = parseVixHistory(rows);
  assert.deepEqual(
    out.map((e) => e.date),
    ["2025-04-10", "2025-04-11", "2025-04-12"],
  );
  assert.equal(out[0].value, 22.0); // dedupe kept the last
  assert.equal(out[2].value, 19.4);
}

console.log("iv-history.test.ts ok");
