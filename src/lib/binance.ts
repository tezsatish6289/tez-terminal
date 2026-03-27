/**
 * Exchange client — Bybit v5 Unified API
 *
 * Kept as binance.ts to minimize import changes across the codebase.
 * All exported function signatures remain compatible with trade-engine.ts.
 */
import crypto from "crypto";

// ── Configuration ────────────────────────────────────────────

const PROD_BASE = "https://api.bybit.com";
const TESTNET_BASE = "https://api-testnet.bybit.com";

function baseUrl(testnet?: boolean): string {
  return testnet ? TESTNET_BASE : PROD_BASE;
}

// ── HMAC Signing (Bybit v5) ────────────────────────────────

function sign(
  timestamp: number,
  apiKey: string,
  recvWindow: number,
  payload: string,
  secret: string
): string {
  const signStr = `${timestamp}${apiKey}${recvWindow}${payload}`;
  return crypto.createHmac("sha256", secret).update(signStr).digest("hex");
}

// ── Request Helpers ────────────────────────────────────────────

export interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
}

interface BybitResponse<T> {
  retCode: number;
  retMsg: string;
  result: T;
  time: number;
}

async function signedGet<T>(
  path: string,
  params: Record<string, string | number | boolean>,
  creds: BinanceCredentials
): Promise<T> {
  const base = baseUrl(creds.testnet);
  const timestamp = Date.now();
  const recvWindow = 5000;

  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

  const signature = sign(timestamp, creds.apiKey, recvWindow, qs, creds.apiSecret);

  const res = await fetch(`${base}${path}${qs ? `?${qs}` : ""}`, {
    method: "GET",
    headers: {
      "X-BAPI-API-KEY": creds.apiKey,
      "X-BAPI-SIGN": signature,
      "X-BAPI-SIGN-TYPE": "2",
      "X-BAPI-TIMESTAMP": String(timestamp),
      "X-BAPI-RECV-WINDOW": String(recvWindow),
    },
  });

  const data = (await res.json()) as BybitResponse<T>;
  if (data.retCode !== 0) {
    throw new BinanceApiError(data.retMsg, data.retCode, path);
  }
  return data.result;
}

async function signedPost<T>(
  path: string,
  body: Record<string, unknown>,
  creds: BinanceCredentials
): Promise<T> {
  const base = baseUrl(creds.testnet);
  const timestamp = Date.now();
  const recvWindow = 5000;

  const bodyStr = JSON.stringify(body);
  const signature = sign(timestamp, creds.apiKey, recvWindow, bodyStr, creds.apiSecret);

  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "X-BAPI-API-KEY": creds.apiKey,
      "X-BAPI-SIGN": signature,
      "X-BAPI-SIGN-TYPE": "2",
      "X-BAPI-TIMESTAMP": String(timestamp),
      "X-BAPI-RECV-WINDOW": String(recvWindow),
      "Content-Type": "application/json",
    },
    body: bodyStr,
  });

  const data = (await res.json()) as BybitResponse<T>;
  if (data.retCode !== 0) {
    throw new BinanceApiError(data.retMsg, data.retCode, path);
  }
  return data.result;
}

async function publicGet<T>(
  path: string,
  params?: Record<string, string | number>,
  testnet?: boolean
): Promise<T> {
  const base = baseUrl(testnet);
  const qs = params
    ? "?" + Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")
    : "";
  const res = await fetch(`${base}${path}${qs}`);
  const data = (await res.json()) as BybitResponse<T>;
  if (data.retCode !== 0) {
    throw new BinanceApiError(data.retMsg, data.retCode, path);
  }
  return data.result;
}

// ── Error Class ────────────────────────────────────────────

export class BinanceApiError extends Error {
  constructor(
    message: string,
    public code: number,
    public endpoint: string
  ) {
    super(`[Bybit ${code}] ${endpoint}: ${message}`);
    this.name = "BinanceApiError";
  }
}

// ── Exchange Info Cache ────────────────────────────────────────

