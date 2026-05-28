/**
 * Pure-function unit tests for `src/lib/crypto-bot-attach-live.ts`.
 *
 * Only `evaluateAttachUserGate` is in scope — it is the entire surface
 * of user-eligibility decisions on the shadow path AND a faithful
 * subset of the live path's gate set. The I/O orchestrator
 * (`fanOutCryptoMirrorLive`) is verified by prod observation: shadow
 * mode emits `ATTACH_SHADOW_WOULD_FIRE` per user; live mode delegates
 * to `executeForAllUsers`, which already has its own integration
 * coverage via every existing call site.
 *
 * Why a pure-function matrix instead of mocking Firestore:
 *
 *   • The decision is the value at risk — a wrong PASS opens a live
 *     order; a wrong SKIP silently drops one. Both are user-money
 *     events. We want them locked into a regression suite that can't
 *     drift with infra changes.
 *   • Firestore-emulator tests are heavy and tend to ossify around
 *     the current schema. A pure matrix survives any storage rewrite.
 *
 * Gate order is asserted exhaustively in
 * `evaluateAttachUserGate — gate ordering` so we get a precise failure
 * name if a future "simplification" reshuffles them.
 */
import {
  evaluateAttachUserGate,
  type AttachUserGateDecision,
  type AttachUserGateInput,
} from "../../src/lib/crypto-bot-attach-live";
import { ATTACH_LOG_KEYS } from "../../src/lib/crypto-bot-attach";
import {
  assertDeepEqual,
  assertEqual,
  describe,
  summary,
  test,
} from "./_assert";

// Helper — base data for a "happy" user (auto-trade ON, no halt, no
// solo opt-in). Tests override specific fields.
function userData(overrides: Record<string, unknown> = {}): AttachUserGateInput["secretData"] {
  return {
    autoTradeEnabled: true,
    zoneBotsEnabled: {},
    ...overrides,
  };
}

function input(opts: {
  secretData?: AttachUserGateInput["secretData"];
  attachedFromAsset?: "btc" | "eth" | "sol" | "xrp";
  attachMode?: "sim" | "live";
}): AttachUserGateInput {
  // Use `"key" in opts` instead of `??` so explicit `null`/`undefined`
  // passed by the caller round-trips through (the `??` short-circuit
  // would replace them with userData(), masking the gate's nullish
  // handling — exactly the bug this helper hides at-a-glance).
  return {
    secretData: "secretData" in opts ? opts.secretData : userData(),
    attachedFromAsset: opts.attachedFromAsset ?? "btc",
    attachMode: opts.attachMode ?? "live",
  };
}

function expectSkip(
  decision: AttachUserGateDecision,
  reason: "NO_AUTO_TRADE" | "SOLO_SUBSCRIBER" | "DAILY_LOSS_HALT",
  logKey: string,
): void {
  assertDeepEqual(decision, { decision: "SKIP", reason, logKey });
}

// ─── SKIP branches ──────────────────────────────────────────────────

