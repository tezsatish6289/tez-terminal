import {
  toBinanceSymbol,
  getSymbolInfo,
  adjustQuantity,
  checkNotional,
  floorToStep,
  setMarginType,
  setLeverage,
  placeMarketOrder,
  placeExitOrders,
  replaceSl,
  placeMarketClose,
  cancelAllOrders,
  getOpenOrders,
  getOrder,
  getUsdtBalance,
  type BinanceOrder,
  type SymbolInfo,
  BinanceApiError,
} from "./binance";
import { decrypt } from "./crypto";
import { SIM_CONFIG } from "./simulator";
import type { SimTrade } from "./simulator";

// ── Types ────────────────────────────────────────────────────

export interface LiveTrade {
  id?: string;
  userId: string;
  signalId: string;
  simTradeId: string;
  symbol: string;              // Binance symbol (no .P)
  signalSymbol: string;        // Original signal symbol (with .P)
  side: "BUY" | "SELL";
  leverage: number;
  entryOrderId: string;
  entryPrice: number;          // actual fill price
  quantity: number;            // in contracts
  positionSize: number;        // in USDT
  remainingQty: number;        // decreases as TPs fill
  stopLoss: number;
  trailingSl: number | null;
  tp1: number;
  tp2: number;
  tp3: number;
  slOrderId: string | null;
  tp1OrderId: string | null;
  tp2OrderId: string | null;
  tp3OrderId: string | null;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  slHit: boolean;
  status: "OPEN" | "CLOSED";
  realizedPnl: number;
  fees: number;
  closeReason: string | null;
  events: LiveTradeEvent[];
  openedAt: string;
  closedAt: string | null;
  confidenceScore: number;
  biasAtEntry: string;
  capitalAtEntry: number;
  timeframe: string;
  algo: string;
}

export interface LiveTradeEvent {
  type: "OPEN" | "TP1" | "TP2" | "TP3" | "SL" | "SL_TO_BE" | "MARKET_TURN" | "SCORE_DEGRADED" | "KILL_SWITCH";
  price: number;
  pnl: number;
  fee: number;
  closePct: number;
  quantity: number;
  orderId: string | null;
  timestamp: string;
}

export interface TradeExecutionResult {
  success: boolean;
  trade?: LiveTrade;
  error?: string;
  warnings: string[];
}

export interface Credentials {
  apiKey: string;
  apiSecret: string;
}

// ── Credential Helpers ────────────────────────────────────────

export function decryptCredentials(encryptedKey: string, encryptedSecret: string): Credentials {
  return {
    apiKey: decrypt(encryptedKey),
    apiSecret: decrypt(encryptedSecret),
  };
}

// ── Core: Execute Trade ────────────────────────────────────────

/**
 * Full trade execution pipeline:
 * 1. Set isolated margin
 * 2. Set leverage
 * 3. Place market entry
 * 4. Place SL + TP1/TP2/TP3 orders
 * 5. Return LiveTrade with all order IDs
 */
