/**
 * Crypto Bot ↔ Zone Bot attach — live fan-out engine (PR 2c).
 *
 * Owns the decision to convert a Crypto Bot mirror SIM trade (opened
 * in `crypto-bot-attach-mirror.ts` whenever a zone bot fires while
 * `attachedZoneBots[asset] !== "off"`) into real exchange orders for
 * Crypto Bot subscribers.
 *
 * ── Why a separate module from `crypto-bot-attach-mirror.ts`? ────────
 *
 * The mirror module is the source of truth for SIMULATED capital
 * tracking — every byte of state lives in `simulator_trades` and
 * `config/sim_state_*`. This module is the source of truth for LIVE
 * dispatch — every byte of state lives in `live_trades`,
 * `dispatch_state`, and (eventually) exchange accounts. Mixing them
 * would couple two failure domains (sim ledger drift vs exchange
 * rejection) that today are isolated by separate try/catch blocks in
 * `sync-zone-bots`. Keeping them split also means PR 2c can be
 * reverted without touching the mirror sim engine, and vice versa.
 *
 * ── Three attach modes (driven by admin config) ──────────────────────
 *
 *   "off"   This module is never invoked (mirror wasn't opened).
 *   "sim"   Mirror sim trade exists, but live fan-out is in SHADOW
 *           mode: discover every user who WOULD have received a live
 *           order and emit `ATTACH_SHADOW_WOULD_FIRE` per user. No
 *           dispatch_state writes, no exchange calls, no live_trades
 *           docs. Used for safe dry-runs in production.
 *   "live"  Mirror sim trade exists AND fan-out is dispatched via the
 *           shared `executeForAllUsers` engine. The shared engine is
 *           passed an `attachContext` so it skips users who would
 *           also receive the solo-zone trade (avoiding duplicate
 *           fills — see `live-execution.ts` AttachContext JSDoc).
 *
 * ── Gates (fail-closed at every layer) ───────────────────────────────
 *
 *   1. Mirror sim open succeeded (= caller guarantees). No mirror →
 *      we never run.
 *   2. `attachMode !== "off"` — enforced by typing + the caller
 *      already checking the mirror outcome.
 *   3. "sim" mode → shadow only. Even a code bug here can't open a
 *      live order because we never call exchange.
 *   4. "live" mode → delegate to `executeForAllUsers` which has its
 *      own gates (autoTradeEnabled, isLiveMirroringEnabledForBotSource
 *      for PATTERN, daily loss halt, per-bot cap, dispatch_state
 *      idempotency, exchange position dedup).
 *   5. Plus the new `AttachContext` skip in the discovery loop:
 *      `zoneBotsEnabled[attachedFromAsset] === true` → skip
 *      (solo path wins silently).
 *
 * ── What this module never does ──────────────────────────────────────
 *
 *   • Never writes to simulator_trades or sim_state — that is the
 *     mirror module's exclusive turf.
 *   • Never decides whether to OPEN a mirror — that decision lives in
 *     `crypto-bot-attach-mirror.ts::evaluateMirrorGate`. By the time
 *     we run, the open call has either succeeded (`fired: true`) or
 *     skipped (no work to do).
 *   • Never modifies bot_deployments — the per-user cap and
 *     subscription state are owned by other modules.
 */
import type { Firestore } from "firebase-admin/firestore";
import {
  ATTACH_LOG_KEYS,
  type AttachMode,
} from "@/lib/crypto-bot-attach";
import {
  executeForAllUsers,
  type AttachContext,
} from "@/lib/live-execution";
import type { SimConfigType, SimTrade } from "@/lib/simulator";
import type { ZoneBotAsset } from "@/lib/zone-bot-config";
import { BOT_SOURCE_PATTERN } from "@/lib/bot-source-constants";
import {
  CRYPTO_BROKERS,
  type ExchangeName,
  docMatchesExchange,
} from "@/lib/exchanges";

// ── Per-user gate (pure) ────────────────────────────────────────────

export interface AttachUserGateInput {
  /** Raw secrets doc data for the user × exchange (same shape
   *  `executeForAllUsers` reads). May be `null` if the doc was
   *  deleted between discovery and gate. */
  secretData: Record<string, unknown> | undefined | null;
  /** Originating zone asset — drives the solo-supersession check. */
  attachedFromAsset: ZoneBotAsset;
  /** Admin's attach mode for this asset. Drives shadow vs live. */
  attachMode: Exclude<AttachMode, "off">;
}