export interface SymbolInfo {
  symbol: string;
  pricePrecision: number;
  quantityPrecision: number;
  minQty: number;
  maxQty: number;
  stepSize: number;
  tickSize: number;
  minNotional: number;
}

interface BybitInstrument {
  symbol: string;
  lotSizeFilter: {
    maxOrderQty: string;
    minOrderQty: string;
    qtyStep: string;
    minNotionalValue?: string;
  };
  priceFilter: {
    tickSize: string;
    minPrice: string;
    maxPrice: string;
  };
}

const cache: Record<string, { symbols: Map<string, SymbolInfo>; ts: number }> = {};
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

export async function getExchangeInfo(forceRefresh = false, testnet?: boolean): Promise<Map<string, SymbolInfo>> {
  const key = testnet ? "testnet" : "prod";
  const cached = cache[key];
  if (!forceRefresh && cached && cached.symbols.size > 0 && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.symbols;
  }

  const data = await publicGet<{ list: BybitInstrument[] }>(
    "/v5/market/instruments-info",
    { category: "linear" },
    testnet
  );
  const map = new Map<string, SymbolInfo>();

  for (const s of data.list) {
    const stepSize = parseFloat(s.lotSizeFilter.qtyStep);
    const tickSize = parseFloat(s.priceFilter.tickSize);
    const qtyPrecision = Math.max(0, Math.round(-Math.log10(stepSize)));
    const pricePrecision = Math.max(0, Math.round(-Math.log10(tickSize)));

    map.set(s.symbol, {
      symbol: s.symbol,
      pricePrecision,
      quantityPrecision: qtyPrecision,
      minQty: parseFloat(s.lotSizeFilter.minOrderQty),
      maxQty: parseFloat(s.lotSizeFilter.maxOrderQty),
      stepSize,
      tickSize,
      minNotional: parseFloat(s.lotSizeFilter.minNotionalValue ?? "5"),
    });
  }

  cache[key] = { symbols: map, ts: Date.now() };
  return map;
}

export async function getSymbolInfo(symbol: string, testnet?: boolean): Promise<SymbolInfo> {
  const map = await getExchangeInfo(false, testnet);
  const info = map.get(symbol);
  if (!info) throw new Error(`Symbol ${symbol} not found on Bybit Futures`);
  return info;
}

// ── Quantity & Price Utilities ────────────────────────────────

export function floorToStep(value: number, stepSize: number): number {
  const precision = Math.max(0, Math.round(-Math.log10(stepSize)));
  const steps = Math.floor(value / stepSize);
  return parseFloat((steps * stepSize).toFixed(precision));
}

export function roundToTick(price: number, tickSize: number): number {
  const precision = Math.max(0, Math.round(-Math.log10(tickSize)));
  const ticks = Math.round(price / tickSize);
  return parseFloat((ticks * tickSize).toFixed(precision));
}

export function adjustQuantity(
  rawQty: number,
  info: SymbolInfo
): { quantity: number } | { error: string } {
  const qty = floorToStep(rawQty, info.stepSize);
  if (qty < info.minQty) return { error: `Quantity ${qty} below minQty ${info.minQty}` };
  if (qty > info.maxQty) return { error: `Quantity ${qty} above maxQty ${info.maxQty}` };
  return { quantity: qty };
}

export function checkNotional(price: number, qty: number, info: SymbolInfo): boolean {
  return price * qty >= info.minNotional;
}

// ── Symbol Mapping ────────────────────────────────────────────

export function toBinanceSymbol(signalSymbol: string): string {
  return signalSymbol.replace(/\.P$/i, "");
}

// ── Bybit side mapping ────────────────────────────────────────

function toBybitSide(side: "BUY" | "SELL"): "Buy" | "Sell" {
  return side === "BUY" ? "Buy" : "Sell";
}

// ── Account & Position ────────────────────────────────────────

export interface FuturesBalance {
  asset: string;
  balance: string;
  availableBalance: string;
  crossUnPnl: string;
}

interface BybitWalletResult {
  list: Array<{
    accountType: string;
    coin: Array<{
      coin: string;
      walletBalance: string;
      availableToWithdraw: string;
      unrealisedPnl: string;
    }>;
  }>;
}

