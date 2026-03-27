import crypto from "crypto";

// ── Configuration ────────────────────────────────────────────

const FUTURES_BASE = "https://fapi.binance.com";
const TESTNET_BASE = "https://testnet.binancefuture.com";

function getBaseUrl(): string {
  return process.env.BINANCE_TESTNET === "true" ? TESTNET_BASE : FUTURES_BASE;
}

// ── HMAC Signing ────────────────────────────────────────────

function sign(queryString: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

function buildSignedParams(
  params: Record<string, string | number | boolean>,
  secret: string
): string {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  const signature = sign(qs, secret);
  return `${qs}&signature=${signature}`;
}

// ── Request Helpers ────────────────────────────────────────────

interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
}

async function signedRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  params: Record<string, string | number | boolean>,
  creds: BinanceCredentials
): Promise<T> {
  const baseUrl = getBaseUrl();
  const fullParams = { ...params, timestamp: Date.now(), recvWindow: 5000 };
  const queryString = buildSignedParams(fullParams, creds.apiSecret);

  const url =
    method === "GET" || method === "DELETE"
      ? `${baseUrl}${path}?${queryString}`
      : `${baseUrl}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      "X-MBX-APIKEY": creds.apiKey,
      ...(method === "POST" || method === "PUT"
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: method === "POST" || method === "PUT" ? queryString : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    const err = data as { code?: number; msg?: string };
    throw new BinanceApiError(
      err.msg ?? `Binance API error ${res.status}`,
      err.code ?? res.status,
      path
    );
  }

  return data as T;
}

async function publicRequest<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const baseUrl = getBaseUrl();
  const qs = params
    ? "?" +
      Object.entries(params)
        .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  const res = await fetch(`${baseUrl}${path}${qs}`);
  const data = await res.json();
  if (!res.ok) {
    const err = data as { code?: number; msg?: string };
    throw new BinanceApiError(err.msg ?? `Binance API error ${res.status}`, err.code ?? res.status, path);
  }
  return data as T;
}

// ── Error Class ────────────────────────────────────────────

export class BinanceApiError extends Error {
  constructor(
    message: string,
    public code: number,
    public endpoint: string
  ) {
    super(`[Binance ${code}] ${endpoint}: ${message}`);
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

interface ExchangeInfoSymbol {
  symbol: string;
  pricePrecision: number;
  quantityPrecision: number;
  filters: Array<{
    filterType: string;
    minQty?: string;
    maxQty?: string;
    stepSize?: string;
    tickSize?: string;
    notional?: string;
    minPrice?: string;
    maxPrice?: string;
  }>;
}

let cachedSymbols: Map<string, SymbolInfo> = new Map();
let cacheTimestamp = 0;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

export async function getExchangeInfo(forceRefresh = false): Promise<Map<string, SymbolInfo>> {
  if (!forceRefresh && cachedSymbols.size > 0 && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedSymbols;
  }

  const data = await publicRequest<{ symbols: ExchangeInfoSymbol[] }>("/fapi/v1/exchangeInfo");
  const map = new Map<string, SymbolInfo>();

  for (const s of data.symbols) {
    const lotSize = s.filters.find((f) => f.filterType === "LOT_SIZE");
    const priceFilter = s.filters.find((f) => f.filterType === "PRICE_FILTER");
    const minNotional = s.filters.find((f) => f.filterType === "MIN_NOTIONAL");

    map.set(s.symbol, {
      symbol: s.symbol,
      pricePrecision: s.pricePrecision,
      quantityPrecision: s.quantityPrecision,
      minQty: parseFloat(lotSize?.minQty ?? "0.001"),
      maxQty: parseFloat(lotSize?.maxQty ?? "1000000"),
      stepSize: parseFloat(lotSize?.stepSize ?? "0.001"),
      tickSize: parseFloat(priceFilter?.tickSize ?? "0.01"),
      minNotional: parseFloat(minNotional?.notional ?? "5"),
    });
  }

  cachedSymbols = map;
  cacheTimestamp = Date.now();
  return map;
}

export async function getSymbolInfo(symbol: string): Promise<SymbolInfo> {
  const map = await getExchangeInfo();
  const info = map.get(symbol);
  if (!info) throw new Error(`Symbol ${symbol} not found on Binance Futures`);
  return info;
}

// ── Quantity & Price Utilities ────────────────────────────────

/** Round quantity DOWN to the nearest stepSize. */
export function floorToStep(value: number, stepSize: number): number {
  const precision = Math.max(0, Math.round(-Math.log10(stepSize)));
  const steps = Math.floor(value / stepSize);
  return parseFloat((steps * stepSize).toFixed(precision));
}

/** Round price to tickSize precision. */
export function roundToTick(price: number, tickSize: number): number {
  const precision = Math.max(0, Math.round(-Math.log10(tickSize)));
  const ticks = Math.round(price / tickSize);
  return parseFloat((ticks * tickSize).toFixed(precision));
}

/** Validate and adjust quantity for Binance rules. Returns null if impossible. */
export function adjustQuantity(
  rawQty: number,
  info: SymbolInfo
): { quantity: number } | { error: string } {
  const qty = floorToStep(rawQty, info.stepSize);
  if (qty < info.minQty) return { error: `Quantity ${qty} below minQty ${info.minQty}` };
  if (qty > info.maxQty) return { error: `Quantity ${qty} above maxQty ${info.maxQty}` };
  return { quantity: qty };
}

/** Validate notional (price * qty >= minNotional). */
export function checkNotional(price: number, qty: number, info: SymbolInfo): boolean {
  return price * qty >= info.minNotional;
}

// ── Symbol Mapping ────────────────────────────────────────────

/** Convert signal symbol to Binance Futures symbol. e.g., "MLNUSDT.P" → "MLNUSDT" */
export function toBinanceSymbol(signalSymbol: string): string {
  return signalSymbol.replace(/\.P$/i, "");
}

// ── Account & Position ────────────────────────────────────────

export interface FuturesBalance {
  asset: string;
  balance: string;
  availableBalance: string;
  crossUnPnl: string;
}

export async function getBalance(creds: BinanceCredentials): Promise<FuturesBalance[]> {
  return signedRequest<FuturesBalance[]>("GET", "/fapi/v2/balance", {}, creds);
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
  const all = await signedRequest<FuturesPosition[]>("GET", "/fapi/v2/positionRisk", {}, creds);
  return all.filter((p) => parseFloat(p.positionAmt) !== 0);
}

export async function getPosition(symbol: string, creds: BinanceCredentials): Promise<FuturesPosition | null> {
  const all = await signedRequest<FuturesPosition[]>("GET", "/fapi/v2/positionRisk", { symbol }, creds);
  return all.find((p) => parseFloat(p.positionAmt) !== 0) ?? null;
}

// ── Margin & Leverage ────────────────────────────────────────

export async function setMarginType(
  symbol: string,
  marginType: "ISOLATED" | "CROSSED",
  creds: BinanceCredentials
): Promise<void> {
  try {
    await signedRequest("POST", "/fapi/v1/marginType", { symbol, marginType }, creds);
  } catch (e) {
    // Code -4046 means "No need to change margin type" (already set)
    if (e instanceof BinanceApiError && e.code === -4046) return;
    throw e;
  }
}

export async function setLeverage(
  symbol: string,
  leverage: number,
  creds: BinanceCredentials
): Promise<void> {
  await signedRequest("POST", "/fapi/v1/leverage", { symbol, leverage }, creds);
}

// ── Order Types ────────────────────────────────────────────

export interface BinanceOrder {
  orderId: number;
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

/** Place a MARKET order for entry. Returns the order with fill info. */
export async function placeMarketOrder(
  symbol: string,
  side: "BUY" | "SELL",
  quantity: number,
  creds: BinanceCredentials
): Promise<BinanceOrder> {
  return signedRequest<BinanceOrder>("POST", "/fapi/v1/order", {
    symbol,
    side,
    type: "MARKET",
    quantity,
    newOrderRespType: "RESULT",
  }, creds);
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
  return signedRequest<BinanceOrder>("POST", "/fapi/v1/order", {
    symbol,
    side,
    type: "STOP_MARKET",
    stopPrice: roundToTick(stopPrice, tickSize),
    quantity,
    reduceOnly: true,
    workingType: "CONTRACT_PRICE",
    newOrderRespType: "RESULT",
  }, creds);
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
  return signedRequest<BinanceOrder>("POST", "/fapi/v1/order", {
    symbol,
    side,
    type: "TAKE_PROFIT_MARKET",
    stopPrice: roundToTick(stopPrice, tickSize),
    quantity,
    reduceOnly: true,
    workingType: "CONTRACT_PRICE",
    newOrderRespType: "RESULT",
  }, creds);
}

/** Place a reduceOnly MARKET order to force-close a position (market turn, score degradation, kill switch). */
export async function placeMarketClose(
  symbol: string,
  side: "BUY" | "SELL",
  quantity: number,
  creds: BinanceCredentials
): Promise<BinanceOrder> {
  const closeSide = side === "BUY" ? "SELL" : "BUY";
  return signedRequest<BinanceOrder>("POST", "/fapi/v1/order", {
    symbol,
    side: closeSide,
    type: "MARKET",
    quantity,
    reduceOnly: true,
    newOrderRespType: "RESULT",
  }, creds);
}

// ── Order Management ────────────────────────────────────────

export async function cancelOrder(
  symbol: string,
  orderId: number,
  creds: BinanceCredentials
): Promise<BinanceOrder> {
  return signedRequest<BinanceOrder>("DELETE", "/fapi/v1/order", { symbol, orderId }, creds);
}

export async function cancelAllOrders(
  symbol: string,
  creds: BinanceCredentials
): Promise<void> {
  await signedRequest("DELETE", "/fapi/v1/allOpenOrders", { symbol }, creds);
}

export async function getOpenOrders(
  symbol: string,
  creds: BinanceCredentials
): Promise<BinanceOrder[]> {
  return signedRequest<BinanceOrder[]>("GET", "/fapi/v1/openOrders", { symbol }, creds);
}

export async function getOrder(
  symbol: string,
  orderId: number,
  creds: BinanceCredentials
): Promise<BinanceOrder> {
  return signedRequest<BinanceOrder>("GET", "/fapi/v1/order", { symbol, orderId }, creds);
}

/** Get all orders for a symbol (filled, cancelled, etc.). */
export async function getAllOrders(
  symbol: string,
  creds: BinanceCredentials,
  limit = 50
): Promise<BinanceOrder[]> {
  return signedRequest<BinanceOrder[]>("GET", "/fapi/v1/allOrders", { symbol, limit }, creds);
}

// ── Batch Operations ────────────────────────────────────────

export interface BatchOrderResult {
  success: boolean;
  order?: BinanceOrder;
  error?: string;
}

/**
 * Place the full set of exit orders for a trade:
 * SL (100% qty), TP1 (50%), TP2 (25%), TP3 (25%).
 * Returns individual results so caller can handle partial failures.
 */
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

  const [slOrder, tp1Order, tp2Order, tp3Order] = await Promise.all([
    exec(() => placeStopMarket(symbol, exitSide, sl, quantity, creds, info.tickSize)),
    exec(() => placeTakeProfitMarket(symbol, exitSide, tp1, tp1Qty, creds, info.tickSize)),
    exec(() => placeTakeProfitMarket(symbol, exitSide, tp2, tp2Qty, creds, info.tickSize)),
    exec(() => placeTakeProfitMarket(symbol, exitSide, tp3, tp3Qty, creds, info.tickSize)),
  ]);

  return { slOrder, tp1Order, tp2Order, tp3Order };
}

/**
 * Replace the SL order after a TP hit.
 * Cancels old SL and places new one at the given price for the remaining quantity.
 */
export async function replaceSl(
  symbol: string,
  side: "BUY" | "SELL",
  oldSlOrderId: number,
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
    if (e instanceof BinanceApiError && e.code === -2011) {
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
