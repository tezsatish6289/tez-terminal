import { deriveBubbleDisplayTone } from "../../src/lib/zones/bubble-tone";
import { assertTrue, describe, summary, test } from "./_assert";

describe("deriveBubbleDisplayTone", () => {
  test("in resistance near max pain stays At Resistance (NIFTY-style)", () => {
    const tone = deriveBubbleDisplayTone(
      {
        spot: 23985.35,
        bullLow: 22846.71,
        bullHigh: 23153.29,
        bearLow: 23846.71,
        bearHigh: 24153.29,
      },
      true,
      false,
      24000,
      153,
      {
        dominantSide: "call",
        dominancePct: 4.6,
        callDeltaPct: -2.1,
        putDeltaPct: 6.4,
        asOf: "2026-07-27",
        prevDate: "2026-07-24",
      },
    );
    assertTrue(tone === "IN_BEAR", `expected IN_BEAR, got ${tone}`);
  });

  test("between zones at max pain → AT_POC", () => {
    const tone = deriveBubbleDisplayTone(
      {
        spot: 24000,
        bullLow: 22800,
        bullHigh: 23100,
        bearLow: 24800,
        bearHigh: 25100,
      },
      true,
      false,
      24000,
    );
    assertTrue(tone === "AT_POC", `expected AT_POC, got ${tone}`);
  });

  test("in support keeps At Support even if OI gate would fail", () => {
    const tone = deriveBubbleDisplayTone(
      {
        spot: 2000,
        bullLow: 1950,
        bullHigh: 2050,
        bearLow: 2150,
        bearHigh: 2250,
      },
      true,
      false,
      2150,
      50,
      null,
    );
    assertTrue(tone === "IN_BULL", `expected IN_BULL, got ${tone}`);
  });
});

summary("bubble-display-tone");
