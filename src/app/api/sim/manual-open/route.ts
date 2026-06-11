import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import { validateEntryVsMarket } from "@/lib/entry-price-sanity";
import { deserializePrices, getReferencePrice } from "@/lib/exchanges";
import { executeForAllUsers } from "@/lib/live-execution";
import { canBotOpenMore } from "@/lib/sim-slot-policy";
import {
  botSourceForCockpit,
  coerceManualLeverage,
  computeManualPositionSize,
  directionFromSide,
  normalizePerpSymbol,
  resolveManualRiskPct,
  validateManualOpenInput,
  zoneAssetFromBotId,
  type ManualOpenTradeInput,
  type ManualTradeSide,
} from "@/lib/manual-sim-open";
import { normalizeSuggestedZones } from "@/components/simulator/heatmap-types";
import { evaluateManualEntryGate } from "@/lib/cockpit-manual-gate";
import { loadSimBotSettings } from "@/lib/sim-bot-settings";
import { SIM_COCKPIT_BOTS, type CockpitBotId } from "@/lib/sim-cockpit-bots";
import {
  checkDailyReset,
  createInitialState,
  getEffectiveSimConfig,
  getSimStateDocId,
  openTrade,
  rewriteLogLeverage,
  SIM_CONFIG,
  type SimConfigType,
  type SimTrade,
  type SimulatorState,
} from "@/lib/simulator";
import {
  loadZoneBotState,
  saveZoneBotState,
  type ZoneBotState,
} from "@/lib/zone-bot-state";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_BOT_IDS = new Set(SIM_COCKPIT_BOTS.map((b) => b.id));

function parseBody(raw: Record<string, unknown>): ManualOpenTradeInput | null {
  const botId = raw.botId;
  if (typeof botId !== "string" || !VALID_BOT_IDS.has(botId as CockpitBotId)) {
    return null;
  }
  const side = raw.side === "SELL" ? "SELL" : raw.side === "BUY" ? "BUY" : null;
  if (!side) return null;

  const num = (k: string) => {
    const v = raw[k];
    return typeof v === "number" && Number.isFinite(v) ? v : NaN;
  };

  const mirrorMode = raw.mirrorMode === "sim_and_live" ? "sim_and_live" : "sim";

  // Silently coerce invalid leverage values to undefined so the
  // downstream `computeManualPositionSize` falls back to the legacy
  // timeframe-derived default (3×). Matches the API-side clamp behaviour
  // documented for the zone-bot config sheet.
  const leverage = coerceManualLeverage(raw.leverage) ?? undefined;

  return {
    botId: botId as CockpitBotId,
    symbol: typeof raw.symbol === "string" ? raw.symbol : "",
    exchange: typeof raw.exchange === "string" ? raw.exchange : "BYBIT",
    side: side as ManualTradeSide,
    entryPrice: num("entryPrice"),
    stopLoss: num("stopLoss"),
    tp1: num("tp1"),
    tp2: num("tp2"),
    tp3: num("tp3"),
    mirrorMode,
    timeframe: typeof raw.timeframe === "string" ? raw.timeframe : "60",
    note: typeof raw.note === "string" ? raw.note : undefined,
    leverage,
  };
}

async function loadCryptoSimState(db: FirebaseFirestore.Firestore): Promise<SimulatorState> {
  try {
    const snap = await db.doc(`config/${getSimStateDocId("CRYPTO")}`).get();
    if (snap.exists) return snap.data() as SimulatorState;
  } catch {
    /* initial */
  }
  return createInitialState("CRYPTO");
}

async function loadOpenCryptoTrades(db: FirebaseFirestore.Firestore): Promise<SimTrade[]> {
  const snap = await db
    .collection("simulator_trades")
    .where("status", "==", "OPEN")
    .where("assetType", "==", "CRYPTO")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SimTrade));
}

