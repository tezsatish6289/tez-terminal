/**
 * Unit tests for the pure helpers in `src/lib/crypto-bot-attach.ts`.
 *
 * These are the small, total functions that drive the whole attach
 * feature — `deliveredAs` stamping, records-tab routing, mode lookup
 * for a given bot source. If any of these flip behaviour, every PR in
 * the attach family is affected. The test set is exhaustive on the
 * matrix (5 bot sources × 4 attach configs × all modes) on purpose;
 * "fast" doesn't matter, "correct in every cell" does.
 */
import {
  ATTACHED_ZONE_BOTS_DEFAULT,
  DELIVERED_TO_BY_ASSET,
  DELIVERED_TO_CRYPTO,
  attachModeForBotSource,
  buildDeliveredAs,
  parseAttachedZoneBots,
  tradeBelongsToCryptoTab,
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
  assertFalse,
  assertTrue,
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

describe("buildDeliveredAs", () => {
  test("pattern → [CRYPTO] regardless of config", () => {
    for (const config of [ALL_OFF, ALL_SIM, ALL_LIVE, MIXED]) {
      assertDeepEqual(
        buildDeliveredAs(config, BOT_SOURCE_PATTERN),
        [DELIVERED_TO_CRYPTO],
        `pattern with ${JSON.stringify(config)}`,
      );
    }
  });

  test("null botSource → [CRYPTO] (legacy pattern compat)", () => {
    assertDeepEqual(buildDeliveredAs(ALL_LIVE, null), [DELIVERED_TO_CRYPTO]);
    assertDeepEqual(buildDeliveredAs(ALL_LIVE, undefined), [DELIVERED_TO_CRYPTO]);
  });

  test("unknown botSource → empty array (no leak into any tab)", () => {
    assertDeepEqual(buildDeliveredAs(ALL_LIVE, "DOGE_ZONE"), []);
  });

  test("zone bot, attach off → [ASSET] only", () => {
    assertDeepEqual(buildDeliveredAs(ALL_OFF, BOT_SOURCE_BTC_ZONE), [DELIVERED_TO_BY_ASSET.btc]);
    assertDeepEqual(buildDeliveredAs(ALL_OFF, BOT_SOURCE_ETH_ZONE), [DELIVERED_TO_BY_ASSET.eth]);
    assertDeepEqual(buildDeliveredAs(ALL_OFF, BOT_SOURCE_SOL_ZONE), [DELIVERED_TO_BY_ASSET.sol]);
    assertDeepEqual(buildDeliveredAs(ALL_OFF, BOT_SOURCE_XRP_ZONE), [DELIVERED_TO_BY_ASSET.xrp]);
  });

  test("zone bot, attach sim → [ASSET, CRYPTO]", () => {
    assertDeepEqual(
      buildDeliveredAs(ALL_SIM, BOT_SOURCE_BTC_ZONE),
      [DELIVERED_TO_BY_ASSET.btc, DELIVERED_TO_CRYPTO],
    );
    assertDeepEqual(
      buildDeliveredAs(ALL_SIM, BOT_SOURCE_ETH_ZONE),
      [DELIVERED_TO_BY_ASSET.eth, DELIVERED_TO_CRYPTO],
    );
  });

  test("zone bot, attach live → [ASSET, CRYPTO]", () => {
    assertDeepEqual(
      buildDeliveredAs(ALL_LIVE, BOT_SOURCE_BTC_ZONE),
      [DELIVERED_TO_BY_ASSET.btc, DELIVERED_TO_CRYPTO],
    );
  });

  test("mixed: each zone follows its own setting", () => {
    assertDeepEqual(
      buildDeliveredAs(MIXED, BOT_SOURCE_BTC_ZONE),
      [DELIVERED_TO_BY_ASSET.btc, DELIVERED_TO_CRYPTO],
      "btc=sim → attached",
    );
    assertDeepEqual(
      buildDeliveredAs(MIXED, BOT_SOURCE_ETH_ZONE),
      [DELIVERED_TO_BY_ASSET.eth, DELIVERED_TO_CRYPTO],
      "eth=live → attached",
    );
    assertDeepEqual(
      buildDeliveredAs(MIXED, BOT_SOURCE_SOL_ZONE),
      [DELIVERED_TO_BY_ASSET.sol],
      "sol=off → solo only",
    );
    assertDeepEqual(
      buildDeliveredAs(MIXED, BOT_SOURCE_XRP_ZONE),
      [DELIVERED_TO_BY_ASSET.xrp, DELIVERED_TO_CRYPTO],
      "xrp=live → attached",
    );
  });
});

describe("tradeBelongsToCryptoTab", () => {
  test("pattern trade always belongs (regardless of deliveredAs)", () => {
    assertTrue(tradeBelongsToCryptoTab(undefined, BOT_SOURCE_PATTERN), "pattern undefined da");
    assertTrue(tradeBelongsToCryptoTab(null, BOT_SOURCE_PATTERN), "pattern null da");
    assertTrue(tradeBelongsToCryptoTab([], BOT_SOURCE_PATTERN), "pattern empty da");
    assertTrue(tradeBelongsToCryptoTab(["CRYPTO"], BOT_SOURCE_PATTERN));
  });

  test("null botSource treated as pattern (legacy compat)", () => {
    assertTrue(tradeBelongsToCryptoTab(undefined, null));
    assertTrue(tradeBelongsToCryptoTab(undefined, undefined));
  });

  test("legacy zone trade (no deliveredAs) does NOT belong", () => {
    assertFalse(tradeBelongsToCryptoTab(undefined, BOT_SOURCE_BTC_ZONE));
    assertFalse(tradeBelongsToCryptoTab(null, BOT_SOURCE_ETH_ZONE));
  });

  test("zone trade with attach (deliveredAs includes CRYPTO) belongs", () => {
    assertTrue(tradeBelongsToCryptoTab(["BTC", "CRYPTO"], BOT_SOURCE_BTC_ZONE));
    assertTrue(tradeBelongsToCryptoTab(["ETH", "CRYPTO"], BOT_SOURCE_ETH_ZONE));
  });

  test("zone trade without attach (deliveredAs has only asset) does NOT belong", () => {
    assertFalse(tradeBelongsToCryptoTab(["BTC"], BOT_SOURCE_BTC_ZONE));
    assertFalse(tradeBelongsToCryptoTab(["SOL"], BOT_SOURCE_SOL_ZONE));
  });

  test("empty deliveredAs for zone trade does NOT belong", () => {
    assertFalse(tradeBelongsToCryptoTab([], BOT_SOURCE_BTC_ZONE));
  });

  test("unknown botSource with no deliveredAs does NOT belong", () => {
    assertFalse(tradeBelongsToCryptoTab(undefined, "DOGE_ZONE"));
  });

  test("end-to-end pipeline: buildDeliveredAs + tradeBelongsToCryptoTab", () => {
    const sources = [
      BOT_SOURCE_BTC_ZONE,
      BOT_SOURCE_ETH_ZONE,
      BOT_SOURCE_SOL_ZONE,
      BOT_SOURCE_XRP_ZONE,
    ];
    for (const config of [ALL_OFF, ALL_SIM, ALL_LIVE, MIXED]) {
      for (const src of sources) {
        const da = buildDeliveredAs(config, src);
        const inTab = tradeBelongsToCryptoTab(da, src);
        const asset = src.toLowerCase().replace("_zone", "") as
          | "btc" | "eth" | "sol" | "xrp";
        const expected = config[asset] === "sim" || config[asset] === "live";
        assertEqual(
          inTab,
          expected,
          `${src} with ${JSON.stringify(config)}: deliveredAs=${JSON.stringify(da)}`,
        );
      }
      assertTrue(
        tradeBelongsToCryptoTab(buildDeliveredAs(config, BOT_SOURCE_PATTERN), BOT_SOURCE_PATTERN),
        `pattern always in crypto tab (config ${JSON.stringify(config)})`,
      );
    }
  });
});

summary("crypto-bot-attach unit");
