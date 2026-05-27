/**
 * Pure-function unit tests for `src/lib/crypto-bot-attach-mirror.ts`.
 *
 * Covers three independent surfaces so a regression in any one lights
 * up a precise test name without dragging in the others:
 *
 *   1. `evaluateMirrorGate` — every SKIP reason + the OPEN path, plus
 *      gate ordering (so the user-facing log key is stable when more
 *      than one condition would skip).
 *   2. `computeMirrorPositionSize` — math + skip branches (matches the
 *      zone-bot formula in sync-zone-bots so the two bots' sizing
 *      stays comparable in reports).
 *   3. `planMirrorCascades` — pure decision over a corpus of open
 *      mirrors + their parent state, including the safety guards
 *      (missing parent, parent still open, mirror itself closed).
 *
 * All three helpers are leaf-pure — no Firestore, no clock, no
 * randomness. The I/O wrappers (`openCryptoMirrorForZoneTrade`,
 * `reconcileMirrorCloses`) are covered by prod verification on a
 * controlled deploy because their I/O surface (transactions, log
 * writes, blockchain queue) is too thick to fake usefully without a
 * full Firestore emulator.
 */
import {
  computeMirrorPositionSize,
  evaluateMirrorGate,
  mirrorDocIdFor,
  mirrorSignalIdFor,
  planMirrorCascades,
  type MirrorTradeRef,
  type ParentTradeRef,
} from "../../src/lib/crypto-bot-attach-mirror";
import type { AttachedZoneBots } from "../../src/lib/crypto-bot-attach";
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
const BTC_ONLY: AttachedZoneBots = { btc: "live", eth: "off", sol: "off", xrp: "off" };

// ─── evaluateMirrorGate ──────────────────────────────────────────────