export async function executeTrade(
  simTrade: SimTrade,
  userId: string,
  simTradeId: string,
  capital: number,
  creds: Credentials
): Promise<TradeExecutionResult> {
  const warnings: string[] = [];
  const binanceSymbol = toBinanceSymbol(simTrade.symbol);

  try {
    const info = await getSymbolInfo(binanceSymbol);

    // 1. Set isolated margin
    await setMarginType(binanceSymbol, "ISOLATED", creds);

    // 2. Set leverage
    await setLeverage(binanceSymbol, simTrade.leverage, creds);

    // 3. Calculate position size and quantity
    const riskPct = SIM_CONFIG.RISK_PER_TRADE_BASE;
    const riskAmount = capital * riskPct;
    const slDistance = Math.abs(simTrade.entryPrice - simTrade.stopLoss) / simTrade.entryPrice;
    const notionalSize = slDistance > 0 ? (riskAmount / slDistance) : riskAmount * simTrade.leverage;
    const rawQty = notionalSize / simTrade.entryPrice;

    const qtyResult = adjustQuantity(rawQty, info);
    if ("error" in qtyResult) {
      return { success: false, error: qtyResult.error, warnings };
    }
    const { quantity } = qtyResult;

    if (!checkNotional(simTrade.entryPrice, quantity, info)) {
      return { success: false, error: `Below minimum notional: ${simTrade.entryPrice * quantity} < ${info.minNotional}`, warnings };
    }

    // 4. Verify sufficient balance
    const balance = await getUsdtBalance(creds);
    const marginRequired = (quantity * simTrade.entryPrice) / simTrade.leverage;
    if (balance.available < marginRequired * 1.05) {
      return { success: false, error: `Insufficient balance: need ~${marginRequired.toFixed(2)} USDT margin, have ${balance.available.toFixed(2)}`, warnings };
    }

    // 5. Place market entry
    const entryOrder = await placeMarketOrder(binanceSymbol, simTrade.side, quantity, creds);
    const fillPrice = parseFloat(entryOrder.avgPrice || entryOrder.price);
    const fillQty = parseFloat(entryOrder.executedQty);

    // Check slippage
    const slippage = Math.abs(fillPrice - simTrade.entryPrice) / simTrade.entryPrice;
    if (slippage > 0.005) {
      warnings.push(`Entry slippage: ${(slippage * 100).toFixed(2)}% (expected ${simTrade.entryPrice}, got ${fillPrice})`);
    }

    // 6. Place exit orders (SL + TP1/TP2/TP3)
    const exitResults = await placeExitOrders(
      binanceSymbol,
      simTrade.side,
      fillQty,
      simTrade.stopLoss,
      simTrade.tp1,
      simTrade.tp2,
      simTrade.tp3,
      info,
      creds
    );

    // If SL placement failed, emergency close
    if (!exitResults.slOrder.success) {
      warnings.push(`SL order failed: ${exitResults.slOrder.error}. Emergency closing position.`);
      try {
        await placeMarketClose(binanceSymbol, simTrade.side, fillQty, creds);
      } catch {
        // worst case — will be caught by reconciliation
      }
      return { success: false, error: `SL placement failed after entry. Position emergency closed. ${exitResults.slOrder.error}`, warnings };
    }

    if (!exitResults.tp1Order.success) warnings.push(`TP1 order failed: ${exitResults.tp1Order.error}`);
    if (!exitResults.tp2Order.success) warnings.push(`TP2 order failed: ${exitResults.tp2Order.error}`);
    if (!exitResults.tp3Order.success) warnings.push(`TP3 order failed: ${exitResults.tp3Order.error}`);

    const entryFee = fillPrice * fillQty * SIM_CONFIG.EXCHANGE_FEE;

    const liveTrade: LiveTrade = {
      userId,
      signalId: simTrade.signalId,
      simTradeId,
      symbol: binanceSymbol,
      signalSymbol: simTrade.symbol,
      side: simTrade.side,
      leverage: simTrade.leverage,
      entryOrderId: entryOrder.orderId,
      entryPrice: fillPrice,
      quantity: fillQty,
      positionSize: fillPrice * fillQty,
      remainingQty: fillQty,
      stopLoss: simTrade.stopLoss,
      trailingSl: null,
      tp1: simTrade.tp1,
      tp2: simTrade.tp2,
      tp3: simTrade.tp3,
      slOrderId: exitResults.slOrder.order?.orderId ?? null,
      tp1OrderId: exitResults.tp1Order.order?.orderId ?? null,
      tp2OrderId: exitResults.tp2Order.order?.orderId ?? null,
      tp3OrderId: exitResults.tp3Order.order?.orderId ?? null,
      tp1Hit: false,
      tp2Hit: false,
      tp3Hit: false,
      slHit: false,
      status: "OPEN",
      realizedPnl: 0,
      fees: entryFee,
      closeReason: null,
      events: [
        {
          type: "OPEN",
          price: fillPrice,
          pnl: 0,
          fee: entryFee,
          closePct: 0,
          quantity: fillQty,
          orderId: entryOrder.orderId,
          timestamp: new Date().toISOString(),
        },
      ],
      openedAt: new Date().toISOString(),
      closedAt: null,
      confidenceScore: simTrade.confidenceScore,
      biasAtEntry: simTrade.biasAtEntry,
      capitalAtEntry: capital,
      timeframe: simTrade.timeframe,
      algo: simTrade.algo,
    };

    return { success: true, trade: liveTrade, warnings };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      warnings,
    };
  }
}

