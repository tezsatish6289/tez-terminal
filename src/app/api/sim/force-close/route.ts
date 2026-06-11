import { NextRequest, NextResponse } from "next/server";
import { getAdminFirestore } from "@/firebase/admin";
import { requireAdmin } from "@/lib/admin-auth";
import type { Firestore } from "firebase-admin/firestore";
import {
  type SimTrade,
  type SimulatorState,
  checkDailyReset,
  createInitialState,
  getSimStateDocId,
  computeUnrealizedPnl,
  SIM_CONFIG,
} from "@/lib/simulator";
import {
  protectiveClose,
  cancelResidualExitOrders,
  type LiveTrade,
  type LiveTradeEvent,
  type Credentials,
} from "@/lib/trade-engine";
import { decrypt } from "@/lib/crypto";
import {
  getPrice,
  deserializePrices,
  getSecretDocIds,
  docMatchesExchange,
  getConnector,
  type AllExchangePrices,
  type ExchangeName,
} from "@/lib/exchanges";
import {
  applyTradeChangeToAggregates,
  type TradeAggregateSnapshot,
} from "@/lib/freedombot/aggregates";
import { killSwitchExitPrice } from "@/lib/entry-price-sanity";

export const dynamic = "force-dynamic";

interface CascadeResult {
  liveClosed: number;
  liveErrors: string[];
  /** Total live mirrors found OPEN at the start of the cascade. */
  liveAttempted: number;
  /** Distinct user IDs touched by the cascade (closed OR attempted). */
  userCount: number;
  /** Distinct user IDs (for callers that aggregate across multiple
   *  force-close POSTs and need to dedupe). */
  userIds: string[];
  /** Per-exchange close counts (only successful closes). */
  byExchange: Record<string, number>;
}

interface MirrorOutcome {
  ok: boolean;
  exchange: string;
  userId: string;
  /** Populated when `ok === false`. */
  error?: string;
}

/**
 * Cap on parallel `protectiveClose` calls during a cascade. The previous
 * sequential `for...of` loop meant a single slow mirror (exchange API
 * timeout, network blip) blocked every subsequent mirror in the same
 * cascade — and a fan-out of 50+ mirrors × 5s timeout each would exceed
 * Cloud Run's default request budget. With this cap, worst-case wall
 * time = ceil(N / 10) × slowest_mirror_in_batch, and a single hung
 * mirror only blocks the 9 others in its batch.
 *
 * Each mirror still has its own try/catch — failures roll up into
 * `liveErrors[]` independently, so even ten concurrent failures don't
 * affect the rest of the cascade.
 */
const CASCADE_CONCURRENCY = 10;