export async function getBalance(creds: BinanceCredentials): Promise<FuturesBalance[]> {
  // Try UNIFIED first, fall back to CONTRACT
  for (const accountType of ["UNIFIED", "CONTRACT"]) {
    try {
      const data = await signedGet<BybitWalletResult>(
        "/v5/account/wallet-balance",
        { accountType },
        creds
      );
      if (data.list.length > 0 && data.list[0].coin.length > 0) {
        return data.list[0].coin.map((c) => ({
          asset: c.coin,
          balance: c.walletBalance,
          availableBalance: c.availableToWithdraw,
          crossUnPnl: c.unrealisedPnl,
        }));
      }
    } catch {
      continue;
    }
  }
  return [];
}

export async function getUsdtBalance(creds: BinanceCredentials): Promise<{ total: number; available: number }> {
  const balances = await getBalance(creds);
  const usdt = balances.find((b) => b.asset === "USDT");
  return {
    total: parseFloat(usdt?.balance ?? "0"),
    available: parseFloat(usdt?.availableBalance ?? "0"),
  };
}

export interface FuturesPosition {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  liquidationPrice: string;
  leverage: string;
  marginType: string;
  isolatedMargin: string;
  positionSide: string;
}

export async function getPositions(creds: BinanceCredentials): Promise<FuturesPosition[]> {
  const data = await signedGet<{ list: Array<Record<string, string>> }>(
    "/v5/position/list",
    { category: "linear", settleCoin: "USDT" },
    creds
  );
  return data.list
    .filter((p) => parseFloat(p.size) !== 0)
    .map((p) => ({
      symbol: p.symbol,
      positionAmt: p.side === "Sell" ? `-${p.size}` : p.size,
      entryPrice: p.avgPrice,
      markPrice: p.markPrice,
      unRealizedProfit: p.unrealisedPnl,
      liquidationPrice: p.liqPrice,
      leverage: p.leverage,
      marginType: p.tradeMode === "1" ? "isolated" : "cross",
      isolatedMargin: p.positionIM || "0",
      positionSide: "BOTH",
    }));
}

export async function getPosition(symbol: string, creds: BinanceCredentials): Promise<FuturesPosition | null> {
  const data = await signedGet<{ list: Array<Record<string, string>> }>(
    "/v5/position/list",
    { category: "linear", symbol },
    creds
  );
  const pos = data.list.find((p) => parseFloat(p.size) !== 0);
  if (!pos) return null;
  return {
    symbol: pos.symbol,
    positionAmt: pos.side === "Sell" ? `-${pos.size}` : pos.size,
    entryPrice: pos.avgPrice,
    markPrice: pos.markPrice,
    unRealizedProfit: pos.unrealisedPnl,
    liquidationPrice: pos.liqPrice,
    leverage: pos.leverage,
    marginType: pos.tradeMode === "1" ? "isolated" : "cross",
    isolatedMargin: pos.positionIM || "0",
    positionSide: "BOTH",
  };
}

// ── Margin & Leverage ────────────────────────────────────────

export async function setMarginType(
  symbol: string,
  marginType: "ISOLATED" | "CROSSED",
  creds: BinanceCredentials
): Promise<void> {
  try {
    await signedPost(
      "/v5/position/switch-isolated",
      {
        category: "linear",
        symbol,
        tradeMode: marginType === "ISOLATED" ? 1 : 0,
        buyLeverage: "10",
        sellLeverage: "10",
      },
      creds
    );
  } catch (e) {
    // 110026 = margin mode not modified (already set)
    if (e instanceof BinanceApiError && e.code === 110026) return;
    throw e;
  }
}

export async function setLeverage(
  symbol: string,
  leverage: number,
  creds: BinanceCredentials
): Promise<void> {
  try {
    await signedPost(
      "/v5/position/set-leverage",
      {
        category: "linear",
        symbol,
        buyLeverage: String(leverage),
        sellLeverage: String(leverage),
      },
      creds
    );
  } catch (e) {
    // 110043 = leverage not modified (already set)
    if (e instanceof BinanceApiError && e.code === 110043) return;
    throw e;
  }
}

