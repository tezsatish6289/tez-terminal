/**
 * Bybit v5 Unified API connector.
 *
 * Refactored from the original binance.ts into the ExchangeConnector interface.
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

const PROD_BASE = "https://api.bybit.com";
const TESTNET_BASE = "https://api-testnet.bybit.com";

function baseUrl(testnet?: boolean): string {
  return testnet ? TESTNET_BASE : PROD_BASE;
}

// ── HMAC Signing (Bybit v5) ────────────────────────────────────

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

// ── Request Helpers ─────────────────────────────────────────────

interface BybitResponse<T> {
  retCode: number;
  retMsg: string;
  result: T;
  time: number;
}

async function signedGet<T>(
  path: string,
  params: Record<string, string | number | boolean>,
  creds: ExchangeCredentials
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
    throw new ExchangeApiError(data.retMsg, data.retCode, path, "BYBIT");
  }
  return data.result;
}

async function signedPost<T>(
  path: string,
  body: Record<string, unknown>,
  creds: ExchangeCredentials
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
    throw new ExchangeApiError(data.retMsg, data.retCode, path, "BYBIT");
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
    throw new ExchangeApiError(data.retMsg, data.retCode, path, "BYBIT");
  }
  return data.result;
}

// ── Bybit-specific Helpers ──────────────────────────────────────

function toBybitSide(side: "BUY" | "SELL"): "Buy" | "Sell" {
  return side === "BUY" ? "Buy" : "Sell";
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

function mapBybitOrder(o: BybitOrderDetail): Order {
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

// ── Instrument Info Cache ───────────────────────────────────────

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

const infoCache: Record<string, { symbols: Map<string, SymbolInfo>; ts: number }> = {};
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

// ── Connector Implementation ────────────────────────────────────

export class BybitConnector implements ExchangeConnector {
  readonly name = "BYBIT" as const;

  normalizeSymbol(signalSymbol: string): string {
    return signalSymbol.replace(/\.P$/i, "");
  }

  // ── Prices ──────────────────────────────────────────────────

  async getAllPrices(_testnet?: boolean): Promise<Map<string, number>> {
    const res = await fetch("https://api.bybit.com/v5/market/tickers?category=linear", {
      cache: "no-store",
    });
    const data = (await res.json()) as BybitResponse<{ list: Array<{ symbol: string; lastPrice: string }> }>;
    const map = new Map<string, number>();
    if (data.retCode === 0 && data.result?.list) {
      for (const t of data.result.list) {
        if (t.symbol && t.lastPrice) {
          map.set(t.symbol.toUpperCase(), parseFloat(t.lastPrice));
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

    infoCache[key] = { symbols: map, ts: Date.now() };
    return map;
  }

  async getSymbolInfo(symbol: string, testnet?: boolean): Promise<SymbolInfo> {
    const map = await this.getExchangeInfo(false, testnet);
    const info = map.get(symbol);
    if (!info) throw new Error(`Symbol ${symbol} not found on Bybit Futures`);
    return info;
  }

  // ── Account ─────────────────────────────────────────────────

  async getBalance(creds: ExchangeCredentials): Promise<FuturesBalance[]> {
    for (const accountType of ["UNIFIED", "CONTRACT"]) {
      try {
        const data = await signedGet<{
          list: Array<{
            accountType: string;
            coin: Array<{
              coin: string;
              walletBalance: string;
              availableToWithdraw: string;
              unrealisedPnl: string;
            }>;
          }>;
        }>("/v5/account/wallet-balance", { accountType }, creds);

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

  async getPosition(symbol: string, creds: ExchangeCredentials): Promise<FuturesPosition | null> {
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

  // ── Margin & Leverage ───────────────────────────────────────

  async setMarginType(symbol: string, marginType: "ISOLATED" | "CROSSED", creds: ExchangeCredentials): Promise<void> {
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
      if (e instanceof ExchangeApiError && e.code === 110026) return;
      throw e;
    }
  }

  async setLeverage(symbol: string, leverage: number, creds: ExchangeCredentials): Promise<void> {
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
      if (e instanceof ExchangeApiError && e.code === 110043) return;
      throw e;
    }
  }

  // ── Orders ──────────────────────────────────────────────────

  async placeMarketOrder(symbol: string, side: "BUY" | "SELL", quantity: number, creds: ExchangeCredentials): Promise<Order> {
    const result = await signedPost<{ orderId: string; orderLinkId: string }>(
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

    await new Promise((r) => setTimeout(r, 500));
    return this.getOrder(symbol, result.orderId, creds);
  }

  async placeStopMarket(
    symbol: string,
    side: "BUY" | "SELL",
    stopPrice: number,
    quantity: number,
    creds: ExchangeCredentials,
    tickSize: number
  ): Promise<Order> {
    const triggerDirection = side === "SELL" ? 2 : 1;

    const result = await signedPost<{ orderId: string; orderLinkId: string }>(
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
      side,
      stopPrice: String(roundToTick(stopPrice, tickSize)),
      time: Date.now(),
      updateTime: Date.now(),
    };
  }

  async placeTakeProfitMarket(
    symbol: string,
    side: "BUY" | "SELL",
    stopPrice: number,
    quantity: number,
    creds: ExchangeCredentials,
    tickSize: number
  ): Promise<Order> {
    const triggerDirection = side === "SELL" ? 1 : 2;

    const result = await signedPost<{ orderId: string; orderLinkId: string }>(
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
      side,
      stopPrice: String(roundToTick(stopPrice, tickSize)),
      time: Date.now(),
      updateTime: Date.now(),
    };
  }

  async placeMarketClose(symbol: string, side: "BUY" | "SELL", quantity: number, creds: ExchangeCredentials): Promise<Order> {
    const closeSide = side === "BUY" ? "SELL" : "BUY";
    const result = await signedPost<{ orderId: string; orderLinkId: string }>(
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
    return this.getOrder(symbol, result.orderId, creds);
  }

  // ── Order Management ────────────────────────────────────────

  async cancelOrder(symbol: string, orderId: string, creds: ExchangeCredentials): Promise<Order> {
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
        if (e instanceof ExchangeApiError && orderFilter === "StopOrder") continue;
        throw e;
      }
    }
    throw new ExchangeApiError("Order not found for cancellation", 110001, "/v5/order/cancel", "BYBIT");
  }

  async cancelAllOrders(symbol: string, creds: ExchangeCredentials): Promise<void> {
    for (const orderFilter of ["Order", "StopOrder"]) {
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

  async getOpenOrders(symbol: string, creds: ExchangeCredentials): Promise<Order[]> {
    const results: Order[] = [];
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

  async getOrder(symbol: string, orderId: string, creds: ExchangeCredentials): Promise<Order> {
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

    throw new ExchangeApiError(`Order ${orderId} not found`, 110001, "/v5/order", "BYBIT");
  }

  async getAllOrders(symbol: string, creds: ExchangeCredentials, limit = 50): Promise<Order[]> {
    const data = await signedGet<{ list: BybitOrderDetail[] }>(
      "/v5/order/history",
      { category: "linear", symbol, limit },
      creds
    );
    return data.list.map(mapBybitOrder);
  }
}
