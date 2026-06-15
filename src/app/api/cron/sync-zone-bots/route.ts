/**
 * /api/cron/sync-zone-bots — "Multi-Asset Zone Bots" engine tick.
 *
 * Cheap-per-call heartbeat for the zone-bot family. Per registered asset:
 *   1. Load per-asset settings + state.
 *   2. Read latest spot from config/exchange_prices.
 *   3. READ the latest zones from config/suggested_zones (BTC) or
 *      config/suggested_zones_${asset} (future ETH/SOL). NO Deribit call —
 *      zones are computed once every 15 min by the separate `suggest-zones`
 *      cron ("Auto Zones" on cron-job.org). This route is purely consumer.
 *   4. Append spot to the rolling price-history window.
 *   5. Call evaluateZoneBot (pure state-machine engine).
 *   6. Execute the returned action:
 *        NONE  → just save state
 *        OPEN  → create a simulator_trades row + mirror to live exchanges
 *        CLOSE → mark the open simulator_trades row CLOSED
 *        FLIP  → close + open
 *   7. Save state.
 *
 * ───────────────────────────────────────────────────────────────────────
 * 2026-05-19 architecture change
 * ───────────────────────────────────────────────────────────────────────
 *   BEFORE: this route fetched the full Deribit option chain on every
 *   tick (~3-5s), wrote `config/suggested_zones_${asset}`, then ran the
 *   engine. With cron at every 15min that's 96 fetches/day. Worse,
 *   because each tick appended exactly 1 price sample, the engine's
 *   confirmation gate (needs ≥7 samples in 15min) could never pass
 *   and the bot was effectively dead.
 *
 *   AFTER: the Deribit fetch lives entirely in `/api/cron/suggest-zones`
 *   ("Auto Zones" cron, every 15min). This route just reads that doc and
 *   runs the engine. Per-tick cost is now ~300ms (mostly Firestore round
 *   trips), so cron-job.org can safely run this every minute. With 1-min
 *   cadence the price history accumulates fast enough for confirmation
 *   to actually fire.
 *
 * ───────────────────────────────────────────────────────────────────────
 * Cron-job.org setup
 * ───────────────────────────────────────────────────────────────────────
 *   Title    : Multi-Asset Zone Bots
 *   URL      : https://tezterminal.com/api/cron/sync-zone-bots?key=<CRON_SECRET>
 *   Method   : GET
 *   Schedule : every 1 min   (cron expr: "  * * * * *  ")
 *   Timeout  : 30 s
 *
 *   Paired with:
 *   Title    : Auto Zones
 *   URL      : .../api/cron/suggest-zones?key=...
 *   Schedule : every 15 min
 *
 * ───────────────────────────────────────────────────────────────────────
 * Safety (unchanged from the original design)
 * ───────────────────────────────────────────────────────────────────────
 *   - Live mirroring is OPT-IN per user, per bot. executeForAllUsers
 *     receives `botSource: ZONE_BOT_SOURCE[asset]`; users only receive
 *     mirrored trades if their secrets doc has
 *     `zoneBotsEnabled.<asset> === true`. Default false → zero existing
 *     pattern-bot users get auto-enrolled.
 *   - Trades are stamped botSource = ZONE_BOT_SOURCE[asset] so the
 *     existing sync-simulator force-close branches skip them. Pattern-
 *     bot trades are completely unaffected.
 *   - sync-live-trades mirrors the eventual zone-bot SIM close to live
 *     by extending its closeReason whitelist (`ZONE_BOT_FLIP`,
 *     `ZONE_BOT_FLIP_BLOCKED`).
 *
 * See `docs/zone-bots.md` for the full design.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { markTradeForBlockchain } from "@/lib/blockchain-logger";
import { recordCronHeartbeat } from "@/lib/cron-health";
import { deserializePrices } from "@/lib/exchanges";
import { effectiveCapitalForSizing } from "@/lib/entry-price-sanity";
import { getLeverage } from "@/lib/leverage";
import { executeForAllUsers } from "@/lib/live-execution";
import {
  SIM_CONFIG,
  type SimConfigType,
  type SimTrade,
  type SimulatorState,
  type SimLog,
  getEffectiveSimConfig,
  openTrade,
  processTradeExit,
  rewriteLogLeverage,
} from "@/lib/simulator";
import {
  ZONE_BOT_REGISTRY,
  ZONE_BOT_PERP_SYMBOL,
  ZONE_BOT_SOURCE,
  type ZoneBotAsset,
} from "@/lib/zone-bot-config";
import { canBotOpenMore } from "@/lib/sim-slot-policy";
import { loadSimBotSettings, toZoneBotSettings } from "@/lib/sim-bot-settings";
import {
  ATTACHED_ZONE_BOTS_DEFAULT,
  loadAttachedZoneBots,
  type AttachedZoneBots,
} from "@/lib/crypto-bot-attach";
import {
  openCryptoMirrorForZoneTrade,
  reconcileMirrorCloses,
} from "@/lib/crypto-bot-attach-mirror";
import { fanOutCryptoMirrorLive } from "@/lib/crypto-bot-attach-live";
import {
  appendZoneBotPriceHistory,
  loadZoneBotState,
  loadZoneSimState,
  saveZoneBotState,
  saveZoneSimState,
  type ZoneBotState,
} from "@/lib/zone-bot-state";
import type { BotSourceFilter } from "@/lib/bot-source-filter";
import {
  evaluateZoneBot,
  priceReachedMaxPain,
  resolveDay0MaxPain,
  type ZoneBotAction,
  type ZoneBotSuggestedZones,
} from "@/lib/zone-bot-engine";
import { isZoneBotSource } from "@/lib/bot-source-constants";

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

// ── Suggested zones loader (read-only) ──────────────────────────────────
//
// As of 2026-05-19 this route no longer computes zones itself — the
// `suggest-zones` cron ("Auto Zones") owns that work and writes the
// result every 15 min. We just read the doc here so each engine tick
// is cheap (~1 Firestore read instead of a 3-5s Deribit fetch).
//
// Path strategy:
//   1. Prefer `config/suggested_zones_${asset}` if it exists (the future
//      shape — separate doc per asset once ETH/SOL ship).
//   2. For BTC, fall back to `config/suggested_zones` — the legacy doc
//      that the pattern bot's AUTO mode and the UI already read from
//      today. Single source of truth means we can't drift.

async function loadSuggestedZones(
  db:    FirebaseFirestore.Firestore,
  asset: ZoneBotAsset,
): Promise<ZoneBotSuggestedZones | null> {
  // Try per-asset path first, then fall back to the shared BTC doc.
  const paths = [`config/suggested_zones_${asset}`];
  if (asset === "btc") paths.push("config/suggested_zones");

  for (const path of paths) {
    try {
      const snap = await db.doc(path).get();
      if (!snap.exists) continue;
      const d = snap.data() as Record<string, unknown>;
      return {
        bullStrike:          typeof d.bullStrike    === "number" ? d.bullStrike    : null,
        bearStrike:          typeof d.bearStrike    === "number" ? d.bearStrike    : null,
        bullZoneLow:         typeof d.bullZoneLow   === "number" ? d.bullZoneLow   : null,
        bullZoneHigh:        typeof d.bullZoneHigh  === "number" ? d.bullZoneHigh  : null,
        bullExitAbove:       typeof d.bullExitAbove === "number" ? d.bullExitAbove : null,
        bearZoneHigh:        typeof d.bearZoneHigh  === "number" ? d.bearZoneHigh  : null,
        bearZoneLow:         typeof d.bearZoneLow   === "number" ? d.bearZoneLow   : null,
        bearExitBelow:       typeof d.bearExitBelow === "number" ? d.bearExitBelow : null,
        halfWidthUsd:        typeof d.halfWidthUsd  === "number" ? d.halfWidthUsd  : null,
        maxPain:             typeof d.maxPain       === "number" ? d.maxPain       : null,
        computedAt:          typeof d.computedAt    === "string" ? d.computedAt    : "",
        bullActionable:      typeof d.bullActionable === "boolean" ? d.bullActionable : undefined,
        bearActionable:      typeof d.bearActionable === "boolean" ? d.bearActionable : undefined,
        inPanicRegime:       typeof d.inPanicRegime  === "boolean" ? d.inPanicRegime  : undefined,
        signalConflict:      typeof d.signalConflict === "boolean" ? d.signalConflict : undefined,
        notActionableReason: typeof d.notActionableReason === "string"
                               ? (d.notActionableReason as string) : null,
      };
    } catch (err) {
      console.error(`[ZoneBot:${asset}] loadSuggestedZones read ${path} failed:`, err);
      // Try next path
    }
  }
  return null;
}

// ── SimulatorState load / save ─────────────────────────────────────────

async function loadOpenCryptoTrades(
  db: FirebaseFirestore.Firestore,
): Promise<SimTrade[]> {
  const snap = await db
    .collection("simulator_trades")
    .where("status", "==", "OPEN")
    .where("assetType", "==", "CRYPTO")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SimTrade));
}

// ── Price precision ─────────────────────────────────────────────────────

/** Truncate to 2 decimal places (no round up/down). XRP/SOL need sub-dollar
 *  precision — `Math.round()` collapses ~$1.36 → $1 and breaks SL/TP logic. */
