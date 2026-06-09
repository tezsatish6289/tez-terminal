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

function peakPoints(series: NonNullable<ReturnType<typeof buildConsecutiveWinLossSeries>>) {
  return series.points.filter((p) => p.streak !== 0);
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
const peaks = peakPoints(series!);
assert(peaks.length === 2, "two completed streak spikes");
assert(peaks[0].streak === 2, "first spike is +2 win streak");
assert(peaks[0].day === 1, "win spike peaks on last win day");
assert(peaks[0].streakSpanDays === 2, "win streak spanned 2 days");
assert(peaks[1].streak === -2, "second spike is -2 loss streak");
assert(peaks[1].day === 3, "loss spike peaks on last loss day");
assert(
  series!.points.every((p, i, arr) => {
    if (p.streak !== 0) return true;
    if (i === 0 || i === arr.length - 1) return true;
    const prev = arr[i - 1];
    const next = arr[i + 1];
    return prev.streak !== 0 || next.streak !== 0 || p.day !== prev.day;
  }),
  "each peak returns to zero on the same day",
);

const eightWinStreak = buildConsecutiveWinLossSeries(
  [
    { status: "CLOSED", closedAt: "2026-01-01T18:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-02T18:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-03T18:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-04T18:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-05T18:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-06T18:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-07T18:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-08T18:00:00.000Z", realizedPnl: 1 },
    { status: "CLOSED", closedAt: "2026-01-09T18:00:00.000Z", realizedPnl: -1 },
  ],
  day0Ms,
  day0Ms + 10 * MS,
);

const winSpike = peakPoints(eightWinStreak!)[0];
assert(winSpike.streak === 8, "eight-trade win streak peaks at +8");
assert(winSpike.day === 7, "win spike ends on day 7");
assert(winSpike.streakSpanDays === 8, "eight wins over eight calendar days");
assert(
  !eightWinStreak!.points.some((p) => p.day > 0 && p.day < 7 && p.streak !== 0),
  "no intermediate peak points while streak is building",
);

const emptyDay0 = buildConsecutiveWinLossSeries([], NaN);
assert(emptyDay0 == null, "invalid day0 returns null");

function summary() {
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

summary();
