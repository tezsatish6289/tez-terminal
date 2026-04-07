import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import {
  processTradeExit,
  checkDailyReset,
  computeUnrealizedPnl,
  computeTrailingSl,
  selectIncubatedSignals,
  openTrade,
  createInitialState,
  getSimStateDocId,
  SIM_CONFIG,
  getEffectiveSimConfig,
  type DirectionBias,
  type SimulatorState,
  type SimTrade,
  type IncubatedCandidate,
} from "@/lib/simulator";
import {
  computeAutoFilter,
  mapFirestoreSignal,
} from "@/lib/auto-filter";
import { deserializePrices, getReferencePrice, getPrice, type AllExchangePrices } from "@/lib/exchanges";
import { executeForAllUsers } from "@/lib/live-execution";
import { isMarketOpen, isIndianSquareOffTime } from "@/lib/market-hours";
import { markTradeForBlockchain } from "@/lib/blockchain-logger";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * CRON 2: SIMULATOR TRADE MANAGEMENT
 *
 * Reads cached prices (from Cron 1) and manages simulator trades:
 * - TP/SL exits from signal events
 * - Trailing SL / price updates on open trades
 * - Market turn detection + score degradation closes
 * - Incubated signal selection + delayed entries
 *
 * Uses Binance prices for the simulator (consistent baseline).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || key !== cronSecret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminFirestore();

  // Load simulator param overrides + controls (user-tunable via UI)
  let simConfig = SIM_CONFIG;
  let simParamsData: Record<string, unknown> = {};
  try {
    const paramsDoc = await db.doc("config/simulator_params").get();
    if (paramsDoc.exists) {
      simParamsData = paramsDoc.data() as Record<string, unknown>;
      simConfig = getEffectiveSimConfig(simParamsData as any);
    }
  } catch {}

  // Resolve simEnabled / directionBias per asset type.
  // Per-asset-type keys (e.g. simEnabled_CRYPTO) take precedence over the
  // legacy global keys (simEnabled / directionBias) for backward compat.
  function getAssetControls(assetType: string): { simEnabled: boolean; directionBias: DirectionBias } {
    const enabledKey = `simEnabled_${assetType}`;
    const biasKey = `directionBias_${assetType}`;
    const simEnabled =
      typeof simParamsData[enabledKey] === "boolean"
        ? (simParamsData[enabledKey] as boolean)
        : typeof simParamsData.simEnabled === "boolean"
          ? (simParamsData.simEnabled as boolean)
          : true;
    const directionBias = (
      ["BULL", "BEAR", "BOTH"].includes(simParamsData[biasKey] as string)
        ? (simParamsData[biasKey] as DirectionBias)
        : ["BULL", "BEAR", "BOTH"].includes(simParamsData.directionBias as string)
          ? (simParamsData.directionBias as DirectionBias)
          : "BOTH"
    ) as DirectionBias;
    return { simEnabled, directionBias };
  }

  try {
    // ── Read cached prices from Cron 1 ──────────────────────
    const priceDoc = await db.collection("config").doc("exchange_prices").get();
    let allPrices: AllExchangePrices = { BINANCE: new Map(), BYBIT: new Map(), MEXC: new Map(), DHAN: new Map() };
    if (priceDoc.exists) {
      allPrices = deserializePrices(priceDoc.data() as Record<string, Record<string, number>>);
    }

    const binancePriceCount = allPrices.BINANCE.size;
    const bybitPriceCount = allPrices.BYBIT.size;

    // Helper: get price for a sim trade using its originating exchange
    const getSimPrice = (symbol: string, exchange?: string): number | null =>
      getReferencePrice(allPrices, symbol, exchange);

    // ── Load signals for scoring context ────────────────────
    const signalsSnap = await db.collection("signals").get();
    const postUpdateDocs: { id: string; [key: string]: any }[] = [];
    for (const signalDoc of signalsSnap.docs) {
      postUpdateDocs.push({ id: signalDoc.id, ...signalDoc.data() });
    }

    // Compute scores for new-entry selection and market turn checks.
    // A second pass with includeResolved:true keeps currentScore fresh on
    // open trades whose signals have already hit TPs — display only.
    const allSignalsForScoring = postUpdateDocs.map(mapFirestoreSignal);
    const scores = computeAutoFilter(allSignalsForScoring);
    const scoresForOpenTrades = computeAutoFilter(allSignalsForScoring, { includeResolved: true });

    // ── Helper: load/save sim state per asset type ─────────
    const simStates = new Map<string, SimulatorState>();
    async function loadSimState(assetType: string): Promise<SimulatorState> {
      const cached = simStates.get(assetType);
      if (cached) return cached;
      const docId = getSimStateDocId(assetType);
      const doc = await db.collection("config").doc(docId).get();
      const state = doc.exists
        ? checkDailyReset(doc.data() as SimulatorState)
        : createInitialState(assetType);
      simStates.set(assetType, state);
      return state;
    }
    function updateSimState(assetType: string, state: SimulatorState) {
      simStates.set(assetType, state);
    }
    async function flushSimStates() {
      for (const [assetType, state] of simStates.entries()) {
        await db.collection("config").doc(getSimStateDocId(assetType)).set(state);
      }
    }

    // ── 3:15 PM IST: force-close open Indian stocks simulator trades ──
    // Mirrors the live-trade square-off (5-minute scalping only).
    // BTST (1h), Swing (4h), and Positional (D) trades are NOT closed at EOD
    // because they intentionally hold overnight — same behaviour as live trading.
    if (isIndianSquareOffTime()) {
      const openIndianSimSnap = await db.collection("simulator_trades")
        .where("status", "==", "OPEN")
        .where("assetType", "==", "INDIAN_STOCKS")
        .get();

      // Only close intraday (5-minute) positions — matches live-trade square-off
      const intradaySimDocs = openIndianSimSnap.docs.filter((d) => String(d.data().timeframe ?? "5") === "5");

      for (const simDoc of intradaySimDocs) {
        const t = simDoc.data() as SimTrade;
        const tradeAsset = t.assetType ?? "INDIAN_STOCKS";
        const closePrice = getSimPrice(t.symbol, t.exchange) ?? t.entryPrice;
        let simState = await loadSimState(tradeAsset);

        const result = processTradeExit({
          trade: { ...t, id: simDoc.id },
          state: simState,
          exitType: "SL", // treat as a forced exit for capital accounting
          exitPrice: closePrice,
        });

        if (result) {
          const { id: _id, ...fields } = result.updatedTrade;
          await db.collection("simulator_trades").doc(simDoc.id).update({
            ...fields,
            closeReason: "EOD_SQUARE_OFF",
          });
          updateSimState(tradeAsset, result.updatedState);
          await db.collection("simulator_logs").add({
            ...result.log,
            action: "EOD_SQUARE_OFF",
            details: `[SIM] ${t.symbol} ${t.side} force-closed @ ₹${closePrice} for 3:15 PM square-off`,
          });
          if (result.updatedTrade.status === "CLOSED") {
            await markTradeForBlockchain(db, simDoc.id);
          }
        }
      }

      await flushSimStates();
    }

    // ── Signal-event-driven exits ───────────────────────────
    // Track trade IDs processed here so the catch-up loop below won't
    // re-process the same exit from a stale Firestore snapshot, which
    // would double-increment simState.capital.
    const processedTradeIds = new Set<string>();
    let eventCloses = 0;
    try {
      const recentEventsSnap = await db.collection("signal_events")
        .where("createdAt", ">=", new Date(Date.now() - 2 * 60 * 1000).toISOString())
        .get();

      if (!recentEventsSnap.empty) {
        const tpSlEvents = recentEventsSnap.docs
          .map((d) => d.data())
          .filter((e) => ["TP1_HIT", "TP2_HIT", "TP3_HIT", "SL_HIT"].includes(e.type));

        for (const evt of tpSlEvents) {
          const simTradeSnap = await db.collection("simulator_trades")
            .where("signalId", "==", evt.signalId)
            .where("status", "==", "OPEN")
            .limit(1)
            .get();

          if (simTradeSnap.empty) continue;

          const simTradeDoc = simTradeSnap.docs[0];
          const simTrade = { id: simTradeDoc.id, ...simTradeDoc.data() } as SimTrade;
          const tradeAsset = simTrade.assetType ?? "CRYPTO";

          let simState = await loadSimState(tradeAsset);

          const exitType = evt.type.replace("_HIT", "") as "TP1" | "TP2" | "TP3" | "SL";
          const exitPrice = evt.price ?? simTrade.entryPrice;

          const result = processTradeExit({
            trade: simTrade,
            state: simState,
            exitType,
            exitPrice,
          });

          if (result) {
            const { id: _tid, ...tradeUpdate } = result.updatedTrade;
            await db.collection("simulator_trades").doc(simTradeDoc.id).update(tradeUpdate);
            updateSimState(tradeAsset, result.updatedState);
            await db.collection("simulator_logs").add(result.log);
            processedTradeIds.add(simTradeDoc.id);
            eventCloses++;
            if (result.updatedTrade.status === "CLOSED") {
              await markTradeForBlockchain(db, simTradeDoc.id);
            }
          }
        }

        await flushSimStates();
      }
    } catch (simErr: any) {
      console.error("[SimSync] Signal event trade closing failed:", simErr.message);
    }

    // ── Price updates + catch-up missed TP/SL on open trades ──
    let priceUpdates = 0;
    let trailingSlCloses = 0;
    try {
      const openSimSnap = await db.collection("simulator_trades")
        .where("status", "==", "OPEN").get();

      if (!openSimSnap.empty) {
        for (const simDoc of openSimSnap.docs) {
          // Per-trade try-catch: one bad trade must not abort price updates for all others
          try {
          // Skip trades already processed by the signal-event loop above.
          // Firestore snapshots can be stale within the same request, so the
          // catch-up logic below could otherwise double-apply the same exit
          // and double-increment simState.capital.
          if (processedTradeIds.has(simDoc.id)) continue;

          const t = simDoc.data() as SimTrade;
          const tradeAsset = t.assetType ?? "CRYPTO";
          if (!isMarketOpen(tradeAsset)) continue;
          const livePrice = getSimPrice(t.symbol, t.exchange);

          const signalDoc = await db.collection("signals").doc(t.signalId).get();
          const signal = signalDoc.exists ? signalDoc.data() : null;

          let simState2 = await loadSimState(tradeAsset);

          if (signal) {
            const missedExits: { type: "TP1" | "TP2" | "TP3" | "SL"; price: number }[] = [];
            if (signal.tp1Hit && !t.tp1Hit) missedExits.push({ type: "TP1", price: signal.tp1 ?? t.tp1 });
            if (signal.tp2Hit && !t.tp2Hit) missedExits.push({ type: "TP2", price: signal.tp2 ?? t.tp2 });
            if (signal.tp3Hit && !t.tp3Hit) missedExits.push({ type: "TP3", price: signal.tp3 ?? t.tp3 });
            if (signal.slHitAt && !t.slHit) missedExits.push({ type: "SL", price: signal.currentPrice ?? t.stopLoss });

            if (missedExits.length > 0) {
              let currentTrade: SimTrade = { ...t, id: simDoc.id };
              for (const exit of missedExits) {
                if (currentTrade.status === "CLOSED") break;
                const result = processTradeExit({
                  trade: currentTrade,
                  state: simState2,
                  exitType: exit.type,
                  exitPrice: exit.price,
                });
                if (result) {
                  currentTrade = result.updatedTrade;
                  simState2 = result.updatedState;
                  updateSimState(tradeAsset, simState2);
                  await db.collection("simulator_logs").add(result.log);
                }
              }
            const { id: _cid, ...catchUpUpdate } = currentTrade;
            await db.collection("simulator_trades").doc(simDoc.id).update(catchUpUpdate);
            if (currentTrade.status === "CLOSED") {
              await markTradeForBlockchain(db, simDoc.id);
            }
            continue;
            }
          }

          if (livePrice != null) {
            const isBuy = t.side === "BUY";
            const currentHwm = (t as any).highWatermark as number | null;
            const updatedHwm = currentHwm == null
              ? livePrice
              : isBuy
                ? Math.max(currentHwm, livePrice)
                : Math.min(currentHwm, livePrice);

            const tradeWithHwm = { ...t, highWatermark: updatedHwm };
            const newTrailingSl = computeTrailingSl(tradeWithHwm, livePrice);
            const effectiveSl = newTrailingSl ?? t.stopLoss;

            const trailingSlHit = isBuy
              ? livePrice <= effectiveSl && newTrailingSl != null
              : livePrice >= effectiveSl && newTrailingSl != null;

            if (trailingSlHit) {
              const exitResult = processTradeExit({
                trade: t,
                exitType: "SL",
                exitPrice: effectiveSl,
                state: simState2,
              });
              if (exitResult) {
                updateSimState(tradeAsset, exitResult.updatedState);
                const { id: _tslId, ...tslUpdate } = exitResult.updatedTrade;
                await db.collection("simulator_trades").doc(simDoc.id).update({
                  ...tslUpdate,
                  trailingSl: newTrailingSl,
                  highWatermark: updatedHwm,
                  closeReason: "TRAILING_SL",
                });
                await db.collection("simulator_logs").add(exitResult.log);
                trailingSlCloses++;
                if (exitResult.updatedTrade.status === "CLOSED") {
                  await markTradeForBlockchain(db, simDoc.id);
                }
              }
            } else {
              const unrealizedPnl = computeUnrealizedPnl(t, livePrice);
              const liveScored = scoresForOpenTrades.get(t.signalId);
              const liveScore = liveScored?.score ?? null;
              const livePattern = liveScored?.breakdown?.pattern ?? null;
              const updatePayload: Record<string, unknown> = {
                currentPrice: livePrice,
                unrealizedPnl: Math.round(unrealizedPnl * 100) / 100,
                highWatermark: updatedHwm,
                currentScore: liveScore,
                currentScorePattern: livePattern,
              };
              if (newTrailingSl !== t.trailingSl && newTrailingSl != null && t.trailingSl == null) {
                updatePayload.trailingSl = newTrailingSl;
                const slToBeEvent = {
                  type: "SL_TO_BE",
                  price: livePrice,
                  pnl: 0,
                  fee: 0,
                  closePct: 0,
                  timestamp: new Date().toISOString(),
                };
                updatePayload.events = [...(t.events || []), slToBeEvent];
              } else if (newTrailingSl !== t.trailingSl) {
                updatePayload.trailingSl = newTrailingSl;
              }
              await db.collection("simulator_trades").doc(simDoc.id).update(updatePayload);
              priceUpdates++;
            }
          }
          } catch (tradeErr: any) {
            // One bad trade must not block price updates for all others
            console.error(`[SimSync] Price update failed for ${simDoc.id}:`, tradeErr.message);
          }
        }

        await flushSimStates();
      }
    } catch (priceErr: any) {
      console.error("[SimSync] Price update loop failed:", priceErr.message);
    }

    // ── Incubated signal selection (per asset type) ────────
    let incubatedCount = 0;
    try {
      const biasDoc = await db.collection("config").doc("market_bias").get();
      const bullScore = biasDoc.exists ? (biasDoc.data()?.bullScore ?? 0) : 0;
      const bearScore = biasDoc.exists ? (biasDoc.data()?.bearScore ?? 0) : 0;

      const openSimSnap2 = await db.collection("simulator_trades")
        .where("status", "==", "OPEN").get();
      const openSimTrades = openSimSnap2.docs.map((d) => ({ id: d.id, ...d.data() } as SimTrade));

      // Collect signal IDs from recently force-closed trades.
      // Cooldown = 6 × chart timeframe so the signal can re-qualify later.
      const TF_MINS: Record<string, number> = {
        "1": 1, "5": 5, "15": 15, "30": 30, "60": 60, "240": 240, "D": 1440, "W": 10080,
      };
      const killedSnap = await db.collection("simulator_trades")
        .where("closeReason", "==", "KILL_SWITCH").get();
      const killedSignalIds = new Set<string>();
      for (const kDoc of killedSnap.docs) {
        const kd = kDoc.data();
        if (!kd.signalId || !kd.closedAt) continue;
        const tfMins = TF_MINS[String(kd.timeframe)] ?? 15;
        const cooldownMs = tfMins * 6 * 60_000;
        const closedAge = Date.now() - new Date(kd.closedAt).getTime();
        if (closedAge < cooldownMs) {
          killedSignalIds.add(kd.signalId);
        }
      }

      const candidates: IncubatedCandidate[] = postUpdateDocs
        .filter((d) =>
          d.status === "ACTIVE" &&
          d.currentPrice != null &&
          d.price != null &&
          d.stopLoss != null,
        )
        .map((d) => {
          const scored = scores.get(d.id);
          return {
            id: d.id,
            symbol: d.symbol || "",
            exchange: d.exchange ?? "BINANCE",
            assetType: d.assetType ?? "CRYPTO",
            type: (d.type || "BUY") as "BUY" | "SELL",
            timeframe: String(d.timeframe || "15"),
            algo: d.algo || "",
            receivedAt: d.receivedAt || new Date().toISOString(),
            entryPrice: Number(d.price),
            currentPrice: Number(d.currentPrice),
            stopLoss: Number(d.stopLoss),
            tp1: Number(d.tp1 || 0),
            tp2: Number(d.tp2 || 0),
            tp3: Number(d.tp3 || 0),
            confidenceScore: scored?.score ?? (d.confidenceScore ?? 0),
            tp1Hit: d.tp1Hit === true,
            tp2Hit: d.tp2Hit === true,
            slHitAt: d.slHitAt ?? null,
            scorePattern: scored?.breakdown?.pattern,
            rrGateFailed: scored?.breakdown?.rrGateFailed ?? false,
          };
        });

      // Group candidates by asset type for separate simulator pools
      const assetTypes = [...new Set(candidates.map((c) => c.assetType))];
      if (assetTypes.length === 0) assetTypes.push("CRYPTO");

      for (const assetType of assetTypes) {
        if (!isMarketOpen(assetType)) continue;
        const assetCandidates = candidates.filter((c) => c.assetType === assetType);
        const assetOpenTrades = openSimTrades.filter((t) => (t.assetType ?? "CRYPTO") === assetType);
        let simState3 = await loadSimState(assetType);

        // Per-asset-type assessment counters for the summary log
        const assess = {
          active: postUpdateDocs.filter((d) => d.status === "ACTIVE" && (d.assetType ?? "CRYPTO") === assetType).length,
          resolvedExcluded: postUpdateDocs.filter((d) => d.status === "ACTIVE" && (d.assetType ?? "CRYPTO") === assetType && (d.tp1Hit || d.tp2Hit || d.slHitAt)).length,
          noPriceExcluded: postUpdateDocs.filter((d) => d.status === "ACTIVE" && (d.assetType ?? "CRYPTO") === assetType && !d.tp1Hit && !d.tp2Hit && !d.slHitAt && (d.currentPrice == null || d.price == null || d.stopLoss == null)).length,
          evaluated: assetCandidates.length,
          alreadyOpen: 0, duplicate: 0, slConsumed: 0, tp1Consumed: 0,
          earlySnapshots: 0, noPattern: 0, rrGateFailed: 0, selected: 0,
        };

        const { simEnabled: assetSimEnabled, directionBias: assetDirectionBias } = getAssetControls(assetType);
        const { selected, skipped: incubSkipped } = assetSimEnabled
          ? selectIncubatedSignals({
              candidates: assetCandidates,
              state: simState3,
              bullScore,
              bearScore,
              openTrades: assetOpenTrades,
              killedSignalIds,
              simConfig,
              directionBias: assetDirectionBias,
            })
          : { selected: [], skipped: [] };

        // Categorise skip reasons for the summary log
        for (const skip of incubSkipped) {
          const r = skip.reason.toLowerCase();
          if (r.includes("already in simulator")) assess.alreadyOpen++;
          else if (r.includes("duplicate")) assess.duplicate++;
          else if (r.includes("sl consumed")) assess.slConsumed++;
          else if (r.includes("tp1 consumed")) assess.tp1Consumed++;
          else if (r.includes("too early")) assess.earlySnapshots++;
          else if (r.includes("no price structure")) assess.noPattern++;
          else if (r.includes("rr gate")) assess.rrGateFailed++;
        }
        assess.selected = selected.length;

        for (const c of selected) {
          const isBuy = c.type === "BUY";
          const slDistancePct = isBuy
            ? (c.currentPrice - c.stopLoss) / c.currentPrice
            : (c.stopLoss - c.currentPrice) / c.currentPrice;

          if (slDistancePct <= 0) {
            await db.collection("simulator_logs").add({
              timestamp: new Date().toISOString(),
              action: "INCUBATED_REJECTED",
              details: `${c.symbol} ${c.type}: SL distance ≤ 0 (currentPrice=${c.currentPrice} sl=${c.stopLoss} slDist%=${(slDistancePct * 100).toFixed(2)}%)`,
              assetType,
            });
            continue;
          }

          const leverage = (await import("@/lib/leverage")).getLeverage(c.timeframe, assetType);
          const hasStreak = (simState3.consecutiveWins ?? 0) >= SIM_CONFIG.STREAK_WINS_TO_SCALE;
          const riskPct = hasStreak ? SIM_CONFIG.RISK_PER_TRADE_STREAK : SIM_CONFIG.RISK_PER_TRADE_BASE;
          const riskAmount = simState3.capital * riskPct;
          let positionSize = riskAmount / (slDistancePct * leverage);
          const maxPosition = simState3.capital * 0.05;
          if (positionSize < 1) {
            await db.collection("simulator_logs").add({
              timestamp: new Date().toISOString(),
              action: "INCUBATED_REJECTED",
              details: `${c.symbol} ${c.type}: position too small ($${positionSize.toFixed(2)})`,
              assetType,
            });
            continue;
          }
          if (positionSize > maxPosition) {
            positionSize = maxPosition;
          }
          positionSize = Math.round(positionSize * 100) / 100;

          const result = openTrade({
            signal: {
              id: c.id,
              symbol: c.symbol,
              exchange: c.exchange,
              assetType: c.assetType,
              type: c.type,
              timeframe: c.timeframe,
              algo: c.algo,
              price: c.currentPrice,
              stopLoss: c.stopLoss,
              tp1: c.tp1,
              tp2: c.tp2,
              tp3: c.tp3,
              confidenceScore: c.confidenceScore,
              scorePattern: c.scorePattern,
            },
            positionSize,
            state: simState3,
            bullScore,
            bearScore,
            liveWinRate: 0,
            algoWinRate: 0,
          });

          // Gate 1: write sim trade to Firestore with retries.
          // Pre-generate the doc ID so retrying set() is idempotent —
          // if the write succeeded but the ack was lost, retrying with the
          // same ID simply overwrites with identical data, no duplicates.
          const simTradeRef = db.collection("simulator_trades").doc();
          let simWriteOk = false;
          for (let w = 1; w <= 3; w++) {
            try {
              await simTradeRef.set(result.trade);
              simWriteOk = true;
              break;
            } catch (writeErr) {
              if (w < 3) {
                await new Promise((r) => setTimeout(r, 500 * w));
              } else {
                console.error(`[SimSync] Sim trade write failed after 3 attempts for ${c.symbol}:`, writeErr);
                await db.collection("simulator_logs").add({
                  timestamp: new Date().toISOString(),
                  action: "SIM_WRITE_FAILED",
                  details: `${c.symbol} ${c.type} — sim trade write failed after 3 attempts; live execution skipped. Error: ${writeErr instanceof Error ? writeErr.message : String(writeErr)}`,
                  assetType,
                }).catch(() => {});
              }
            }
          }

          // Gate: only proceed to live execution if sim trade is persisted.
          if (!simWriteOk) continue;

          simState3 = result.updatedState;
          updateSimState(assetType, simState3);
          result.log.details = `[INCUBATED] ${result.log.details}`;
          await db.collection("simulator_logs").add(result.log);
          incubatedCount++;

          try {
            const signalData = postUpdateDocs.find((d) => d.id === c.id);
            const signalExchange = signalData?.exchange ?? "BINANCE";
            await executeForAllUsers(
              db, result.trade, simTradeRef.id, simState3.capital,
              c.id, c.symbol, c.type, signalExchange, simConfig,
            );
          } catch (liveErr) {
            const errMsg = liveErr instanceof Error ? liveErr.message : String(liveErr);
            console.error("[SimSync] Incubated live execution failed:", errMsg);
            await db.collection("live_trade_logs").add({
              timestamp: new Date().toISOString(),
              action: "ERROR",
              details: `[INCUBATED] Live execution crashed for ${c.symbol} ${c.type}: ${errMsg}`,
              signalId: c.id,
              symbol: c.symbol,
              assetType,
            }).catch(() => {});
          }
        }

        // Assessment summary — one entry per asset type per cycle, full funnel visible at a glance
        await db.collection("simulator_logs").add({
          timestamp: new Date().toISOString(),
          action: "ASSESSMENT_SUMMARY",
          details: [
            `active=${assess.active}`,
            `resolved=${assess.resolvedExcluded}`,
            `no_price=${assess.noPriceExcluded}`,
            `evaluated=${assess.evaluated}`,
            `open=${assess.alreadyOpen}`,
            `dup=${assess.duplicate}`,
            `sl_consumed=${assess.slConsumed}`,
            `tp1_consumed=${assess.tp1Consumed}`,
            `early=${assess.earlySnapshots}`,
            `no_pattern=${assess.noPattern}`,
            `rr_gate=${assess.rrGateFailed}`,
            `→ selected=${assess.selected}`,
          ].join(" | "),
          capital: simState3.capital,
          assetType,
        });

        // Log fresh skips (< 3 candles old) for new signals — kept brief to avoid spam
        const CANDLE_MINS: Record<string, number> = {
          "1": 1, "5": 5, "15": 15, "60": 60, "240": 240, "D": 1440, "W": 10080,
        };
        const freshSkips = incubSkipped.filter((skip) => {
          const cand = assetCandidates.find((c) => c.symbol === skip.symbol);
          if (!cand) return false;
          const candleMs = (CANDLE_MINS[cand.timeframe] ?? 15) * 60_000;
          const ageMs = Date.now() - new Date(cand.receivedAt).getTime();
          return ageMs <= candleMs * 3;
        });
        for (const skip of freshSkips.slice(0, 5)) {
          await db.collection("simulator_logs").add({
            timestamp: new Date().toISOString(),
            action: "INCUBATED_SKIPPED",
            details: `${skip.symbol}: ${skip.reason}`,
            capital: simState3.capital,
            assetType,
          });
        }
      }

      await flushSimStates();
    } catch (incErr: any) {
      console.error("[SimSync] Incubated signal selection failed:", incErr.message);
    }

    await db.collection("logs").add({
      timestamp: new Date().toISOString(),
      level: "INFO",
      message: `SIM SYNC: eventCloses=${eventCloses} priceUpdates=${priceUpdates} trailingSl=${trailingSlCloses} incubated=${incubatedCount}`,
      webhookId: "SYSTEM_CRON",
    });

    return NextResponse.json({
      success: true,
      prices: { binance: binancePriceCount, bybit: bybitPriceCount },
      eventCloses,
      priceUpdates,
      trailingSlCloses,
      incubatedCount,
    });
  } catch (error: any) {
    await db.collection("logs").add({
      timestamp: new Date().toISOString(),
      level: "ERROR",
      message: "Simulator Sync Failure",
      details: error.message,
      webhookId: "SYSTEM_CRON",
    });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
