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
  day0Ms + 10 * MS,
);

assert(series != null, "series exists");
assert(series!.points.length === 3, "launch + win episode + loss episode only");
assert(series!.points[0].day === 0 && series!.points[0].streak === 0, "starts at day 0 zero");
assert(
  series!.points.some((p) => p.day === 1 && p.streak === 2),
  "two-win episode peaks at +2 on last win day",
);
assert(
  series!.points.some((p) => p.day === 3 && p.streak === -2),
  "two-loss episode ends at -2 on last loss day",
);
assert(
  !series!.points.some((p) => p.streak === 1 || p.streak === -1),
  "no per-trade intermediate points",
);
assert(series!.currentStreak === -2, "current streak is -2");

const userExample = buildConsecutiveWinLossSeries(
  [
    { status: "CLOSED", closedAt: "2026-01-06T18:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-06T19:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-06T20:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-06T21:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-06T22:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-08T18:00:00.000Z", realizedPnl: -1 },
    { status: "CLOSED", closedAt: "2026-01-08T20:00:00.000Z", realizedPnl: -1 },
    { status: "CLOSED", closedAt: "2026-01-11T18:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-11T19:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-11T20:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-11T21:00:00.000Z", realizedPnl: 1 },
  ],
  day0Ms,
  day0Ms + 14 * MS,
);

assert(
  userExample!.points.some((p) => p.day === 5 && p.streak === 5),
  "five-win episode at day 5",
);
assert(
  userExample!.points.some((p) => p.day === 7 && p.streak === -2),
  "two-loss episode at day 7",
);
assert(
  userExample!.points.some((p) => p.day === 10 && p.streak === 4),
  "four-win episode at day 10",
);

const sameDay = buildConsecutiveWinLossSeries(
  [
    { status: "CLOSED", closedAt: "2026-01-05T18:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-05T20:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-05T22:00:00.000Z", realizedPnl: -1 },
  ],
  day0Ms,
  day0Ms + 10 * MS,
);

const day4 = sameDay!.points.filter((p) => p.day === 4);
assert(day4.some((p) => p.streak === 2), "same-day win episode +2");
assert(day4.some((p) => p.streak === -1), "same-day loss episode -1");
assert(day4.length === 2, "two episodes on one day");

const openStreak = buildConsecutiveWinLossSeries(
  [
    { status: "CLOSED", closedAt: "2026-01-08T18:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-09T18:00:00.000Z", realizedPnl: 1 },
  ],
  day0Ms,
  day0Ms + 14 * MS,
);

assert(openStreak!.currentStreak === 2, "open streak is +2");
assert(
  openStreak!.points.some((p) => p.day === 8 && p.streak === 2),
  "open two-win episode ends at last win day",
);
assert(
  !openStreak!.points.some((p) => p.streak === 0 && p.day > 0),
  "no forced zero anchors after launch",
);

const emptyDay0 = buildConsecutiveWinLossSeries([], NaN);
assert(emptyDay0 == null, "invalid day0 returns null");

function summary() {
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

summary();