describe("evaluateMirrorGate — SKIP branches", () => {
  test("PATTERN bot source always returns ATTACH_OFF (mirror is zone-only)", () => {
    const res = evaluateMirrorGate({
      parentBotSource: BOT_SOURCE_PATTERN,
      attachedZoneBots: ALL_LIVE,
      cryptoBotManualOverride: "AUTO",
      cryptoBotMaxOpenTrades: 5,
      cryptoBotOpenPatternCount: 0,
      cryptoBotCapital: 1000,
      mirrorAlreadyExists: false,
    });
    assertEqual(res.decision, "SKIP");
    if (res.decision === "SKIP") assertEqual(res.reason, "ATTACH_OFF");
  });

  test("null bot source returns ATTACH_OFF", () => {
    const res = evaluateMirrorGate({
      parentBotSource: null,
      attachedZoneBots: ALL_LIVE,
      cryptoBotManualOverride: "AUTO",
      cryptoBotMaxOpenTrades: 5,
      cryptoBotOpenPatternCount: 0,
      cryptoBotCapital: 1000,
      mirrorAlreadyExists: false,
    });
    assertEqual(res.decision, "SKIP");
    if (res.decision === "SKIP") assertEqual(res.reason, "ATTACH_OFF");
  });

  test("attach config = off for this asset returns ATTACH_OFF", () => {
    const res = evaluateMirrorGate({
      parentBotSource: BOT_SOURCE_ETH_ZONE,
      attachedZoneBots: BTC_ONLY,
      cryptoBotManualOverride: "AUTO",
      cryptoBotMaxOpenTrades: 5,
      cryptoBotOpenPatternCount: 0,
      cryptoBotCapital: 1000,
      mirrorAlreadyExists: false,
    });
    assertEqual(res.decision, "SKIP");
    if (res.decision === "SKIP") assertEqual(res.reason, "ATTACH_OFF");
  });

  test("Crypto Bot manualOverride = OFF returns CRYPTO_BOT_OFF (even with attach live)", () => {
    const res = evaluateMirrorGate({
      parentBotSource: BOT_SOURCE_BTC_ZONE,
      attachedZoneBots: ALL_LIVE,
      cryptoBotManualOverride: "OFF",
      cryptoBotMaxOpenTrades: 5,
      cryptoBotOpenPatternCount: 0,
      cryptoBotCapital: 1000,
      mirrorAlreadyExists: false,
    });
    assertEqual(res.decision, "SKIP");
    if (res.decision === "SKIP") assertEqual(res.reason, "CRYPTO_BOT_OFF");
  });

  test("capital = 0 returns CRYPTO_CAPITAL_NON_POSITIVE", () => {
    const res = evaluateMirrorGate({
      parentBotSource: BOT_SOURCE_BTC_ZONE,
      attachedZoneBots: ALL_LIVE,
      cryptoBotManualOverride: "AUTO",
      cryptoBotMaxOpenTrades: 5,
      cryptoBotOpenPatternCount: 0,
      cryptoBotCapital: 0,
      mirrorAlreadyExists: false,
    });
    assertEqual(res.decision, "SKIP");
    if (res.decision === "SKIP") assertEqual(res.reason, "CRYPTO_CAPITAL_NON_POSITIVE");
  });

  test("capital negative returns CRYPTO_CAPITAL_NON_POSITIVE", () => {
    const res = evaluateMirrorGate({
      parentBotSource: BOT_SOURCE_BTC_ZONE,
      attachedZoneBots: ALL_LIVE,
      cryptoBotManualOverride: "AUTO",
      cryptoBotMaxOpenTrades: 5,
      cryptoBotOpenPatternCount: 0,
      cryptoBotCapital: -100,
      mirrorAlreadyExists: false,
    });
    assertEqual(res.decision, "SKIP");
    if (res.decision === "SKIP") assertEqual(res.reason, "CRYPTO_CAPITAL_NON_POSITIVE");
  });

  test("open count at cap returns CRYPTO_CAP_REACHED", () => {
    const res = evaluateMirrorGate({
      parentBotSource: BOT_SOURCE_BTC_ZONE,
      attachedZoneBots: ALL_LIVE,
      cryptoBotManualOverride: "AUTO",
      cryptoBotMaxOpenTrades: 3,
      cryptoBotOpenPatternCount: 3,
      cryptoBotCapital: 1000,
      mirrorAlreadyExists: false,
    });
    assertEqual(res.decision, "SKIP");
    if (res.decision === "SKIP") assertEqual(res.reason, "CRYPTO_CAP_REACHED");
  });

  test("open count above cap returns CRYPTO_CAP_REACHED", () => {
    const res = evaluateMirrorGate({
      parentBotSource: BOT_SOURCE_BTC_ZONE,
      attachedZoneBots: ALL_LIVE,
      cryptoBotManualOverride: "AUTO",
      cryptoBotMaxOpenTrades: 2,
      cryptoBotOpenPatternCount: 5,
      cryptoBotCapital: 1000,
      mirrorAlreadyExists: false,
    });
    assertEqual(res.decision, "SKIP");
    if (res.decision === "SKIP") assertEqual(res.reason, "CRYPTO_CAP_REACHED");
  });

  test("mirror already exists returns DUPLICATE (lowest priority skip)", () => {
    const res = evaluateMirrorGate({
      parentBotSource: BOT_SOURCE_BTC_ZONE,
      attachedZoneBots: ALL_LIVE,
      cryptoBotManualOverride: "AUTO",
      cryptoBotMaxOpenTrades: 5,
      cryptoBotOpenPatternCount: 1,
      cryptoBotCapital: 1000,
      mirrorAlreadyExists: true,
    });
    assertEqual(res.decision, "SKIP");
    if (res.decision === "SKIP") assertEqual(res.reason, "DUPLICATE");
  });
});

describe("evaluateMirrorGate — OPEN path", () => {
  test("attach=sim + everything green → OPEN with sim mode", () => {
    const res = evaluateMirrorGate({
      parentBotSource: BOT_SOURCE_BTC_ZONE,
      attachedZoneBots: ALL_SIM,
      cryptoBotManualOverride: "AUTO",
      cryptoBotMaxOpenTrades: 5,
      cryptoBotOpenPatternCount: 0,
      cryptoBotCapital: 1000,
      mirrorAlreadyExists: false,
    });
    assertEqual(res.decision, "OPEN");
    if (res.decision === "OPEN") assertEqual(res.attachMode, "sim");
  });

  test("attach=live + everything green → OPEN with live mode", () => {
    const res = evaluateMirrorGate({
      parentBotSource: BOT_SOURCE_ETH_ZONE,
      attachedZoneBots: ALL_LIVE,
      cryptoBotManualOverride: "AUTO",
      cryptoBotMaxOpenTrades: 5,
      cryptoBotOpenPatternCount: 4,
      cryptoBotCapital: 1000,
      mirrorAlreadyExists: false,
    });
    assertEqual(res.decision, "OPEN");
    if (res.decision === "OPEN") assertEqual(res.attachMode, "live");
  });

  test("each zone source maps to its own slot in the config", () => {
    const cases: { source: string; mode: AttachedZoneBots[keyof AttachedZoneBots] }[] = [
      { source: BOT_SOURCE_BTC_ZONE, mode: "live" },
      { source: BOT_SOURCE_ETH_ZONE, mode: "off" },
      { source: BOT_SOURCE_SOL_ZONE, mode: "off" },
      { source: BOT_SOURCE_XRP_ZONE, mode: "off" },
    ];
    for (const c of cases) {
      const res = evaluateMirrorGate({
        parentBotSource: c.source,
        attachedZoneBots: BTC_ONLY,
        cryptoBotManualOverride: "AUTO",
        cryptoBotMaxOpenTrades: 5,
        cryptoBotOpenPatternCount: 0,
        cryptoBotCapital: 1000,
        mirrorAlreadyExists: false,
      });
      if (c.mode === "off") {
        assertEqual(res.decision, "SKIP", c.source);
      } else {
        assertEqual(res.decision, "OPEN", c.source);
      }
    }
  });
});

