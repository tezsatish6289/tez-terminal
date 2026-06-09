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
assert(series!.points[0].streak === 0 && series!.points[0].day === 0, "starts on zero line");
assert(
  series!.points.some((p) => p.day === 0 && p.streak === 1),
  "first win steps to +1",
);
assert(
  series!.points.some((p) => p.day === 1 && p.streak === 2),
  "second win steps to +2",
);
assert(
  series!.points.some((p) => p.day === 2 && p.streak === 0),
  "win episode closes back to zero on flip",
);
assert(
  series!.points.some((p) => p.day === 2 && p.streak === -1),
  "loss episode steps to -1",
);
assert(series!.currentStreak === -2, "current streak is -2");

const gap = buildConsecutiveWinLossSeries(
  [
    { status: "CLOSED", closedAt: "2026-01-02T18:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-12T18:00:00.000Z", realizedPnl: -1 },
  ],
  day0Ms,
  day0Ms + 14 * MS,
);

const day1 = gap!.points.find((p) => p.day === 1 && p.streak === 1);
const day11Zero = gap!.points.find((p) => p.day === 11 && p.streak === 0);
assert(day1 != null, "first win on day 1");
assert(day11Zero != null, "zero line extends before next episode");

const openStreak = buildConsecutiveWinLossSeries(
  [
    { status: "CLOSED", closedAt: "2026-01-08T18:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-09T18:00:00.000Z", realizedPnl: 1 },
  ],
  day0Ms,
  day0Ms + 14 * MS,
);

assert(openStreak!.currentStreak === 2, "open streak stays at +2");
assert(
  openStreak!.points.some((p) => p.day === 14 && p.streak === 0),
  "open streak closes to zero at chart end",
);

const emptyDay0 = buildConsecutiveWinLossSeries([], NaN);
assert(emptyDay0 == null, "invalid day0 returns null");

function summary() {
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

summary();
