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

const BASE_URL = "https://api.dhan.co/v2";

// ── Security ID Cache ───────────────────────────────────────────

const symbolToSecurityId = new Map<string, number>();
const securityIdToSymbol = new Map<number, string>();

// ── Request Helpers ─────────────────────────────────────────────

function authHeaders(creds: ExchangeCredentials): Record<string, string> {
  return {
    "access-token": creds.apiKey,
    "client-id": creds.apiSecret,
    "Content-Type": "application/json",
  };
}

async function dhanGet<T>(path: string, creds: ExchangeCredentials): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers: authHeaders(creds),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ExchangeApiError(text, res.status, path, "DHAN" as const);
  }
  return (await res.json()) as T;
}

async function dhanPost<T>(
  path: string,
  body: Record<string, unknown>,
  creds: ExchangeCredentials
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: authHeaders(creds),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ExchangeApiError(text, res.status, path, "DHAN" as const);
  }
  return (await res.json()) as T;
}

async function dhanDelete<T>(path: string, creds: ExchangeCredentials): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
    headers: authHeaders(creds),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ExchangeApiError(text, res.status, path, "DHAN" as const);
  }
  return (await res.json()) as T;
}

// ── Dhan Response Types ─────────────────────────────────────────

interface DhanOrderResponse {
  orderId: string;
  orderStatus: string;
  transactionType: string;
  exchangeSegment: string;
  productType: string;
  orderType: string;
  tradingSymbol: string;
  securityId: string;
  quantity: number;
  price: number;
  triggerPrice: number;
  filledQty?: number;
  averageTradedPrice?: number;
  exchangeOrderId?: string;
  orderTimestamp?: string;
  exchangeTimestamp?: string;
  drvExpiryDate?: string;
  drvOptionType?: string;
  correlationId?: string;
  remainingQuantity?: number;
}

interface DhanPositionResponse {
  tradingSymbol: string;
  securityId: string;
  exchangeSegment: string;
  positionType: string;
  buyAvg: number;
  sellAvg: number;
  netQty: number;
  buyQty: number;
  sellQty: number;
  realizedProfit: number;
  unrealizedProfit: number;
  multiplier: number;
  costPrice: number;
  dayBuyQty?: number;
  daySellQty?: number;
}

interface DhanFundResponse {
  availabelBalance: number; // note: Dhan's actual typo in their API
  sodLimit: number;
  utilizedAmount: number;
}

// ── Mapping Helpers ─────────────────────────────────────────────

function mapDhanStatus(s: string): string {
  const map: Record<string, string> = {
    PENDING: "NEW",
    TRADED: "FILLED",
    CANCELLED: "CANCELED",
    REJECTED: "REJECTED",
    TRANSIT: "NEW",
    PART_TRADED: "PARTIALLY_FILLED",
  };
  return map[s] || s;
}

function mapDhanOrder(o: DhanOrderResponse): Order {
  const symbol = securityIdToSymbol.get(Number(o.securityId)) || o.tradingSymbol || o.securityId;
  return {
    orderId: o.orderId,
    symbol,
    status: mapDhanStatus(o.orderStatus),
    clientOrderId: o.correlationId || "",
    price: String(o.price ?? 0),
    avgPrice: String(o.averageTradedPrice ?? 0),
    origQty: String(o.quantity ?? 0),
    executedQty: String(o.filledQty ?? 0),
    cumQuote: String((o.filledQty ?? 0) * (o.averageTradedPrice ?? 0)),
    type: o.orderType,
    side: o.transactionType === "BUY" ? "BUY" : "SELL",
    stopPrice: String(o.triggerPrice ?? 0),
    time: o.orderTimestamp ? new Date(o.orderTimestamp).getTime() : Date.now(),
    updateTime: o.exchangeTimestamp ? new Date(o.exchangeTimestamp).getTime() : Date.now(),
  };
}

// ── Security ID Resolution ──────────────────────────────────────

function resolveSecurityId(symbol: string): number {
  const id = symbolToSecurityId.get(symbol.toUpperCase());
  if (!id) {
    console.warn(`[DHAN] No securityId mapping for symbol: ${symbol}`);
    throw new Error(
      `No securityId mapping for symbol "${symbol}". Call loadInstruments() first.`
    );
  }
  return id;
}

// ── Exchange Info Cache ─────────────────────────────────────────

let symbolInfoCache: Map<string, SymbolInfo> | null = null;

function buildSymbolInfo(symbol: string): SymbolInfo {
  return {
    symbol,
    pricePrecision: 2,
    quantityPrecision: 0,
    minQty: 1,
    maxQty: 100000,
    stepSize: 1,
    tickSize: 0.05,
    minNotional: 0,
    maxLeverage: 1,
  };
}

// ── Connector Implementation ────────────────────────────────────

