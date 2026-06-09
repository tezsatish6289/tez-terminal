import { buildConsecutiveWinLossSeries } from "../../src/lib/freedombot/consecutive-win-loss-series";

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

const day0 = "2026-01-01T12:00:00.000Z";
const day0Ms = new Date(day0).getTime();
const MS = 24 * 60 * 60 * 1000;

const series = buildConsecutiveWinLossSeries(
  [
    { status: "CLOSED", closedAt: "2026-01-01T18:00:00.000Z", realizedPnl: 10 },
    { status: "CLOSED", closedAt: "2026-01-02T18:00:00.000Z", realizedPnl: 5 },
    { status: "CLOSED", closedAt: "2026-01-03T18:00:00.000Z", realizedPnl: -3 },
    { status: "CLOSED", closedAt: "2026-01-04T18:00:00.000Z", realizedPnl: -2 },
  ],
  day0Ms,
  day0Ms + 4 * MS,
);

assert(series != null, "series exists");
assert(series!.points[0].streak === 1, "day 0 first win");
assert(series!.points[0].day === 0, "starts at day 0");
assert(series!.points[1].streak === 2, "day 1 second win");
assert(series!.points[2].streak === -1, "day 2 first loss");
assert(series!.points[3].streak === -2, "day 3 second loss");
assert(series!.points[4].streak === -2, "day 4 holds loss streak");
assert(series!.currentStreak === -2, "current streak is -2");
assert(series!.maxWinStreak === 2, "max win streak is 2");
assert(series!.maxLossStreak === 2, "max loss streak is 2");

const breakeven = buildConsecutiveWinLossSeries(
  [
    { status: "CLOSED", closedAt: "2026-01-01T18:00:00.000Z", realizedPnl: 10 },
    { status: "CLOSED", closedAt: "2026-01-02T18:00:00.000Z", realizedPnl: 0 },
  ],
  day0Ms,
  day0Ms + 2 * MS,
);

assert(breakeven!.points[2].streak === 1, "breakeven keeps prior win streak");

const emptyDay0 = buildConsecutiveWinLossSeries([], NaN);
assert(emptyDay0 == null, "invalid day0 returns null");

function summary() {
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

summary();
