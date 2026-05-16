/**
 * /api/cron/sync-zone-bots
 *
 * Heartbeat for the zone-bot family (Phase 1: BTC only). Every 15 min:
 *   1. Per registered asset (currently just BTC):
 *      a. Load per-asset settings + state.
 *      b. Read latest spot from config/exchange_prices.
 *      c. Compute fresh Deribit-OI zones via computeOptionsZones.
 *      d. Persist them at config/suggested_zones_${asset}.
 *      e. Append spot to the rolling price-history window.
 *      f. Call evaluateZoneBot (pure state-machine engine).
 *      g. Execute the returned action:
 *           NONE  → just save state
 *           OPEN  → create a simulator_trades row (stamped botSource)
 *           CLOSE → mark the open simulator_trades row CLOSED
 *           FLIP  → close + open
 *      h. Save state.
 *   2. Return per-asset summaries for cron-job.org logging.
 *
 * ───────────────────────────────────────────────────────────────────────
 * Cron-job.org setup (one-time, after first deploy):
 * ───────────────────────────────────────────────────────────────────────
 *   URL      : https://tezterminal.com/api/cron/sync-zone-bots?key=<CRON_SECRET>
 *   Method   : GET
 *   Schedule : every 15 min   (cron expr: "  * /15 * * * *  ")
 *   Timeout  : 60 s   (apphosting.yaml allows up to 120 s)
 *
 * Until that cron job is created, this endpoint runs only when triggered
 * manually (the POST variant below, no key required) — i.e., the new
 * code path is fully dormant in production.
 *
 * ───────────────────────────────────────────────────────────────────────
 * Safety
 * ───────────────────────────────────────────────────────────────────────
 *   - Live mirroring is OPT-IN per user, per bot. executeForAllUsers
 *     receives `botSource: ZONE_BOT_SOURCE[asset]`; users only receive
 *     mirrored trades if their secrets doc has
 *     `zoneBotsEnabled.<asset> === true`. Default false → zero existing
 *     pattern-bot users get auto-enrolled.
 *   - Trades are stamped botSource = ZONE_BOT_SOURCE[asset] so the
 *     existing sync-simulator force-close branches (added in PR #3) skip
 *     them. Pattern-bot trades are completely unaffected.
 *   - sync-live-trades (1-min cron) mirrors the eventual zone-bot SIM
 *     close to live by extending its closeReason whitelist
 *     (`ZONE_BOT_FLIP`, `ZONE_BOT_MAX_PAIN_EXIT`) — same protective-
 *     close path used for TRAILING_SL.
 *   - Default settings = AUTO, but ZONE_BOT_REGISTRY only contains "btc"
 *     and nothing fires until cron-job.org actually starts hitting the
 *     endpoint AND at least one user has opted in.
 *
 * See `docs/zone-bots.md` for the full design.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { deserializePrices } from "@/lib/exchanges";
import { getLeverage } from "@/lib/leverage";
import { computeOptionsZones } from "@/lib/options-zones";
import { executeForAllUsers } from "@/lib/live-execution";
import {
  SIM_CONFIG,
  type SimConfigType,
  type SimTrade,
  type SimulatorState,
  type SimLog,
  getEffectiveSimConfig,
  getSimStateDocId,
  createInitialState,
  openTrade,
  processTradeExit,
} from "@/lib/simulator";
import {
  loadZoneBotSettings,
  ZONE_BOT_REGISTRY,
  ZONE_BOT_PERP_SYMBOL,
  ZONE_BOT_SOURCE,
  type ZoneBotAsset,
  type ZoneBotSettings,
} from "@/lib/zone-bot-config";
import {
  appendZoneBotPriceHistory,
  loadZoneBotState,
  saveZoneBotState,
  type ZoneBotState,
} from "@/lib/zone-bot-state";
import {
  evaluateZoneBot,
  type ZoneBotAction,
  type ZoneBotSuggestedZones,
} from "@/lib/zone-bot-engine";

export const dynamic     = "force-dynamic";
export const maxDuration = 60;

const CRON_SECRET = process.env.CRON_SECRET;

// ── Per-asset summary returned to cron-job.org ──────────────────────────

interface AssetTickResult {
  asset:       ZoneBotAsset;
  ok:          boolean;
  spot:        number | null;
  action:      ZoneBotAction["type"] | "ERROR";
  reason:      string;
  openTradeId: string | null;
  error?:      string;
}

// ── Spot price helpers ──────────────────────────────────────────────────

type PricesView = ReturnType<typeof deserializePrices>;

async function loadSpotPrices(db: FirebaseFirestore.Firestore): Promise<PricesView | null> {
  try {
    const snap = await db.doc("config/exchange_prices").get();
    if (!snap.exists) return null;
    return deserializePrices(snap.data() as Record<string, Record<string, number>>);
  } catch {
    return null;
  }
}

function spotForAsset(prices: PricesView | null, asset: ZoneBotAsset): number | null {
  if (!prices) return null;
  const sym = ZONE_BOT_PERP_SYMBOL[asset];
  return (
    prices.BYBIT?.get(sym) ??
    prices.BINANCE?.get(sym) ??
    null
  );
}

// ── Suggested zones persistence ─────────────────────────────────────────

async function computeAndPersistZones(
  db:       FirebaseFirestore.Firestore,
  asset:    ZoneBotAsset,
  spot:     number,
  settings: ZoneBotSettings,
): Promise<ZoneBotSuggestedZones | null> {
  // Compute fresh Deribit-OI zones with per-asset config so the
  // strike-selection filter (skip strikes near today's max pain) and
  // half-width both come from the user's settings rather than the global
  // pattern-bot ones.
  try {
    const result = await computeOptionsZones(spot, {
      zoneHalfWidthUsd:      settings.zoneHalfWidthUsd,
      maxPainMinDistanceUsd: settings.maxPainMinDistanceUsd,
    });

    // Full snapshot in Firestore so the UI can render the max-pain table
    // and zone bands without re-computing. We re-use the same shape that
    // suggest-zones writes to config/suggested_zones for consistency.
    const doc = {
      asset,
      bullStrike:        result.bullStrike,
      bearStrike:        result.bearStrike,
      bullZoneLow:       result.bullZoneLow,
      bullZoneHigh:      result.bullZoneHigh,
      bullExitAbove:     result.bullExitAbove,
      bearZoneLow:       result.bearZoneLow,
      bearZoneHigh:      result.bearZoneHigh,
      bearExitBelow:     result.bearExitBelow,
      bullOI:            result.bullOI,
      bearOI:            result.bearOI,
      maxPain:           result.maxPain,
      maxPainByExpiry:   result.maxPainByExpiry,
      signalConflict:    result.signalConflict,
      bullTpTarget:      result.bullTpTarget,
      bullTpExpiry:      result.bullTpExpiry,
      bullTpConfidence:  result.bullTpConfidence,
      bearTpTarget:      result.bearTpTarget,
      bearTpExpiry:      result.bearTpExpiry,
      bearTpConfidence:  result.bearTpConfidence,
      expiryUsed:        result.expiryUsed,
      expiriesUsed:      result.expiriesUsed,
      expiryOI:          result.expiryOI,
      insufficientGap:   result.insufficientGap,
      btcPrice:          result.btcPrice,
      deribitIndexPrice: result.deribitIndexPrice,
      source:            "deribit",
      computedAt:        result.computedAt,
    };

    await db.doc(`config/suggested_zones_${asset}`).set(doc);

    // Engine only needs a narrow slice — return that view.
    return {
      bullZoneLow:   result.bullZoneLow,
      bullZoneHigh:  result.bullZoneHigh,
      bullExitAbove: result.bullExitAbove,
      bearZoneHigh:  result.bearZoneHigh,
      bearZoneLow:   result.bearZoneLow,
      bearExitBelow: result.bearExitBelow,
      maxPain:       result.maxPain,
      computedAt:    result.computedAt,
    };
  } catch (err) {
    console.error(`[ZoneBot:${asset}] computeOptionsZones failed:`, err);
    // Fall back to the last persisted snapshot so the engine still gets
    // *some* zones (just stale by one tick). On extended outages the
    // engine's own staleness gate (>12h) eventually shuts the bot off.
    try {
      const snap = await db.doc(`config/suggested_zones_${asset}`).get();
      if (!snap.exists) return null;
      const d = snap.data() as Record<string, unknown>;
      return {
        bullZoneLow:   typeof d.bullZoneLow   === "number" ? d.bullZoneLow   : null,
        bullZoneHigh:  typeof d.bullZoneHigh  === "number" ? d.bullZoneHigh  : null,
        bullExitAbove: typeof d.bullExitAbove === "number" ? d.bullExitAbove : null,
        bearZoneHigh:  typeof d.bearZoneHigh  === "number" ? d.bearZoneHigh  : null,
        bearZoneLow:   typeof d.bearZoneLow   === "number" ? d.bearZoneLow   : null,
        bearExitBelow: typeof d.bearExitBelow === "number" ? d.bearExitBelow : null,
        maxPain:       typeof d.maxPain       === "number" ? d.maxPain       : null,
        computedAt:    typeof d.computedAt    === "string" ? d.computedAt    : "",
      };
    } catch {
      return null;
    }
  }
}

// ── SimulatorState load / save ─────────────────────────────────────────

async function loadCryptoSimState(db: FirebaseFirestore.Firestore): Promise<SimulatorState> {
  try {
    const snap = await db.doc(`config/${getSimStateDocId("CRYPTO")}`).get();
    if (snap.exists) return snap.data() as SimulatorState;
  } catch {
    /* fall through to initial state */
  }
  return createInitialState("CRYPTO");
}

