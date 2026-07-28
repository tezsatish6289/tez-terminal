import {
  computeContext,
  computeDirection,
  computeVolFit,
  postureFromLegs,
  rrContextScore,
  scoreDirectionalSetup,
  scoreStrategy,
  stanceAlignment,
  type ScoreInputs,
} from "../../src/lib/levels/strategy-score";
import { assertTrue, describe, summary, test } from "./_assert";

const BASE: ScoreInputs = {
  spot: null,
  maxPain: null,
  supportLow: null,
  supportHigh: null,
  resistanceLow: null,
  resistanceHigh: null,
  putWallStrike: null,
  putWallSize: null,
  callWallStrike: null,
  callWallSize: null,
  atmIV: null,
  ivPercentile: null,
  volRegimeFlag: null,
  daysToExpiry: null,
  daysToEarnings: null,
  putOiChangePct: null,
  callOiChangePct: null,
  newsScore: null,
  pvtSlope: null,
};

const inputs = (over: Partial<ScoreInputs>): ScoreInputs => ({ ...BASE, ...over });

describe("computeDirection", () => {
  test("spot near support with max pain above → bullish", () => {
    const d = computeDirection(
      inputs({ spot: 100, supportLow: 98, supportHigh: 102, resistanceLow: 118, resistanceHigh: 122, maxPain: 108 }),
    );
    assertTrue(d.value > 0.2, `expected bullish, got ${d.value}`);
    assertTrue(d.label === "bullish");
  });

  test("spot near resistance with max pain below → bearish", () => {
    const d = computeDirection(
      inputs({ spot: 120, supportLow: 98, supportHigh: 102, resistanceLow: 118, resistanceHigh: 122, maxPain: 108 }),
    );
    assertTrue(d.value < -0.2, `expected bearish, got ${d.value}`);
    assertTrue(d.label === "bearish");
  });

  test("max pain sign uses direction, not raw distance", () => {
    const up = computeDirection(inputs({ spot: 100, maxPain: 110 }));
    const down = computeDirection(inputs({ spot: 100, maxPain: 90 }));
    assertTrue(up.value > 0, "max pain above spot is bullish");
    assertTrue(down.value < 0, "max pain below spot is bearish");
    assertTrue(Math.abs(up.value + down.value) < 1e-9, "symmetric gaps cancel");
  });

  test("put wall building is bullish, call wall building is bearish", () => {
    const putBuild = computeDirection(inputs({ putOiChangePct: 30, callOiChangePct: 0 }));
    const callBuild = computeDirection(inputs({ putOiChangePct: 0, callOiChangePct: 30 }));
    assertTrue(putBuild.value > 0, "put buildup bullish");
    assertTrue(callBuild.value < 0, "call buildup bearish");
  });

  test("PVT slope is a primary directional signal", () => {
    const up = computeDirection(inputs({ pvtSlope: 1 }));
    const down = computeDirection(inputs({ pvtSlope: -1 }));
    assertTrue(up.value > 0 && up.label === "bullish", `pvt up: ${up.value}`);
    assertTrue(down.value < 0 && down.label === "bearish", `pvt down: ${down.value}`);
    // Carries real weight: on its own a full +1 PVT reads clearly bullish.
    assertTrue(up.value >= 0.9, `pvt should dominate when alone: ${up.value}`);
  });

  test("bullish PVT lifts an otherwise-neutral read", () => {
    const flat = computeDirection(inputs({ spot: 110, supportLow: 98, supportHigh: 102, resistanceLow: 118, resistanceHigh: 122 }));
    const withPvt = computeDirection(
      inputs({ spot: 110, supportLow: 98, supportHigh: 102, resistanceLow: 118, resistanceHigh: 122, pvtSlope: 1 }),
    );
    assertTrue(withPvt.value > flat.value, `${withPvt.value} vs ${flat.value}`);
  });

  test("no signals → neutral zero", () => {
    const d = computeDirection(BASE);
    assertTrue(d.value === 0 && d.label === "neutral");
  });
});

