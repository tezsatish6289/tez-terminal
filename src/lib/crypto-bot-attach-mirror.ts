/**
 * Crypto Bot ↔ Zone Bot attach — mirror sim trade engine (PR 2b).
 *
 * When a zone bot (BTC/ETH/SOL/XRP) opens a sim trade and the admin
 * has set its attach mode to "sim" or "live" via
 * `config/sim_bot_crypto_settings.attachedZoneBots`, this module is
 * responsible for opening a PARALLEL sim trade on the Crypto Bot side
 * ("the mirror") and for ensuring that mirror closes when its parent
 * zone trade closes.
 *
 * ── Why a parallel trade, not a multi-pool tag? ──────────────────────
 *
 * Originally we considered stamping a single sim trade with a
 * `deliveredAs: ["BTC", "CRYPTO"]` list and filtering records pages
 * accordingly. That collapsed the two bots' capital / fees / PnL into
 * a single ledger and broke per-bot reporting. The mirror approach
 * keeps each bot's books fully independent — Crypto Bot's capital,
 * fees, realized PnL, and `simulator_state` all reflect ONLY the
 * trades Crypto Bot took, including its share of the zone signals it
 * subscribed to, sized by Crypto Bot's own risk × capital.
 *
 * ── Mirror trade shape ───────────────────────────────────────────────
 *
 *   {
 *     ...openTrade(parent.signal with crypto sizing),
 *     botSource: "PATTERN",        // routes under Crypto Bot in reports
 *     attachedFrom: "BTC_ZONE",    // audit: who fired this signal
 *     parentSimTradeId: "sim-zone-bot-btc-XXX",  // cascade close link
 *   }
 *
 * Same entry/SL/TP prices as parent → natural TP/SL closes are handled
 * by `sync-simulator`'s universal raw-price catch-up loop with no
 * special wiring. The cascade reconciler here is only for non-TP/SL
 * parent closes (FLIP / manual / ZONE_BOT_FLIP_BLOCKED), where the
 * parent dies but the mirror would otherwise stay open at the same
 * prices waiting for a TP/SL hit that may never come.
 *
 * ── Gates (fail-closed, every one) ───────────────────────────────────
 *
 *   • Attach config for the originating asset is "off"          → skip
 *   • Crypto Bot manual override is "OFF"                       → skip
 *   • Crypto Bot capital ≤ 0                                    → skip
 *   • Crypto Bot already at maxOpenTrades for PATTERN trades    → skip
 *   • Mirror doc already exists (retry / duplicate cron tick)   → skip
 *   • Position sizing math returns < $1 floor                   → skip
 *
 * ── PR 2b scope ──────────────────────────────────────────────────────
 *
 * Sim mode only. The mirror gets its own simulator_trades doc, its
 * own Solana memo, and shows up on the Crypto Bot card / Crypto
 * records tab. NO live execution for Crypto Bot subscribers — that
 * comes in PR 2c, which will gate `executeForAllUsers` on top of the
 * mirror open here.
 */
import type { Firestore } from "firebase-admin/firestore";
import { getLeverage } from "@/lib/leverage";
import {
  ATTACH_LOG_KEYS,
  type AttachMode,
  type AttachedZoneBots,
  attachModeForBotSource,
  zoneAssetFromBotSource,
} from "@/lib/crypto-bot-attach";
import {
  SIM_CONFIG,
  type SimConfigType,
  type SimTrade,
  type SimulatorState,
  checkDailyReset,
  computeUnrealizedPnl,
  createInitialState,
  getSimStateDocId,
  openTrade,
} from "@/lib/simulator";
import {
  loadSimBotSettings,
  type SimBotOverride,
  type SimBotSettings,
} from "@/lib/sim-bot-settings";
import {
  BOT_SOURCE_PATTERN,
  classifyBotSource,
} from "@/lib/bot-source-constants";
import { markTradeForBlockchain } from "@/lib/blockchain-logger";