async function saveCryptoSimState(
  db: FirebaseFirestore.Firestore,
  state: SimulatorState,
): Promise<void> {
  await db.doc(`config/${getSimStateDocId("CRYPTO")}`).set(state);
}

// ── Position sizing ─────────────────────────────────────────────────────

interface PositionSizeResult {
  size: number;
  leverage: number;
  skip: boolean;
  reason?: string;
}

function computePositionSize(
  state:       SimulatorState,
  cfg:         SimConfigType,
  entryPrice:  number,
  stopLoss:    number,
  timeframe:   string = "60",
): PositionSizeResult {
  const leverage = getLeverage(timeframe, "CRYPTO");
  const slDist   = Math.abs(entryPrice - stopLoss);
  if (slDist <= 0 || leverage <= 0) {
    return { size: 0, leverage, skip: true, reason: "slDist or leverage non-positive" };
  }

  const hasStreak  = (state.consecutiveWins ?? 0) >= cfg.STREAK_WINS_TO_SCALE;
  const riskPct    = hasStreak ? cfg.RISK_PER_TRADE_STREAK : cfg.RISK_PER_TRADE_BASE;
  let   posNotional = (state.capital * riskPct) / (slDist * leverage);

  // Hard cap at 5% of capital — same guardrail used by the legacy zone
  // block in sync-simulator. Prevents a tiny SL distance from blowing up
  // notional size beyond the trader's intended exposure.
  const hardCap = state.capital * 0.05;
  if (posNotional > hardCap) posNotional = hardCap;

  posNotional = Math.round(posNotional * 100) / 100;
  if (posNotional < 1) {
    return { size: posNotional, leverage, skip: true, reason: `size $${posNotional.toFixed(2)} < $1 floor` };
  }
  return { size: posNotional, leverage, skip: false };
}