describe("stanceAlignment", () => {
  test("bullish stance rewards bullish read", () => {
    assertTrue(stanceAlignment("bullish", 1) === 1);
    assertTrue(stanceAlignment("bullish", -1) === 0);
  });
  test("bearish stance rewards bearish read", () => {
    assertTrue(stanceAlignment("bearish", -1) === 1);
    assertTrue(stanceAlignment("bearish", 1) === 0);
  });
  test("neutral stance wants a flat read", () => {
    assertTrue(stanceAlignment("neutral", 0) === 1);
    assertTrue(stanceAlignment("volatility", 1) === 0);
  });
});

describe("computeVolFit", () => {
  test("selling vol wants HIGH IV (fixes the inverted rule)", () => {
    const hi = computeVolFit("short-vol", inputs({ ivPercentile: 90 }));
    const lo = computeVolFit("short-vol", inputs({ ivPercentile: 10 }));
    assertTrue(hi > lo, `high IV should favour selling: ${hi} vs ${lo}`);
    assertTrue(hi > 0.6, `high-IV sell fit should be strong: ${hi}`);
  });

  test("buying vol wants LOW IV", () => {
    const hi = computeVolFit("long-vol", inputs({ ivPercentile: 90 }));
    const lo = computeVolFit("long-vol", inputs({ ivPercentile: 10 }));
    assertTrue(lo > hi, `low IV should favour buying: ${lo} vs ${hi}`);
  });

  test("directional/futures is ~vega-neutral: IV does not raise it", () => {
    const hi = computeVolFit("directional", inputs({ ivPercentile: 95 }));
    const lo = computeVolFit("directional", inputs({ ivPercentile: 5 }));
    assertTrue(lo >= hi, "high IV must not raise a futures score");
    assertTrue(hi <= 0.55 && lo <= 0.6, "stays near neutral band");
  });

  test("regime flag is the fallback when percentile is absent", () => {
    const elevated = computeVolFit("short-vol", inputs({ volRegimeFlag: "ELEVATED" }));
    const calm = computeVolFit("short-vol", inputs({ volRegimeFlag: "CALM" }));
    assertTrue(elevated > calm, "ELEVATED favours selling over CALM");
  });

  test("earnings penalises sellers; short-dated helps them", () => {
    const withEarnings = computeVolFit("short-vol", inputs({ ivPercentile: 80, daysToEarnings: 2 }));
    const noEarnings = computeVolFit("short-vol", inputs({ ivPercentile: 80 }));
    assertTrue(withEarnings < noEarnings, "earnings gap-risk trims sell fit");
  });
});

describe("computeContext", () => {
  test("strikes on walls score higher than off-anchor strikes", () => {
    const base = inputs({ spot: 1000, putWallStrike: 950, callWallStrike: 1050 });
    const aligned = computeContext(base, { strikes: [950, 1050] });
    const off = computeContext(base, { strikes: [913, 1087] });
    assertTrue(aligned > off, `aligned strikes should score higher: ${aligned} vs ${off}`);
  });

  test("reachable reward:risk scores higher than tiny RR", () => {
    const good = computeContext(inputs({}), { riskReward: 2 });
    const poor = computeContext(inputs({}), { riskReward: 0.3 });
    assertTrue(good > poor);
  });

  test("RR soft-peak: mid-band beats lottery RR", () => {
    assertTrue(rrContextScore(2) === 1, `peak should be 1, got ${rrContextScore(2)}`);
    assertTrue(rrContextScore(2) > rrContextScore(4), "RR 2 > RR 4");
    assertTrue(rrContextScore(2) > rrContextScore(0.5), "RR 2 > RR 0.5");
    assertTrue(rrContextScore(4) === 0.25, `floor at RR≥4, got ${rrContextScore(4)}`);
    const peaked = computeContext(inputs({}), { riskReward: 2 });
    const lottery = computeContext(inputs({}), { riskReward: 5 });
    assertTrue(peaked > lottery, `reachable RR should beat lottery: ${peaked} vs ${lottery}`);
  });

  test("neutral 0.5 when nothing derivable", () => {
    assertTrue(computeContext(BASE, {}) === 0.5);
  });
});

