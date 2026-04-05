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
 * Map a signal exchange to the broker that holds its prices.
 * Crypto: BYBIT → BYBIT, BINANCE → BINANCE, MEXC → MEXC
 * Stocks: NSE/BSE/MCX → DHAN (the only stock broker)
 */
export function signalExchangeToPriceBucket(exchange: string): ExchangeName {
  if (isStockExchange(exchange)) return "DHAN";
  return exchange.toUpperCase() as ExchangeName;
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

// ── Closed PnL Record (actual exchange-reported PnL) ────────────

export interface ClosedPnlRecord {
  symbol: string;
  closedPnl: number;      // actual realized PnL reported by the exchange
  qty: number;
  avgEntryPrice: number;
  avgExitPrice: number;
  createdTime: number;    // ms timestamp
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

  // Closed PnL — optional, only implemented by exchanges that support it
  getClosedPnl?(symbol: string, creds: ExchangeCredentials, startTime?: number): Promise<ClosedPnlRecord[]>;
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
 * Place SL + TP1 exit orders through any exchange connector.
 * SL covers full quantity. TP1 closes tp1ClosePct of the position.
 * No TP2/TP3 orders — remaining quantity is managed by trailing SL.
 */
export async function placeExitOrders(
  connector: ExchangeConnector,
  symbol: string,
  side: "BUY" | "SELL",
  quantity: number,
  sl: number,
  tp1: number,
  tp1ClosePct: number,
  info: SymbolInfo,
  creds: ExchangeCredentials
): Promise<{
  slOrder: BatchOrderResult;
  tp1Order: BatchOrderResult;
}> {
  const exitSide = side === "BUY" ? "SELL" : "BUY";
  const tp1Qty = floorToStep(quantity * tp1ClosePct, info.stepSize);

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
  const tp1Order = tp1Qty > 0
    ? await exec(() => connector.placeTakeProfitMarket(symbol, exitSide, tp1, tp1Qty, creds, info.tickSize))
    : { success: true } as BatchOrderResult;

  return { slOrder, tp1Order };
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