// ── Trade open / close primitives ───────────────────────────────────────

const ZONE_BOT_ALGO     = "ZONE_BOT";
const ZONE_BOT_BIAS_BTC: Record<ZoneBotAsset, string> = {
  btc: "BTC_ZONE",
};

function makeZoneSignalId(asset: ZoneBotAsset, now: number): string {
  return `zone-bot-${asset}-${now}`;
}

async function openZoneBotTrade(args: {
  db:         FirebaseFirestore.Firestore;
  asset:      ZoneBotAsset;
  state:      SimulatorState;
  simConfig:  SimConfigType;
  action:     Extract<ZoneBotAction, { type: "OPEN" } | { type: "FLIP" }>;
  now:        number;
}): Promise<{ tradeId: string; updatedState: SimulatorState; log: SimLog; sizing: PositionSizeResult }> {
  const { db, asset, state, simConfig, action, now } = args;

  // OPEN uses `.side`, FLIP uses `.openSide`; the rest of the trade params
  // share names across both variants of the union.
  const side = action.type === "OPEN" ? action.side : action.openSide;
  const { entryPrice, stopLoss, tp1, tp2, tp3 } = action;

  const sizing = computePositionSize(state, simConfig, entryPrice, stopLoss);
  if (sizing.skip) {
    // Caller decides what to do — typically just log and keep state.
    return { tradeId: "", updatedState: state, log: {
      timestamp: new Date(now).toISOString(),
      action: "TRADE_SKIPPED",
      details: `[${ZONE_BOT_SOURCE[asset]}] ${side} skipped — ${sizing.reason}`,
      symbol: `${ZONE_BOT_PERP_SYMBOL[asset]}.P`,
      capital: state.capital,
      assetType: "CRYPTO",
    }, sizing };
  }

  const signalId = makeZoneSignalId(asset, now);
  const result = openTrade({
    signal: {
      id:              signalId,
      symbol:          `${ZONE_BOT_PERP_SYMBOL[asset]}.P`,
      exchange:        "BYBIT",
      assetType:       "CRYPTO",
      type:            side,
      timeframe:       "60",
      algo:            ZONE_BOT_ALGO,
      price:           entryPrice,
      stopLoss:        Math.round(stopLoss),
      tp1:             Math.round(tp1),
      tp2:             Math.round(tp2),
      tp3:             Math.round(tp3),
      confidenceScore: 75,
      scorePattern:    "none",
      scoreBreakdown:  undefined,
    },
    positionSize:  sizing.size,
    state,
    bullScore:     0,
    bearScore:     0,
    liveWinRate:   0,
    algoWinRate:   0,
    directionBias: ZONE_BOT_BIAS_BTC[asset] as "BULL" | "BEAR" | "BOTH",
  });

  // Stamp botSource so PR #3's guards in sync-simulator skip this trade
  // for zone-flip / max-pain-proximity force-closes (zone bot owns its own
  // lifecycle decisions).
  const tradeWithSource: SimTrade = { ...result.trade, botSource: ZONE_BOT_SOURCE[asset] };

  const docId = `sim-${signalId}`;
  await db.collection("simulator_trades").doc(docId).set(tradeWithSource);

  // Decorate the log so it's easy to grep zone-bot activity in
  // simulator_logs without scrolling through every pattern-signal event.
  const decoratedLog: SimLog = {
    ...result.log,
    details: `[${ZONE_BOT_SOURCE[asset]}] ${result.log.details}`,
  };
  await db.collection("simulator_logs").add(decoratedLog);

  // Mirror to live exchanges for any user who has explicitly opted into
  // this specific zone bot (zoneBotsEnabled.<asset> === true).
  // executeForAllUsers internally:
  //   • skips users whose secrets doc lacks the opt-in
  //   • runs per-user with Promise.allSettled (one failure doesn't bleed)
  //   • emergency-closes exchange positions whose Firestore write fails
  //
  // Best-effort: any throw here is swallowed so the sim trade record
  // stays consistent (the live side has its own per-user error logs
  // under live_trade_logs, and sync-live-trades will reconcile state on
  // the next 1-min tick).
  try {
    await executeForAllUsers(
      db,
      tradeWithSource,
      docId,
      result.updatedState.capital,
      signalId,
      tradeWithSource.symbol,
      side,
      "BYBIT",
      simConfig,
      ZONE_BOT_SOURCE[asset], // gates which users mirror this trade
    );
  } catch (e) {
    await db.collection("simulator_logs").add({
      timestamp: new Date(now).toISOString(),
      action: "ZONE_BOT_LIVE_MIRROR_FAILED",
      details: `[${ZONE_BOT_SOURCE[asset]}] live mirror call threw: ${e instanceof Error ? e.message : String(e)}. Sim trade ${docId} unaffected.`,
      symbol: tradeWithSource.symbol,
      capital: result.updatedState.capital,
      assetType: "CRYPTO",
    }).catch(() => {});
  }

  return { tradeId: docId, updatedState: result.updatedState, log: decoratedLog, sizing };
}