export type AttachUserGateDecision =
  | { decision: "PASS" }
  | {
      decision: "SKIP";
      reason: "NO_AUTO_TRADE" | "SOLO_SUBSCRIBER" | "DAILY_LOSS_HALT";
      logKey: string;
    }
  | { decision: "SHADOW"; logKey: string };

/** Decide what to do for a single user when fanning a mirror out.
 *  Pure — no I/O, no clock. Mirrors a SUBSET of the gates
 *  `executeForAllUsers` runs; the full gate set there is the
 *  authoritative one for the "live" path. This pure function is the
 *  ONLY gate path for the "sim" (shadow) path, where we want to
 *  reproduce the visible filtering without paying for Firestore
 *  writes. */
export function evaluateAttachUserGate(
  input: AttachUserGateInput,
): AttachUserGateDecision {
  const data = input.secretData ?? {};

  // 1. autoTradeEnabled — without this, the user is never live.
  if (data.autoTradeEnabled !== true) {
    return {
      decision: "SKIP",
      reason: "NO_AUTO_TRADE",
      logKey: ATTACH_LOG_KEYS.skipNotCryptoSubscriber,
    };
  }

  // 2. Daily-loss halt — same halt key the live engine respects.
  //    Inlined the field check to keep this pure (the live-execution
  //    helper imports its own clock).
  const haltUtc = data.dailyLossHaltedUtcDate as string | undefined;
  if (typeof haltUtc === "string" && haltUtc.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    if (haltUtc === today) {
      return {
        decision: "SKIP",
        reason: "DAILY_LOSS_HALT",
        logKey: ATTACH_LOG_KEYS.skipDailyLossHalt,
      };
    }
  }

  // 3. Solo-zone supersession — user already gets the trade direct.
  const zoneMap = data.zoneBotsEnabled as Record<string, boolean> | undefined;
  if (zoneMap?.[input.attachedFromAsset] === true) {
    return {
      decision: "SKIP",
      reason: "SOLO_SUBSCRIBER",
      logKey: ATTACH_LOG_KEYS.skipSymbolAlreadyOpen,
    };
  }

  // 4. Live vs shadow.
  if (input.attachMode === "sim") {
    return { decision: "SHADOW", logKey: ATTACH_LOG_KEYS.shadowWouldFire };
  }
  return { decision: "PASS" };
}

// ── I/O: orchestrator ───────────────────────────────────────────────

/** Fan a zone-bot trade out to live Crypto Bot subscribers.
 *
 *  • "live" mode: delegates to the shared `executeForAllUsers` engine
 *    with `botSource: "PATTERN"` (so the trade rolls under Crypto Bot
 *    in every existing per-bot query — cap, dashboard, reports) plus
 *    an `attachContext` that skips users already subscribed to the
 *    solo zone.
 *  • "sim" mode (shadow): runs a parallel discovery (collectionGroup
 *    secrets, same query the live engine uses) and writes one
 *    `ATTACH_SHADOW_WOULD_FIRE` per user who would have received the
 *    live order. No exchange calls, no `live_trades` writes, no
 *    `dispatch_state` claims.
 *
 *  `mirror` / `mirrorDocId` / `mirrorSignalId` are the template trade
 *  and its anchor ids. The anchor doc (`mirrorDocId`) MUST be a
 *  `simulator_trades` doc that exists for the full trade lifecycle, so
 *  `sync-live-trades` can drive closes off it — a live trade whose
 *  linked sim doc is missing is force-closed as orphaned. Callers pass
 *  either:
 *    • the Crypto Bot's own mirror sim trade, OR
 *    • the parent zone sim trade directly (re-tagged `botSource:
 *      "PATTERN"`), which is the decoupled path that delivers to
 *      subscribers even when the sim mirror was skipped at its sim cap.
 *  Live sizing is recomputed per-user from each subscriber's risk%, so
 *  `mirror.positionSize` is only a template — entry / SL / TPs /
 *  leverage are what matter.
 *
 *  Soft-failure: any throw is captured and logged to `live_trade_logs`
 *  with `ATTACH_SKIP_EVAL_ERROR`. The caller (sync-zone-bots) catches
 *  errors anyway, but the local log gives an operator a starting
 *  point even when the outer catch swallows. */
