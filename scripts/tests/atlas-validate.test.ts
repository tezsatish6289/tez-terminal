import {
  checkIntradayPvt,
  checkNews,
  checkOiDay,
  checkOiHistory,
  checkSrLocation,
  tallyVerdict,
  validateTradeIdea,
  type AtlasValidateInputs,
} from "../../src/lib/levels/atlas-validate";
import { assertTrue, describe, summary, test } from "./_assert";

const base = (over: Partial<AtlasValidateInputs> = {}): AtlasValidateInputs => ({
  symbol: "RELIANCE",
  label: "Reliance",
  bias: "bullish",
  spot: 2850,
  supportLow: 2820,
  supportHigh: 2860,
  resistanceLow: 2920,
  resistanceHigh: 2960,
  putOiChangePct: null,
  callOiChangePct: null,
  oiHistory: null,
  newsScore: null,
  pvtSlope: null,
  ...over,
});

describe("checkSrLocation", () => {
  test("holding support supports a bullish idea", () => {
    const c = checkSrLocation(base({ spot: 2840, bias: "bullish" }));
    assertTrue(c.status === "support", c.reason);
  });

  test("at resistance conflicts with a bullish idea", () => {
    const c = checkSrLocation(base({ spot: 2940, bias: "bullish" }));
    assertTrue(c.status === "conflict", c.reason);
  });

  test("broken support conflicts with bullish and forces not_aligned", () => {
    const inputs = base({ spot: 2800, bias: "bullish" });
    const c = checkSrLocation(inputs);
    assertTrue(c.status === "conflict", c.reason);
    assertTrue(tallyVerdict([c], inputs) === "not_aligned");
  });
});

describe("checkOiDay", () => {
  test("put wall building supports bullish", () => {
    const c = checkOiDay(base({ putOiChangePct: 20, callOiChangePct: 0, bias: "bullish" }));
    assertTrue(c.status === "support", c.reason);
  });

  test("call wall building conflicts with bullish", () => {
    const c = checkOiDay(base({ putOiChangePct: 0, callOiChangePct: 25, bias: "bullish" }));
    assertTrue(c.status === "conflict", c.reason);
  });
});

describe("checkOiHistory", () => {
  test("put wall trend supports bullish", () => {
    const hist = [
      { date: "2026-07-01", spot: 2800, putStrike: 2800, putOI: 100, callStrike: 3000, callOI: 100, maxPain: 2900, expiry: null },
      { date: "2026-07-02", spot: 2810, putStrike: 2800, putOI: 110, callStrike: 3000, callOI: 100, maxPain: 2900, expiry: null },
      { date: "2026-07-03", spot: 2820, putStrike: 2800, putOI: 120, callStrike: 3000, callOI: 95, maxPain: 2900, expiry: null },
      { date: "2026-07-04", spot: 2830, putStrike: 2800, putOI: 140, callStrike: 3000, callOI: 90, maxPain: 2900, expiry: null },
    ];
    const c = checkOiHistory(base({ oiHistory: hist, bias: "bullish" }));
    assertTrue(c.status === "support", c.reason);
  });
});

describe("checkNews", () => {
  test("bullish news supports bullish bias", () => {
    const c = checkNews(base({ newsScore: 72, newsLabel: "bullish", bias: "bullish" }));
    assertTrue(c.status === "support", c.reason);
  });

  test("bearish news conflicts with bullish bias", () => {
    const c = checkNews(base({ newsScore: 30, newsLabel: "bearish", bias: "bullish" }));
    assertTrue(c.status === "conflict", c.reason);
  });
});

describe("checkIntradayPvt", () => {
  test("up PVT supports bullish", () => {
    const c = checkIntradayPvt(base({ pvtSlope: 0.8, bias: "bullish" }));
    assertTrue(c.status === "support", c.reason);
  });
});

describe("validateTradeIdea", () => {
  test("aligned when multiple supports and no conflicts", () => {
    const r = validateTradeIdea(
      base({
        spot: 2840,
        putOiChangePct: 20,
        callOiChangePct: 0,
        newsScore: 70,
        pvtSlope: 0.5,
      }),
    );
    assertTrue(r.verdict === "aligned", r.summary);
    assertTrue(r.checks.some((c) => c.status === "support"));
    assertTrue(r.invalidation != null && /2,?820/.test(r.invalidation), r.invalidation ?? "no invalidation");
  });

  test("partially aligned on mixed evidence", () => {
    const r = validateTradeIdea(
      base({
        spot: 2840,
        putOiChangePct: 20,
        callOiChangePct: 0,
        newsScore: 25,
        pvtSlope: -0.6,
      }),
    );
    assertTrue(r.verdict === "partially_aligned", r.summary);
  });

  test("not aligned when everything conflicts", () => {
    const r = validateTradeIdea(
      base({
        bias: "bullish",
        spot: 2940,
        putOiChangePct: 0,
        callOiChangePct: 30,
        newsScore: 20,
        pvtSlope: -0.8,
      }),
    );
    assertTrue(r.verdict === "not_aligned", r.summary);
  });
});

summary();