// ─── Gate logic (pure) ──────────────────────────────────────────────

export interface MirrorGateInput {
  /** Originating zone bot — e.g. "BTC_ZONE". `null` / "PATTERN" both
   *  short-circuit to ATTACH_OFF because the mirror is a zone-only
   *  concept. */
  parentBotSource: string | null | undefined;
  attachedZoneBots: AttachedZoneBots;
  cryptoBotManualOverride: SimBotOverride;
  cryptoBotMaxOpenTrades: number;
  cryptoBotOpenPatternCount: number;
  cryptoBotCapital: number;
  /** True when a mirror doc for this exact parent already exists in
   *  `simulator_trades`. Caller computes this once before the gate so
   *  the gate stays pure. */
  mirrorAlreadyExists: boolean;
}

export type MirrorGateDecision =
  | { decision: "OPEN"; attachMode: Exclude<AttachMode, "off"> }
  | {
      decision: "SKIP";
      reason:
        | "ATTACH_OFF"
        | "CRYPTO_BOT_OFF"
        | "CRYPTO_CAPITAL_NON_POSITIVE"
        | "CRYPTO_CAP_REACHED"
        | "DUPLICATE";
      detail: string;
    };

/** Decide whether to open a mirror given the current snapshot.
 *  Pure — no I/O, no clock, no side effects. Easy to test exhaustively. */
export function evaluateMirrorGate(
  input: MirrorGateInput,
): MirrorGateDecision {
  const attachMode = attachModeForBotSource(
    input.attachedZoneBots,
    input.parentBotSource,
  );
  if (attachMode === "off") {
    return {
      decision: "SKIP",
      reason: "ATTACH_OFF",
      detail: `attach mode is off for ${input.parentBotSource ?? "null"}`,
    };
  }
  if (input.cryptoBotManualOverride === "OFF") {
    return {
      decision: "SKIP",
      reason: "CRYPTO_BOT_OFF",
      detail: "Crypto Bot manual override is OFF",
    };
  }
  if (!(input.cryptoBotCapital > 0)) {
    return {
      decision: "SKIP",
      reason: "CRYPTO_CAPITAL_NON_POSITIVE",
      detail: `Crypto Bot capital ${input.cryptoBotCapital} ≤ 0`,
    };
  }
  if (input.cryptoBotOpenPatternCount >= input.cryptoBotMaxOpenTrades) {
    return {
      decision: "SKIP",
      reason: "CRYPTO_CAP_REACHED",
      detail: `Crypto Bot at cap (${input.cryptoBotOpenPatternCount}/${input.cryptoBotMaxOpenTrades})`,
    };
  }
  if (input.mirrorAlreadyExists) {
    return {
      decision: "SKIP",
      reason: "DUPLICATE",
      detail: "mirror sim trade already exists for this parent",
    };
  }
  return { decision: "OPEN", attachMode };
}

// ─── Position sizing (pure) ─────────────────────────────────────────

export interface MirrorSizingInput {
  capital: number;
  riskPerTradePct: number;
  entryPrice: number;
  stopLoss: number;
  /** Crypto Bot's leverage at the parent's timeframe (resolved via
   *  `getLeverage` by the caller — passed in so this helper stays
   *  pure). */
  leverage: number;
  /** Defaults to 0.05 (5%) — same hard cap zone bots use. */
  hardCapFraction?: number;
  /** Defaults to $1. */
  minNotional?: number;
}

export type MirrorSizingResult =
  | { size: number; leverage: number; skip: false }
  | { size: number; leverage: number; skip: true; reason: string };

/** Mirrors the zone bot's `computePositionSize` math (sync-zone-bots)
 *  so reports compare apples to apples — Crypto Bot's mirror sizing is
 *  Crypto Bot's risk × Crypto Bot's capital, capped at the same 5%
 *  notional ceiling, with the same $1 minimum floor. */
