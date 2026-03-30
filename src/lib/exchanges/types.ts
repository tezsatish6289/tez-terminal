/**
 * Multi-exchange connector types and shared utilities.
 *
 * Every exchange adapter implements ExchangeConnector.
 * Shared math utilities (floorToStep, adjustQuantity, etc.) live here
 * since they're exchange-agnostic.
 */

// ── Asset Types ─────────────────────────────────────────────────

export type AssetType = "CRYPTO" | "INDIAN_STOCKS" | "COMMODITIES";

// ── Broker Names (entities that execute orders) ─────────────────
// For crypto: broker = exchange. For stocks: broker ≠ exchange.

export type BrokerName = "BYBIT" | "BINANCE" | "MEXC" | "DHAN";

export const CRYPTO_BROKERS: BrokerName[] = ["BYBIT", "BINANCE", "MEXC"];
export const STOCK_BROKERS: BrokerName[] = ["DHAN"];
export const ALL_BROKERS: BrokerName[] = [...CRYPTO_BROKERS, ...STOCK_BROKERS];

// ── Signal Exchanges (where signals originate) ──────────────────

export type SignalExchange = "BYBIT" | "BINANCE" | "MEXC" | "NSE" | "BSE" | "MCX";

// ── Exchange Names (backward compat — union of all broker names) ─

export type ExchangeName = BrokerName;

export const SUPPORTED_EXCHANGES: ExchangeName[] = ["BYBIT", "BINANCE", "MEXC"];
export const STOCK_EXCHANGES: ExchangeName[] = ["DHAN"];
export const ALL_EXCHANGES: ExchangeName[] = [...SUPPORTED_EXCHANGES, ...STOCK_EXCHANGES];

// ── Indian Exchange Segments (Dhan API segments) ────────────────

export type IndianExchangeSegment = "NSE_EQ" | "BSE_EQ" | "NSE_FNO" | "BSE_FNO" | "MCX_FO";

const SIGNAL_EXCHANGE_TO_SEGMENT: Record<string, IndianExchangeSegment> = {
  NSE: "NSE_EQ",
  BSE: "BSE_EQ",
  MCX: "MCX_FO",
};

export function getExchangeSegment(signalExchange: string): IndianExchangeSegment {
  return SIGNAL_EXCHANGE_TO_SEGMENT[signalExchange.toUpperCase()] ?? "NSE_EQ";
}

// ── Signal Exchange → Broker routing ────────────────────────────

export function getBrokersForAssetType(assetType: string): BrokerName[] {
  const upper = assetType.toUpperCase();
  if (upper.includes("INDIAN") || upper.includes("STOCK")) return STOCK_BROKERS;
  if (upper.includes("COMMOD")) return STOCK_BROKERS;
  return CRYPTO_BROKERS;
}

export function isStockExchange(exchange: string): boolean {
  return ["NSE", "BSE", "MCX"].includes(normalizeSignalExchange(exchange));
}

/**
 * Normalize TradingView exchange names to our canonical form.
 * TradingView sends "NSE_DLY", "NSE_EQ", "BSE_DLY", etc.
 * We strip suffixes and keep just the core exchange: NSE, BSE, MCX.
 */
export function normalizeSignalExchange(raw: string): string {
  const upper = raw.toUpperCase();
  if (upper.startsWith("NSE")) return "NSE";
  if (upper.startsWith("BSE")) return "BSE";
  if (upper.startsWith("MCX")) return "MCX";
  return upper;
}

export function normalizeAssetType(raw: string): AssetType {
  const upper = raw.toUpperCase().replace(/\s+/g, "_");
  if (upper.includes("INDIAN") || upper === "INDIANSTOCKS") return "INDIAN_STOCKS";
  if (upper.includes("COMMOD")) return "COMMODITIES";
  return "CRYPTO";
}

// ── Credentials ─────────────────────────────────────────────────

export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
  /** For Indian brokers: the Dhan exchange segment (NSE_EQ, BSE_EQ, MCX_FO) */
  exchangeSegment?: IndianExchangeSegment;
}

// ── Instrument / Symbol Info ────────────────────────────────────

export interface SymbolInfo {
  symbol: string;
  pricePrecision: number;
  quantityPrecision: number;
  minQty: number;
  maxQty: number;
  stepSize: number;
  tickSize: number;
  minNotional: number;
  maxLeverage: number;
}

// ── Order ───────────────────────────────────────────────────────

export interface Order {
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

// ── Balance & Position ──────────────────────────────────────────

export interface FuturesBalance {
  asset: string;
  balance: string;
  availableBalance: string;
  crossUnPnl: string;
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

// ── Batch Order Result ──────────────────────────────────────────

export interface BatchOrderResult {
  success: boolean;
  order?: Order;
  error?: string;
}

// ── Error ───────────────────────────────────────────────────────

export class ExchangeApiError extends Error {
  constructor(
    message: string,
    public code: number,
    public endpoint: string,
    public exchange: ExchangeName
  ) {
    super(`[${exchange} ${code}] ${endpoint}: ${message}`);
    this.name = "ExchangeApiError";
  }
}

// ── Exchange Connector Interface ────────────────────────────────

export interface ExchangeConnector {
  readonly name: ExchangeName;