function truncatePrice(price: number): number {
  return Math.trunc(price * 100) / 100;
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
  riskPctOverride?: number,
  leverageOverride?: number,
): PositionSizeResult {
  // Per-bot leverage (user-chosen via Config Sheet, 3/5/10×) overrides the
  // legacy timeframe-keyed default. When unset we fall back to the original
  // `getLeverage("60", "CRYPTO")` value (= 3×) so existing bots that haven't
  // had a leverage saved keep their pre-2026-05-27 behaviour.
  const leverage =
    typeof leverageOverride === "number" &&
    Number.isFinite(leverageOverride) &&
    leverageOverride > 0
      ? leverageOverride
      : getLeverage(timeframe, "CRYPTO");
  const slDist   = Math.abs(entryPrice - stopLoss);
  if (slDist <= 0 || entryPrice <= 0 || leverage <= 0) {
    return { size: 0, leverage, skip: true, reason: "slDist / entryPrice / leverage non-positive" };
  }

  // CRITICAL: SL distance must be expressed as a FRACTION of entry, not a
  // USD value. The formula
  //     positionSize = (capital × riskPct) / (slDistPct × leverage)
  // matches the pattern bot's sizing in src/lib/simulator.ts:660. Earlier
  // versions of this function passed `slDist` (dollars) directly, which
  // made the denominator ~10⁴× too large for BTC and produced sub-$1
  // notionals that always tripped the "< $1 floor" skip — that's why
  // the zone bot was silently missing every BULL confirmation.
  const slDistPct = slDist / entryPrice;

  const hasStreak  = (state.consecutiveWins ?? 0) >= cfg.STREAK_WINS_TO_SCALE;
  const riskPct    =
    riskPctOverride ??
    (hasStreak ? cfg.RISK_PER_TRADE_STREAK : cfg.RISK_PER_TRADE_BASE);
  const sizingCapital = effectiveCapitalForSizing(state);
  let   posNotional = (sizingCapital * riskPct) / (slDistPct * leverage);

  // Hard cap at 5% of capital — same guardrail used by the legacy zone
  // block in sync-simulator. Prevents a tiny SL distance from blowing up
  // notional size beyond the trader's intended exposure.
  const hardCap = sizingCapital * 0.05;
  if (posNotional > hardCap) posNotional = hardCap;

  posNotional = Math.round(posNotional * 100) / 100;
  if (posNotional < 1) {
    return { size: posNotional, leverage, skip: true, reason: `size $${posNotional.toFixed(2)} < $1 floor` };
  }
  return { size: posNotional, leverage, skip: false };
}