// ── TP Hit Handler ────────────────────────────────────────────

/**
 * Called when we detect a TP order has been filled on Binance.
 * Adjusts the SL order for remaining quantity.
 */
export async function handleTpFill(
  trade: LiveTrade,
  tpLevel: 1 | 2 | 3,
  fillPrice: number,
  fillQty: number,
  creds: Credentials
): Promise<{
  updatedFields: Partial<LiveTrade>;
  newEvent: LiveTradeEvent;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const info = await getSymbolInfo(trade.symbol);

  const newRemainingQty = floorToStep(trade.remainingQty - fillQty, info.stepSize);
  const closePct = fillQty / trade.quantity;

  // Calculate PnL for this TP hit
  const priceDiff = trade.side === "BUY"
    ? fillPrice - trade.entryPrice
    : trade.entryPrice - fillPrice;
  const pnl = priceDiff * fillQty * trade.leverage;
  const fee = fillPrice * fillQty * SIM_CONFIG.EXCHANGE_FEE;

  const event: LiveTradeEvent = {
    type: `TP${tpLevel}` as "TP1" | "TP2" | "TP3",
    price: fillPrice,
    pnl,
    fee,
    closePct,
    quantity: fillQty,
    orderId: null,
    timestamp: new Date().toISOString(),
  };

  const updatedFields: Partial<LiveTrade> = {
    [`tp${tpLevel}Hit`]: true,
    remainingQty: newRemainingQty,
    realizedPnl: trade.realizedPnl + pnl,
    fees: trade.fees + fee,
  };

  // Replace SL with updated quantity (or at breakeven if TP1)
  if (newRemainingQty > 0 && trade.slOrderId) {
    const newSlPrice = tpLevel === 1 ? trade.entryPrice : (trade.trailingSl ?? trade.entryPrice);
    const slResult = await replaceSl(
      trade.symbol,
      trade.side,
      trade.slOrderId,
      newSlPrice,
      newRemainingQty,
      info,
      creds
    );

    if (slResult.newOrder.success) {
      updatedFields.slOrderId = slResult.newOrder.order!.orderId;
      if (tpLevel === 1) {
        updatedFields.trailingSl = trade.entryPrice;
      }
    } else {
      warnings.push(`SL replacement failed after TP${tpLevel}: ${slResult.newOrder.error}`);
    }
  }

  // If position fully closed (TP3 or no remaining qty)
  if (newRemainingQty <= 0 || tpLevel === 3) {
    updatedFields.status = "CLOSED";
    updatedFields.closedAt = new Date().toISOString();
    updatedFields.closeReason = `TP${tpLevel}`;
    // Cancel any remaining open orders
    try {
      await cancelAllOrders(trade.symbol, creds);
    } catch {
      // best effort
    }
  }

  return { updatedFields, newEvent: event, warnings };
}

// ── SL Hit Handler ────────────────────────────────────────────

export async function handleSlFill(
  trade: LiveTrade,
  fillPrice: number,
  fillQty: number
): Promise<{
  updatedFields: Partial<LiveTrade>;
  newEvent: LiveTradeEvent;
}> {
  const closePct = fillQty / trade.quantity;
  const priceDiff = trade.side === "BUY"
    ? fillPrice - trade.entryPrice
    : trade.entryPrice - fillPrice;
  const pnl = priceDiff * fillQty * trade.leverage;
  const fee = fillPrice * fillQty * SIM_CONFIG.EXCHANGE_FEE;

  const event: LiveTradeEvent = {
    type: "SL",
    price: fillPrice,
    pnl,
    fee,
    closePct,
    quantity: fillQty,
    orderId: null,
    timestamp: new Date().toISOString(),
  };

  const updatedFields: Partial<LiveTrade> = {
    slHit: true,
    remainingQty: 0,
    realizedPnl: trade.realizedPnl + pnl,
    fees: trade.fees + fee,
    status: "CLOSED",
    closedAt: new Date().toISOString(),
    closeReason: trade.trailingSl != null ? "TRAILING_SL" : "SL",
  };

  return { updatedFields, newEvent: event };
}