describe("PVT weight (audit calibration)", () => {
  test("aligned PVT outscores against-PVT on an otherwise equal resistance setup", () => {
    const base = {
      spot: 120,
      supportLow: 98,
      supportHigh: 102,
      resistanceLow: 118,
      resistanceHigh: 122,
      maxPain: 108,
      callWallSize: 400_000,
    };
    const aligned = scoreDirectionalSetup("resistance", inputs({ ...base, pvtSlope: -1 }), {
      riskReward: 2,
    });
    const against = scoreDirectionalSetup("resistance", inputs({ ...base, pvtSlope: 1 }), {
      riskReward: 2,
    });
    assertTrue(
      aligned.composite > against.composite + 10,
      `aligned ${aligned.composite} should clearly beat against ${against.composite}`,
    );
  });
});

describe("postureFromLegs", () => {
  test("future leg → directional", () => {
    assertTrue(
      postureFromLegs([
        { instrument: "future", action: "buy" },
        { instrument: "option", action: "buy" },
      ]) === "directional",
    );
  });
  test("econ kind decides spread posture", () => {
    const legs = [
      { instrument: "option" as const, action: "buy" as const },
      { instrument: "option" as const, action: "sell" as const },
    ];
    assertTrue(postureFromLegs(legs, "debit") === "long-vol");
    assertTrue(postureFromLegs(legs, "credit") === "short-vol");
  });
  test("net long options → long-vol", () => {
    assertTrue(postureFromLegs([{ instrument: "option", action: "buy" }]) === "long-vol");
  });
});

describe("scoreStrategy", () => {
  const bullishSymbol = inputs({
    spot: 1000,
    supportLow: 985,
    supportHigh: 1005,
    resistanceLow: 1090,
    resistanceHigh: 1110,
    maxPain: 1050,
    putWallStrike: 980,
    putWallSize: 500_000,
    callWallStrike: 1100,
    callWallSize: 300_000,
    ivPercentile: 20,
    volRegimeFlag: "CALM",
    daysToExpiry: 25,
    putOiChangePct: 20,
    callOiChangePct: -5,
  });

  test("bull call spread on a bullish/calm setup scores well", () => {
    const s = scoreStrategy({
      stance: "bullish",
      posture: "long-vol",
      inputs: bullishSymbol,
      strikes: [980, 1100],
      riskReward: 2,
    });
    assertTrue(s.composite >= 60, `expected strong score, got ${s.composite}`);
    assertTrue(s.directionLabel === "bullish");
  });

  test("bearish structure on a bullish read scores worse than the bullish one", () => {
    const bull = scoreStrategy({ stance: "bullish", posture: "long-vol", inputs: bullishSymbol });
    const bear = scoreStrategy({ stance: "bearish", posture: "long-vol", inputs: bullishSymbol });
    assertTrue(bull.composite > bear.composite, `${bull.composite} vs ${bear.composite}`);
  });

  test("selling premium in calm IV underperforms buying in calm IV", () => {
    const buy = scoreStrategy({ stance: "bullish", posture: "long-vol", inputs: bullishSymbol });
    const sell = scoreStrategy({ stance: "bullish", posture: "short-vol", inputs: bullishSymbol });
    assertTrue(buy.composite > sell.composite, `buy ${buy.composite} vs sell ${sell.composite}`);
  });

  test("composite stays within 0–100", () => {
    const s = scoreStrategy({ stance: "neutral", posture: "short-vol", inputs: bullishSymbol });
    assertTrue(s.composite >= 0 && s.composite <= 100);
  });
});

describe("scoreDirectionalSetup", () => {
  test("support entry is scored as a bullish thesis", () => {
    const s = scoreDirectionalSetup(
      "support",
      inputs({ spot: 100, supportLow: 98, supportHigh: 102, maxPain: 108, putOiChangePct: 15 }),
    );
    assertTrue(s.directionLabel === "bullish");
    assertTrue(s.subScores.direction >= 50, `alignment ${s.subScores.direction}`);
  });
});

summary("strategy-score");