// ── Trade open / close primitives ───────────────────────────────────────

const ZONE_BOT_ALGO     = "ZONE_BOT";
const ZONE_BOT_BIAS: Record<ZoneBotAsset, string> = {
  btc: "BTC_ZONE",
  eth: "ETH_ZONE",
  sol: "SOL_ZONE",
  xrp: "XRP_ZONE",
};

function makeZoneSignalId(asset: ZoneBotAsset, now: number): string {
  return `zone-bot-${asset}-${now}`;
}

async function openZoneBotTrade(args: {
  db:                FirebaseFirestore.Firestore;
  asset:             ZoneBotAsset;
  state:             SimulatorState;
  simConfig:         SimConfigType;
  action:            Extract<ZoneBotAction, { type: "OPEN" } | { type: "FLIP" }>;
  now:               number;
  riskPerTradePct?:  number;
  leverageOverride?: number;
  attachedZoneBots:  AttachedZoneBots;
  /** Day-0 max pain at entry — 50% partial + runner management target. */
  maxPainTarget?:    number | null;
}): Promise<{ tradeId: string; updatedState: SimulatorState; log: SimLog; sizing: PositionSizeResult }> {
  const {
    db,
    asset,
    state,
    simConfig,
    action,
    now,
    riskPerTradePct,
    leverageOverride,
    attachedZoneBots,
    maxPainTarget,
  } = args;

  // OPEN uses `.side`, FLIP uses `.openSide`; the rest of the trade params
  // share names across both variants of the union.
  const side = action.type === "OPEN" ? action.side : action.openSide;
  const { entryPrice, stopLoss, tp1, tp2, tp3 } = action;

  // Zone bots do not use the 1R/2R/3R ladder — partial is 50% at day-0 max
  // pain only. Keep tp fields at the 1R values for chart compat; sync-simulator
  // skips TP processing for zone-bot trades.
  const day0MaxPain =
    maxPainTarget != null && Number.isFinite(maxPainTarget) && maxPainTarget > 0
      ? maxPainTarget
      : null;
  const effectiveTp1 = tp1;
  const effectiveTp2 = tp2;
  const effectiveTp3 = tp3;

  const sizing = computePositionSize(
    state,
    simConfig,
    entryPrice,
    stopLoss,
    "60",
    riskPerTradePct,
    leverageOverride,
  );
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
      stopLoss:        truncatePrice(stopLoss),
      tp1:             truncatePrice(effectiveTp1),
      tp2:             truncatePrice(effectiveTp2),
      tp3:             truncatePrice(effectiveTp3),
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
    directionBias: ZONE_BOT_BIAS[asset] as "BULL" | "BEAR" | "BOTH",
  });

  // Stamp botSource so PR #3's guards in sync-simulator skip this trade
  // for zone-flip / max-pain-proximity force-closes (zone bot owns its own
  // lifecycle decisions). Also stamp the chosen leverage (3/5/10×) so the
  // live mirror in `executeTrade` sets the right exchange leverage and the
  // sim PnL math in `simulator.ts` uses it. `openTrade()` always derives
  // leverage from `getLeverage(timeframe, assetType)` (= 3 for our `"60"`
  // crypto path) — we overwrite it here to match `sizing.leverage`.
  const tradeWithSource: SimTrade = {
    ...result.trade,
    botSource: ZONE_BOT_SOURCE[asset],
    leverage: sizing.leverage,
    maxPainTarget: day0MaxPain,
    maxPainHit: false,
  };

  const docId = `sim-${signalId}`;

  // Decorate the log so it's easy to grep zone-bot activity in
  // simulator_logs without scrolling through every pattern-signal event.
  // Also swap the `lev=Nx` substring (which `openTrade()` built from the
  // timeframe-default 3×) for the actually-applied leverage, matching the
  // trade doc + live mirror.
  const decoratedLog: SimLog = {
    ...result.log,
    details: rewriteLogLeverage(
      `[${ZONE_BOT_SOURCE[asset]}] ${result.log.details}`,
      sizing.leverage,
    ),
  };

  // Surface any Firestore write failure as a simulator_logs entry — the
  // outer tickAsset try/catch otherwise swallows the error into console
  // and the operator sees zero zone-bot activity (which is what happened
  // when `scoreBreakdownAtEntry: undefined` was rejected by the admin SDK).
  try {
    await db.collection("simulator_trades").doc(docId).set(tradeWithSource);
    await db.collection("simulator_logs").add(decoratedLog);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.collection("simulator_logs").add({
      timestamp: new Date(now).toISOString(),
      action: "ZONE_BOT_OPEN_FAILED",
      details: `[${ZONE_BOT_SOURCE[asset]}] open write threw: ${msg}. Sim trade NOT created.`,
      symbol: tradeWithSource.symbol,
      capital: state.capital,
      assetType: "CRYPTO",
    }).catch(() => {});
    throw e; // re-throw so tickAsset's caller still surfaces the error
  }

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

  // PR 2b: open a parallel Crypto Bot mirror sim trade when admin has
  // attached this zone bot via `attachedZoneBots`. Failure is
  // swallowed inside the helper — parent zone trade is never affected
  // by mirror open errors. Skipped silently when attach mode is "off",
  // Crypto Bot is OFF, or Crypto Bot is at cap. See
  // `crypto-bot-attach-mirror.ts` for the full gate / sizing model.
  //
  // PR 2c: when the mirror open succeeded AND attach mode is "sim" or
  // "live", fan the mirror out via `fanOutCryptoMirrorLive`. "sim"
  // emits shadow logs only; "live" dispatches via the shared
  // `executeForAllUsers` engine with an `attachContext` that skips
  // users already on the solo zone. Errors here are isolated from the
  // mirror open AND from the parent zone trade — every layer fails
  // closed independently.
  try {
    const mirrorOutcome = await openCryptoMirrorForZoneTrade({
      db,
      parent: { ...tradeWithSource, id: docId },
      parentSimTradeId: docId,
      attachedZoneBots,
      simConfig,
      now,
    });

    if (mirrorOutcome.fired) {
      try {
        await fanOutCryptoMirrorLive({
          db,
          mirror: mirrorOutcome.mirror,
          mirrorDocId: mirrorOutcome.mirrorDocId,
          mirrorSignalId: mirrorOutcome.mirrorSignalId,
          attachedFromAsset: mirrorOutcome.attachedFromAsset,
          attachMode: mirrorOutcome.attachMode,
          simConfig,
          now,
        });
      } catch (e) {
        // fanOutCryptoMirrorLive has its own try/catch and writes its
        // own ATTACH_SKIP_EVAL_ERROR log; this catch is for the
        // pathological synchronous-throw-before-internal-catch case.
        await db.collection("simulator_logs").add({
          timestamp: new Date(now).toISOString(),
          action: "ATTACH_MIRROR_LIVE_ERROR",
          details: `[CRYPTO_MIRROR] fanOutCryptoMirrorLive threw outside helper for mirror=${mirrorOutcome.mirrorDocId}: ${e instanceof Error ? e.message : String(e)}. Mirror sim trade unaffected.`,
          symbol: tradeWithSource.symbol,
          capital: result.updatedState.capital,
          assetType: "CRYPTO",
        }).catch(() => {});
      }
    }
  } catch (e) {
    // Defence in depth — the helper already wraps everything in
    // try/catch and writes a log. This second catch is for the
    // pathological case where the helper itself throws synchronously
    // before its own try/catch can engage.
    await db.collection("simulator_logs").add({
      timestamp: new Date(now).toISOString(),
      action: "ATTACH_MIRROR_OPEN_ERROR",
      details: `[CRYPTO_MIRROR] openCryptoMirrorForZoneTrade threw outside helper: ${e instanceof Error ? e.message : String(e)}. Parent ${docId} unaffected.`,
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

  if (exitResult.updatedTrade.status === "CLOSED") {
    await markTradeForBlockchain(db, tradeId);
  }

  return { updatedState: exitResult.updatedState, log: decoratedLog };
}

/** Zone-bot lifecycle: 50% at live day-0 max pain; runner SL → cost. */
async function maybeTakeMaxPainPartial(args: {
  db:         FirebaseFirestore.Firestore;
  asset:      ZoneBotAsset;
  tradeId:    string;
  state:      SimulatorState;
  simConfig:  SimConfigType;
  spot:       number;
  /** Today's (day-0 expiry) max pain from the latest zones snapshot. */
  day0MaxPain: number;
  halfWidth?: number | null;
}): Promise<{ updatedState: SimulatorState; log: SimLog | null }> {
  const { db, asset, tradeId, state, simConfig, spot, day0MaxPain, halfWidth } = args;

  const snap = await db.collection("simulator_trades").doc(tradeId).get();
  if (!snap.exists) return { updatedState: state, log: null };

  const trade = { id: snap.id, ...(snap.data() as SimTrade) };
  if (trade.status !== "OPEN" || trade.maxPainHit || !isZoneBotSource(trade.botSource)) {
    return { updatedState: state, log: null };
  }

  if (!Number.isFinite(day0MaxPain) || day0MaxPain <= 0) {
    return { updatedState: state, log: null };
  }

  if (!priceReachedMaxPain(trade.side, spot, day0MaxPain, halfWidth ?? undefined)) {
    return { updatedState: state, log: null };
  }

  const exitResult = processTradeExit({
    trade,
    state,
    exitType: "MAX_PAIN",
    exitPrice: spot,
    simConfig,
  });
  if (!exitResult) return { updatedState: state, log: null };

  const slToCostEvent = {
    type: "SL_TO_BE" as const,
    price: trade.entryPrice,
    pnl: 0,
    fee: 0,
    closePct: 0,
    timestamp: new Date().toISOString(),
  };

  const runner = {
    ...exitResult.updatedTrade,
    stopLoss: trade.entryPrice,
    trailingSl: trade.entryPrice,
    events: [...(exitResult.updatedTrade.events || []), slToCostEvent],
  };

  const { id: _id, ...fields } = runner;
  await db.collection("simulator_trades").doc(tradeId).update({
    ...fields,
    closeReason: exitResult.updatedTrade.status === "CLOSED"
      ? "ZONE_BOT_MAX_PAIN"
      : trade.closeReason,
  });

  const decoratedLog: SimLog = {
    ...exitResult.log,
    action: "ZONE_BOT_MAX_PAIN",
    details: `[${ZONE_BOT_SOURCE[asset]}] ${trade.symbol} ${trade.side} — 50% at day-0 max pain ${Math.round(day0MaxPain)} @ $${spot}; runner SL → cost $${trade.entryPrice}`,
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
  db:               FirebaseFirestore.Firestore,
  asset:            ZoneBotAsset,
  prices:           PricesView | null,
  simConfig:        SimConfigType,
  now:              number,
  attachedZoneBots: AttachedZoneBots,
): Promise<AssetTickResult> {
  try {
    const botSettings = await loadSimBotSettings(db, asset);
    const settings = toZoneBotSettings(botSettings);
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

    // Read the cached zones doc. Computation is owned by the separate
    // `Auto Zones` cron (every 15min) — this route is purely a consumer
    // so the engine tick stays cheap enough to run every minute (which
    // is what the confirmation gate needs to gather ≥7 samples).
    const suggested = await loadSuggestedZones(db, asset);

    const { nextState, action } = evaluateZoneBot({
      asset,
      spot,
      suggested,
      settings,
      state:   prevState,
      history,
      now,
    });

    let workingSimState  = await loadZoneSimState(db, asset);
    const workingState   = { ...nextState }; // we'll patch openTradeId below

    switch (action.type) {
      case "NONE": {
        break;
      }

      case "OPEN": {
        const openTrades = await loadOpenCryptoTrades(db);
        const slotCheck = canBotOpenMore(
          openTrades,
          ZONE_BOT_SOURCE[asset] as Exclude<BotSourceFilter, "ALL">,
          botSettings.maxOpenTrades,
        );
        if (!slotCheck.ok) {
          workingState.direction = "IDLE";
          workingState.confirming = null;
          workingState.reason = `${asset.toUpperCase()} zone ready — ${slotCheck.reason}`;
          await db.collection("simulator_logs").add({
            timestamp: new Date(now).toISOString(),
            action: "TRADE_SKIPPED",
            details: `[${ZONE_BOT_SOURCE[asset]}] ${slotCheck.reason}`,
            symbol: `${ZONE_BOT_PERP_SYMBOL[asset]}.P`,
            capital: workingSimState.capital,
            assetType: "CRYPTO",
          }).catch(() => {});
          break;
        }
        const opened = await openZoneBotTrade({
          db,
          asset,
          state: workingSimState,
          simConfig,
          action,
          now,
          riskPerTradePct: botSettings.riskPerTradePct,
          leverageOverride: botSettings.leverage,
          attachedZoneBots,
          maxPainTarget: resolveDay0MaxPain(suggested),
        });
        if (opened.tradeId) {
          workingState.openTradeId = opened.tradeId;
          workingSimState = opened.updatedState;
          await saveZoneSimState(db, asset, workingSimState);
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
          // Engine-driven flip ABORT: opposite side confirmed but the new
          // flip-trade SL would exceed MAX_SL_DISTANCE_PCT. Close the
          // dying side without re-opening in a bad shape. Full 100% close
          // (exitType: "SL") since the original thesis is dead.
          const closed = await closeZoneBotTrade({
            db, asset, tradeId: prevState.openTradeId, state: workingSimState, simConfig, spot,
            reason: "ZONE_BOT_FLIP_BLOCKED", exitType: "SL",
          });
          workingSimState = closed.updatedState;
          if (closed.log) await saveZoneSimState(db, asset, workingSimState);
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
          if (closed.log) await saveZoneSimState(db, asset, workingSimState);
        }
        const openTradesFlip = await loadOpenCryptoTrades(db);
        const flipSlot = canBotOpenMore(
          openTradesFlip,
          ZONE_BOT_SOURCE[asset] as Exclude<BotSourceFilter, "ALL">,
          botSettings.maxOpenTrades,
        );
        if (!flipSlot.ok) {
          workingState.openTradeId = null;
          workingState.reason = `FLIP close OK, open skipped — ${flipSlot.reason}`;
          await db.collection("simulator_logs").add({
            timestamp: new Date(now).toISOString(),
            action: "TRADE_SKIPPED",
            details: `[${ZONE_BOT_SOURCE[asset]}] FLIP open skipped — ${flipSlot.reason}`,
            symbol: `${ZONE_BOT_PERP_SYMBOL[asset]}.P`,
            capital: workingSimState.capital,
            assetType: "CRYPTO",
          }).catch(() => {});
        } else {
          const opened = await openZoneBotTrade({
            db,
            asset,
            state: workingSimState,
            simConfig,
            action,
            now,
            riskPerTradePct: botSettings.riskPerTradePct,
            leverageOverride: botSettings.leverage,
            attachedZoneBots,
            maxPainTarget: resolveDay0MaxPain(suggested),
          });
          if (opened.tradeId) {
            workingState.openTradeId = opened.tradeId;
            workingSimState = opened.updatedState;
            await saveZoneSimState(db, asset, workingSimState);
          } else {
            await db.collection("simulator_logs").add(opened.log);
            workingState.openTradeId = null;
            workingState.reason = `FLIP close OK, open skipped (${opened.sizing.reason})`;
          }
        }
        break;
      }
    }

    const day0MaxPain = resolveDay0MaxPain(suggested);
    if (workingState.openTradeId && day0MaxPain != null) {
      const mpResult = await maybeTakeMaxPainPartial({
        db,
        asset,
        tradeId: workingState.openTradeId,
        state: workingSimState,
        simConfig,
        spot,
        day0MaxPain,
        halfWidth: suggested?.halfWidthUsd ?? null,
      });
      workingSimState = mpResult.updatedState;
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

  // Read attach config ONCE per cron run. The mirror engine fail-closes
  // on read error (returns ATTACHED_ZONE_BOTS_DEFAULT = all "off") so a
  // transient Firestore hiccup just skips mirror opens this tick — zone
  // bots themselves are unaffected.
  let attachedZoneBots: AttachedZoneBots;
  try {
    attachedZoneBots = await loadAttachedZoneBots(db);
  } catch {
    attachedZoneBots = ATTACHED_ZONE_BOTS_DEFAULT;
  }

  // Per-asset ticks run sequentially — each uses its own `zone_sim_state_*`
  // ledger ($1000 starting capital per bot).
  const results: AssetTickResult[] = [];
  for (const asset of ZONE_BOT_REGISTRY) {
    results.push(await tickAsset(db, asset, prices, simConfig, now, attachedZoneBots));
  }

  // After every per-asset tick has finished, sweep the open Crypto Bot
  // mirror trades and force-close any whose parent zone trade has
  // already closed for a non-TP/SL reason (FLIP / manual / EOD). The
  // reconciler is idempotent: TP/SL closes are handled natively by
  // sync-simulator's raw-price catch-up loop, and a mirror that's
  // already closed is skipped by the OPEN-status guard in the txn.
  // Soft-failure: any throw here is swallowed; the next tick will
  // retry. The mirror engine's own per-mirror try/catch already logs
  // failures to simulator_logs for ops visibility.
  try {
    const recon = await reconcileMirrorCloses({ db, now });
    if (recon.closed > 0 || recon.errors.length > 0) {
      await db.collection("simulator_logs").add({
        timestamp: new Date(now).toISOString(),
        action: "ATTACH_MIRROR_RECONCILE",
        details: `scanned=${recon.scanned} closed=${recon.closed} errors=${recon.errors.length}${
          recon.errors.length > 0 ? ` | ${recon.errors.slice(0, 3).join("; ")}` : ""
        }`,
        capital: null,
        assetType: "CRYPTO",
      }).catch(() => {});
    }
  } catch (e) {
    console.error(
      "[SyncZoneBots] reconcileMirrorCloses threw:",
      e instanceof Error ? e.message : String(e),
    );
  }

  return results;
}

function summarizeZoneBotTick(
  results: { asset: string; ok: boolean; action: string }[],
): string {
  return results
    .map((r) => `${r.asset}=${r.ok ? r.action : "ERR"}`)
    .join(" ");
}

// GET — called by cron-job.org with ?key=CRON_SECRET (see header comment).
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (CRON_SECRET && key !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const db = getAdminFirestore();
  try {
    const results = await run(db);
    const allOk = results.every((r) => r.ok);
    await recordCronHeartbeat(db, "sync-zone-bots", {
      ok: allOk,
      degraded: !allOk,
      summary: summarizeZoneBotTick(results),
      durationMs: Date.now() - startedAt,
      error: allOk
        ? undefined
        : results
            .filter((r) => !r.ok)
            .map((r) => `${r.asset}: ${"error" in r ? r.error : "failed"}`)
            .join("; "),
    });
    return NextResponse.json({ success: true, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[SyncZoneBots] Failed:", err);
    await recordCronHeartbeat(db, "sync-zone-bots", {
      ok: false,
      error: msg,
      durationMs: Date.now() - startedAt,
    }).catch(() => {});
    return NextResponse.json({ error: msg }, { status: 500 });
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