async function closeZoneBotTrade(args: {
  db:         FirebaseFirestore.Firestore;
  asset:      ZoneBotAsset;
  tradeId:    string;
  state:      SimulatorState;
  simConfig:  SimConfigType;
  spot:       number;
  reason:     string;
  /** "SL" for forced exits (FLIP and max-pain proximity — both intend
   *  a full position exit, not a TP1-style partial). Kept as a union
   *  for forward compat with possible future partial-exit reasons. */
  exitType:   "SL" | "TP1";
}): Promise<{ updatedState: SimulatorState; log: SimLog | null }> {
  const { db, asset, tradeId, state, simConfig, spot, reason, exitType } = args;

  const snap = await db.collection("simulator_trades").doc(tradeId).get();
  if (!snap.exists) {
    // Trade doc already gone (manual cleanup, race, etc.). Clear our state
    // reference and move on.
    return { updatedState: state, log: null };
  }
  const trade = { id: snap.id, ...(snap.data() as SimTrade) };

  if (trade.status !== "OPEN") {
    // Already closed by sync-simulator (e.g. SL hit between cron ticks).
    return { updatedState: state, log: null };
  }

  const exitResult = processTradeExit({
    trade,
    state,
    exitType,
    exitPrice: spot,
    simConfig,
  });

  if (!exitResult) {
    return { updatedState: state, log: null };
  }

  const { id: _id, ...fields } = exitResult.updatedTrade;
  await db.collection("simulator_trades").doc(tradeId).update({
    ...fields,
    closeReason: reason,
  });

  const decoratedLog: SimLog = {
    ...exitResult.log,
    action: reason,
    details: `[${ZONE_BOT_SOURCE[asset]}] ${trade.symbol} ${trade.side} closed @ $${spot} — ${reason}`,
  };
  await db.collection("simulator_logs").add(decoratedLog);

  return { updatedState: exitResult.updatedState, log: decoratedLog };
}