export function computeMirrorPositionSize(
  input: MirrorSizingInput,
): MirrorSizingResult {
  const { capital, riskPerTradePct, entryPrice, stopLoss, leverage } = input;
  const hardCapFraction = input.hardCapFraction ?? 0.05;
  const minNotional = input.minNotional ?? 1;

  const slDist = Math.abs(entryPrice - stopLoss);
  if (slDist <= 0 || entryPrice <= 0 || leverage <= 0) {
    return {
      size: 0,
      leverage,
      skip: true,
      reason: "slDist / entryPrice / leverage non-positive",
    };
  }
  if (!(capital > 0) || !(riskPerTradePct > 0)) {
    return {
      size: 0,
      leverage,
      skip: true,
      reason: "capital / riskPerTradePct non-positive",
    };
  }

  const slDistPct = slDist / entryPrice;
  let notional = (capital * riskPerTradePct) / (slDistPct * leverage);

  const hardCap = capital * hardCapFraction;
  if (notional > hardCap) notional = hardCap;
  notional = Math.round(notional * 100) / 100;

  if (notional < minNotional) {
    return {
      size: notional,
      leverage,
      skip: true,
      reason: `size $${notional.toFixed(2)} < $${minNotional} floor`,
    };
  }
  return { size: notional, leverage, skip: false };
}

// ─── Cascade planning (pure) ────────────────────────────────────────

export interface MirrorTradeRef {
  id: string;
  parentSimTradeId: string;
  status: "OPEN" | "CLOSED";
  attachedFrom: string;
}

export interface ParentTradeRef {
  id: string;
  status: "OPEN" | "CLOSED";
  closeReason: string | null;
  currentPrice: number | null;
  closedAt: string | null;
}

export interface CascadeAction {
  mirrorId: string;
  parentId: string;
  exitPrice: number | null;
  reason: string;
}

/** Given the OPEN mirrors and the current state of their parents,
 *  decide which mirrors need to be force-closed. Pure — caller does
 *  the actual writes. */
export function planMirrorCascades(
  openMirrors: readonly MirrorTradeRef[],
  parentRefs: ReadonlyMap<string, ParentTradeRef>,
): CascadeAction[] {
  const actions: CascadeAction[] = [];
  for (const m of openMirrors) {
    if (m.status !== "OPEN") continue;
    const parent = parentRefs.get(m.parentSimTradeId);
    if (!parent) continue;
    if (parent.status !== "CLOSED") continue;
    actions.push({
      mirrorId: m.id,
      parentId: parent.id,
      exitPrice: parent.currentPrice,
      reason: `ATTACH_PARENT_CLOSED:${parent.closeReason ?? "UNKNOWN"}`,
    });
  }
  return actions;
}

// ─── Mirror id derivation ───────────────────────────────────────────

/** Deterministic mirror doc id derived from the parent's doc id so
 *  retried cron ticks are idempotent — second open call sees the doc
 *  and short-circuits via the DUPLICATE gate. */
export function mirrorDocIdFor(parentSimTradeId: string): string {
  return `sim-crypto-mirror-${parentSimTradeId}`;
}

/** Deterministic mirror signalId so live execution (PR 2c) can find
 *  its own live_trades via the same signalId convention every other
 *  bot uses. Prefixed with `crypto-mirror-` so it can never collide
 *  with a real Crypto Bot pattern signal id. */
export function mirrorSignalIdFor(parentSignalId: string): string {
  return `crypto-mirror-${parentSignalId}`;
}

// ─── I/O helpers ────────────────────────────────────────────────────

/** Count OPEN crypto-bot PATTERN trades — the pool the mirror counts
 *  against for `maxOpenTrades`. Mirrors also have botSource=PATTERN,
 *  so they count themselves correctly without special casing. */
async function loadCryptoOpenPatternCount(
  db: Firestore,
): Promise<number> {
  const snap = await db
    .collection("simulator_trades")
    .where("status", "==", "OPEN")
    .where("assetType", "==", "CRYPTO")
    .get();
  let n = 0;
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    if (classifyBotSource(data.botSource as string | undefined) === BOT_SOURCE_PATTERN) {
      n++;
    }
  }
  return n;
}