// ── Order Types ────────────────────────────────────────────

export interface BinanceOrder {
  orderId: string;
  symbol: string;
  status: string;
  clientOrderId: string;
  price: string;
  avgPrice: string;
  origQty: string;
  executedQty: string;
  cumQuote: string;
  type: string;
  side: string;
  stopPrice: string;
  time: number;
  updateTime: number;
}

interface BybitOrderResult {
  orderId: string;
  orderLinkId: string;
}

interface BybitOrderDetail {
  orderId: string;
  orderLinkId: string;
  symbol: string;
  side: string;
  orderType: string;
  price: string;
  qty: string;
  cumExecQty: string;
  cumExecValue: string;
  avgPrice: string;
  orderStatus: string;
  triggerPrice: string;
  createdTime: string;
  updatedTime: string;
}

function mapBybitOrder(o: BybitOrderDetail): BinanceOrder {
  return {
    orderId: o.orderId,
    symbol: o.symbol,
    status: mapBybitStatus(o.orderStatus),
    clientOrderId: o.orderLinkId,
    price: o.price,
    avgPrice: o.avgPrice,
    origQty: o.qty,
    executedQty: o.cumExecQty,
    cumQuote: o.cumExecValue,
    type: o.orderType,
    side: o.side === "Buy" ? "BUY" : "SELL",
    stopPrice: o.triggerPrice,
    time: parseInt(o.createdTime) || 0,
    updateTime: parseInt(o.updatedTime) || 0,
  };
}

function mapBybitStatus(s: string): string {
  const map: Record<string, string> = {
    New: "NEW",
    PartiallyFilled: "PARTIALLY_FILLED",
    Filled: "FILLED",
    Cancelled: "CANCELED",
    Rejected: "REJECTED",
    Deactivated: "CANCELED",
    Triggered: "NEW",
    Untriggered: "NEW",
  };
  return map[s] || s;
}

/** Place a MARKET order for entry. */
export async function placeMarketOrder(
  symbol: string,
  side: "BUY" | "SELL",
  quantity: number,
  creds: BinanceCredentials
): Promise<BinanceOrder> {
  const result = await signedPost<BybitOrderResult>(
    "/v5/order/create",
    {
      category: "linear",
      symbol,
      side: toBybitSide(side),
      orderType: "Market",
      qty: String(quantity),
      timeInForce: "GTC",
    },
    creds
  );

  // Fetch filled order details
  await new Promise((r) => setTimeout(r, 500));
  return getOrder(symbol, result.orderId, creds);
}

/** Place a STOP_MARKET order (for SL). Uses reduceOnly. */
export async function placeStopMarket(
  symbol: string,
  side: "BUY" | "SELL",
  stopPrice: number,
  quantity: number,
  creds: BinanceCredentials,
  tickSize: number
): Promise<BinanceOrder> {
  // SL: exit side SELL → price falls (dir=2), exit side BUY → price rises (dir=1)
  const triggerDirection = side === "SELL" ? 2 : 1;

  const result = await signedPost<BybitOrderResult>(
    "/v5/order/create",
    {
      category: "linear",
      symbol,
      side: toBybitSide(side),
      orderType: "Market",
      qty: String(quantity),
      triggerPrice: String(roundToTick(stopPrice, tickSize)),
      triggerDirection,
      reduceOnly: true,
      timeInForce: "GTC",
    },
    creds
  );

  return {
    orderId: result.orderId,
    symbol,
    status: "NEW",
    clientOrderId: result.orderLinkId || "",
    price: "0",
    avgPrice: "0",
    origQty: String(quantity),
    executedQty: "0",
    cumQuote: "0",
    type: "STOP_MARKET",
    side: side,
    stopPrice: String(roundToTick(stopPrice, tickSize)),
    time: Date.now(),
    updateTime: Date.now(),
  };
}