export async function fanOutCryptoMirrorLive(args: {
  db: Firestore;
  mirror: SimTrade;
  mirrorDocId: string;
  mirrorSignalId: string;
  attachedFromAsset: ZoneBotAsset;
  /** Already known to be "sim" or "live" — caller has gated "off". */
  attachMode: Exclude<AttachMode, "off">;
  simConfig?: SimConfigType;
  now: number;
}): Promise<void> {
  const {
    db,
    mirror,
    mirrorDocId,
    mirrorSignalId,
    attachedFromAsset,
    attachMode,
    simConfig,
    now,
  } = args;

  // Sanity: mirror must point back at its sim doc id so live_trades
  // can later be joined by simTradeId. A mismatch would break the
  // cascade-close path in sync-live-trades. Catch loudly so the bug
  // surfaces immediately instead of producing untrackable live trades.
  if (mirror.id && mirror.id !== mirrorDocId) {
    await logAttachLiveEvent(db, {
      action: ATTACH_LOG_KEYS.skipEvalError,
      details: `[CRYPTO_MIRROR_LIVE] mirror.id="${mirror.id}" but mirrorDocId="${mirrorDocId}" — refusing to dispatch (would orphan live legs).`,
      symbol: mirror.symbol,
      signalId: mirrorSignalId,
      now,
    });
    return;
  }

  await logAttachLiveEvent(db, {
    action: ATTACH_LOG_KEYS.pathEntry,
    details: `[CRYPTO_MIRROR_LIVE] ${attachMode.toUpperCase()} fan-out start: ${mirror.symbol} ${mirror.side} mirrorDoc=${mirrorDocId} parent=${mirror.parentSimTradeId ?? "?"} from=${attachedFromAsset.toUpperCase()}_ZONE size=$${mirror.positionSize.toFixed(2)} lev=${mirror.leverage}x`,
    symbol: mirror.symbol,
    signalId: mirrorSignalId,
    now,
  });

  try {
    if (attachMode === "sim") {
      await runShadowFanout({
        db,
        mirror,
        mirrorSignalId,
        attachedFromAsset,
        now,
      });
      return;
    }

    // "live" mode: hand off to the shared engine.
    //
    // botSource is "PATTERN" (already set on the mirror SimTrade by
    // crypto-bot-attach-mirror.openCryptoMirrorForZoneTrade) so the
    // per-bot cap in executeForAllUsers counts ALL of Crypto Bot's
    // open live trades — both native pattern trades and mirrored
    // zone trades — against the user's `maxConcurrentTrades`. That
    // is the combined-pool cap the user asked for, with no new code.
    //
    // signalExchange = "BYBIT" mirrors what the parent zone trade
    // uses (zone bots run BYBIT-only today; see sync-zone-bots).
    // executeForAllUsers handles the CRYPTO_BROKERS fan-out
    // (BYBIT/BINANCE/MEXC/HYPERLIQUID/COINDCX) from there.
    const attachContext: AttachContext = { attachedFromAsset };
    await executeForAllUsers(
      db,
      mirror,
      mirrorDocId,
      mirror.capitalAfter ?? 0,
      mirrorSignalId,
      mirror.symbol,
      mirror.side,
      "BYBIT",
      simConfig,
      BOT_SOURCE_PATTERN,
      attachContext,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logAttachLiveEvent(db, {
      action: ATTACH_LOG_KEYS.skipEvalError,
      details: `[CRYPTO_MIRROR_LIVE] fan-out threw for mirror=${mirrorDocId}: ${msg}. Mirror sim trade unaffected; live legs (if any) tracked individually in live_trades.`,
      symbol: mirror.symbol,
      signalId: mirrorSignalId,
      now,
    });
  }
}

// ── Shadow discovery (sim mode) ─────────────────────────────────────

const DOC_ID_TO_EXCHANGE: Record<string, ExchangeName> = {
  bybit: "BYBIT",
  binance: "BYBIT",
  binance_futures: "BINANCE",
  mexc: "MEXC",
  coindcx: "COINDCX",
  hyperliquid: "HYPERLIQUID",
  dhan: "DHAN",
};

async function runShadowFanout(args: {
  db: Firestore;
  mirror: SimTrade;
  mirrorSignalId: string;
  attachedFromAsset: ZoneBotAsset;
  now: number;
}): Promise<void> {
  const { db, mirror, mirrorSignalId, attachedFromAsset, now } = args;
  const allowed = new Set<ExchangeName>(CRYPTO_BROKERS);

  let scanned = 0;
  let wouldFire = 0;
  const skipCounts: Record<string, number> = {
    not_auto_trade: 0,
    wrong_asset_class: 0,
    exchange_mismatch: 0,
    solo_supersedes: 0,
    daily_loss_halt: 0,
  };

  try {
    const snap = await db
      .collectionGroup("secrets")
      .where("autoTradeEnabled", "==", true)
      .get();
    scanned = snap.size;

    // Per-user dedup so a user with both `secrets/bybit` and a legacy
    // `secrets/binance` doc isn't double-counted.
    const seen = new Set<string>();

    for (const secretDoc of snap.docs) {
      const userId = secretDoc.ref.parent.parent?.id;
      if (!userId) continue;
      const exchangeName = DOC_ID_TO_EXCHANGE[secretDoc.id];
      if (!exchangeName || !allowed.has(exchangeName)) {
        skipCounts.wrong_asset_class++;
        continue;
      }
      const data = secretDoc.data() ?? {};
      if (!docMatchesExchange(data, exchangeName, secretDoc.id)) {
        skipCounts.exchange_mismatch++;
        continue;
      }

      const decision = evaluateAttachUserGate({
        secretData: data,
        attachedFromAsset,
        attachMode: "sim",
      });

      if (decision.decision === "SKIP") {
        if (decision.reason === "SOLO_SUBSCRIBER") skipCounts.solo_supersedes++;
        else if (decision.reason === "DAILY_LOSS_HALT") skipCounts.daily_loss_halt++;
        else if (decision.reason === "NO_AUTO_TRADE") skipCounts.not_auto_trade++;
        continue;
      }

      const dedupeKey = `${userId}::${exchangeName}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      // SHADOW: emit a would-fire log so an admin can confirm WHO
      // would have received the live order without any side effect.
      await db.collection("live_trade_logs").add({
        timestamp: new Date(now).toISOString(),
        action: ATTACH_LOG_KEYS.shadowWouldFire,
        details: `[CRYPTO_MIRROR_LIVE] SHADOW: would dispatch ${mirror.symbol} ${mirror.side} to user ${userId} on ${exchangeName} (size=$${mirror.positionSize.toFixed(2)} lev=${mirror.leverage}x from=${attachedFromAsset.toUpperCase()}_ZONE). attachMode=sim → no live order placed.`,
        signalId: mirrorSignalId,
        symbol: mirror.symbol,
        userId,
        exchange: exchangeName,
        attachedFromAsset,
        assetType: "CRYPTO",
      }).catch(() => {});
      wouldFire++;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logAttachLiveEvent(db, {
      action: ATTACH_LOG_KEYS.skipEvalError,
      details: `[CRYPTO_MIRROR_LIVE] shadow discovery failed: ${msg}`,
      symbol: mirror.symbol,
      signalId: mirrorSignalId,
      now,
    });
    return;
  }

  // Per-tick summary so it's easy to see at a glance how many users
  // attach would have hit on a given signal.
  const skipDetail = Object.entries(skipCounts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}=${n}`)
    .join(", ");
  await db.collection("live_trade_logs").add({
    timestamp: new Date(now).toISOString(),
    action: ATTACH_LOG_KEYS.pathEntry,
    details: `[CRYPTO_MIRROR_LIVE] SHADOW summary for ${mirror.symbol} ${mirror.side}: ${wouldFire} would-fire / ${scanned} scanned${skipDetail ? ` (skipped: ${skipDetail})` : ""}`,
    signalId: mirrorSignalId,
    symbol: mirror.symbol,
    attachedFromAsset,
    assetType: "CRYPTO",
  }).catch(() => {});
}

// ── Internal log helper ─────────────────────────────────────────────

async function logAttachLiveEvent(
  db: Firestore,
  args: {
    action: string;
    details: string;
    symbol: string;
    signalId: string;
    now: number;
  },
): Promise<void> {
  try {
    await db.collection("live_trade_logs").add({
      timestamp: new Date(args.now).toISOString(),
      action: args.action,
      details: args.details,
      symbol: args.symbol,
      signalId: args.signalId,
      assetType: "CRYPTO",
    });
  } catch (e) {
    console.warn(
      "[crypto-bot-attach-live] log write failed:",
      e instanceof Error ? e.message : String(e),
    );
  }
}