async function loadCryptoSimState(
  db: Firestore,
): Promise<SimulatorState> {
  const stateRef = db.collection("config").doc(getSimStateDocId("CRYPTO"));
  const snap = await stateRef.get();
  if (!snap.exists) return createInitialState("CRYPTO");
  return checkDailyReset(snap.data() as SimulatorState);
}

// ─── Mirror open (orchestrated) ─────────────────────────────────────

export type MirrorOpenOutcome =
  | {
      fired: true;
      mirrorDocId: string;
      mirrorSignalId: string;
      attachMode: Exclude<AttachMode, "off">;
      capitalAfter: number;
      size: number;
    }
  | {
      fired: false;
      reason:
        | "ATTACH_OFF"
        | "CRYPTO_BOT_OFF"
        | "CRYPTO_CAPITAL_NON_POSITIVE"
        | "CRYPTO_CAP_REACHED"
        | "DUPLICATE"
        | "SIZE_BELOW_FLOOR"
        | "OPEN_THREW";
      detail: string;
    };

/** Open a Crypto Bot mirror sim trade for a zone bot's just-opened
 *  parent. Every failure is captured into `simulator_logs` so the
 *  parent zone trade is never affected.
 *
 *  Idempotent: retries with the same `parentSimTradeId` short-circuit
 *  via the DUPLICATE gate. */