export class DhanConnector implements ExchangeConnector {
  readonly name = "DHAN" as const;

  normalizeSymbol(signalSymbol: string): string {
    return signalSymbol.replace(/\.(NS|NSE)$/i, "").toUpperCase();
  }

  /**
   * Load instrument mappings from Firestore doc `config/dhan_instruments`.
   * The doc should be a map of { SYMBOL: securityId, ... }.
   */
  async loadInstruments(): Promise<void> {
    const { getAdminFirestore } = await import("@/firebase/admin");
    const db = getAdminFirestore();
    const docRef = db.collection("config").doc("dhan_instruments");
    const snap = await docRef.get();
    if (!snap.exists) {
      console.warn("[DHAN] config/dhan_instruments doc not found in Firestore");
      return;
    }
    const data = snap.data() as Record<string, number>;
    symbolToSecurityId.clear();
    securityIdToSymbol.clear();
    for (const [sym, id] of Object.entries(data)) {
      const upperSym = sym.toUpperCase();
      symbolToSecurityId.set(upperSym, id);
      securityIdToSymbol.set(id, upperSym);
    }
    console.log(`[DHAN] Loaded ${symbolToSecurityId.size} instrument mappings`);
  }

  // ── Prices ──────────────────────────────────────────────────

  async getAllPrices(): Promise<Map<string, number>> {
    return new Map();
  }

  async getPricesForSymbols(
    securityIds: number[],
    creds: ExchangeCredentials
  ): Promise<Map<number, number>> {
    if (securityIds.length === 0) return new Map();

    const data = await dhanPost<{
      data: { NSE_EQ: Record<string, { last_price: number }> };
    }>(
      "/marketfeed/ltp",
      { NSE_EQ: securityIds },
      creds
    );

    const prices = new Map<number, number>();
    const nseData = data.data?.NSE_EQ;
    if (nseData) {
      for (const [idStr, info] of Object.entries(nseData)) {
        prices.set(Number(idStr), info.last_price);
      }
    }
    return prices;
  }

  // ── Exchange Info ───────────────────────────────────────────

  async getExchangeInfo(): Promise<Map<string, SymbolInfo>> {
    if (symbolInfoCache && symbolInfoCache.size > 0) return symbolInfoCache;

    const map = new Map<string, SymbolInfo>();
    for (const [sym] of symbolToSecurityId) {
      map.set(sym, buildSymbolInfo(sym));
    }
    symbolInfoCache = map;
    return map;
  }

  async getSymbolInfo(symbol: string): Promise<SymbolInfo> {
    const normalized = this.normalizeSymbol(symbol);
    const map = await this.getExchangeInfo();
    const info = map.get(normalized);
    if (info) return info;
    return buildSymbolInfo(normalized);
  }

  // ── Account ─────────────────────────────────────────────────

  async getBalance(creds: ExchangeCredentials): Promise<FuturesBalance[]> {
    const data = await dhanGet<DhanFundResponse>("/fundlimit", creds);
    return [
      {
        asset: "INR",
        balance: String(data.sodLimit ?? 0),
        availableBalance: String(data.availabelBalance ?? 0),
        crossUnPnl: "0",
      },
    ];
  }

  async getUsdtBalance(creds: ExchangeCredentials): Promise<{ total: number; available: number }> {
    const data = await dhanGet<DhanFundResponse>("/fundlimit", creds);
    return {
      total: data.sodLimit ?? 0,
      available: data.availabelBalance ?? 0,
    };
  }

  // ── Positions ───────────────────────────────────────────────

  async getPositions(creds: ExchangeCredentials): Promise<FuturesPosition[]> {
    const data = await dhanGet<DhanPositionResponse[]>("/positions", creds);
    if (!Array.isArray(data)) return [];

    return data
      .filter((p) => p.netQty !== 0)
      .map((p) => {
        const symbol = securityIdToSymbol.get(Number(p.securityId)) || p.tradingSymbol;
        return {
          symbol,
          positionAmt: String(p.netQty),
          entryPrice: String(p.costPrice ?? 0),
          markPrice: "0",
          unRealizedProfit: String(p.unrealizedProfit ?? 0),
          liquidationPrice: "0",
          leverage: "1",
          marginType: "cross",
          isolatedMargin: "0",
          positionSide: "BOTH",
        };
      });
  }

  async getPosition(symbol: string, creds: ExchangeCredentials): Promise<FuturesPosition | null> {
    const all = await this.getPositions(creds);
    const normalized = this.normalizeSymbol(symbol);
    return all.find((p) => p.symbol === normalized) ?? null;
  }

  // ── Margin & Leverage (no-ops) ─────────────────────────────

  async setMarginType(): Promise<void> {}
  async setLeverage(): Promise<void> {}