describe("evaluateMirrorGate — ordering", () => {
  test("ATTACH_OFF outranks CRYPTO_BOT_OFF + CAP_REACHED + DUPLICATE", () => {
    const res = evaluateMirrorGate({
      parentBotSource: BOT_SOURCE_BTC_ZONE,
      attachedZoneBots: ALL_OFF,
      cryptoBotManualOverride: "OFF",
      cryptoBotMaxOpenTrades: 1,
      cryptoBotOpenPatternCount: 5,
      cryptoBotCapital: 0,
      mirrorAlreadyExists: true,
    });
    if (res.decision === "SKIP") assertEqual(res.reason, "ATTACH_OFF");
    else throw new Error("expected SKIP");
  });

  test("CRYPTO_BOT_OFF outranks CAPITAL + CAP + DUPLICATE", () => {
    const res = evaluateMirrorGate({
      parentBotSource: BOT_SOURCE_BTC_ZONE,
      attachedZoneBots: ALL_LIVE,
      cryptoBotManualOverride: "OFF",
      cryptoBotMaxOpenTrades: 0,
      cryptoBotOpenPatternCount: 5,
      cryptoBotCapital: 0,
      mirrorAlreadyExists: true,
    });
    if (res.decision === "SKIP") assertEqual(res.reason, "CRYPTO_BOT_OFF");
    else throw new Error("expected SKIP");
  });

  test("CAPITAL outranks CAP_REACHED + DUPLICATE", () => {
    const res = evaluateMirrorGate({
      parentBotSource: BOT_SOURCE_BTC_ZONE,
      attachedZoneBots: ALL_LIVE,
      cryptoBotManualOverride: "AUTO",
      cryptoBotMaxOpenTrades: 0,
      cryptoBotOpenPatternCount: 5,
      cryptoBotCapital: 0,
      mirrorAlreadyExists: true,
    });
    if (res.decision === "SKIP") assertEqual(res.reason, "CRYPTO_CAPITAL_NON_POSITIVE");
    else throw new Error("expected SKIP");
  });

  test("CAP_REACHED outranks DUPLICATE", () => {
    const res = evaluateMirrorGate({
      parentBotSource: BOT_SOURCE_BTC_ZONE,
      attachedZoneBots: ALL_LIVE,
      cryptoBotManualOverride: "AUTO",
      cryptoBotMaxOpenTrades: 1,
      cryptoBotOpenPatternCount: 1,
      cryptoBotCapital: 1000,
      mirrorAlreadyExists: true,
    });
    if (res.decision === "SKIP") assertEqual(res.reason, "CRYPTO_CAP_REACHED");
    else throw new Error("expected SKIP");
  });
});

// ─── computeMirrorPositionSize ──────────────────────────────────────

