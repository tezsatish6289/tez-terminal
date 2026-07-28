import {
  atlasScoreBucket,
  atlasScoreSideFromTone,
  atlasScoreTone,
  atlasSideFromLevels,
} from "../../src/lib/levels/atlas-score-calibration";
import type { PublicLevels } from "../../src/components/levels/ZonePriceLadder";
import { assertTrue, describe, summary, test } from "./_assert";

describe("atlasScoreBucket", () => {
  test("maps into admin calibration bands", () => {
    assertTrue(atlasScoreBucket(34).label === "0–49");
    assertTrue(atlasScoreBucket(34).winRatePct === 34);
    assertTrue(atlasScoreBucket(60).label === "50–69");
    assertTrue(atlasScoreBucket(60).winRatePct === 50);
    assertTrue(atlasScoreBucket(72).label === "70–100");
    assertTrue(atlasScoreBucket(72).winRatePct === 72);
  });
});

describe("atlasScoreTone", () => {
  test("matches calibration card colors", () => {
    assertTrue(atlasScoreTone(40) === "weak");
    assertTrue(atlasScoreTone(55) === "mid");
    assertTrue(atlasScoreTone(80) === "strong");
  });
});

describe("atlasScoreSideFromTone", () => {
  test("only at/near zone tones get a side", () => {
    assertTrue(atlasScoreSideFromTone("IN_BULL") === "support");
    assertTrue(atlasScoreSideFromTone("NEAR_BEAR") === "resistance");
    assertTrue(atlasScoreSideFromTone("AT_POC") === null);
    assertTrue(atlasScoreSideFromTone("NEUTRAL") === null);
  });
});

describe("atlasSideFromLevels", () => {
  test("in-band spot scores support even without OI (geo, not display gate)", () => {
    const levels = {
      spot: 2038,
      bullLow: 1950,
      bullHigh: 2050,
      bearLow: 2150,
      bearHigh: 2250,
      poc: 2150,
      bandOffset: 50,
      oi: null,
    } as PublicLevels;
    assertTrue(atlasSideFromLevels(levels) === "support");
  });
});

summary("atlas-score-calibration");