  // ── Orders ─────────────────────────────────────────────────

  async placeMarketOrder(
    symbol: string,
    side: "BUY" | "SELL",
    quantity: number,
    creds: ExchangeCredentials
  ): Promise<Order> {
    const normalized = this.normalizeSymbol(symbol);
    const securityId = String(resolveSecurityId(normalized));

    const result = await dhanPost<DhanOrderResponse>(
      "/orders",
      {
        dhanClientId: creds.apiSecret,
        transactionType: side,
        exchangeSegment: "NSE_EQ",
        productType: "INTRADAY",
        orderType: "MARKET",
        securityId,
        quantity: Math.round(quantity),
        price: "",
        triggerPrice: "",
        validity: "DAY",
      },
      creds
    );

    return mapDhanOrder(result);
  }

  async placeStopMarket(
    symbol: string,
    side: "BUY" | "SELL",
    stopPrice: number,
    quantity: number,
    creds: ExchangeCredentials,
    tickSize: number
  ): Promise<Order> {
    const normalized = this.normalizeSymbol(symbol);
    const securityId = String(resolveSecurityId(normalized));
    const trigger = roundToTick(stopPrice, tickSize);

    const result = await dhanPost<DhanOrderResponse>(
      "/orders",
      {
        dhanClientId: creds.apiSecret,
        transactionType: side,
        exchangeSegment: "NSE_EQ",
        productType: "INTRADAY",
        orderType: "STOP_LOSS_MARKET",
        securityId,
        quantity: Math.round(quantity),
        price: "",
        triggerPrice: String(trigger),
        validity: "DAY",
      },
      creds
    );

    return mapDhanOrder(result);
  }

  async placeTakeProfitMarket(
    symbol: string,
    side: "BUY" | "SELL",
    stopPrice: number,
    quantity: number,
    creds: ExchangeCredentials,
    tickSize: number
  ): Promise<Order> {
    const normalized = this.normalizeSymbol(symbol);
    const securityId = String(resolveSecurityId(normalized));
    const price = roundToTick(stopPrice, tickSize);

    const result = await dhanPost<DhanOrderResponse>(
      "/orders",
      {
        dhanClientId: creds.apiSecret,
        transactionType: side,
        exchangeSegment: "NSE_EQ",
        productType: "INTRADAY",
        orderType: "LIMIT",
        securityId,
        quantity: Math.round(quantity),
        price: String(price),
        triggerPrice: "",
        validity: "DAY",
      },
      creds
    );

    return mapDhanOrder(result);
  }

  async placeMarketClose(
    symbol: string,
    side: "BUY" | "SELL",
    quantity: number,
    creds: ExchangeCredentials
  ): Promise<Order> {
    const closeSide = side === "BUY" ? "SELL" : "BUY";
    return this.placeMarketOrder(symbol, closeSide, quantity, creds);
  }

  // ── Order Management ───────────────────────────────────────

  async cancelOrder(_symbol: string, orderId: string, creds: ExchangeCredentials): Promise<Order> {
    const result = await dhanDelete<DhanOrderResponse>(`/orders/${orderId}`, creds);
    if (result && result.orderId) return mapDhanOrder(result);

    return {
      orderId,
      symbol: _symbol,
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
    const open = await this.getOpenOrders(symbol, creds);
    await Promise.allSettled(
      open.map((o) => this.cancelOrder(symbol, o.orderId, creds))
    );
  }

  async getOrder(_symbol: string, orderId: string, creds: ExchangeCredentials): Promise<Order> {
    const result = await dhanGet<DhanOrderResponse>(`/orders/${orderId}`, creds);
    return mapDhanOrder(result);
  }

  async getOpenOrders(symbol: string, creds: ExchangeCredentials): Promise<Order[]> {
    const data = await dhanGet<DhanOrderResponse[]>("/orders", creds);
    if (!Array.isArray(data)) return [];

    const normalized = this.normalizeSymbol(symbol);
    const secId = symbolToSecurityId.get(normalized);

    return data
      .filter((o) => {
        const isPending = o.orderStatus === "PENDING" || o.orderStatus === "TRANSIT";
        if (!isPending) return false;
        if (secId) return String(o.securityId) === String(secId);
        return true;
      })
      .map(mapDhanOrder);
  }

  async getAllOrders(symbol: string, creds: ExchangeCredentials, _limit?: number): Promise<Order[]> {
    const data = await dhanGet<DhanOrderResponse[]>("/orders", creds);
    if (!Array.isArray(data)) return [];

    const normalized = this.normalizeSymbol(symbol);
    const secId = symbolToSecurityId.get(normalized);

    return data
      .filter((o) => {
        if (secId) return String(o.securityId) === String(secId);
        return true;
      })
      .map(mapDhanOrder);
  }
}
