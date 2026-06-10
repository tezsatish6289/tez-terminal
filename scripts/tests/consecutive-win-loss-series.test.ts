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
assert(series!.points[0].day === 0, "starts at day 0");

const day0pt = series!.points.find((p) => p.day === 0)!;
const day1pt = series!.points.find((p) => p.day === 1)!;
const day2pt = series!.points.find((p) => p.day === 2)!;
const day3pt = series!.points.find((p) => p.day === 3)!;

assert(day0pt.wins === 1 && day0pt.cumulativeNet === 1, "day 0 one win, net +1");
assert(day1pt.wins === 1 && day1pt.cumulativeNet === 2, "day 1 one win, net +2");
assert(day2pt.losses === 1 && day2pt.lossBar === -1 && day2pt.cumulativeNet === 1, "day 2 one loss");
assert(day3pt.losses === 1 && day3pt.cumulativeNet === 0, "day 3 net back to 0");
assert(series!.cumulativeNet === 0, "final cumulative net is 0");
assert(series!.totalWins === 2 && series!.totalLosses === 2, "totals");

const sameDay = buildConsecutiveWinLossSeries(
  [
    { status: "CLOSED", closedAt: "2026-01-05T18:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-05T20:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-05T22:00:00.000Z", realizedPnl: -1 },
  ],
  day0Ms,
  day0Ms + 10 * MS,
);

const day4 = sameDay!.points.find((p) => p.day === 4)!;
assert(day4.wins === 2 && day4.losses === 1, "same day wins and losses");
assert(day4.lossBar === -1, "loss bar is negative");

const netRun = buildConsecutiveWinLossSeries(
  [
    { status: "CLOSED", closedAt: "2026-01-02T18:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-03T18:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-04T18:00:00.000Z", realizedPnl: 1 },
  ],
  day0Ms,
  day0Ms + 10 * MS,
);

assert(netRun!.cumulativeNet === 3, "three wins yields +3 net");
assert(
  netRun!.points.find((p) => p.day === 3)!.cumulativeNet === 3,
  "cumulative net climbs on line",
);

const emptyDay0 = buildConsecutiveWinLossSeries([], NaN);
assert(emptyDay0 == null, "invalid day0 returns null");

function summary() {
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

summary();
