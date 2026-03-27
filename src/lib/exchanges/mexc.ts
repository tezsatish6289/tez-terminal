/**
 * MEXC Futures connector.
 *
 * Implements ExchangeConnector for MEXC Futures (contract) trading.
 * Uses HMAC-SHA256 signing with header-based authentication.
 *
 * MEXC Futures API: https://mexcdevelop.github.io/apidocs/contract_v1_en/
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

const PROD_BASE = "https://contract.mexc.com";

function baseUrl(_testnet?: boolean): string {
  // MEXC doesn't have a public testnet for futures
  return PROD_BASE;
}

// ── HMAC Signing (MEXC) ─────────────────────────────────────────

function signPayload(timestamp: string, apiSecret: string, params: string = ""): string {
  const signStr = `${timestamp}${params}`;
  return crypto.createHmac("sha256", apiSecret).update(signStr).digest("hex");
}

function buildHeaders(creds: ExchangeCredentials, params: string = ""): Record<string, string> {
  const timestamp = String(Date.now());
  return {
    "ApiKey": creds.apiKey,
    "Request-Time": timestamp,
    "Signature": signPayload(timestamp, creds.apiSecret, params),
    "Content-Type": "application/json",
  };
}

// ── Request Helpers ─────────────────────────────────────────────

async function signedGet<T>(
  path: string,
  params: Record<string, string | number | boolean>,
  creds: ExchangeCredentials
): Promise<T> {
  const base = baseUrl(creds.testnet);
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");

  const headers = buildHeaders(creds, qs);
  const res = await fetch(`${base}${path}${qs ? `?${qs}` : ""}`, {
    method: "GET",
    headers,
  });

  const data = await res.json();
  if (data.code !== 0 && data.code !== 200) {
    throw new ExchangeApiError(data.msg || data.message || "Unknown error", data.code, path, "MEXC");
  }
  return (data.data ?? data) as T;
}

async function signedPost<T>(
  path: string,
  body: Record<string, unknown>,
  creds: ExchangeCredentials
): Promise<T> {
  const base = baseUrl(creds.testnet);
  const bodyStr = JSON.stringify(body);
  const headers = buildHeaders(creds, bodyStr);

  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: bodyStr,
  });

  const data = await res.json();
  if (data.code !== 0 && data.code !== 200) {
    throw new ExchangeApiError(data.msg || data.message || "Unknown error", data.code, path, "MEXC");
  }
  return (data.data ?? data) as T;
}

// ── MEXC-specific Helpers ───────────────────────────────────────

function toMexcSide(side: "BUY" | "SELL", isOpen: boolean): number {
  // MEXC: 1=open long, 2=close short, 3=open short, 4=close long
  if (side === "BUY" && isOpen) return 1;
  if (side === "BUY" && !isOpen) return 2;
  if (side === "SELL" && isOpen) return 3;
  return 4;
}

function mapMexcStatus(status: number): string {
  const map: Record<number, string> = {
    1: "NEW",          // uninformed
    2: "NEW",          // uncompleted
    3: "FILLED",       // completed
    4: "CANCELED",     // cancelled
    5: "PARTIALLY_FILLED",
  };
  return map[status] || "NEW";
}

interface MexcContractDetail {
  symbol: string;
  baseCoin: string;
  quoteCoin: string;
  priceScale: number;
  volScale: number;
  minVol: number;
  maxVol: number;
  contractSize: number;
  priceUnit: number;
  volUnit: number;
}

// ── Instrument Info Cache ───────────────────────────────────────

const infoCache: Record<string, { symbols: Map<string, SymbolInfo>; ts: number }> = {};
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

// ── Connector Implementation ────────────────────────────────────

export class MexcConnector implements ExchangeConnector {
  readonly name = "MEXC" as const;

  normalizeSymbol(signalSymbol: string): string {
    // MEXC futures uses underscored symbols: BTC_USDT
    const clean = signalSymbol.replace(/\.P$/i, "");
    if (clean.endsWith("USDT")) {
      return clean.slice(0, -4) + "_USDT";
    }
    return clean;
  }

  // ── Prices ──────────────────────────────────────────────────

  async getAllPrices(_testnet?: boolean): Promise<Map<string, number>> {
    const res = await fetch(`${PROD_BASE}/api/v1/contract/ticker`, {
      cache: "no-store",
    });
    const data = await res.json();
    const map = new Map<string, number>();

    const list = data.data ?? data;
    if (Array.isArray(list)) {
      for (const t of list) {
        if (t.symbol && t.lastPrice) {
          // Store both MEXC format (BTC_USDT) and normalized (BTCUSDT) for lookups
          map.set(t.symbol.toUpperCase(), parseFloat(t.lastPrice));
          const normalized = t.symbol.replace(/_/g, "").toUpperCase();
          map.set(normalized, parseFloat(t.lastPrice));
        }
      }
    }
    return map;
  }

  // ── Exchange Info ───────────────────────────────────────────

  async getExchangeInfo(forceRefresh = false, _testnet?: boolean): Promise<Map<string, SymbolInfo>> {
    const key = "prod"; // MEXC has no testnet for futures
    const cached = infoCache[key];
    if (!forceRefresh && cached && cached.symbols.size > 0 && Date.now() - cached.ts < CACHE_TTL_MS) {
      return cached.symbols;
    }

    const res = await fetch(`${PROD_BASE}/api/v1/contract/detail`);
    const data = await res.json();
    const list: MexcContractDetail[] = data.data ?? data;
    const map = new Map<string, SymbolInfo>();

    if (Array.isArray(list)) {
      for (const s of list) {
        const stepSize = s.volUnit || 1;
        const tickSize = s.priceUnit || 0.01;
        const qtyPrecision = Math.max(0, Math.round(-Math.log10(stepSize)));
        const pricePrecision = s.priceScale || Math.max(0, Math.round(-Math.log10(tickSize)));

        map.set(s.symbol, {
          symbol: s.symbol,
          pricePrecision,
          quantityPrecision: qtyPrecision,
          minQty: s.minVol || 1,
          maxQty: s.maxVol || 1000000,
          stepSize,
          tickSize,
          minNotional: 5,
        });
      }
    }

    infoCache[key] = { symbols: map, ts: Date.now() };
    return map;
  }

  async getSymbolInfo(symbol: string, testnet?: boolean): Promise<SymbolInfo> {
    const map = await this.getExchangeInfo(false, testnet);
    const info = map.get(symbol);
    if (!info) throw new Error(`Symbol ${symbol} not found on MEXC Futures`);
    return info;
  }

  // ── Account ─────────────────────────────────────────────────

  async getBalance(creds: ExchangeCredentials): Promise<FuturesBalance[]> {
    const data = await signedGet<Array<{
      currency: string;
      availableBalance: number;
      frozenBalance: number;
      equity: number;
      unrealized: number;
    }>>("/api/v1/private/account/assets", {}, creds);

    if (!Array.isArray(data)) return [];
    return data.map((b) => ({
      asset: b.currency,
      balance: String(b.equity),
      availableBalance: String(b.availableBalance),
      crossUnPnl: String(b.unrealized),
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
      holdVol: number;
      positionType: number; // 1=long, 2=short
      openAvgPrice: number;
      liquidatePrice: number;
      leverage: number;
      unrealised: number;
      im: number;
    }>>("/api/v1/private/position/open_positions", {}, creds);

    if (!Array.isArray(data)) return [];
    return data
      .filter((p) => p.holdVol !== 0)
      .map((p) => ({
        symbol: p.symbol,
        positionAmt: p.positionType === 2 ? String(-p.holdVol) : String(p.holdVol),
        entryPrice: String(p.openAvgPrice),
        markPrice: String(p.openAvgPrice),
        unRealizedProfit: String(p.unrealised),
        liquidationPrice: String(p.liquidatePrice),
        leverage: String(p.leverage),
        marginType: "isolated",
        isolatedMargin: String(p.im),
        positionSide: "BOTH",
      }));
  }

  async getPosition(symbol: string, creds: ExchangeCredentials): Promise<FuturesPosition | null> {
    const positions = await this.getPositions(creds);
    return positions.find((p) => p.symbol === symbol) ?? null;
  }

  // ── Margin & Leverage ───────────────────────────────────────

  async setMarginType(_symbol: string, _marginType: "ISOLATED" | "CROSSED", _creds: ExchangeCredentials): Promise<void> {
    // MEXC sets margin type per-order, not globally
  }

  async setLeverage(symbol: string, leverage: number, creds: ExchangeCredentials): Promise<void> {
    try {
      await signedPost("/api/v1/private/position/change_leverage", {
        symbol,
        leverage,
        openType: 1, // isolated
        positionType: 1, // long
      }, creds);
      await signedPost("/api/v1/private/position/change_leverage", {
        symbol,
        leverage,
        openType: 1,
        positionType: 2, // short
      }, creds);
    } catch {
      // best effort — leverage may already be set
    }
  }

  // ── Orders ──────────────────────────────────────────────────

  async placeMarketOrder(symbol: string, side: "BUY" | "SELL", quantity: number, creds: ExchangeCredentials): Promise<Order> {
    const data = await signedPost<{ orderId: string }>("/api/v1/private/order/submit", {
      symbol,
      side: toMexcSide(side, true),
      type: 5, // market order
      vol: quantity,
      openType: 1, // isolated
    }, creds);

    await new Promise((r) => setTimeout(r, 500));
    return this.getOrder(symbol, data.orderId, creds);
  }

  async placeStopMarket(
    symbol: string,
    side: "BUY" | "SELL",
    stopPrice: number,
    quantity: number,
    creds: ExchangeCredentials,
    tickSize: number
  ): Promise<Order> {
    const triggerPrice = roundToTick(stopPrice, tickSize);
    const data = await signedPost<{ orderId: string }>("/api/v1/private/planorder/place", {
      symbol,
      side: toMexcSide(side, false),
      type: 5, // market when triggered
      vol: quantity,
      triggerPrice,
      triggerType: 1, // last price
      openType: 1,
    }, creds);

    return {
      orderId: data.orderId || String(Date.now()),
      symbol,
      status: "NEW",
      clientOrderId: "",
      price: "0",
      avgPrice: "0",
      origQty: String(quantity),
      executedQty: "0",
      cumQuote: "0",
      type: "STOP_MARKET",
      side,
      stopPrice: String(triggerPrice),
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
    const triggerPrice = roundToTick(stopPrice, tickSize);
    const data = await signedPost<{ orderId: string }>("/api/v1/private/planorder/place", {
      symbol,
      side: toMexcSide(side, false),
      type: 5,
      vol: quantity,
      triggerPrice,
      triggerType: 1,
      openType: 1,
    }, creds);

    return {
      orderId: data.orderId || String(Date.now()),
      symbol,
      status: "NEW",
      clientOrderId: "",
      price: "0",
      avgPrice: "0",
      origQty: String(quantity),
      executedQty: "0",
      cumQuote: "0",
      type: "TAKE_PROFIT_MARKET",
      side,
      stopPrice: String(triggerPrice),
      time: Date.now(),
      updateTime: Date.now(),
    };
  }

  async placeMarketClose(symbol: string, side: "BUY" | "SELL", quantity: number, creds: ExchangeCredentials): Promise<Order> {
    const data = await signedPost<{ orderId: string }>("/api/v1/private/order/submit", {
      symbol,
      side: toMexcSide(side === "BUY" ? "SELL" : "BUY", false),
      type: 5,
      vol: quantity,
      openType: 1,
    }, creds);

    await new Promise((r) => setTimeout(r, 500));
    return this.getOrder(symbol, data.orderId, creds);
  }

  // ── Order Management ────────────────────────────────────────

  async cancelOrder(symbol: string, orderId: string, creds: ExchangeCredentials): Promise<Order> {
    // Try plan order cancellation first (SL/TP), then regular
    try {
      await signedPost("/api/v1/private/planorder/cancel", { symbol, orderId }, creds);
    } catch {
      await signedPost("/api/v1/private/order/cancel", { symbol, orderId }, creds);
    }

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
  }

  async cancelAllOrders(symbol: string, creds: ExchangeCredentials): Promise<void> {
    try {
      await signedPost("/api/v1/private/order/cancel_all", { symbol }, creds);
    } catch {
      // best effort
    }
    try {
      await signedPost("/api/v1/private/planorder/cancel_all", { symbol }, creds);
    } catch {
      // best effort
    }
  }

  async getOpenOrders(symbol: string, creds: ExchangeCredentials): Promise<Order[]> {
    const data = await signedGet<Array<{
      orderId: string;
      symbol: string;
      side: number;
      price: number;
      vol: number;
      dealVol: number;
      dealAvgPrice: number;
      state: number;
      createTime: number;
      updateTime: number;
    }>>("/api/v1/private/order/list/open_orders/" + symbol, {}, creds);

    if (!Array.isArray(data)) return [];
    return data.map((o) => ({
      orderId: o.orderId,
      symbol: o.symbol,
      status: mapMexcStatus(o.state),
      clientOrderId: "",
      price: String(o.price),
      avgPrice: String(o.dealAvgPrice),
      origQty: String(o.vol),
      executedQty: String(o.dealVol),
      cumQuote: String(o.dealAvgPrice * o.dealVol),
      type: "MARKET",
      side: o.side <= 2 ? "BUY" : "SELL",
      stopPrice: "0",
      time: o.createTime,
      updateTime: o.updateTime,
    }));
  }

  async getOrder(symbol: string, orderId: string, creds: ExchangeCredentials): Promise<Order> {
    const data = await signedGet<{
      orderId: string;
      symbol: string;
      side: number;
      price: number;
      vol: number;
      dealVol: number;
      dealAvgPrice: number;
      state: number;
      createTime: number;
      updateTime: number;
    }>(`/api/v1/private/order/get/${orderId}`, {}, creds);

    return {
      orderId: data.orderId || orderId,
      symbol: data.symbol || symbol,
      status: mapMexcStatus(data.state),
      clientOrderId: "",
      price: String(data.price),
      avgPrice: String(data.dealAvgPrice),
      origQty: String(data.vol),
      executedQty: String(data.dealVol),
      cumQuote: String(data.dealAvgPrice * data.dealVol),
      type: "MARKET",
      side: data.side <= 2 ? "BUY" : "SELL",
      stopPrice: "0",
      time: data.createTime,
      updateTime: data.updateTime,
    };
  }

  async getAllOrders(symbol: string, creds: ExchangeCredentials, _limit = 50): Promise<Order[]> {
    return this.getOpenOrders(symbol, creds);
  }
}
