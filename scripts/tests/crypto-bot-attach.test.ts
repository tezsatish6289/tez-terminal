/**
 * Unit tests for the pure helpers in `src/lib/crypto-bot-attach.ts`.
 *
 * Scope: config parsing + mode lookup. The dual-tab `deliveredAs`
 * helpers from PR 2a are gone — PR 2b moved to a separate mirror
 * sim trade per attach, so records-tab filtering is just botSource →
 * cryptoBotByBotSource (tested in route + UI integration), and the
 * attach-config parsing here is the only pure logic worth a unit test.
 *
 * The matrix is intentionally exhaustive (5 bot sources × 4 attach
 * configs) so any flip in `attachModeForBotSource` is loud.
 */
import {
  ATTACHED_ZONE_BOTS_DEFAULT,
  attachModeForBotSource,
  parseAttachedZoneBots,
  zoneAssetFromBotSource,
  type AttachedZoneBots,
} from "../../src/lib/crypto-bot-attach";
import {
  BOT_SOURCE_BTC_ZONE,
  BOT_SOURCE_ETH_ZONE,
  BOT_SOURCE_PATTERN,
  BOT_SOURCE_SOL_ZONE,
  BOT_SOURCE_XRP_ZONE,
} from "../../src/lib/bot-source-constants";
import {
  assertDeepEqual,
  assertEqual,
  describe,
  summary,
  test,
} from "./_assert";

const ALL_OFF: AttachedZoneBots = { btc: "off", eth: "off", sol: "off", xrp: "off" };
const ALL_SIM: AttachedZoneBots = { btc: "sim", eth: "sim", sol: "sim", xrp: "sim" };
const ALL_LIVE: AttachedZoneBots = { btc: "live", eth: "live", sol: "live", xrp: "live" };
const MIXED: AttachedZoneBots = { btc: "sim", eth: "live", sol: "off", xrp: "live" };

describe("parseAttachedZoneBots", () => {
  test("null → all off", () => {
    assertDeepEqual(parseAttachedZoneBots(null), ALL_OFF);
  });

  test("undefined → all off", () => {
    assertDeepEqual(parseAttachedZoneBots(undefined), ALL_OFF);
  });

  test("non-object → all off", () => {
    assertDeepEqual(parseAttachedZoneBots("hello"), ALL_OFF);
    assertDeepEqual(parseAttachedZoneBots(42), ALL_OFF);
    assertDeepEqual(parseAttachedZoneBots(true), ALL_OFF);
  });

  test("empty object → all off", () => {
    assertDeepEqual(parseAttachedZoneBots({}), ALL_OFF);
  });

  test("valid full map preserved", () => {
    assertDeepEqual(parseAttachedZoneBots(MIXED), MIXED);
  });

  test("partial map fills missing with off", () => {
    assertDeepEqual(
      parseAttachedZoneBots({ btc: "live" }),
      { btc: "live", eth: "off", sol: "off", xrp: "off" },
    );
  });

  test("garbage per-asset value coerces to off", () => {
    assertDeepEqual(
      parseAttachedZoneBots({ btc: "lol", eth: 123, sol: null, xrp: "live" }),
      { btc: "off", eth: "off", sol: "off", xrp: "live" },
    );
  });

  test("unknown keys ignored", () => {
    assertDeepEqual(
      parseAttachedZoneBots({ btc: "sim", doge: "live" }),
      { btc: "sim", eth: "off", sol: "off", xrp: "off" },
    );
  });

  test("default constant is all off", () => {
    assertDeepEqual(ATTACHED_ZONE_BOTS_DEFAULT, ALL_OFF);
  });
});

describe("zoneAssetFromBotSource", () => {
  test("BTC_ZONE → btc", () => assertEqual(zoneAssetFromBotSource(BOT_SOURCE_BTC_ZONE), "btc"));
  test("ETH_ZONE → eth", () => assertEqual(zoneAssetFromBotSource(BOT_SOURCE_ETH_ZONE), "eth"));
  test("SOL_ZONE → sol", () => assertEqual(zoneAssetFromBotSource(BOT_SOURCE_SOL_ZONE), "sol"));
  test("XRP_ZONE → xrp", () => assertEqual(zoneAssetFromBotSource(BOT_SOURCE_XRP_ZONE), "xrp"));
  test("PATTERN → null", () => assertEqual(zoneAssetFromBotSource(BOT_SOURCE_PATTERN), null));
  test("null → null", () => assertEqual(zoneAssetFromBotSource(null), null));
  test("undefined → null", () => assertEqual(zoneAssetFromBotSource(undefined), null));
  test("unknown string → null", () => assertEqual(zoneAssetFromBotSource("DOGE_ZONE"), null));
});

describe("attachModeForBotSource", () => {
  test("pattern always off (even when config has values)", () => {
    assertEqual(attachModeForBotSource(ALL_LIVE, BOT_SOURCE_PATTERN), "off");
  });

  test("null source → off", () => {
    assertEqual(attachModeForBotSource(ALL_LIVE, null), "off");
  });

  test("unknown source → off", () => {
    assertEqual(attachModeForBotSource(ALL_LIVE, "DOGE_ZONE"), "off");
  });

  test("matrix: every zone × every mode", () => {
    const matrix: { source: string; asset: "btc" | "eth" | "sol" | "xrp" }[] = [
      { source: BOT_SOURCE_BTC_ZONE, asset: "btc" },
      { source: BOT_SOURCE_ETH_ZONE, asset: "eth" },
      { source: BOT_SOURCE_SOL_ZONE, asset: "sol" },
      { source: BOT_SOURCE_XRP_ZONE, asset: "xrp" },
    ];
    for (const { source, asset } of matrix) {
      for (const config of [ALL_OFF, ALL_SIM, ALL_LIVE, MIXED]) {
        assertEqual(
          attachModeForBotSource(config, source),
          config[asset],
          `${source} with config ${JSON.stringify(config)}`,
        );
      }
    }
  });
});

summary("crypto-bot-attach unit");
