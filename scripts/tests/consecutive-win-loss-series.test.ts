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
  "loss flip crosses zero",
);
assert(
  series!.points.some((p) => p.day === 2 && p.streak === -1),
  "first loss steps to -1",
);
assert(
  series!.points.some((p) => p.day === 3 && p.streak === -2),
  "second loss steps to -2",
);
assert(series!.currentStreak === -2, "current streak is -2");

const sameDay = buildConsecutiveWinLossSeries(
  [
    { status: "CLOSED", closedAt: "2026-01-05T18:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-05T20:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-05T22:00:00.000Z", realizedPnl: -1 },
  ],
  day0Ms,
  day0Ms + 6 * MS,
);

const day5 = sameDay!.points.filter((p) => p.day === 4);
assert(day5.some((p) => p.streak === 1), "same-day win steps to +1");
assert(day5.some((p) => p.streak === 2), "same-day win steps to +2");
assert(day5.some((p) => p.streak === 0), "same-day flip crosses zero");
assert(day5.some((p) => p.streak === -1), "same-day loss steps to -1");

const emptyDay0 = buildConsecutiveWinLossSeries([], NaN);
assert(emptyDay0 == null, "invalid day0 returns null");

function summary() {
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

summary();