  // Public prices (no auth)
  getAllPrices(testnet?: boolean): Promise<Map<string, number>>;

  // Instrument info
  getExchangeInfo(forceRefresh?: boolean, testnet?: boolean): Promise<Map<string, SymbolInfo>>;
  getSymbolInfo(symbol: string, testnet?: boolean): Promise<SymbolInfo>;

  // Symbol normalization: signal symbol (e.g. "SOLUSDT.P") → exchange symbol (e.g. "SOLUSDT")
  normalizeSymbol(signalSymbol: string): string;

  // Account
  getBalance(creds: ExchangeCredentials): Promise<FuturesBalance[]>;
  getUsdtBalance(creds: ExchangeCredentials): Promise<{ total: number; available: number }>;

  // Positions
  getPositions(creds: ExchangeCredentials): Promise<FuturesPosition[]>;
  getPosition(symbol: string, creds: ExchangeCredentials): Promise<FuturesPosition | null>;

  // Margin & leverage
  setMarginType(symbol: string, marginType: "ISOLATED" | "CROSSED", creds: ExchangeCredentials): Promise<void>;
  setLeverage(symbol: string, leverage: number, creds: ExchangeCredentials): Promise<void>;

  // Order placement
  placeMarketOrder(symbol: string, side: "BUY" | "SELL", quantity: number, creds: ExchangeCredentials): Promise<Order>;
  placeStopMarket(symbol: string, side: "BUY" | "SELL", stopPrice: number, quantity: number, creds: ExchangeCredentials, tickSize: number): Promise<Order>;
  placeTakeProfitMarket(symbol: string, side: "BUY" | "SELL", stopPrice: number, quantity: number, creds: ExchangeCredentials, tickSize: number): Promise<Order>;
  placeMarketClose(symbol: string, side: "BUY" | "SELL", quantity: number, creds: ExchangeCredentials): Promise<Order>;

  // Order management
  cancelOrder(symbol: string, orderId: string, creds: ExchangeCredentials): Promise<Order>;
  cancelAllOrders(symbol: string, creds: ExchangeCredentials): Promise<void>;
  getOrder(symbol: string, orderId: string, creds: ExchangeCredentials): Promise<Order>;
  getOpenOrders(symbol: string, creds: ExchangeCredentials): Promise<Order[]>;
  getAllOrders(symbol: string, creds: ExchangeCredentials, limit?: number): Promise<Order[]>;
}

// ── Shared Math Utilities (exchange-agnostic) ───────────────────

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

// ── Shared Composite Operations ─────────────────────────────────

/**
 * Place SL + TP1/TP2/TP3 exit orders through any exchange connector.
 * Split: 50% at TP1, 25% at TP2, 25% at TP3. SL covers full quantity.
 */
export async function placeExitOrders(
  connector: ExchangeConnector,
  symbol: string,
  side: "BUY" | "SELL",
  quantity: number,
  sl: number,
  tp1: number,
  tp2: number,
  tp3: number,
  info: SymbolInfo,
  creds: ExchangeCredentials
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
    fn: () => Promise<Order>
  ): Promise<BatchOrderResult> => {
    try {
      const order = await fn();
      return { success: true, order };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  const slOrder = await exec(() => connector.placeStopMarket(symbol, exitSide, sl, quantity, creds, info.tickSize));
  const tp1Order = await exec(() => connector.placeTakeProfitMarket(symbol, exitSide, tp1, tp1Qty, creds, info.tickSize));
  const tp2Order = await exec(() => connector.placeTakeProfitMarket(symbol, exitSide, tp2, tp2Qty, creds, info.tickSize));
  const tp3Order = await exec(() => connector.placeTakeProfitMarket(symbol, exitSide, tp3, tp3Qty, creds, info.tickSize));

  return { slOrder, tp1Order, tp2Order, tp3Order };
}

/**
 * Cancel existing SL and place a new one at a different price.
 */
export async function replaceSl(
  connector: ExchangeConnector,
  symbol: string,
  side: "BUY" | "SELL",
  oldSlOrderId: string,
  newSlPrice: number,
  remainingQty: number,
  info: SymbolInfo,
  creds: ExchangeCredentials
): Promise<{ cancelled: boolean; newOrder: BatchOrderResult }> {
  let cancelled = false;
  try {
    await connector.cancelOrder(symbol, oldSlOrderId, creds);
    cancelled = true;
  } catch (e) {
    if (e instanceof ExchangeApiError) {
      cancelled = true; // already cancelled or filled
    }
  }

  const exitSide = side === "BUY" ? "SELL" : "BUY";
  let newOrder: BatchOrderResult;
  try {
    const order = await connector.placeStopMarket(symbol, exitSide, newSlPrice, remainingQty, creds, info.tickSize);
    newOrder = { success: true, order };
  } catch (e) {
    newOrder = { success: false, error: e instanceof Error ? e.message : String(e) };
  }

  return { cancelled, newOrder };
}
