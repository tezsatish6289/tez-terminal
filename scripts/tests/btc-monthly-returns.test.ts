import {
  buildBtcMonthlyReturnSeries,
  parseMonthlyKlines,
} from "../../src/lib/btc-monthly-returns";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${msg}`);
  }
}

// Jan 2026 open 100 → close 110 (+10%), Feb open 110 → close 99 (−10%)
const klines = parseMonthlyKlines([
  { startMs: Date.UTC(2026, 0, 1), open: 100, close: 110 },
  { startMs: Date.UTC(2026, 1, 1), open: 110, close: 99 },
]);

const series = buildBtcMonthlyReturnSeries(["2026-01", "2026-02"], klines);

assert(series.length === 2, "two months");
assert(series[0].btcMonthlyReturnPct === 10, "jan monthly +10%");
assert(series[0].btcCumulativeReturnPct === 10, "jan cumulative +10%");
assert(series[1].btcMonthlyReturnPct === -10, "feb monthly -10%");
assert(series[1].btcCumulativeReturnPct === -1, "feb cumulative -1% vs jan open");

function summary() {
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

summary();