/** Place a TAKE_PROFIT_MARKET order. Uses reduceOnly. */
export async function placeTakeProfitMarket(
  symbol: string,
  side: "BUY" | "SELL",
  stopPrice: number,
  quantity: number,
  creds: BinanceCredentials,
  tickSize: number
): Promise<BinanceOrder> {
  // TP: exit side SELL → price rises (dir=1), exit side BUY → price falls (dir=2)
  const triggerDirection = side === "SELL" ? 1 : 2;

  const result = await signedPost<BybitOrderResult>(
    "/v5/order/create",
    {
      category: "linear",
      symbol,
      side: toBybitSide(side),
      orderType: "Market",
      qty: String(quantity),
      triggerPrice: String(roundToTick(stopPrice, tickSize)),
      triggerDirection,
      reduceOnly: true,
      timeInForce: "GTC",
    },
    creds
  );

  return {
    orderId: result.orderId,
    symbol,
    status: "NEW",
    clientOrderId: result.orderLinkId || "",
    price: "0",
    avgPrice: "0",
    origQty: String(quantity),
    executedQty: "0",
    cumQuote: "0",
    type: "TAKE_PROFIT_MARKET",
    side: side,
    stopPrice: String(roundToTick(stopPrice, tickSize)),
    time: Date.now(),
    updateTime: Date.now(),
  };
}

/** Place a reduceOnly MARKET order to force-close a position. */
export async function placeMarketClose(
  symbol: string,
  side: "BUY" | "SELL",
  quantity: number,
  creds: BinanceCredentials
): Promise<BinanceOrder> {
  const closeSide = side === "BUY" ? "SELL" : "BUY";
  const result = await signedPost<BybitOrderResult>(
    "/v5/order/create",
    {
      category: "linear",
      symbol,
      side: toBybitSide(closeSide),
      orderType: "Market",
      qty: String(quantity),
      reduceOnly: true,
      timeInForce: "GTC",
    },
    creds
  );

  await new Promise((r) => setTimeout(r, 500));
  return getOrder(symbol, result.orderId, creds);
}

// ── Order Management ────────────────────────────────────────

export async function cancelOrder(
  symbol: string,
  orderId: string,
  creds: BinanceCredentials
): Promise<BinanceOrder> {
  // Try StopOrder first (SL/TP), then regular Order
  for (const orderFilter of ["StopOrder", "Order"]) {
    try {
      await signedPost(
        "/v5/order/cancel",
        { category: "linear", symbol, orderId, orderFilter },
        creds
      );
      return {
        orderId,
        symbol,
        status: "CANCELED",
        clientOrderId: "",
        price: "0",
        avgPrice: "0",
        origQty: "0",
        executedQty: "0",
        cumQuote: "0",
        type: "",
        side: "",
        stopPrice: "0",
        time: 0,
        updateTime: Date.now(),
      };
    } catch (e) {
      if (e instanceof BinanceApiError && orderFilter === "StopOrder") continue;
      throw e;
    }
  }
  throw new BinanceApiError("Order not found for cancellation", 110001, "/v5/order/cancel");
}

export async function cancelAllOrders(
  symbol: string,
  creds: BinanceCredentials
): Promise<void> {
  // Cancel both regular and conditional orders
  const filters = ["Order", "StopOrder"];
  for (const orderFilter of filters) {
    try {
      await signedPost(
        "/v5/order/cancel-all",
        { category: "linear", symbol, orderFilter },
        creds
      );
    } catch {
      // best effort
    }
  }
}

export async function getOpenOrders(
  symbol: string,
  creds: BinanceCredentials
): Promise<BinanceOrder[]> {
  const results: BinanceOrder[] = [];
  for (const orderFilter of ["Order", "StopOrder"]) {
    try {
      const data = await signedGet<{ list: BybitOrderDetail[] }>(
        "/v5/order/realtime",
        { category: "linear", symbol, orderFilter },
        creds
      );
      results.push(...data.list.map(mapBybitOrder));
    } catch {
      continue;
    }
  }
  return results;
}

