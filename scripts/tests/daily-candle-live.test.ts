import assert from "node:assert/strict";
import {
  enrichDailyWithTodayMarketBar,
  istDateKeyFromEpochSec,
  istDayStartEpochSec,
  istTodayKey,
  mergeTodaySessionBar,
  todayBarFromMarketSnapshot,
  type DailyOhlcCandle,
} from "../../src/lib/levels/daily-candle-live";

// Monday 2026-07-06 11:00 IST
const MON_11AM_IST = Date.UTC(2026, 6, 6, 5, 30, 0);
const MON_KEY = "2026-07-06";

function friBar(): DailyOhlcCandle {
  const friKey = "2026-07-03";
  return {
    time: istDayStartEpochSec(friKey),
    open: 100,
    high: 105,
    low: 99,
    close: 104,
    volume: 1_000_000,
  };
}

// Build today bar from Dhan marketfeed snapshot.
{
  const bar = todayBarFromMarketSnapshot(
    {
      last_price: 108,
      ohlc: { open: 104, high: 110, low: 103, close: 105 },
      volume: 250_000,
    },
    MON_KEY,
  );
  assert.ok(bar);
  assert.equal(bar.open, 104);
  assert.equal(bar.high, 110);
  assert.equal(bar.low, 103);
  assert.equal(bar.close, 108);
  assert.equal(bar.volume, 250_000);
  assert.equal(bar.live, true);
}

// Appends today's bar when history ends on a prior session.
{
  const todayBar = todayBarFromMarketSnapshot(
    { last_price: 108, ohlc: { open: 104, high: 110, low: 103, close: 105 } },
    MON_KEY,
  )!;
  const out = mergeTodaySessionBar([friBar()], todayBar);
  assert.equal(out.length, 2);
  assert.equal(istDateKeyFromEpochSec(out[1]!.time), MON_KEY);
}

// End-to-end enrich on weekdays.
{
  const out = enrichDailyWithTodayMarketBar(
    [friBar()],
    { last_price: 108, ohlc: { open: 104, high: 110, low: 103, close: 105 } },
    MON_11AM_IST,
  );
  assert.equal(out.length, 2);
  assert.equal(istDateKeyFromEpochSec(out[1]!.time), istTodayKey(MON_11AM_IST));
}

// No-op before the session opens (pre-market) — snapshot still holds the prior
// session's OHLC, so we must not fabricate a bar dated today.
{
  const preOpenMs = Date.UTC(2026, 6, 6, 3, 0, 0); // Mon 08:30 IST (before 09:15)
  const out = enrichDailyWithTodayMarketBar(
    [friBar()],
    { last_price: 108, ohlc: { open: 104, high: 110, low: 103, close: 105 } },
    preOpenMs,
  );
  assert.equal(out.length, 1);
  assert.equal(istDateKeyFromEpochSec(out[0]!.time), "2026-07-03");
}

// Merges once the session has opened (09:15 IST boundary).
{
  const atOpenMs = Date.UTC(2026, 6, 6, 3, 45, 0); // Mon 09:15 IST
  const out = enrichDailyWithTodayMarketBar(
    [friBar()],
    { last_price: 108, ohlc: { open: 104, high: 110, low: 103, close: 105 } },
    atOpenMs,
  );
  assert.equal(out.length, 2);
}

// No-op on weekends.
{
  const satMs = Date.UTC(2026, 6, 4, 5, 30, 0);
  const out = enrichDailyWithTodayMarketBar(
    [friBar()],
    { last_price: 108, ohlc: { open: 104, high: 110, low: 103, close: 105 } },
    satMs,
  );
  assert.equal(out.length, 1);
}

// Rejects zeroed OHLC (pre-market / bad snapshot).
{
  const bar = todayBarFromMarketSnapshot(
    { last_price: 108, ohlc: { open: 0, high: 0, low: 0, close: 108 } },
    MON_KEY,
  );
  assert.equal(bar, null);
}

console.log("daily-candle-live.test.ts passed");