// ── Trailing SL Handler ────────────────────────────────────────

/**
 * Check if SL should be moved to breakeven (entry).
 * Triggered when price crosses 50% of distance from entry to TP1.
 */
export async function moveSlToBreakeven(
  trade: LiveTrade,
  currentPrice: number,
  creds: Credentials
): Promise<{
  moved: boolean;
  updatedFields?: Partial<LiveTrade>;
  newEvent?: LiveTradeEvent;
  warning?: string;
}> {
  if (trade.trailingSl != null) return { moved: false };

  const distToTp1 = Math.abs(trade.tp1 - trade.entryPrice);
  const threshold = trade.side === "BUY"
    ? trade.entryPrice + distToTp1 * 0.5
    : trade.entryPrice - distToTp1 * 0.5;

  const crossed = trade.side === "BUY"
    ? currentPrice >= threshold
    : currentPrice <= threshold;

  if (!crossed) return { moved: false };

  const info = await getSymbolInfo(trade.symbol);

  if (!trade.slOrderId) {
    return { moved: false, warning: "No SL order ID to replace" };
  }

  const slResult = await replaceSl(
    trade.symbol,
    trade.side,
    trade.slOrderId,
    trade.entryPrice,
    trade.remainingQty,
    info,
    creds
  );

  if (!slResult.newOrder.success) {
    return { moved: false, warning: `SL→BE failed: ${slResult.newOrder.error}` };
  }

  return {
    moved: true,
    updatedFields: {
      trailingSl: trade.entryPrice,
      slOrderId: slResult.newOrder.order!.orderId,
    },
    newEvent: {
      type: "SL_TO_BE",
      price: currentPrice,
      pnl: 0,
      fee: 0,
      closePct: 0,
      quantity: 0,
      orderId: slResult.newOrder.order!.orderId,
      timestamp: new Date().toISOString(),
    },
  };
}

// ── Protective Closes ────────────────────────────────────────

/**
 * Force close a live trade (market turn, score degradation, kill switch).
 * Cancels all open orders and market closes the position.
 */