describe("evaluateAttachUserGate — SKIP branches", () => {
  test("autoTradeEnabled missing → NO_AUTO_TRADE", () => {
    const d = evaluateAttachUserGate(input({ secretData: { zoneBotsEnabled: {} } }));
    expectSkip(d, "NO_AUTO_TRADE", ATTACH_LOG_KEYS.skipNotCryptoSubscriber);
  });

  test("autoTradeEnabled === false → NO_AUTO_TRADE", () => {
    const d = evaluateAttachUserGate(input({ secretData: userData({ autoTradeEnabled: false }) }));
    expectSkip(d, "NO_AUTO_TRADE", ATTACH_LOG_KEYS.skipNotCryptoSubscriber);
  });

  test("autoTradeEnabled === 'true' (string) → NO_AUTO_TRADE (strict equality)", () => {
    // Truthy strings must not pass — the live-execution discovery query is
    // `where("autoTradeEnabled", "==", true)` which only matches boolean
    // true. We mirror that to avoid a shadow vs live divergence.
    const d = evaluateAttachUserGate(input({ secretData: userData({ autoTradeEnabled: "true" }) }));
    expectSkip(d, "NO_AUTO_TRADE", ATTACH_LOG_KEYS.skipNotCryptoSubscriber);
  });

  test("secretData = null → NO_AUTO_TRADE", () => {
    const d = evaluateAttachUserGate(input({ secretData: null }));
    expectSkip(d, "NO_AUTO_TRADE", ATTACH_LOG_KEYS.skipNotCryptoSubscriber);
  });

  test("secretData = undefined → NO_AUTO_TRADE", () => {
    const d = evaluateAttachUserGate(input({ secretData: undefined }));
    expectSkip(d, "NO_AUTO_TRADE", ATTACH_LOG_KEYS.skipNotCryptoSubscriber);
  });

  test("daily-loss halt for today → DAILY_LOSS_HALT", () => {
    const today = new Date().toISOString().slice(0, 10);
    const d = evaluateAttachUserGate(input({
      secretData: userData({ dailyLossHaltedUtcDate: today }),
    }));
    expectSkip(d, "DAILY_LOSS_HALT", ATTACH_LOG_KEYS.skipDailyLossHalt);
  });

  test("daily-loss halt for yesterday → PASS (stale halt is harmless)", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const d = evaluateAttachUserGate(input({
      secretData: userData({ dailyLossHaltedUtcDate: yesterday }),
    }));
    assertDeepEqual(d, { decision: "PASS" });
  });

  test("daily-loss halt as empty string → PASS", () => {
    const d = evaluateAttachUserGate(input({
      secretData: userData({ dailyLossHaltedUtcDate: "" }),
    }));
    assertDeepEqual(d, { decision: "PASS" });
  });

  test("zoneBotsEnabled.btc === true (asset=btc) → SOLO_SUBSCRIBER", () => {
    const d = evaluateAttachUserGate(input({
      secretData: userData({ zoneBotsEnabled: { btc: true } }),
      attachedFromAsset: "btc",
    }));
    expectSkip(d, "SOLO_SUBSCRIBER", ATTACH_LOG_KEYS.skipSymbolAlreadyOpen);
  });

  test("zoneBotsEnabled.eth === true (asset=btc) → PASS (orthogonal opt-in)", () => {
    const d = evaluateAttachUserGate(input({
      secretData: userData({ zoneBotsEnabled: { eth: true } }),
      attachedFromAsset: "btc",
    }));
    assertDeepEqual(d, { decision: "PASS" });
  });

  test("zoneBotsEnabled.btc === false → PASS (explicit opt-out is the default)", () => {
    const d = evaluateAttachUserGate(input({
      secretData: userData({ zoneBotsEnabled: { btc: false } }),
      attachedFromAsset: "btc",
    }));
    assertDeepEqual(d, { decision: "PASS" });
  });

  test("zoneBotsEnabled = undefined → PASS", () => {
    const d = evaluateAttachUserGate(input({
      secretData: { autoTradeEnabled: true },
      attachedFromAsset: "btc",
    }));
    assertDeepEqual(d, { decision: "PASS" });
  });

  test("zoneBotsEnabled.btc = truthy non-true ('yes') → PASS (strict === true)", () => {
    // Symmetric with the autoTradeEnabled strict check — only true skips.
    const d = evaluateAttachUserGate(input({
      secretData: userData({ zoneBotsEnabled: { btc: "yes" as unknown as boolean } }),
      attachedFromAsset: "btc",
    }));
    assertDeepEqual(d, { decision: "PASS" });
  });

  test("all four assets respected: eth", () => {
    const d = evaluateAttachUserGate(input({
      secretData: userData({ zoneBotsEnabled: { eth: true } }),
      attachedFromAsset: "eth",
    }));
    expectSkip(d, "SOLO_SUBSCRIBER", ATTACH_LOG_KEYS.skipSymbolAlreadyOpen);
  });

  test("all four assets respected: sol", () => {
    const d = evaluateAttachUserGate(input({
      secretData: userData({ zoneBotsEnabled: { sol: true } }),
      attachedFromAsset: "sol",
    }));
    expectSkip(d, "SOLO_SUBSCRIBER", ATTACH_LOG_KEYS.skipSymbolAlreadyOpen);
  });

  test("all four assets respected: xrp", () => {
    const d = evaluateAttachUserGate(input({
      secretData: userData({ zoneBotsEnabled: { xrp: true } }),
      attachedFromAsset: "xrp",
    }));
    expectSkip(d, "SOLO_SUBSCRIBER", ATTACH_LOG_KEYS.skipSymbolAlreadyOpen);
  });
});

// ─── SHADOW vs LIVE ─────────────────────────────────────────────────

describe("evaluateAttachUserGate — SHADOW vs LIVE", () => {
  test("attachMode = 'live', everything green → PASS", () => {
    const d = evaluateAttachUserGate(input({ attachMode: "live" }));
    assertDeepEqual(d, { decision: "PASS" });
  });

  test("attachMode = 'sim', everything green → SHADOW", () => {
    const d = evaluateAttachUserGate(input({ attachMode: "sim" }));
    assertDeepEqual(d, { decision: "SHADOW", logKey: ATTACH_LOG_KEYS.shadowWouldFire });
  });

  test("attachMode = 'sim' does NOT override SKIPs (gate order matters)", () => {
    // Important: SHADOW must come AFTER the SKIP gates. A solo subscriber
    // in sim mode should still SKIP, not SHADOW — otherwise the shadow
    // log overcounts the would-fire population by including users who
    // would never get a live order even in live mode.
    const d = evaluateAttachUserGate(input({
      secretData: userData({ zoneBotsEnabled: { btc: true } }),
      attachedFromAsset: "btc",
      attachMode: "sim",
    }));
    expectSkip(d, "SOLO_SUBSCRIBER", ATTACH_LOG_KEYS.skipSymbolAlreadyOpen);
  });

  test("attachMode = 'sim' + autoTradeEnabled false → SKIP NO_AUTO_TRADE", () => {
    const d = evaluateAttachUserGate(input({
      secretData: userData({ autoTradeEnabled: false }),
      attachMode: "sim",
    }));
    expectSkip(d, "NO_AUTO_TRADE", ATTACH_LOG_KEYS.skipNotCryptoSubscriber);
  });

  test("attachMode = 'sim' + halted today → SKIP DAILY_LOSS_HALT", () => {
    const today = new Date().toISOString().slice(0, 10);
    const d = evaluateAttachUserGate(input({
      secretData: userData({ dailyLossHaltedUtcDate: today }),
      attachMode: "sim",
    }));
    expectSkip(d, "DAILY_LOSS_HALT", ATTACH_LOG_KEYS.skipDailyLossHalt);
  });
});

