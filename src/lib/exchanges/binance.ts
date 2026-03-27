/**
 * Binance USDT-M Futures connector.
 *
 * Implements ExchangeConnector for Binance Futures trading.
 * Uses HMAC-SHA256 signing with query-string-based authentication.
 */
import crypto from "crypto";
import {
  type ExchangeConnector,
  type ExchangeCredentials,
  type SymbolInfo,
  type Order,
  type FuturesBalance,
  type FuturesPosition,
  ExchangeApiError,
  roundToTick,
} from "./types";

// ── Configuration ───────────────────────────────────────────────

const PROD_BASE = "https://fapi.binance.com";
const TESTNET_BASE = "https://testnet.binancefuture.com";

function baseUrl(testnet?: boolean): string {
  return testnet ? TESTNET_BASE : PROD_BASE;
}

// ── HMAC Signing (Binance) ──────────────────────────────────────

function signQuery(queryString: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(queryString).digest("hex");
}

// ── Request Helpers ─────────────────────────────────────────────

async function signedGet<T>(
  path: string,
  params: Record<string, string | number | boolean>,
  creds: ExchangeCredentials
): Promise<T> {
  const base = baseUrl(creds.testnet);
  const timestamp = Date.now();
  const allParams = { ...params, timestamp, recvWindow: 5000 };

  const qs = Object.entries(allParams)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

  const signature = signQuery(qs, creds.apiSecret);
  const fullQs = `${qs}&signature=${signature}`;

  const res = await fetch(`${base}${path}?${fullQs}`, {
    method: "GET",
    headers: { "X-MBX-APIKEY": creds.apiKey },
  });

  const data = await res.json();
  if (data.code && data.code !== 200) {
    throw new ExchangeApiError(data.msg || data.message || "Unknown error", data.code, path, "BINANCE");
  }
  return data as T;
}

async function signedPost<T>(
  path: string,
  params: Record<string, string | number | boolean>,
  creds: ExchangeCredentials
): Promise<T> {
  const base = baseUrl(creds.testnet);
  const timestamp = Date.now();
  const allParams = { ...params, timestamp, recvWindow: 5000 };

  const qs = Object.entries(allParams)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

  const signature = signQuery(qs, creds.apiSecret);
  const fullQs = `${qs}&signature=${signature}`;

  const res = await fetch(`${base}${path}?${fullQs}`, {
    method: "POST",
    headers: { "X-MBX-APIKEY": creds.apiKey },
  });

  const data = await res.json();
  if (data.code && data.code !== 200) {
    throw new ExchangeApiError(data.msg || data.message || "Unknown error", data.code, path, "BINANCE");
  }
  return data as T;
}

async function signedDelete<T>(
  path: string,
  params: Record<string, string | number | boolean>,
  creds: ExchangeCredentials
): Promise<T> {
  const base = baseUrl(creds.testnet);
  const timestamp = Date.now();
  const allParams = { ...params, timestamp, recvWindow: 5000 };

  const qs = Object.entries(allParams)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

  const signature = signQuery(qs, creds.apiSecret);
  const fullQs = `${qs}&signature=${signature}`;

  const res = await fetch(`${base}${path}?${fullQs}`, {
    method: "DELETE",
    headers: { "X-MBX-APIKEY": creds.apiKey },
  });

  const data = await res.json();
  if (data.code && data.code !== 200) {
    throw new ExchangeApiError(data.msg || data.message || "Unknown error", data.code, path, "BINANCE");
  }
  return data as T;
}

// ── Binance-specific Helpers ────────────────────────────────────

interface BinanceExchangeInfoResponse {
  symbols: Array<{
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
      minNotional?: string;
    }>;
  }>;
}

interface BinanceOrderResponse {
  orderId: number;
  clientOrderId: string;
  symbol: string;
  status: string;
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

function mapBinanceOrder(o: BinanceOrderResponse): Order {
  return {
    orderId: String(o.orderId),
    symbol: o.symbol,
    status: o.status,
    clientOrderId: o.clientOrderId,
    price: o.price,
    avgPrice: o.avgPrice,
    origQty: o.origQty,
    executedQty: o.executedQty,
    cumQuote: o.cumQuote,
    type: o.type,
    side: o.side,
    stopPrice: o.stopPrice || "0",
    time: o.time,
    updateTime: o.updateTime,
  };
}

// ── Instrument Info Cache ───────────────────────────────────────

const infoCache: Record<string, { symbols: Map<string, SymbolInfo>; ts: number }> = {};
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

// ── Connector Implementation ────────────────────────────────────

export class BinanceConnector implements ExchangeConnector {
  readonly name = "BINANCE" as const;

