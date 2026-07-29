import {
  computeLightAtlasScore,
  LIGHT_ATLAS_MAP_MIN_SCORE,
  passesLightAtlasMapGate,
  scoreInputsFromPublicLevels,
} from "../../src/lib/levels/light-atlas-score";
import type { PublicLevels } from "../../src/components/levels/ZonePriceLadder";
import { assertTrue, describe, summary, test } from "./_assert";

function levels(partial: Partial<PublicLevels>): PublicLevels {
  return {
    spot: null,
    poc: null,
    bullLow: null,
    bullHigh: null,
    bearLow: null,
    bearHigh: null,
    bandOffset: null,
    bullActive: null,
    bearActive: null,
    computedAt: null,
    unavailable: false,
    levelsSource: "nse",
    ...partial,
  };
}

describe("light Atlas score", () => {
  test("builds inputs without PVT / IV percentile", () => {
    const inputs = scoreInputsFromPublicLevels(
      levels({
        spot: 100,
        poc: 102,
        bullLow: 95,
        bullHigh: 98,
        bearLow: 105,
        bearHigh: 108,
        atmIV: 18,
        volRegime: "CALM",
        putClusterSize: 1000,
        putClusterChange: 100,
        oi: {
          asOf: "2026-07-28",
          prevDate: "2026-07-27",
          putDeltaPct: 12.5,
          callDeltaPct: -3,
          dominancePct: 20,
          dominantSide: "put",
        },
      }),
    );
    assertTrue(inputs.pvtSlope === null, "pvt left null");
    assertTrue(inputs.ivPercentile === null, "iv percentile left null");
    assertTrue(inputs.putOiChangePct === 12.5, `put OI delta ${inputs.putOiChangePct}`);
    assertTrue(inputs.volRegimeFlag === "CALM", "vol regime passed through");
  });

  test("in-support setup returns a finite primary score", () => {
    const result = computeLightAtlasScore(
      levels({
        spot: 96.5,
        poc: 102,
        bullLow: 95,
        bullHigh: 98,
        bearLow: 105,
        bearHigh: 108,
        bandOffset: 1.5,
        atmIV: 20,
        volRegime: "CALM",
        putClusterSize: 5000,
        callClusterSize: 2000,
        putClusterStrike: 96,
        callClusterStrike: 106,
        oi: {
          asOf: "2026-07-28",
          prevDate: "2026-07-27",
          putDeltaPct: 8,
          callDeltaPct: -2,
          dominancePct: 30,
          dominantSide: "put",
        },
      }),
      "IN_BULL",
    );
    assertTrue(result != null, "expected a score");
    assertTrue(
      result!.composite >= 0 && result!.composite <= 100,
      `composite ${result!.composite}`,
    );
    assertTrue(result!.side === "support", `side ${result!.side}`);
  });

  test("map gate hides ≤ min score when enabled", () => {
    assertTrue(
      !passesLightAtlasMapGate({ atlasScore: LIGHT_ATLAS_MAP_MIN_SCORE }, true),
      "60 should be hidden",
    );
    assertTrue(
      passesLightAtlasMapGate({ atlasScore: LIGHT_ATLAS_MAP_MIN_SCORE + 1 }, true),
      "61 should show",
    );
    assertTrue(
      passesLightAtlasMapGate({ atlasScore: 40 }, false),
      "disabled gate shows weak scores",
    );
    assertTrue(
      passesLightAtlasMapGate({ kind: "mmi", atlasScore: null }, true),
      "MMI always kept",
    );
    assertTrue(
      !passesLightAtlasMapGate({ atlasScore: null }, true),
      "unscored hidden when gate on",
    );
  });
});

summary();