export async function openCryptoMirrorForZoneTrade(args: {
  db: Firestore;
  parent: SimTrade;
  parentSimTradeId: string;
  attachedZoneBots: AttachedZoneBots;
  simConfig: SimConfigType;
  now: number;
}): Promise<MirrorOpenOutcome> {
  const { db, parent, parentSimTradeId, attachedZoneBots, simConfig, now } = args;

  const parentSource = parent.botSource ?? null;
  const asset = zoneAssetFromBotSource(parentSource);

  // Cheap pre-check before any Firestore reads — if the bot source
  // isn't a recognised zone, the gate will SKIP anyway.
  if (!asset || attachModeForBotSource(attachedZoneBots, parentSource) === "off") {
    return {
      fired: false,
      reason: "ATTACH_OFF",
      detail: `attach mode is off for parent botSource=${parentSource ?? "null"}`,
    };
  }

  try {
    const mirrorDocId = mirrorDocIdFor(parentSimTradeId);
    const mirrorRef = db.collection("simulator_trades").doc(mirrorDocId);

    const [cryptoSettings, cryptoState, openPatternCount, existingMirror] =
      await Promise.all([
        loadSimBotSettings(db, "crypto"),
        loadCryptoSimState(db),
        loadCryptoOpenPatternCount(db),
        mirrorRef.get(),
      ]);

    const gate = evaluateMirrorGate({
      parentBotSource: parentSource,
      attachedZoneBots,
      cryptoBotManualOverride: cryptoSettings.manualOverride,
      cryptoBotMaxOpenTrades: resolveCryptoMaxOpenTrades(cryptoSettings, cryptoState),
      cryptoBotOpenPatternCount: openPatternCount,
      cryptoBotCapital: cryptoState.capital,
      mirrorAlreadyExists: existingMirror.exists,
    });

    if (gate.decision === "SKIP") {
      await logMirrorEvent(db, {
        action: ATTACH_LOG_KEYS.mirrorSkipped,
        details: `[CRYPTO_MIRROR] skipped for ${parent.symbol} ${parent.side} (parent=${parentSimTradeId}, source=${parentSource ?? "null"}) — ${gate.reason}: ${gate.detail}`,
        symbol: parent.symbol,
        signalId: parent.signalId,
        capital: cryptoState.capital,
        now,
      });
      return { fired: false, reason: gate.reason, detail: gate.detail };
    }

    // Follow the parent zone bot's configured leverage (3/5/10×) so the
    // Crypto-Bot mirror sim trade sizes itself the same way the zone bot
    // did. Falls back to the legacy timeframe-keyed value if the parent
    // doc somehow lacks a leverage field (legacy / hand-edited rows).
    const leverage =
      typeof parent.leverage === "number" &&
      Number.isFinite(parent.leverage) &&
      parent.leverage > 0
        ? parent.leverage
        : getLeverage(parent.timeframe, parent.assetType);
    const sizing = computeMirrorPositionSize({
      capital: cryptoState.capital,
      riskPerTradePct: cryptoSettings.riskPerTradePct,
      entryPrice: parent.entryPrice,
      stopLoss: parent.stopLoss,
      leverage,
    });

    if (sizing.skip) {
      await logMirrorEvent(db, {
        action: ATTACH_LOG_KEYS.mirrorSkipped,
        details: `[CRYPTO_MIRROR] size skip for ${parent.symbol} ${parent.side} (parent=${parentSimTradeId}) — ${sizing.reason}`,
        symbol: parent.symbol,
        signalId: parent.signalId,
        capital: cryptoState.capital,
        now,
      });
      return {
        fired: false,
        reason: "SIZE_BELOW_FLOOR",
        detail: sizing.reason,
      };
    }

    const mirrorSignalId = mirrorSignalIdFor(parent.signalId);
    const openResult = openTrade({
      signal: {
        id: mirrorSignalId,
        symbol: parent.symbol,
        exchange: parent.exchange,
        assetType: parent.assetType ?? "CRYPTO",
        type: parent.side,
        timeframe: parent.timeframe,
        algo: parent.algo,
        price: parent.entryPrice,
        stopLoss: parent.stopLoss,
        tp1: parent.tp1,
        tp2: parent.tp2,
        tp3: parent.tp3,
        confidenceScore: parent.confidenceScore,
        scorePattern: parent.scorePattern,
        scoreBreakdown: parent.scoreBreakdownAtEntry,
      },
      positionSize: sizing.size,
      state: cryptoState,
      bullScore: 0,
      bearScore: 0,
      liveWinRate: 0,
      algoWinRate: 0,
      directionBias: "BOTH",
    });

    // Override the trade's botSource so it rolls up under Crypto Bot,
    // and stamp the audit fields so cascade reconciliation can find
    // the parent and ops can grep for attach activity. Leverage is also
    // overwritten — `openTrade()` derives it from the signal's timeframe
    // (= 3× for the "60" zone-bot path), but we already resolved the
    // parent's leverage above (3/5/10×) and used it for sizing, so the
    // persisted mirror doc + its live mirror must agree.
    const mirrorTrade: SimTrade = {
      ...openResult.trade,
      botSource: BOT_SOURCE_PATTERN,
      attachedFrom: parentSource ?? undefined,
      parentSimTradeId,
      leverage,
    };

    // Write trade + bump state inside a transaction so a racing
    // KILL_SWITCH / TP-SL close on the same Crypto Bot tick can't
    // double-debit capital.
    const stateRef = db
      .collection("config")
      .doc(getSimStateDocId(parent.assetType ?? "CRYPTO"));

    await db.runTransaction(async (tx) => {
      const existing = await tx.get(mirrorRef);
      if (existing.exists) {
        throw new Error("RACE_DUPLICATE");
      }
      const freshStateSnap = await tx.get(stateRef);
      const freshState: SimulatorState = freshStateSnap.exists
        ? checkDailyReset(freshStateSnap.data() as SimulatorState)
        : createInitialState(parent.assetType ?? "CRYPTO");
      // Recompute the entry-fee adjustment against the FRESH state so
      // capital deltas don't compound on top of a stale read from the
      // pre-txn loadCryptoSimState() call.
      const entryFee = mirrorTrade.fees;
      const freshUpdatedState: SimulatorState = {
        ...freshState,
        capital: freshState.capital - entryFee,
        dailyPnl: freshState.dailyPnl - entryFee,
        dailyFees: freshState.dailyFees + entryFee,
        totalRealizedPnl: freshState.totalRealizedPnl - entryFee,
        totalFeesPaid: freshState.totalFeesPaid + entryFee,
        totalTradesTaken: freshState.totalTradesTaken + 1,
        lastUpdated: new Date(now).toISOString(),
      };

      tx.set(mirrorRef, mirrorTrade);
      if (freshStateSnap.exists) {
        tx.update(stateRef, {
          capital: freshUpdatedState.capital,
          dailyPnl: freshUpdatedState.dailyPnl,
          dailyFees: freshUpdatedState.dailyFees,
          totalRealizedPnl: freshUpdatedState.totalRealizedPnl,
          totalFeesPaid: freshUpdatedState.totalFeesPaid,
          totalTradesTaken: freshUpdatedState.totalTradesTaken,
          lastUpdated: freshUpdatedState.lastUpdated,
        });
      } else {
        tx.set(stateRef, freshUpdatedState);
      }
    });

    await logMirrorEvent(db, {
      action: ATTACH_LOG_KEYS.mirrorOpened,
      details: `[CRYPTO_MIRROR] ${parent.side} ${parent.symbol} mirrored (parent=${parentSimTradeId}, source=${parentSource}, mode=${gate.attachMode}) | size=$${sizing.size} lev=${sizing.leverage}x risk=${(cryptoSettings.riskPerTradePct * 100).toFixed(2)}%`,
      symbol: parent.symbol,
      signalId: mirrorSignalId,
      capital: cryptoState.capital - mirrorTrade.fees,
      now,
    });

    return {
      fired: true,
      mirrorDocId,
      mirrorSignalId,
      attachMode: gate.attachMode,
      capitalAfter: cryptoState.capital - mirrorTrade.fees,
      size: sizing.size,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // RACE_DUPLICATE is the txn losing to another concurrent caller
    // that created the same mirror — fold into DUPLICATE so the caller
    // doesn't treat it as an error.
    if (msg === "RACE_DUPLICATE") {
      return {
        fired: false,
        reason: "DUPLICATE",
        detail: "concurrent caller created the mirror first",
      };
    }
    await logMirrorEvent(db, {
      action: ATTACH_LOG_KEYS.mirrorOpenError,
      details: `[CRYPTO_MIRROR] open threw for parent=${parentSimTradeId}: ${msg}. Parent zone trade unaffected.`,
      symbol: parent.symbol,
      signalId: parent.signalId,
      capital: null,
      now,
    });
    return { fired: false, reason: "OPEN_THREW", detail: msg };
  }
}

function resolveCryptoMaxOpenTrades(
  settings: SimBotSettings,
  state: SimulatorState,
): number {
  const streakActive =
    (state.consecutiveWins ?? 0) >= (settings.streakWinsToScale ?? SIM_CONFIG.STREAK_WINS_TO_SCALE);
  if (streakActive && settings.maxOpenTradesStreakCap != null) {
    return Math.max(settings.maxOpenTrades, settings.maxOpenTradesStreakCap);
  }
  return settings.maxOpenTrades;
}

// ─── Cascade close (orchestrated) ───────────────────────────────────

export interface MirrorReconcileResult {
  scanned: number;
  closed: number;
  errors: string[];
}

/** Sweep open mirror sim trades and close those whose parent zone
 *  trade has already closed for a non-TP/SL reason. Idempotent —
 *  safe to call from every `sync-zone-bots` tick. */
export async function reconcileMirrorCloses(args: {
  db: Firestore;
  now: number;
}): Promise<MirrorReconcileResult> {
  const { db, now } = args;
  const errors: string[] = [];

  let openMirrors: { ref: MirrorTradeRef; full: SimTrade }[] = [];
  try {
    const openSnap = await db
      .collection("simulator_trades")
      .where("status", "==", "OPEN")
      .where("assetType", "==", "CRYPTO")
      .get();
    openMirrors = openSnap.docs
      .map((d) => {
        const data = d.data() as SimTrade;
        return { id: d.id, data };
      })
      .filter(({ data }) => typeof data.attachedFrom === "string" && typeof data.parentSimTradeId === "string")
      .map(({ id, data }) => ({
        ref: {
          id,
          parentSimTradeId: data.parentSimTradeId as string,
          status: "OPEN" as const,
          attachedFrom: data.attachedFrom as string,
        },
        full: { ...data, id },
      }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { scanned: 0, closed: 0, errors: [`open-mirror scan failed: ${msg}`] };
  }

  if (openMirrors.length === 0) {
    return { scanned: 0, closed: 0, errors };
  }

  const parentIds = Array.from(new Set(openMirrors.map((m) => m.ref.parentSimTradeId)));
  const parentRefs = new Map<string, ParentTradeRef>();
  const parentFull = new Map<string, SimTrade>();

  // Firestore `in` is capped at 30 values per query — batch defensively.
  const IN_BATCH = 25;
  try {
    for (let i = 0; i < parentIds.length; i += IN_BATCH) {
      const slice = parentIds.slice(i, i + IN_BATCH);
      const parentSnap = await db
        .collection("simulator_trades")
        .where("__name__", "in", slice)
        .get();
      for (const doc of parentSnap.docs) {
        const data = doc.data() as SimTrade;
        parentRefs.set(doc.id, {
          id: doc.id,
          status: (data.status as "OPEN" | "CLOSED") ?? "OPEN",
          closeReason: data.closeReason ?? null,
          currentPrice: typeof data.currentPrice === "number" ? data.currentPrice : null,
          closedAt: data.closedAt ?? null,
        });
        parentFull.set(doc.id, { ...data, id: doc.id });
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`parent fetch failed: ${msg}`);
    return { scanned: openMirrors.length, closed: 0, errors };
  }

  const actions = planMirrorCascades(
    openMirrors.map((m) => m.ref),
    parentRefs,
  );

  let closed = 0;
  for (const action of actions) {
    const mirror = openMirrors.find((m) => m.ref.id === action.mirrorId);
    const parent = parentFull.get(action.parentId);
    if (!mirror || !parent) continue;
    try {
      const exitPrice =
        action.exitPrice ?? mirror.full.currentPrice ?? mirror.full.entryPrice;
      await closeMirrorWithCascade({
        db,
        mirror: mirror.full,
        parent,
        exitPrice,
        reason: action.reason,
        now,
      });
      closed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`mirror ${action.mirrorId}: ${msg}`);
      await logMirrorEvent(db, {
        action: ATTACH_LOG_KEYS.mirrorCascadeError,
        details: `[CRYPTO_MIRROR] cascade-close threw for mirror=${action.mirrorId} parent=${action.parentId}: ${msg}`,
        symbol: mirror.full.symbol,
        signalId: mirror.full.signalId,
        capital: null,
        now,
      }).catch(() => {});
    }
  }

  return { scanned: openMirrors.length, closed, errors };
}

async function closeMirrorWithCascade(args: {
  db: Firestore;
  mirror: SimTrade;
  parent: SimTrade;
  exitPrice: number;
  reason: string;
  now: number;
}): Promise<void> {
  const { db, mirror, parent, exitPrice, reason, now } = args;
  if (!mirror.id) throw new Error("mirror missing doc id");

  const mirrorRef = db.collection("simulator_trades").doc(mirror.id);
  const stateRef = db
    .collection("config")
    .doc(getSimStateDocId(mirror.assetType ?? "CRYPTO"));

  let netPnl = 0;
  let totalRealized = 0;
  let newCapital = 0;
  let didFlip = false;

  await db.runTransaction(async (tx) => {
    const freshSnap = await tx.get(mirrorRef);
    if (!freshSnap.exists) return;
    const fresh = freshSnap.data() as SimTrade;
    if (fresh.status !== "OPEN") return;

    const freshStateSnap = await tx.get(stateRef);
    const freshState: SimulatorState = freshStateSnap.exists
      ? checkDailyReset(freshStateSnap.data() as SimulatorState)
      : createInitialState(fresh.assetType ?? "CRYPTO");

    const unrealized = computeUnrealizedPnl({ ...fresh, id: mirror.id }, exitPrice);
    const exitFee =
      fresh.positionSize * fresh.remainingPct * SIM_CONFIG.EXCHANGE_FEE;
    netPnl = unrealized - exitFee;
    totalRealized = fresh.realizedPnl + netPnl;
    newCapital = freshState.capital + netPnl;

    const closeEvent = {
      // SimTradeEvent's union doesn't include a cascade-specific type
      // — re-using "SL" keeps the equity-curve / fee accounting paths
      // working with no schema changes. The real reason is stamped on
      // `closeReason` for audit.
      type: "SL" as const,
      price: exitPrice,
      pnl: netPnl,
      fee: exitFee,
      closePct: fresh.remainingPct,
      timestamp: new Date(now).toISOString(),
    };

    tx.update(mirrorRef, {
      status: "CLOSED",
      closedAt: new Date(now).toISOString(),
      closeReason: reason,
      currentPrice: exitPrice,
      unrealizedPnl: 0,
      remainingPct: 0,
      realizedPnl: totalRealized,
      fees: fresh.fees + exitFee,
      capitalAfter: newCapital,
      events: [...(fresh.events || []), closeEvent],
    });

    const stateUpdate: Record<string, unknown> = {
      capital: newCapital,
      dailyPnl: (freshState.dailyPnl ?? 0) + netPnl,
      dailyFees: (freshState.dailyFees ?? 0) + exitFee,
      totalRealizedPnl: (freshState.totalRealizedPnl ?? 0) + netPnl,
      totalFeesPaid: (freshState.totalFeesPaid ?? 0) + exitFee,
      lastUpdated: new Date(now).toISOString(),
    };
    if (totalRealized >= 0) {
      stateUpdate.totalWins = (freshState.totalWins ?? 0) + 1;
    } else {
      stateUpdate.totalLosses = (freshState.totalLosses ?? 0) + 1;
    }

    if (freshStateSnap.exists) {
      tx.update(stateRef, stateUpdate);
    } else {
      tx.set(stateRef, { ...freshState, ...stateUpdate });
    }
    didFlip = true;
  });

  if (!didFlip) return;

  await markTradeForBlockchain(db, mirror.id).catch((e) => {
    console.error(
      "[crypto-bot-attach-mirror] blockchain queue failed:",
      e instanceof Error ? e.message : String(e),
    );
  });

  await logMirrorEvent(db, {
    action: ATTACH_LOG_KEYS.mirrorCascadeClosed,
    details: `[CRYPTO_MIRROR] ${mirror.symbol} ${mirror.side} cascade-closed @ $${exitPrice} (parent=${parent.id}, parentClose=${parent.closeReason ?? "?"}) | netPnl=$${netPnl.toFixed(2)} capital=$${newCapital.toFixed(2)}`,
    symbol: mirror.symbol,
    signalId: mirror.signalId,
    capital: newCapital,
    pnl: netPnl,
    now,
  });
}

async function logMirrorEvent(
  db: Firestore,
  args: {
    action: string;
    details: string;
    symbol: string;
    signalId: string;
    capital: number | null;
    pnl?: number;
    now: number;
  },
): Promise<void> {
  try {
    await db.collection("simulator_logs").add({
      timestamp: new Date(args.now).toISOString(),
      action: args.action,
      details: args.details,
      signalId: args.signalId,
      symbol: args.symbol,
      capital: args.capital,
      pnl: args.pnl,
      assetType: "CRYPTO",
    });
  } catch (e) {
    console.warn(
      "[crypto-bot-attach-mirror] log write failed:",
      e instanceof Error ? e.message : String(e),
    );
  }
}