async function closeSingleMirror(
  db: Firestore,
  lt: LiveTrade,
  liveDocId: string,
  fallbackPrice: number,
  allPrices: AllExchangePrices,
): Promise<MirrorOutcome> {
  try {
    const userId = lt.userId;
    const ltExchange = lt.exchange;
    const docIds = getSecretDocIds(ltExchange);
    let creds: Credentials | null = null;

    for (const secretId of docIds) {
      try {
        const secretDoc = await db
          .collection("users")
          .doc(userId)
          .collection("secrets")
          .doc(secretId)
          .get();
        const data = secretDoc.data();
        if (
          secretDoc.exists &&
          data &&
          docMatchesExchange(data, ltExchange as ExchangeName, secretId)
        ) {
          creds = {
            apiKey: decrypt(data.encryptedKey),
            apiSecret: decrypt(data.encryptedSecret),
            testnet: data.useTestnet === true,
          };
          break;
        }
      } catch {}
    }

    if (!creds) {
      return {
        ok: false,
        exchange: ltExchange,
        userId,
        error: `${lt.signalSymbol} [${ltExchange}]: no credentials found`,
      };
    }

    const livePrice =
      getPrice(allPrices, lt.signalSymbol, ltExchange) ?? fallbackPrice;

    // Orphan pre-check: ask the exchange whether the position is still
    // open before we issue a close. If the venue already has zero size
    // we short-circuit to SYNCED_FROM_EXCHANGE — kill-switch's user
    // intent ("no open position") is already satisfied, and we avoid
    // a phantom close that on some connectors (Dhan F&O places a plain
    // side-flipped market order; MEXC reduce-only behaviour is
    // unverified) could OPEN a reverse position. Bybit, Hyperliquid,
    // and CoinDCX already guard against this at the connector level;
    // this check standardises the safety across every exchange.
    //
    // Soft-fail: if the position query itself errors we fall through
    // to the legacy protectiveClose path rather than blocking the
    // kill switch on a position-API outage.
    try {
      const connector = getConnector(ltExchange as ExchangeName);
      const livePos = await connector.getPosition(lt.symbol, creds);
      const venueQty = livePos ? Math.abs(parseFloat(livePos.positionAmt || "0")) : 0;
      if (!livePos || venueQty < 1e-12) {
        const cleanup = await cancelResidualExitOrders(connector, lt.symbol, creds);
        const residualPending = !cleanup.success;
        const nowIso = new Date().toISOString();
        const syncedEvent: LiveTradeEvent = {
          type: "SYNCED_FROM_EXCHANGE",
          price: livePrice,
          pnl: 0,
          fee: 0,
          closePct: 0,
          quantity: lt.remainingQty,
          orderId: null,
          timestamp: nowIso,
        };
        const syncedEvents = [...(lt.events || []), syncedEvent];
        const syncedAggBefore: TradeAggregateSnapshot = { ...lt };
        const syncedPatch = {
          status: "CLOSED" as const,
          closedAt: nowIso,
          closeReason: "SYNCED_FROM_EXCHANGE",
          residualOrdersPendingCleanup: residualPending,
          slOrderId: null,
          tp1OrderId: null,
          tp2OrderId: null,
          tp3OrderId: null,
          events: syncedEvents,
        };
        await db.collection("live_trades").doc(liveDocId).update(syncedPatch);
        await applyTradeChangeToAggregates(db, syncedAggBefore, {
          ...syncedAggBefore,
          ...syncedPatch,
        });
        await db.collection("live_trade_logs").add({
          timestamp: nowIso,
          action: "SYNCED_FROM_EXCHANGE",
          details: `${lt.signalSymbol} ${lt.side} reconciled (sim cascade) — venue shows no open position. Skipped protectiveClose to avoid phantom reverse order.`,
          symbol: lt.signalSymbol,
          userId,
          exchange: ltExchange,
          assetType: ltExchange === "DHAN" ? "INDIAN_STOCKS" : "CRYPTO",
        });
        return { ok: true, exchange: ltExchange, userId };
      }
    } catch (preErr) {
      console.warn(
        `[ForceClose] orphan pre-check failed for ${lt.signalSymbol} [${ltExchange}]; falling through to protectiveClose:`,
        preErr instanceof Error ? preErr.message : String(preErr),
      );
    }

    const closeResult = await protectiveClose(lt, "KILL_SWITCH", livePrice, creds);

    if (closeResult.updatedFields.status === "CLOSED") {
      await db
        .collection("live_trades")
        .doc(liveDocId)
        .update({
          ...closeResult.updatedFields,
          events: [...(lt.events || []), closeResult.newEvent],
        });
      await db.collection("live_trade_logs").add({
        timestamp: new Date().toISOString(),
        action: "KILL_SWITCH",
        details: `${lt.signalSymbol} ${lt.side} force-closed @ $${livePrice} (sim cascade)`,
        symbol: lt.signalSymbol,
        userId,
        exchange: ltExchange,
        assetType: ltExchange === "DHAN" ? "INDIAN_STOCKS" : "CRYPTO",
      });
      return { ok: true, exchange: ltExchange, userId };
    }

    return {
      ok: false,
      exchange: ltExchange,
      userId,
      error: `${lt.signalSymbol} [${ltExchange}]: ${closeResult.warning ?? "close did not fill"}`,
    };
  } catch (err) {
    return {
      ok: false,
      exchange: lt.exchange,
      userId: lt.userId,
      error: `${lt.signalSymbol} [${lt.exchange}]: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Closes every OPEN live_trades doc linked to this sim trade via
 * `simTradeId`, using `protectiveClose` (the same path sync-live-trades
 * uses for sim-driven closes). Returns counts + per-mirror errors and
 * per-exchange / per-user aggregates so the kill-switch UI can show a
 * detailed success toast. Never throws — failures roll up into
 * `liveErrors`.
 *
 * Shared between two call sites in the same endpoint:
 *   • the standard "close OPEN sim + cascade" path
 *   • the "live-only" recovery path for an already-closed sim whose
 *     original inline cascade failed
 */
async function cascadeCloseLiveMirrors(
  db: Firestore,
  simTradeId: string,
  fallbackPrice: number,
  allPrices: AllExchangePrices,
): Promise<CascadeResult> {
  const liveErrors: string[] = [];
  const byExchange: Record<string, number> = {};
  const userIds = new Set<string>();

  const liveSnap = await db
    .collection("live_trades")
    .where("simTradeId", "==", simTradeId)
    .where("status", "==", "OPEN")
    .get();

  const liveAttempted = liveSnap.docs.length;
  if (liveAttempted === 0) {
    return {
      liveClosed: 0,
      liveErrors,
      liveAttempted: 0,
      userCount: 0,
      userIds: [],
      byExchange,
    };
  }

  type Job = { lt: LiveTrade; liveDocId: string };
  const jobs: Job[] = liveSnap.docs.map((d) => {
    const lt = { id: d.id, ...d.data() } as LiveTrade;
    if (lt.userId) userIds.add(lt.userId);
    return { lt, liveDocId: d.id };
  });

  // Process mirrors in concurrency-capped batches. Each batch is a
  // `Promise.allSettled` so one rejection can never poison the others;
  // every job already returns a `MirrorOutcome` rather than throwing,
  // but the `.allSettled` is belt-and-braces against any unhandled
  // throw escaping `closeSingleMirror`.
  let liveClosed = 0;
  for (let i = 0; i < jobs.length; i += CASCADE_CONCURRENCY) {
    const batch = jobs.slice(i, i + CASCADE_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((j) =>
        closeSingleMirror(db, j.lt, j.liveDocId, fallbackPrice, allPrices),
      ),
    );
    for (let k = 0; k < settled.length; k++) {
      const s = settled[k]!;
      const j = batch[k]!;
      if (s.status === "fulfilled") {
        const out = s.value;
        if (out.ok) {
          liveClosed++;
          byExchange[out.exchange] = (byExchange[out.exchange] ?? 0) + 1;
        } else if (out.error) {
          liveErrors.push(out.error);
        }
      } else {
        // Should not happen — closeSingleMirror catches everything —
        // but if a Promise.allSettled rejection slips through, fold it
        // in as an error so the operator sees it.
        const reason =
          s.reason instanceof Error ? s.reason.message : String(s.reason);
        liveErrors.push(
          `${j.lt.signalSymbol} [${j.lt.exchange}]: unexpected throw — ${reason}`,
        );
      }
    }
  }

  return {
    liveClosed,
    liveErrors,
    liveAttempted,
    userCount: userIds.size,
    userIds: Array.from(userIds),
    byExchange,
  };
}

async function loadAllPrices(db: Firestore): Promise<AllExchangePrices> {
  const priceDoc = await db.collection("config").doc("exchange_prices").get();
  if (!priceDoc.exists) {
    return { BINANCE: new Map(), BYBIT: new Map(), MEXC: new Map(), COINDCX: new Map(), HYPERLIQUID: new Map(), DHAN: new Map() };
  }
  return deserializePrices(priceDoc.data() as Record<string, Record<string, number>>);
}

/**
 * GET /api/sim/force-close?simTradeId=...
 * Auth: admin only.
 *
 * Read-only preflight. Returns the blast-radius the caller would inflict
 * if they POSTed to this endpoint with the same `simTradeId`:
 *   • sim trade summary (status, symbol, side, current price)
 *   • every linked live mirror (id, userId, exchange, side, qty, status)
 *   • aggregate counts: mirrors total, distinct users, breakdown by
 *     exchange
 *
 * Never writes. Never closes anything. Lets the kill-switch dialog show
 * "you are about to close X positions for Y users" before the operator
 * is asked to type the safety phrase.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(request.url);
    const simTradeId = searchParams.get("simTradeId");
    if (!simTradeId || typeof simTradeId !== "string") {
      return NextResponse.json({ error: "Missing simTradeId" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const simDoc = await db.collection("simulator_trades").doc(simTradeId).get();
    if (!simDoc.exists) {
      return NextResponse.json({ error: "Sim trade not found" }, { status: 404 });
    }
    const simTrade = { id: simDoc.id, ...simDoc.data() } as SimTrade;

    const liveSnap = await db
      .collection("live_trades")
      .where("simTradeId", "==", simTradeId)
      .where("status", "==", "OPEN")
      .get();

    type MirrorRow = {
      id: string;
      userId: string;
      exchange: string;
      side: string;
      qty: number;
      status: string;
    };
    const liveMirrors: MirrorRow[] = liveSnap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        userId: String(data.userId ?? ""),
        exchange: String(data.exchange ?? ""),
        side: String(data.side ?? ""),
        qty: Number(data.positionSize ?? data.quantity ?? 0),
        status: String(data.status ?? "OPEN"),
      };
    });

    const userIds = new Set(liveMirrors.map((m) => m.userId).filter(Boolean));
    const byExchange: Record<string, number> = {};
    for (const m of liveMirrors) {
      byExchange[m.exchange] = (byExchange[m.exchange] ?? 0) + 1;
    }

    return NextResponse.json({
      simTrade: {
        id: simTrade.id,
        symbol: simTrade.symbol,
        side: simTrade.side,
        status: simTrade.status,
        currentPrice: simTrade.currentPrice ?? simTrade.entryPrice,
        entryPrice: simTrade.entryPrice,
      },
      liveMirrors,
      summary: {
        liveMirrorCount: liveMirrors.length,
        userCount: userIds.size,
        byExchange,
      },
    });
  } catch (e) {
    // Preflight should never crash a kill-switch flow — its only job is
    // to populate the impact-preview panel. A bare 500 makes the dialog
    // hide the preview and show generic "preflight failed" instead.
    // Surfacing the real message lets the operator diagnose.
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[force-close GET preflight]", msg);
    return NextResponse.json(
      { error: `Preflight failed: ${msg}` },
      { status: 500 },
    );
  }
}

/**
 * POST /api/sim/force-close
 * Body: { simTradeId: string }
 * Auth: admin only (Firebase ID token + admin_user_roles membership).
 *
 * Two behaviours, picked from the sim trade's current state:
 *
 *   • Sim is OPEN → close the sim at market + cascade live mirrors.
 *
 *   • Sim is CLOSED but still has OPEN linked live_trades → "live-only"
 *     recovery cascade. Sim doc is NOT touched. Returns the same
 *     `{ liveClosed, liveErrors }` shape so the caller can show a
 *     toast and retry until clean.
 *
 *   • Sim is CLOSED with zero open mirrors → 400 (nothing to do).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json().catch(() => null);
    const simTradeId =
      body && typeof body === "object" ? (body as { simTradeId?: unknown }).simTradeId : undefined;
    if (!simTradeId || typeof simTradeId !== "string") {
      return NextResponse.json({ error: "Missing simTradeId" }, { status: 400 });
    }

    const db = getAdminFirestore();

    // 1. Load sim trade
    const simDoc = await db.collection("simulator_trades").doc(simTradeId).get();
    if (!simDoc.exists) {
      return NextResponse.json({ error: "Sim trade not found" }, { status: 404 });
    }
    const simTrade = { id: simDoc.id, ...simDoc.data() } as SimTrade;

    // Branch A — sim already CLOSED → "live-only" cascade.
    if (simTrade.status !== "OPEN") {
      const allPricesAdmin = await loadAllPrices(db);
      const exchangeAdmin = (simTrade as any).exchange ?? "BINANCE";
      const fallbackPriceAdmin =
        getPrice(allPricesAdmin, simTrade.symbol, exchangeAdmin)
        ?? simTrade.currentPrice
        ?? simTrade.entryPrice;

      const recovery = await cascadeCloseLiveMirrors(
        db,
        simTradeId,
        fallbackPriceAdmin,
        allPricesAdmin,
      );

      // P2 fix: "sim closed + zero open mirrors" is a no-op success, not
      // an error. Caller should see a benign "nothing to do" toast rather
      // than a destructive "Force close failed" banner. Returning 200
      // with `liveAttempted: 0` keeps the success branch unified.
      if (recovery.liveAttempted === 0) {
        return NextResponse.json({
          success: true,
          mode: "live-only",
          noop: true,
          simTrade: {
            id: simTradeId,
            symbol: simTrade.symbol,
            side: simTrade.side,
          },
          liveAttempted: 0,
          liveClosed: 0,
          userCount: 0,
          userIds: [],
          byExchange: {},
          message: "Sim is already closed and all mirrors are reconciled.",
        });
      }

      await db
        .collection("simulator_logs")
        .add({
          timestamp: new Date().toISOString(),
          action: "KILL_SWITCH_LIVE_RECOVERY",
          details: `${simTrade.symbol} ${simTrade.side}: live-only recovery cascade — closed ${recovery.liveClosed}, errors ${recovery.liveErrors.length}`,
          signalId: simTrade.signalId,
          symbol: simTrade.symbol,
          capital: null,
          pnl: null,
          assetType: (simTrade as any).assetType ?? "CRYPTO",
        })
        .catch(() => {});

      return NextResponse.json({
        success: true,
        mode: "live-only",
        simTrade: {
          id: simTradeId,
          symbol: simTrade.symbol,
          side: simTrade.side,
        },
        liveAttempted: recovery.liveAttempted,
        liveClosed: recovery.liveClosed,
        userCount: recovery.userCount,
        userIds: recovery.userIds,
        byExchange: recovery.byExchange,
        liveErrors: recovery.liveErrors.length > 0 ? recovery.liveErrors : undefined,
      });
    }

    // Branch B — sim still OPEN → standard close + cascade.

    // 2. Get current price (read outside the txn — no concurrent writer)
    const allPrices = await loadAllPrices(db);
    const exchange = (simTrade as any).exchange ?? "BINANCE";
    const currentPrice =
      getPrice(allPrices, simTrade.symbol, exchange) ??
      simTrade.currentPrice ??
      simTrade.entryPrice;
    const killPrice = killSwitchExitPrice(simTrade.entryPrice, currentPrice);
    const assetType = (simTrade as any).assetType ?? "CRYPTO";
    const stateDocId = getSimStateDocId(assetType);
    const simRef = db.collection("simulator_trades").doc(simTradeId);
    const stateRef = db.collection("config").doc(stateDocId);

    // 3. Atomic close (P0 fix): wrap the sim status flip + capital +
    //    win/loss update in a single Firestore transaction. Two concurrent
    //    POSTs that both see the sim as OPEN would otherwise double-debit
    //    capital and append duplicate KILL_SWITCH events. The txn forces
    //    the second caller to re-read inside the txn, find status ===
    //    "CLOSED", and bail out without writing.
    //
    //    Idempotency: if the txn discovers the sim is already CLOSED
    //    (lost the race), we fall through to the live-only cascade path
    //    so the caller still gets the orphaned-mirror sweep. Matches
    //    branch A's contract.
    type TxResult =
      | {
          flipped: true;
          netPnl: number;
          newCapital: number;
          currentPrice: number;
        }
      | { flipped: false; reason: "ALREADY_CLOSED" | "DELETED" };

    const txResult: TxResult = await db.runTransaction(async (tx) => {
      const freshSim = await tx.get(simRef);
      if (!freshSim.exists) {
        return { flipped: false as const, reason: "DELETED" as const };
      }
      const fresh = freshSim.data() as SimTrade;
      if (fresh.status !== "OPEN") {
        return { flipped: false as const, reason: "ALREADY_CLOSED" as const };
      }

      const freshStateSnap = await tx.get(stateRef);
      const freshState: SimulatorState = freshStateSnap.exists
        ? checkDailyReset(freshStateSnap.data() as SimulatorState)
        : createInitialState(assetType);

      const txUnrealized = computeUnrealizedPnl(fresh, killPrice);
      const txExitFee =
        fresh.positionSize * fresh.remainingPct * SIM_CONFIG.EXCHANGE_FEE;
      const txNetPnl = txUnrealized - txExitFee;
      const txTotalRealized = fresh.realizedPnl + txNetPnl;

      const txCloseEvent = {
        type: "KILL_SWITCH" as const,
        price: killPrice,
        pnl: txNetPnl,
        fee: txExitFee,
        closePct: fresh.remainingPct,
        timestamp: new Date().toISOString(),
      };

      // Snapshot the most-recent live score the sync-simulator cron
      // stamped on the open trade so the History view can show
      // "Entry → Close" delta and the Score-vs-Outcome analysis has data
      // for force-closed trades. Conditional copy to avoid writing
      // `undefined` into Firestore.
      const txScoreUpdate: Record<string, unknown> = {};
      if (fresh.currentScore != null) {
        txScoreUpdate.confidenceScoreAtClose = fresh.currentScore;
      }
      if (fresh.currentScorePattern) {
        txScoreUpdate.scorePatternAtClose = fresh.currentScorePattern;
      }

      tx.update(simRef, {
        status: "CLOSED",
        closedAt: new Date().toISOString(),
        closeReason: "KILL_SWITCH",
        currentPrice: killPrice,
        unrealizedPnl: 0,
        remainingPct: 0,
        realizedPnl: txTotalRealized,
        fees: fresh.fees + txExitFee,
        events: [...(fresh.events || []), txCloseEvent],
        ...txScoreUpdate,
      });

      const txNewCapital = freshState.capital + txNetPnl;
      const txStateUpdate: Record<string, unknown> = {
        capital: txNewCapital,
        dailyPnl: (freshState.dailyPnl ?? 0) + txNetPnl,
        totalFeesPaid: (freshState.totalFeesPaid ?? 0) + txExitFee,
        lastUpdated: new Date().toISOString(),
      };
      if (txTotalRealized >= 0) {
        txStateUpdate.totalWins = (freshState.totalWins ?? 0) + 1;
      } else {
        txStateUpdate.totalLosses = (freshState.totalLosses ?? 0) + 1;
      }
      if (freshStateSnap.exists) {
        tx.update(stateRef, txStateUpdate);
      } else {
        tx.set(stateRef, { ...freshState, ...txStateUpdate });
      }

      return {
        flipped: true as const,
        netPnl: txNetPnl,
        newCapital: txNewCapital,
        currentPrice,
      };
    });

    if (!txResult.flipped && txResult.reason === "DELETED") {
      return NextResponse.json({ error: "Sim trade not found" }, { status: 404 });
    }

    // Lost the race — another concurrent kill-switch flipped the sim
    // while we were mid-flight. Fall through to the live-only cascade so
    // the caller still gets the orphaned-mirror sweep (matches branch
    // A's contract). Sim doc state is NOT touched a second time.
    if (!txResult.flipped) {
      const recovery = await cascadeCloseLiveMirrors(
        db,
        simTradeId,
        currentPrice,
        allPrices,
      );
      return NextResponse.json({
        success: true,
        mode: "live-only",
        raced: true,
        simTrade: {
          id: simTradeId,
          symbol: simTrade.symbol,
          side: simTrade.side,
        },
        liveAttempted: recovery.liveAttempted,
        liveClosed: recovery.liveClosed,
        userCount: recovery.userCount,
        userIds: recovery.userIds,
        byExchange: recovery.byExchange,
        liveErrors: recovery.liveErrors.length > 0 ? recovery.liveErrors : undefined,
      });
    }

    // 4. Queue blockchain publication (best-effort; failures are
    //    non-fatal because the sim is already correctly closed).
    await markTradeForBlockchain(db, simTradeId).catch((e) => {
      console.error("[force-close] blockchain publish queue failed:", e);
    });

    // 5. Audit log — written outside the txn so a log failure doesn't
    //    roll back the close. Logging is best-effort.
    await db
      .collection("simulator_logs")
      .add({
        timestamp: new Date().toISOString(),
        action: "KILL_SWITCH",
        details: `${simTrade.symbol} ${simTrade.side} force-closed @ ${txResult.currentPrice} | PnL: ${txResult.netPnl.toFixed(4)}`,
        signalId: simTrade.signalId,
        symbol: simTrade.symbol,
        capital: txResult.newCapital,
        pnl: txResult.netPnl,
        assetType,
      })
      .catch((e) => {
        console.error("[force-close] simulator_logs write failed:", e);
      });

    // 6. Cascade to linked live trades (shared helper — same logic the
    //    "live-only" recovery branch uses).
    const cascade = await cascadeCloseLiveMirrors(
      db,
      simTradeId,
      txResult.currentPrice,
      allPrices,
    );

    return NextResponse.json({
      success: true,
      mode: "default",
      simTrade: {
        id: simTradeId,
        symbol: simTrade.symbol,
        side: simTrade.side,
        closePrice: txResult.currentPrice,
        pnl: txResult.netPnl,
      },
      liveAttempted: cascade.liveAttempted,
      liveClosed: cascade.liveClosed,
      userCount: cascade.userCount,
      userIds: cascade.userIds,
      byExchange: cascade.byExchange,
      liveErrors: cascade.liveErrors.length > 0 ? cascade.liveErrors : undefined,
    });
  } catch (e) {
    // Last-resort guard. The only unexpected throws that should reach
    // here are:
    //   • Firestore transaction `ABORTED` (5 retries exhausted)
    //   • Firestore quota / network outage on a non-wrapped read
    //   • Misshapen request body that survived `request.json().catch(...)`
    // The sim flip is wrapped in a Firestore txn, so either the close
    // committed atomically or didn't commit at all — there is no
    // partial-flip state. If the cascade is what threw, the sim is
    // already CLOSED and `sync-live-trades` will sweep mirrors on
    // its next 1-min tick (KILL_SWITCH is NOT in the
    // NON_MIRRORED_SIM_CLOSE_REASONS whitelist).
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[force-close POST]", msg, e);
    return NextResponse.json(
      {
        error: `Force close failed: ${msg}`,
        retrySafe: true,
        hint: "If the sim doc is already CLOSED, sync-live-trades will reconcile any open mirrors within 60s. Otherwise, retry the kill switch — the operation is idempotent.",
      },
      { status: 500 },
    );
  }
}
