import { buildPlatformUserGrowthSeries } from "../../src/lib/freedombot/platform-user-growth";

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

const allBots = buildPlatformUserGrowthSeries(
  [
    { uid: "u1", bot: "CRYPTO", createdAt: day0 },
    { uid: "u2", bot: "BTC", createdAt: "2026-01-03T12:00:00.000Z" },
    { uid: "u1", bot: "ETH", createdAt: "2026-01-05T12:00:00.000Z" },
  ],
  null,
  day0Ms + 5 * 24 * 60 * 60 * 1000,
);

assert(allBots != null, "all-bots series exists");
assert(allBots!.points[0].users === 1, "day 0 has one user");
assert(allBots!.points[2].users === 2, "day 2 adds second user");
assert(allBots!.totalUsers === 2, "two unique users total");

const btcOnly = buildPlatformUserGrowthSeries(
  [
    { uid: "u1", bot: "CRYPTO", createdAt: day0 },
    { uid: "u2", bot: "BTC", createdAt: "2026-01-03T12:00:00.000Z" },
    { uid: "u3", bot: "BTC", createdAt: "2026-01-04T12:00:00.000Z" },
  ],
  "BTC",
  day0Ms + 4 * 24 * 60 * 60 * 1000,
);

assert(btcOnly != null, "btc filter series exists");
assert(btcOnly!.day0.startsWith("2026-01-03"), "btc day 0 is first btc deploy");
assert(btcOnly!.points[0].users === 1, "btc day 0 one user");
assert(btcOnly!.points[1].users === 2, "btc day 1 two users");

const empty = buildPlatformUserGrowthSeries([], null);
assert(empty == null, "empty deployments returns null");

function summary() {
  console.log(`${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

summary();