describe("computeMirrorPositionSize — happy path", () => {
  test("classic BTC long: $1000 cap, 1% risk, $50k entry, $49k SL, 10x lev", () => {
    // slDistPct = 1000/50000 = 0.02 (2%)
    // notional = (1000 × 0.01) / (0.02 × 10) = 50
    // hardCap = 1000 × 0.05 = 50
    // result clamped to 50
    const r = computeMirrorPositionSize({
      capital: 1000,
      riskPerTradePct: 0.01,
      entryPrice: 50_000,
      stopLoss: 49_000,
      leverage: 10,
    });
    assertEqual(r.skip, false);
    if (!r.skip) {
      assertEqual(r.size, 50);
      assertEqual(r.leverage, 10);
    }
  });

  test("matches zone-bot formula on tight SL — hard cap binds", () => {
    // Tight 0.1% SL → uncapped notional would be huge ($10k+)
    // 5% cap should bind
    const r = computeMirrorPositionSize({
      capital: 1000,
      riskPerTradePct: 0.01,
      entryPrice: 50_000,
      stopLoss: 49_950, // 0.1% SL
      leverage: 10,
    });
    assertEqual(r.skip, false);
    if (!r.skip) {
      // $1000 × 0.05 = $50 hard cap
      assertEqual(r.size, 50);
    }
  });

  test("short trade — sign of SL doesn't matter (uses abs)", () => {
    const r = computeMirrorPositionSize({
      capital: 1000,
      riskPerTradePct: 0.01,
      entryPrice: 50_000,
      stopLoss: 51_000, // short, SL above
      leverage: 10,
    });
    assertEqual(r.skip, false);
    if (!r.skip) assertEqual(r.size, 50);
  });
});

describe("computeMirrorPositionSize — skip branches", () => {
  test("SL == entry → skip slDist", () => {
    const r = computeMirrorPositionSize({
      capital: 1000,
      riskPerTradePct: 0.01,
      entryPrice: 50_000,
      stopLoss: 50_000,
      leverage: 10,
    });
    assertEqual(r.skip, true);
  });

  test("entry = 0 → skip", () => {
    const r = computeMirrorPositionSize({
      capital: 1000,
      riskPerTradePct: 0.01,
      entryPrice: 0,
      stopLoss: 100,
      leverage: 10,
    });
    assertEqual(r.skip, true);
  });

  test("leverage = 0 → skip", () => {
    const r = computeMirrorPositionSize({
      capital: 1000,
      riskPerTradePct: 0.01,
      entryPrice: 50_000,
      stopLoss: 49_000,
      leverage: 0,
    });
    assertEqual(r.skip, true);
  });

  test("capital = 0 → skip", () => {
    const r = computeMirrorPositionSize({
      capital: 0,
      riskPerTradePct: 0.01,
      entryPrice: 50_000,
      stopLoss: 49_000,
      leverage: 10,
    });
    assertEqual(r.skip, true);
  });

  test("risk pct = 0 → skip", () => {
    const r = computeMirrorPositionSize({
      capital: 1000,
      riskPerTradePct: 0,
      entryPrice: 50_000,
      stopLoss: 49_000,
      leverage: 10,
    });
    assertEqual(r.skip, true);
  });

  test("below $1 floor → skip with reason", () => {
    // Tiny capital + huge SL → notional well under $1
    const r = computeMirrorPositionSize({
      capital: 1,
      riskPerTradePct: 0.001,
      entryPrice: 50_000,
      stopLoss: 25_000, // 50% SL
      leverage: 1,
    });
    assertEqual(r.skip, true);
    if (r.skip) assertTrue(r.reason.includes("floor"));
  });

  test("custom min notional respected", () => {
    const r = computeMirrorPositionSize({
      capital: 1000,
      riskPerTradePct: 0.01,
      entryPrice: 50_000,
      stopLoss: 49_000,
      leverage: 10,
      minNotional: 100, // above the computed $50
    });
    assertEqual(r.skip, true);
  });

  test("custom hard cap fraction binds tighter", () => {
    const r = computeMirrorPositionSize({
      capital: 1000,
      riskPerTradePct: 0.01,
      entryPrice: 50_000,
      stopLoss: 49_000,
      leverage: 10,
      hardCapFraction: 0.01, // 1% cap → $10
    });
    assertEqual(r.skip, false);
    if (!r.skip) assertEqual(r.size, 10);
  });
});

// ─── planMirrorCascades ─────────────────────────────────────────────

const M = (id: string, parentId: string, status: "OPEN" | "CLOSED" = "OPEN"): MirrorTradeRef => ({
  id,
  parentSimTradeId: parentId,
  status,
  attachedFrom: "BTC_ZONE",
});

const P = (
  id: string,
  status: "OPEN" | "CLOSED",
  reason: string | null = null,
  price: number | null = null,
): ParentTradeRef => ({
  id,
  status,
  closeReason: reason,
  currentPrice: price,
  closedAt: status === "CLOSED" ? new Date(0).toISOString() : null,
});