export async function protectiveClose(
  trade: LiveTrade,
  reason: "MARKET_TURN" | "SCORE_DEGRADED" | "KILL_SWITCH",
  currentPrice: number,
  creds: Credentials
): Promise<{
  updatedFields: Partial<LiveTrade>;
  newEvent: LiveTradeEvent;
  warning?: string;
}> {
  // Cancel all pending orders for this symbol
  try {
    await cancelAllOrders(trade.symbol, creds);
  } catch {
    // best effort
  }

  // Market close the remaining position
  let fillPrice = currentPrice;
  let fillQty = trade.remainingQty;
  try {
    const closeOrder = await placeMarketClose(trade.symbol, trade.side, trade.remainingQty, creds);
    fillPrice = parseFloat(closeOrder.avgPrice || closeOrder.price) || currentPrice;
    fillQty = parseFloat(closeOrder.executedQty) || trade.remainingQty;
  } catch (e) {
    return {
      updatedFields: {},
      newEvent: {
        type: reason,
        price: currentPrice,
        pnl: 0,
        fee: 0,
        closePct: 0,
        quantity: 0,
        orderId: null,
        timestamp: new Date().toISOString(),
      },
      warning: `Protective close failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const closePct = fillQty / trade.quantity;
  const priceDiff = trade.side === "BUY"
    ? fillPrice - trade.entryPrice
    : trade.entryPrice - fillPrice;
  const pnl = priceDiff * fillQty * trade.leverage;
  const fee = fillPrice * fillQty * SIM_CONFIG.EXCHANGE_FEE;

  return {
    updatedFields: {
      slHit: false,
      remainingQty: 0,
      realizedPnl: trade.realizedPnl + pnl,
      fees: trade.fees + fee,
      status: "CLOSED",
      closedAt: new Date().toISOString(),
      closeReason: reason,
      slOrderId: null,
      tp1OrderId: null,
      tp2OrderId: null,
      tp3OrderId: null,
    },
    newEvent: {
      type: reason,
      price: fillPrice,
      pnl,
      fee,
      closePct,
      quantity: fillQty,
      orderId: null,
      timestamp: new Date().toISOString(),
    },
  };
}

// ── Order Fill Detection ────────────────────────────────────────

interface OrderFillCheck {
  tp1Filled: boolean;
  tp2Filled: boolean;
  tp3Filled: boolean;
  slFilled: boolean;
  fills: Array<{ type: "TP1" | "TP2" | "TP3" | "SL"; price: number; qty: number; orderId: string }>;
}

/**
 * Check which orders have been filled for a live trade.
 * Called by the cron job to detect fills via polling.
 */
export async function checkOrderFills(
  trade: LiveTrade,
  creds: Credentials
): Promise<OrderFillCheck> {
  const result: OrderFillCheck = {
    tp1Filled: false,
    tp2Filled: false,
    tp3Filled: false,
    slFilled: false,
    fills: [],
  };

  const checkOrder = async (
    orderId: string | null,
    type: "TP1" | "TP2" | "TP3" | "SL",
    alreadyHit: boolean
  ) => {
    if (!orderId || alreadyHit) return;
    try {
      const order = await getOrder(trade.symbol, orderId, creds);
      if (order.status === "FILLED") {
        const price = parseFloat(order.avgPrice || order.price);
        const qty = parseFloat(order.executedQty);
        result.fills.push({ type, price, qty, orderId });
        if (type === "TP1") result.tp1Filled = true;
        if (type === "TP2") result.tp2Filled = true;
        if (type === "TP3") result.tp3Filled = true;
        if (type === "SL") result.slFilled = true;
      }
    } catch {
      // order may have been cancelled
    }
  };

  await Promise.all([
    checkOrder(trade.tp1OrderId, "TP1", trade.tp1Hit),
    checkOrder(trade.tp2OrderId, "TP2", trade.tp2Hit),
    checkOrder(trade.tp3OrderId, "TP3", trade.tp3Hit),
    checkOrder(trade.slOrderId, "SL", trade.slHit),
  ]);

  return result;
}

// ── Reconciliation ────────────────────────────────────────────

export interface ReconciliationResult {
  symbol: string;
  firestoreQty: number;
  binanceQty: number;
  mismatch: boolean;
  details: string;
}

/**
 * Compare Firestore live_trades state vs actual Binance positions.
 * Returns discrepancies for alerting.
 */
export async function reconcile(
  trades: LiveTrade[],
  creds: Credentials
): Promise<ReconciliationResult[]> {
  const results: ReconciliationResult[] = [];

  const openTrades = trades.filter((t) => t.status === "OPEN");
  const symbolMap = new Map<string, number>();

  for (const t of openTrades) {
    const existing = symbolMap.get(t.symbol) ?? 0;
    const qty = t.side === "BUY" ? t.remainingQty : -t.remainingQty;
    symbolMap.set(t.symbol, existing + qty);
  }

  for (const [symbol, expectedQty] of symbolMap) {
    try {
      const { getPosition } = await import("./binance");
      const pos = await getPosition(symbol, creds);
      const actualQty = pos ? parseFloat(pos.positionAmt) : 0;
      const mismatch = Math.abs(actualQty - expectedQty) > 0.001;

      results.push({
        symbol,
        firestoreQty: expectedQty,
        binanceQty: actualQty,
        mismatch,
        details: mismatch
          ? `Expected ${expectedQty}, Binance has ${actualQty}`
          : "In sync",
      });
    } catch (e) {
      results.push({
        symbol,
        firestoreQty: expectedQty,
        binanceQty: 0,
        mismatch: true,
        details: `Failed to check: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  return results;
}