// ── Reality-sync helper ─────────────────────────────────────────────────

/** Clears state.openTradeId if the underlying simulator_trades doc is
 *  missing or already CLOSED. The engine treats `openTradeId != null` as
 *  "we're in a position", so a stale id would freeze the bot in HAS-OPEN
 *  mode even after sync-simulator has fully exited the trade. */
async function reconcileOpenTradeId(
  db:    FirebaseFirestore.Firestore,
  state: ZoneBotState,
): Promise<ZoneBotState> {
  if (!state.openTradeId) return state;
  try {
    const snap = await db.collection("simulator_trades").doc(state.openTradeId).get();
    if (!snap.exists)                                    return { ...state, openTradeId: null };
    const status = (snap.data() as SimTrade).status;
    if (status === "CLOSED")                             return { ...state, openTradeId: null };
    return state;
  } catch {
    // On a transient read error, keep the existing id — better to skip
    // a tick than to lose the reference and accidentally open a parallel
    // trade.
    return state;
  }
}

// ── Per-asset tick ──────────────────────────────────────────────────────

async function tickAsset(
  db:        FirebaseFirestore.Firestore,
  asset:     ZoneBotAsset,
  prices:    PricesView | null,
  simConfig: SimConfigType,
  now:       number,
): Promise<AssetTickResult> {
  try {
    const settings = await loadZoneBotSettings(db, asset);
    const spot     = spotForAsset(prices, asset);

    if (spot == null) {
      // Persist a "no price" reason on state so the UI shows it.
      const state = await loadZoneBotState(db, asset);
      const next: ZoneBotState = { ...state, reason: "OFF — no spot price feed", updatedAt: new Date(now).toISOString() };
      await saveZoneBotState(db, asset, next);
      return { asset, ok: true, spot: null, action: "NONE", reason: next.reason, openTradeId: state.openTradeId };
    }

    // Append spot to rolling history BEFORE evaluating so the engine sees
    // the latest sample.
    const loadedState = await loadZoneBotState(db, asset);

    // Reality-sync openTradeId: sync-simulator's per-tick TP/SL price
    // checks may have closed the trade between zone-bot cron runs. The
    // engine is pure (no DB calls), so we patch state here. If the trade
    // doc is missing OR already CLOSED, clear the reference so the engine
    // doesn't think we're still in a position.
    const prevState: ZoneBotState = await reconcileOpenTradeId(db, loadedState);

    const history = appendZoneBotPriceHistory(prevState.priceHistory, spot, now);

    // Compute zones (and persist the snapshot). If this fails we fall back
    // to the last persisted suggestion to avoid a single Deribit hiccup
    // turning every zone bot off.
    const suggested = await computeAndPersistZones(db, asset, spot, settings);

    const { nextState, action } = evaluateZoneBot({
      asset,
      spot,
      suggested,
      settings,
      state:   prevState,
      history,
      now,
    });

    let workingSimState  = await loadCryptoSimState(db);
    const workingState   = { ...nextState }; // we'll patch openTradeId below

    switch (action.type) {
      case "NONE": {
        break;
      }

      case "OPEN": {
        const opened = await openZoneBotTrade({
          db, asset, state: workingSimState, simConfig, action, now,
        });
        if (opened.tradeId) {
          workingState.openTradeId = opened.tradeId;
          workingSimState = opened.updatedState;
          await saveCryptoSimState(db, workingSimState);
        } else {
          // sizing.skip — engine wanted to open but we can't (size < $1).
          // Log it and keep state IDLE so we re-evaluate next tick.
          await db.collection("simulator_logs").add(opened.log);
          workingState.openTradeId = null;
          workingState.reason = `${asset.toUpperCase()} confirmed — open skipped (${opened.sizing.reason})`;
        }
        break;
      }

      case "CLOSE": {
        if (prevState.openTradeId) {
          // Max-pain-proximity exit: zone bot wants the position FULLY
          // out, so use SL (100% close), not TP1 (20%). The closeReason
          // tag tells humans/downstream what actually triggered it.
          const closed = await closeZoneBotTrade({
            db, asset, tradeId: prevState.openTradeId, state: workingSimState, simConfig, spot,
            reason: "ZONE_BOT_MAX_PAIN_EXIT", exitType: "SL",
          });
          workingSimState = closed.updatedState;
          if (closed.log) await saveCryptoSimState(db, workingSimState);
        }
        workingState.openTradeId = null;
        break;
      }

      case "FLIP": {
        if (prevState.openTradeId) {
          const closed = await closeZoneBotTrade({
            db, asset, tradeId: prevState.openTradeId, state: workingSimState, simConfig, spot,
            reason: "ZONE_BOT_FLIP", exitType: "SL",
          });
          workingSimState = closed.updatedState;
          if (closed.log) await saveCryptoSimState(db, workingSimState);
        }
        const opened = await openZoneBotTrade({
          db, asset, state: workingSimState, simConfig, action, now,
        });
        if (opened.tradeId) {
          workingState.openTradeId = opened.tradeId;
          workingSimState = opened.updatedState;
          await saveCryptoSimState(db, workingSimState);
        } else {
          await db.collection("simulator_logs").add(opened.log);
          workingState.openTradeId = null;
          workingState.reason = `FLIP close OK, open skipped (${opened.sizing.reason})`;
        }
        break;
      }
    }

    await saveZoneBotState(db, asset, workingState);
    return {
      asset,
      ok: true,
      spot,
      action: action.type,
      reason: workingState.reason,
      openTradeId: workingState.openTradeId,
    };
  } catch (err) {
    console.error(`[ZoneBot:${asset}] tick failed:`, err);
    return {
      asset,
      ok: false,
      spot: null,
      action: "ERROR",
      reason: "tick threw",
      openTradeId: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Cron entry points ───────────────────────────────────────────────────

async function run(db: FirebaseFirestore.Firestore): Promise<AssetTickResult[]> {
  // Load shared SimConfig once.
  let simConfig: SimConfigType = SIM_CONFIG;
  try {
    const paramsDoc = await db.doc("config/simulator_params").get();
    if (paramsDoc.exists) {
      simConfig = getEffectiveSimConfig(paramsDoc.data() as Partial<Record<keyof SimConfigType, number>>);
    }
  } catch {
    /* fall back to SIM_CONFIG defaults */
  }

  const prices = await loadSpotPrices(db);
  const now    = Date.now();

  // Per-asset ticks run sequentially for safety — they share the CRYPTO
  // SimulatorState ledger, and concurrent writes from two assets could
  // race. With only 1 asset in v1 the sequential cost is zero; even at
  // 4 assets it's still well under the 60s cron timeout.
  const results: AssetTickResult[] = [];
  for (const asset of ZONE_BOT_REGISTRY) {
    results.push(await tickAsset(db, asset, prices, simConfig, now));
  }
  return results;
}

// GET — called by cron-job.org with ?key=CRON_SECRET (see header comment).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (CRON_SECRET && key !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const db = getAdminFirestore();
    const results = await run(db);
    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error("[SyncZoneBots] Failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// POST — manual trigger from a "Refresh" button or admin tool. No auth
// required because it's only callable by an authenticated session in
// the same origin (browser CSRF surface is small — same headers checked
// elsewhere can be added later if needed).
export async function POST(_request: NextRequest) {
  try {
    const db = getAdminFirestore();
    const results = await run(db);
    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error("[SyncZoneBots] Failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