describe("planMirrorCascades — basic flows", () => {
  test("empty mirror list → empty action list", () => {
    const actions = planMirrorCascades([], new Map());
    assertDeepEqual(actions, []);
  });

  test("parent still open → no action", () => {
    const actions = planMirrorCascades(
      [M("mir-1", "par-1")],
      new Map([["par-1", P("par-1", "OPEN")]]),
    );
    assertDeepEqual(actions, []);
  });

  test("parent CLOSED + mirror OPEN → 1 cascade action with parent's price + reason", () => {
    const actions = planMirrorCascades(
      [M("mir-1", "par-1")],
      new Map([["par-1", P("par-1", "CLOSED", "ZONE_BOT_FLIP", 50_123)]]),
    );
    assertEqual(actions.length, 1);
    assertEqual(actions[0]!.mirrorId, "mir-1");
    assertEqual(actions[0]!.parentId, "par-1");
    assertEqual(actions[0]!.exitPrice, 50_123);
    assertEqual(actions[0]!.reason, "ATTACH_PARENT_CLOSED:ZONE_BOT_FLIP");
  });

  test("multiple mirrors, mixed parent state → only closed parents cascade", () => {
    const actions = planMirrorCascades(
      [
        M("mir-1", "par-1"),
        M("mir-2", "par-2"),
        M("mir-3", "par-3"),
      ],
      new Map([
        ["par-1", P("par-1", "OPEN")],
        ["par-2", P("par-2", "CLOSED", "TP3", 100)],
        ["par-3", P("par-3", "CLOSED", "KILL_SWITCH", 200)],
      ]),
    );
    assertEqual(actions.length, 2);
    const ids = actions.map((a) => a.mirrorId).sort();
    assertDeepEqual(ids, ["mir-2", "mir-3"]);
  });
});

describe("planMirrorCascades — safety guards", () => {
  test("mirror itself CLOSED → ignored even if parent CLOSED", () => {
    const actions = planMirrorCascades(
      [M("mir-1", "par-1", "CLOSED")],
      new Map([["par-1", P("par-1", "CLOSED", "ZONE_BOT_FLIP", 100)]]),
    );
    assertDeepEqual(actions, []);
  });

  test("parent missing from map → ignored (no orphan close)", () => {
    const actions = planMirrorCascades(
      [M("mir-1", "ghost-parent")],
      new Map(),
    );
    assertDeepEqual(actions, []);
  });

  test("parent CLOSED but missing exit price → exitPrice null bubbles up", () => {
    const actions = planMirrorCascades(
      [M("mir-1", "par-1")],
      new Map([["par-1", P("par-1", "CLOSED", "ZONE_BOT_FLIP", null)]]),
    );
    assertEqual(actions.length, 1);
    assertEqual(actions[0]!.exitPrice, null);
    // I/O wrapper falls back to mirror.currentPrice/entryPrice — proven
    // in production verification, not unit-test scope.
  });

  test("parent CLOSED with null reason → ATTACH_PARENT_CLOSED:UNKNOWN", () => {
    const actions = planMirrorCascades(
      [M("mir-1", "par-1")],
      new Map([["par-1", P("par-1", "CLOSED", null, 50)]]),
    );
    assertEqual(actions[0]!.reason, "ATTACH_PARENT_CLOSED:UNKNOWN");
  });
});

// ─── ID helpers ─────────────────────────────────────────────────────

describe("mirrorDocIdFor / mirrorSignalIdFor", () => {
  test("doc id is deterministic and prefixed", () => {
    assertEqual(mirrorDocIdFor("sim-zone-bot-btc-12345"), "sim-crypto-mirror-sim-zone-bot-btc-12345");
  });

  test("signal id is deterministic and prefixed", () => {
    assertEqual(mirrorSignalIdFor("zone-bot-btc-12345"), "crypto-mirror-zone-bot-btc-12345");
  });

  test("repeat calls return identical strings (idempotent)", () => {
    assertEqual(mirrorDocIdFor("x"), mirrorDocIdFor("x"));
    assertEqual(mirrorSignalIdFor("y"), mirrorSignalIdFor("y"));
  });

  test("doc and signal ids do not collide", () => {
    assertFalse(mirrorDocIdFor("a") === mirrorSignalIdFor("a"));
  });
});

summary("crypto-bot-attach-mirror unit");
