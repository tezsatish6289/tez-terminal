/**
 * Integration test for the records-page tab filter (PR 2a).
 *
 * Builds a representative corpus of closed sim trades — every cell of
 * the matrix the filter has to handle in production — and asserts
 * which tabs each one shows up in. The production filter in
 * `src/app/api/admin/blockchain-records/route.ts` calls the exact
 * same helper (`tradeBelongsToRecordsTab`), so this is a real check
 * on the user-visible routing, not a copy-pasted shadow.
 *
 * Why a corpus instead of N parameterised tests: the failure mode
 * we're guarding against is "trade leaks into wrong tab" or "trade
 * disappears from the right tab" — both are best caught by reading
 * a single grid that lists every tab for every trade. If the grid
 * matches the spec, the filter is correct.
 */
import {
  ATTACHED_ZONE_BOTS_DEFAULT,
  buildDeliveredAs,
  tradeBelongsToRecordsTab,
  type RecordsTabFilter,
} from "../../src/lib/crypto-bot-attach";
import {
  BOT_SOURCE_BTC_ZONE,
  BOT_SOURCE_ETH_ZONE,
  BOT_SOURCE_PATTERN,
  BOT_SOURCE_SOL_ZONE,
  BOT_SOURCE_XRP_ZONE,
} from "../../src/lib/bot-source-constants";
import { assertDeepEqual, assertTrue, describe, summary, test } from "./_assert";

type TradeFixture = {
  id: string;
  botId: "crypto" | "btc" | "eth" | "sol" | "xrp";
  botSource: string | null;
  deliveredAs: string[] | null;
};

const ALL_TABS: RecordsTabFilter[] = ["all", "crypto", "btc", "eth", "sol", "xrp"];

const PATTERN_TRADE: TradeFixture = {
  id: "pattern-fresh",
  botId: "crypto",
  botSource: BOT_SOURCE_PATTERN,
  deliveredAs: buildDeliveredAs(ATTACHED_ZONE_BOTS_DEFAULT, BOT_SOURCE_PATTERN),
};

const LEGACY_PATTERN: TradeFixture = {
  id: "pattern-legacy-no-deliveredAs",
  botId: "crypto",
  botSource: BOT_SOURCE_PATTERN,
  deliveredAs: null,
};

const LEGACY_PATTERN_NULL_SOURCE: TradeFixture = {
  id: "pattern-legacy-null-source",
  botId: "crypto",
  botSource: null,
  deliveredAs: null,
};

const BTC_SOLO: TradeFixture = {
  id: "btc-attach-off",
  botId: "btc",
  botSource: BOT_SOURCE_BTC_ZONE,
  deliveredAs: ["BTC"],
};

const BTC_ATTACHED_SIM: TradeFixture = {
  id: "btc-attach-sim",
  botId: "btc",
  botSource: BOT_SOURCE_BTC_ZONE,
  deliveredAs: ["BTC", "CRYPTO"],
};

const BTC_ATTACHED_LIVE: TradeFixture = {
  id: "btc-attach-live",
  botId: "btc",
  botSource: BOT_SOURCE_BTC_ZONE,
  deliveredAs: ["BTC", "CRYPTO"],
};

const LEGACY_BTC_NO_DELIVEREDAS: TradeFixture = {
  id: "btc-legacy-no-deliveredAs",
  botId: "btc",
  botSource: BOT_SOURCE_BTC_ZONE,
  deliveredAs: null,
};

const ETH_SOLO: TradeFixture = {
  id: "eth-attach-off",
  botId: "eth",
  botSource: BOT_SOURCE_ETH_ZONE,
  deliveredAs: ["ETH"],
};

const ETH_ATTACHED: TradeFixture = {
  id: "eth-attach-live",
  botId: "eth",
  botSource: BOT_SOURCE_ETH_ZONE,
  deliveredAs: ["ETH", "CRYPTO"],
};

const SOL_ATTACHED: TradeFixture = {
  id: "sol-attach-sim",
  botId: "sol",
  botSource: BOT_SOURCE_SOL_ZONE,
  deliveredAs: ["SOL", "CRYPTO"],
};