// ─── Gate ordering ──────────────────────────────────────────────────

describe("evaluateAttachUserGate — gate ordering", () => {
  // When two gates would fire, we want the FIRST one in the chain to
  // win so the log key is stable. Order is:
  //   1. NO_AUTO_TRADE
  //   2. DAILY_LOSS_HALT
  //   3. SOLO_SUBSCRIBER
  //   4. SHADOW vs PASS
  // This matches the live engine's order (autoTradeEnabled is the very
  // first .where() clause on the secrets discovery query).

  test("NO_AUTO_TRADE wins over DAILY_LOSS_HALT", () => {
    const today = new Date().toISOString().slice(0, 10);
    const d = evaluateAttachUserGate(input({
      secretData: {
        autoTradeEnabled: false,
        dailyLossHaltedUtcDate: today,
        zoneBotsEnabled: { btc: true },
      },
    }));
    assertEqual(d.decision, "SKIP");
    if (d.decision === "SKIP") assertEqual(d.reason, "NO_AUTO_TRADE");
  });

  test("NO_AUTO_TRADE wins over SOLO_SUBSCRIBER", () => {
    const d = evaluateAttachUserGate(input({
      secretData: {
        autoTradeEnabled: false,
        zoneBotsEnabled: { btc: true },
      },
    }));
    assertEqual(d.decision, "SKIP");
    if (d.decision === "SKIP") assertEqual(d.reason, "NO_AUTO_TRADE");
  });

  test("DAILY_LOSS_HALT wins over SOLO_SUBSCRIBER", () => {
    const today = new Date().toISOString().slice(0, 10);
    const d = evaluateAttachUserGate(input({
      secretData: userData({
        dailyLossHaltedUtcDate: today,
        zoneBotsEnabled: { btc: true },
      }),
    }));
    assertEqual(d.decision, "SKIP");
    if (d.decision === "SKIP") assertEqual(d.reason, "DAILY_LOSS_HALT");
  });

  test("SOLO_SUBSCRIBER wins over SHADOW (sim mode)", () => {
    const d = evaluateAttachUserGate(input({
      secretData: userData({ zoneBotsEnabled: { btc: true } }),
      attachMode: "sim",
    }));
    assertEqual(d.decision, "SKIP");
    if (d.decision === "SKIP") assertEqual(d.reason, "SOLO_SUBSCRIBER");
  });

  test("SOLO_SUBSCRIBER wins over PASS (live mode)", () => {
    const d = evaluateAttachUserGate(input({
      secretData: userData({ zoneBotsEnabled: { btc: true } }),
      attachMode: "live",
    }));
    assertEqual(d.decision, "SKIP");
    if (d.decision === "SKIP") assertEqual(d.reason, "SOLO_SUBSCRIBER");
  });
});

// ─── Asset isolation ────────────────────────────────────────────────

describe("evaluateAttachUserGate — asset isolation matrix", () => {
  // A user can opt into multiple solo zones independently. The mirror
  // decision must read the EXACT field that matches `attachedFromAsset`
  // and ignore the others. Catches accidental field-key drift.
  const allAssets: Array<"btc" | "eth" | "sol" | "xrp"> = ["btc", "eth", "sol", "xrp"];

  for (const fired of allAssets) {
    for (const enabled of allAssets) {
      const expectedSkip = fired === enabled;
      test(`fired=${fired} × enabled=${enabled} → ${expectedSkip ? "SKIP" : "PASS"}`, () => {
        const d = evaluateAttachUserGate(input({
          secretData: userData({ zoneBotsEnabled: { [enabled]: true } }),
          attachedFromAsset: fired,
        }));
        if (expectedSkip) {
          expectSkip(d, "SOLO_SUBSCRIBER", ATTACH_LOG_KEYS.skipSymbolAlreadyOpen);
        } else {
          assertDeepEqual(d, { decision: "PASS" });
        }
      });
    }
  }
});

summary("crypto-bot-attach-live");