export async function getOrder(
  symbol: string,
  orderId: string,
  creds: BinanceCredentials
): Promise<BinanceOrder> {
  // Check order history first (filled/cancelled orders)
  try {
    const hist = await signedGet<{ list: BybitOrderDetail[] }>(
      "/v5/order/history",
      { category: "linear", symbol, orderId },
      creds
    );
    if (hist.list.length > 0) return mapBybitOrder(hist.list[0]);
  } catch {
    // continue to realtime
  }

  // Check active orders
  for (const orderFilter of ["Order", "StopOrder"]) {
    try {
      const data = await signedGet<{ list: BybitOrderDetail[] }>(
        "/v5/order/realtime",
        { category: "linear", symbol, orderId, orderFilter },
        creds
      );
      if (data.list.length > 0) return mapBybitOrder(data.list[0]);
    } catch {
      continue;
    }
  }

  throw new BinanceApiError(`Order ${orderId} not found`, 110001, "/v5/order");
}

export async function getAllOrders(
  symbol: string,
  creds: BinanceCredentials,
  limit = 50
): Promise<BinanceOrder[]> {
  const data = await signedGet<{ list: BybitOrderDetail[] }>(
    "/v5/order/history",
    { category: "linear", symbol, limit },
    creds
  );
  return data.list.map(mapBybitOrder);
}

// ── Batch Operations ────────────────────────────────────────

export interface BatchOrderResult {
  success: boolean;
  order?: BinanceOrder;
  error?: string;
}

export async function placeExitOrders(
  symbol: string,
  side: "BUY" | "SELL",
  quantity: number,
  sl: number,
  tp1: number,
  tp2: number,
  tp3: number,
  info: SymbolInfo,
  creds: BinanceCredentials
): Promise<{
  slOrder: BatchOrderResult;
  tp1Order: BatchOrderResult;
  tp2Order: BatchOrderResult;
  tp3Order: BatchOrderResult;
}> {
  const exitSide = side === "BUY" ? "SELL" : "BUY";
  const tp1Qty = floorToStep(quantity * 0.50, info.stepSize);
  const tp2Qty = floorToStep(quantity * 0.25, info.stepSize);
  const tp3Qty = floorToStep(quantity - tp1Qty - tp2Qty, info.stepSize);

  const exec = async (
    fn: () => Promise<BinanceOrder>
  ): Promise<BatchOrderResult> => {
    try {
      const order = await fn();
      return { success: true, order };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  // Place sequentially to avoid Bybit rate limits on conditional orders
  const slOrder = await exec(() => placeStopMarket(symbol, exitSide, sl, quantity, creds, info.tickSize));
  const tp1Order = await exec(() => placeTakeProfitMarket(symbol, exitSide, tp1, tp1Qty, creds, info.tickSize));
  const tp2Order = await exec(() => placeTakeProfitMarket(symbol, exitSide, tp2, tp2Qty, creds, info.tickSize));
  const tp3Order = await exec(() => placeTakeProfitMarket(symbol, exitSide, tp3, tp3Qty, creds, info.tickSize));

  return { slOrder, tp1Order, tp2Order, tp3Order };
}

export async function replaceSl(
  symbol: string,
  side: "BUY" | "SELL",
  oldSlOrderId: string,
  newSlPrice: number,
  remainingQty: number,
  info: SymbolInfo,
  creds: BinanceCredentials
): Promise<{ cancelled: boolean; newOrder: BatchOrderResult }> {
  let cancelled = false;
  try {
    await cancelOrder(symbol, oldSlOrderId, creds);
    cancelled = true;
  } catch (e) {
    if (e instanceof BinanceApiError) {
      cancelled = true; // already cancelled or filled
    }
  }

  const exitSide = side === "BUY" ? "SELL" : "BUY";
  let newOrder: BatchOrderResult;
  try {
    const order = await placeStopMarket(symbol, exitSide, newSlPrice, remainingQty, creds, info.tickSize);
    newOrder = { success: true, order };
  } catch (e) {
    newOrder = { success: false, error: e instanceof Error ? e.message : String(e) };
  }

  return { cancelled, newOrder };
}