const XRP_SOLO: TradeFixture = {
  id: "xrp-attach-off",
  botId: "xrp",
  botSource: BOT_SOURCE_XRP_ZONE,
  deliveredAs: ["XRP"],
};

const CORPUS: TradeFixture[] = [
  PATTERN_TRADE,
  LEGACY_PATTERN,
  LEGACY_PATTERN_NULL_SOURCE,
  BTC_SOLO,
  BTC_ATTACHED_SIM,
  BTC_ATTACHED_LIVE,
  LEGACY_BTC_NO_DELIVEREDAS,
  ETH_SOLO,
  ETH_ATTACHED,
  SOL_ATTACHED,
  XRP_SOLO,
];

/** Expected tab → trade ids that should appear in that tab. */
const EXPECTED: Record<RecordsTabFilter, string[]> = {
  all: CORPUS.map((t) => t.id),
  crypto: [
    // Pattern trades: always in crypto tab.
    "pattern-fresh",
    "pattern-legacy-no-deliveredAs",
    "pattern-legacy-null-source",
    // Zone trades attached to crypto (deliveredAs includes CRYPTO).
    "btc-attach-sim",
    "btc-attach-live",
    "eth-attach-live",
    "sol-attach-sim",
    // NOT included: btc-attach-off, btc-legacy (no deliveredAs),
    // eth-attach-off, xrp-attach-off.
  ],
  btc: [
    "btc-attach-off",
    "btc-attach-sim",
    "btc-attach-live",
    "btc-legacy-no-deliveredAs",
  ],
  eth: ["eth-attach-off", "eth-attach-live"],
  sol: ["sol-attach-sim"],
  xrp: ["xrp-attach-off"],
};

function tradesForTab(filter: RecordsTabFilter): string[] {
  return CORPUS.filter((t) => tradeBelongsToRecordsTab(filter, t)).map((t) => t.id);
}

describe("records-tab-filter (PR 2a)", () => {
  for (const tab of ALL_TABS) {
    test(`tab "${tab}" returns the expected trades`, () => {
      assertDeepEqual(tradesForTab(tab), EXPECTED[tab]);
    });
  }

  test("every trade appears in at least one of the per-tab views", () => {
    const seen = new Set<string>();
    for (const tab of ALL_TABS.filter((t) => t !== "all")) {
      for (const id of tradesForTab(tab)) seen.add(id);
    }
    for (const trade of CORPUS) {
      assertTrue(seen.has(trade.id), `trade ${trade.id} not in any tab`);
    }
  });

  test("attached zone trades appear in BOTH their origin tab AND crypto", () => {
    const attached = ["btc-attach-sim", "btc-attach-live", "eth-attach-live", "sol-attach-sim"];
    for (const id of attached) {
      const inCrypto = tradesForTab("crypto").includes(id);
      const trade = CORPUS.find((t) => t.id === id)!;
      const inOriginTab = tradesForTab(trade.botId as RecordsTabFilter).includes(id);
      assertTrue(inCrypto, `${id} missing from crypto tab`);
      assertTrue(inOriginTab, `${id} missing from origin (${trade.botId}) tab`);
    }
  });

  test("solo-only zone trades NEVER appear in crypto tab", () => {
    const solo = ["btc-attach-off", "eth-attach-off", "xrp-attach-off"];
    const cryptoIds = tradesForTab("crypto");
    for (const id of solo) {
      assertTrue(!cryptoIds.includes(id), `${id} leaked into crypto tab`);
    }
  });

  test("legacy zone trades (no deliveredAs) stay origin-only — never attach retroactively", () => {
    const id = "btc-legacy-no-deliveredAs";
    assertTrue(tradesForTab("btc").includes(id), "must stay in btc tab");
    assertTrue(!tradesForTab("crypto").includes(id), "must NOT appear in crypto tab");
  });

  test("legacy pattern trades (no deliveredAs) stay in crypto — never disappear", () => {
    assertTrue(tradesForTab("crypto").includes("pattern-legacy-no-deliveredAs"));
    assertTrue(tradesForTab("crypto").includes("pattern-legacy-null-source"));
  });
});

summary("records-tab-filter integration");