  normalizeSymbol(signalSymbol: string): string {
    return signalSymbol.replace(/\.P$/i, "");
  }

  // ── Prices ──────────────────────────────────────────────────

  async getAllPrices(_testnet?: boolean): Promise<Map<string, number>> {
    const res = await fetch("https://fapi.binance.com/fapi/v2/ticker/price", {
      cache: "no-store",
    });

    const map = new Map<string, number>();
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        for (const t of data) {
          if (t.symbol && t.price) map.set(t.symbol.toUpperCase(), parseFloat(t.price));
        }
      }
    }
    return map;
  }

  // ── Exchange Info ───────────────────────────────────────────

  async getExchangeInfo(forceRefresh = false, testnet?: boolean): Promise<Map<string, SymbolInfo>> {
    const key = testnet ? "testnet" : "prod";
    const cached = infoCache[key];
    if (!forceRefresh && cached && cached.symbols.size > 0 && Date.now() - cached.ts < CACHE_TTL_MS) {
      return cached.symbols;
    }

    const base = baseUrl(testnet);
    const res = await fetch(`${base}/fapi/v1/exchangeInfo`);
    const data = (await res.json()) as BinanceExchangeInfoResponse;
    const map = new Map<string, SymbolInfo>();

    for (const s of data.symbols) {
      const lotFilter = s.filters.find((f) => f.filterType === "LOT_SIZE");
      const priceFilter = s.filters.find((f) => f.filterType === "PRICE_FILTER");
      const notionalFilter = s.filters.find((f) => f.filterType === "MIN_NOTIONAL");

      const stepSize = parseFloat(lotFilter?.stepSize ?? "0.001");
      const tickSize = parseFloat(priceFilter?.tickSize ?? "0.01");

      map.set(s.symbol, {
        symbol: s.symbol,
        pricePrecision: s.pricePrecision,
        quantityPrecision: s.quantityPrecision,
        minQty: parseFloat(lotFilter?.minQty ?? "0.001"),
        maxQty: parseFloat(lotFilter?.maxQty ?? "1000"),
        stepSize,
        tickSize,
        minNotional: parseFloat(notionalFilter?.notional ?? notionalFilter?.minNotional ?? "5"),
      });
    }

    infoCache[key] = { symbols: map, ts: Date.now() };
    return map;
  }

  async getSymbolInfo(symbol: string, testnet?: boolean): Promise<SymbolInfo> {
    const map = await this.getExchangeInfo(false, testnet);
    const info = map.get(symbol);
    if (!info) throw new Error(`Symbol ${symbol} not found on Binance Futures`);
    return info;
  }

  // ── Account ─────────────────────────────────────────────────

  async getBalance(creds: ExchangeCredentials): Promise<FuturesBalance[]> {
    const data = await signedGet<Array<{
      asset: string;
      balance: string;
      availableBalance: string;
      crossUnPnl: string;
    }>>("/fapi/v2/balance", {}, creds);

    return data.map((b) => ({
      asset: b.asset,
      balance: b.balance,
      availableBalance: b.availableBalance,
      crossUnPnl: b.crossUnPnl,
    }));
  }

  async getUsdtBalance(creds: ExchangeCredentials): Promise<{ total: number; available: number }> {
    const balances = await this.getBalance(creds);
    const usdt = balances.find((b) => b.asset === "USDT");
    return {
      total: parseFloat(usdt?.balance ?? "0"),
      available: parseFloat(usdt?.availableBalance ?? "0"),
    };
  }

  // ── Positions ───────────────────────────────────────────────

  async getPositions(creds: ExchangeCredentials): Promise<FuturesPosition[]> {
    const data = await signedGet<Array<{
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
    }>>("/fapi/v2/positionRisk", {}, creds);

    return data
      .filter((p) => parseFloat(p.positionAmt) !== 0)
      .map((p) => ({
        symbol: p.symbol,
        positionAmt: p.positionAmt,
        entryPrice: p.entryPrice,
        markPrice: p.markPrice,
        unRealizedProfit: p.unRealizedProfit,
        liquidationPrice: p.liquidationPrice,
        leverage: p.leverage,
        marginType: p.marginType.toLowerCase(),
        isolatedMargin: p.isolatedMargin,
        positionSide: p.positionSide,
      }));
  }

  async getPosition(symbol: string, creds: ExchangeCredentials): Promise<FuturesPosition | null> {
    const positions = await this.getPositions(creds);
    return positions.find((p) => p.symbol === symbol) ?? null;
  }

  // ── Margin & Leverage ───────────────────────────────────────

  async setMarginType(symbol: string, marginType: "ISOLATED" | "CROSSED", creds: ExchangeCredentials): Promise<void> {
    try {
      await signedPost("/fapi/v1/marginType", { symbol, marginType }, creds);
    } catch (e) {
      // -4046 = No need to change margin type (already set)
      if (e instanceof ExchangeApiError && e.code === -4046) return;
      throw e;
    }
  }

  async setLeverage(symbol: string, leverage: number, creds: ExchangeCredentials): Promise<void> {
    await signedPost("/fapi/v1/leverage", { symbol, leverage }, creds);
  }

  // ── Orders ──────────────────────────────────────────────────

  async placeMarketOrder(symbol: string, side: "BUY" | "SELL", quantity: number, creds: ExchangeCredentials): Promise<Order> {
    const data = await signedPost<BinanceOrderResponse>("/fapi/v1/order", {
      symbol,
      side,
      type: "MARKET",
      quantity,
    }, creds);
    return mapBinanceOrder(data);
  }

  async placeStopMarket(
    symbol: string,
    side: "BUY" | "SELL",
    stopPrice: number,
    quantity: number,
    creds: ExchangeCredentials,
    tickSize: number
  ): Promise<Order> {
    const data = await signedPost<BinanceOrderResponse>("/fapi/v1/order", {
      symbol,
      side,
      type: "STOP_MARKET",
      stopPrice: roundToTick(stopPrice, tickSize),
      quantity,
      reduceOnly: true,
      workingType: "CONTRACT_PRICE",
    }, creds);
    return mapBinanceOrder(data);
  }

  async placeTakeProfitMarket(
    symbol: string,
    side: "BUY" | "SELL",
    stopPrice: number,
    quantity: number,
    creds: ExchangeCredentials,
    tickSize: number
  ): Promise<Order> {
    const data = await signedPost<BinanceOrderResponse>("/fapi/v1/order", {
      symbol,
      side,
      type: "TAKE_PROFIT_MARKET",
      stopPrice: roundToTick(stopPrice, tickSize),
      quantity,
      reduceOnly: true,
      workingType: "CONTRACT_PRICE",
    }, creds);
    return mapBinanceOrder(data);
  }

  async placeMarketClose(symbol: string, side: "BUY" | "SELL", quantity: number, creds: ExchangeCredentials): Promise<Order> {
    const closeSide = side === "BUY" ? "SELL" : "BUY";
    const data = await signedPost<BinanceOrderResponse>("/fapi/v1/order", {
      symbol,
      side: closeSide,
      type: "MARKET",
      quantity,
      reduceOnly: true,
    }, creds);
    return mapBinanceOrder(data);
  }

  // ── Order Management ────────────────────────────────────────

  async cancelOrder(symbol: string, orderId: string, creds: ExchangeCredentials): Promise<Order> {
    const data = await signedDelete<BinanceOrderResponse>(
      "/fapi/v1/order",
      { symbol, orderId },
      creds
    );
    return mapBinanceOrder(data);
  }

  async cancelAllOrders(symbol: string, creds: ExchangeCredentials): Promise<void> {
    try {
      await signedDelete("/fapi/v1/allOpenOrders", { symbol }, creds);
    } catch {
      // best effort
    }
  }

  async getOpenOrders(symbol: string, creds: ExchangeCredentials): Promise<Order[]> {
    const data = await signedGet<BinanceOrderResponse[]>(
      "/fapi/v1/openOrders",
      { symbol },
      creds
    );
    return data.map(mapBinanceOrder);
  }

  async getOrder(symbol: string, orderId: string, creds: ExchangeCredentials): Promise<Order> {
    const data = await signedGet<BinanceOrderResponse>(
      "/fapi/v1/order",
      { symbol, orderId },
      creds
    );
    return mapBinanceOrder(data);
  }

  async getAllOrders(symbol: string, creds: ExchangeCredentials, limit = 50): Promise<Order[]> {
    const data = await signedGet<BinanceOrderResponse[]>(
      "/fapi/v1/allOrders",
      { symbol, limit },
      creds
    );
    return data.map(mapBinanceOrder);
  }
}