/**
 * POST /api/sim/manual-open
 * Admin-only manual sim entry (optional live mirror for opted-in users).
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = parseBody(body);
  if (!input) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const validationError = validateManualOpenInput(input);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const symbol = normalizePerpSymbol(input.symbol);
  const exchange = input.exchange.trim().toUpperCase();
  const botSource = botSourceForCockpit(input.botId);
  const timeframe = input.timeframe ?? "60";

  const db = getAdminFirestore();

  const priceDoc = await db.collection("config").doc("exchange_prices").get();
  if (priceDoc.exists) {
    const allPrices = deserializePrices(
      priceDoc.data() as Record<string, Record<string, number>>,
    );
    const livePrice = getReferencePrice(allPrices, symbol, exchange);
    const marketErr = validateEntryVsMarket(input.entryPrice, livePrice);
    if (marketErr) {
      return NextResponse.json({ error: marketErr }, { status: 400 });
    }
  }

  const botSettings = await loadSimBotSettings(db, input.botId);

  const botDef = SIM_COCKPIT_BOTS.find((b) => b.id === input.botId);
  const suggestedSnap = botDef
    ? await db.doc(`config/${botDef.suggestedDoc}`).get()
    : null;
  const manualGate = evaluateManualEntryGate(
    normalizeSuggestedZones(
      suggestedSnap?.exists
        ? (suggestedSnap.data() as Record<string, unknown>)
        : null,
    ),
  );
  if (!manualGate.allowed) {
    return NextResponse.json({ error: manualGate.reason }, { status: 403 });
  }

  let simConfig: SimConfigType = SIM_CONFIG;
  try {
    const paramsDoc = await db.doc("config/simulator_params").get();
    if (paramsDoc.exists) {
      simConfig = getEffectiveSimConfig(
        paramsDoc.data() as Partial<Record<keyof SimConfigType, number>>,
      );
    }
  } catch {
    /* defaults */
  }

  let state = await loadCryptoSimState(db);
  state = checkDailyReset(state);
  if (!state.isActive) {
    return NextResponse.json({ error: "Simulator is paused" }, { status: 400 });
  }

  const openTrades = await loadOpenCryptoTrades(db);
  const slotCheck = canBotOpenMore(openTrades, botSource, botSettings.maxOpenTrades);
  if (!slotCheck.ok) {
    return NextResponse.json({ error: slotCheck.reason ?? "Max open trades reached" }, { status: 400 });
  }

  const riskPct = resolveManualRiskPct(input.botId, botSettings, state);
  const sizing = computeManualPositionSize(
    state,
    riskPct,
    input.entryPrice,
    input.stopLoss,
    timeframe,
    input.leverage,
  );
  if (sizing.skip) {
    return NextResponse.json({ error: sizing.reason ?? "Position size too small" }, { status: 400 });
  }

  const now = Date.now();
  const signalId = `manual-${input.botId}-${now}`;
  const docId = `sim-${signalId}`;

  const bias = directionFromSide(input.side);
  const zoneAsset = zoneAssetFromBotId(input.botId);

  const result = openTrade({
    signal: {
      id: signalId,
      symbol,
      exchange,
      assetType: "CRYPTO",
      type: input.side,
      timeframe,
      algo: "MANUAL",
      price: input.entryPrice,
      stopLoss: input.stopLoss,
      tp1: input.tp1,
      tp2: input.tp2,
      tp3: input.tp3,
      confidenceScore: 75,
      scorePattern: "none",
    },
    positionSize: sizing.size,
    state,
    bullScore: 0,
    bearScore: 0,
    liveWinRate: 0,
    algoWinRate: 0,
    directionBias: bias,
  });

  // Overwrite the leverage stamped by `openTrade()` (which always uses
  // `getLeverage(timeframe, assetType)` = 3× for our `"60"` crypto path)
  // with the user-chosen value resolved in `sizing`. This way the sim
  // doc, the simulator PnL math, AND the live mirror (which reads
  // `simTrade.leverage` in `executeTrade`) all agree.
  const tradeWithSource: SimTrade = {
    ...result.trade,
    botSource,
    leverage: sizing.leverage,
  };

  const noteSuffix = input.note?.trim() ? ` — ${input.note.trim()}` : "";
  // Swap `lev=Nx` (built by openTrade() from the timeframe default) for
  // the actually-applied leverage so the log agrees with the persisted
  // trade and the live mirror.
  const decoratedLog = {
    ...result.log,
    details: rewriteLogLeverage(
      `[MANUAL ${botSource}] ${result.log.details}${noteSuffix}`,
      sizing.leverage,
    ),
    action: "MANUAL_TRADE_OPENED",
  };

  try {
    await db.collection("simulator_trades").doc(docId).set(tradeWithSource);
    await db.collection("simulator_logs").add(decoratedLog);
    await db.doc(`config/${getSimStateDocId("CRYPTO")}`).set(result.updatedState);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Failed to write trade: ${msg}` }, { status: 500 });
  }

  if (zoneAsset) {
    const prev = await loadZoneBotState(db, zoneAsset);
    const next: ZoneBotState = {
      ...prev,
      direction: directionFromSide(input.side),
      confirming: null,
      openTradeId: docId,
      reason: `MANUAL ${input.side} @ $${input.entryPrice}`,
      updatedAt: new Date(now).toISOString(),
    };
    await saveZoneBotState(db, zoneAsset, next);
  }

  let liveMirrorAttempted = false;
  if (input.mirrorMode === "sim_and_live") {
    liveMirrorAttempted = true;
    try {
      await executeForAllUsers(
        db,
        tradeWithSource,
        docId,
        result.updatedState.capital,
        signalId,
        symbol,
        input.side,
        exchange,
        simConfig,
        botSource,
      );
    } catch (e) {
      await db.collection("simulator_logs").add({
        timestamp: new Date(now).toISOString(),
        action: "MANUAL_LIVE_MIRROR_FAILED",
        details: `[MANUAL ${botSource}] live mirror threw: ${e instanceof Error ? e.message : String(e)}. Sim trade ${docId} created.`,
        symbol,
        capital: result.updatedState.capital,
        assetType: "CRYPTO",
      });
    }
  }

  return NextResponse.json({
    success: true,
    tradeId: docId,
    positionSize: sizing.size,
    leverage: sizing.leverage,
    riskPctUsed: riskPct,
    botSource,
    liveMirrorAttempted,
    mirrorMode: input.mirrorMode,
  });
}
