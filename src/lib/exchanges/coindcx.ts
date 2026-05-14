/**
 * CoinDCX USDT-margined futures connector.
 * API: https://docs.coindcx.com/ — HMAC-SHA256 over full JSON body.
 */
import crypto from "crypto";
import https from "node:https";
import {
  type ExchangeConnector,
  type ExchangeCredentials,
  type SymbolInfo,
  type Order,
  type FuturesBalance,
  type FuturesPosition,
  type ClosedPnlRecord,
  ExchangeApiError,
  roundToTick,
} from "./types";

const API_BASE = "https://api.coindcx.com";
const PUBLIC_PRICES_URL =
  "https://public.coindcx.com/market_data/v3/current_prices/futures/rt";

const USDT_MARGIN = "USDT";

function compactSignPayload(body: Record<string, unknown>): string {
  return JSON.stringify(body);
}

function sign(secret: string, jsonPayload: string): string {
  return crypto.createHmac("sha256", secret).update(jsonPayload).digest("hex");
}

/** CoinDCX expects ms timestamps (see official Python samples). */
function nowTs(): number {
  return Date.now();
}

/** BTCUSDT → B-BTC_USDT */
function coinDcxPairFromInternal(symbol: string): string {
  const s = symbol.replace(/\.P$/i, "").trim().toUpperCase();
  if (/^B-[A-Z0-9]+_USDT$/i.test(s)) return s;
  if (s.endsWith("USDT")) {
    const base = s.slice(0, -4);
    return `B-${base}_USDT`;
  }
  return s;
}

/** B-BTC_USDT → BTCUSDT */
function internalSymbolFromCoinDcxPair(pair: string): string {
  const m = /^B-(.+)_USDT$/i.exec(pair.trim());
  if (m) return `${m[1].toUpperCase()}USDT`;
  return pair.replace(/\.P$/i, "").toUpperCase();
}

// ── HTTPS GET with JSON body (required by futures wallets endpoint) ───────

async function signedGetJsonBody<T>(
  path: string,
  bodyFields: Record<string, unknown>,
  creds: ExchangeCredentials,
): Promise<T> {
  const timestamp = nowTs();
  const payload = { ...bodyFields, timestamp };
  const jsonBody = compactSignPayload(payload);
  const signature = sign(creds.apiSecret, jsonBody);

  const raw = await new Promise<string>((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.coindcx.com",
        path,
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(jsonBody),
          "X-AUTH-APIKEY": creds.apiKey,
          "X-AUTH-SIGNATURE": signature,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => {
          data += c;
        });
        res.on("end", () => resolve(data));
      },
    );
    req.on("error", reject);
    req.write(jsonBody);
    req.end();
  });

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new ExchangeApiError(raw.slice(0, 200), 500, path, "COINDCX");
  }

  if (typeof data === "object" && data !== null && "status" in data) {
    const d = data as { status?: string; message?: string; code?: number };
    if (d.status === "error" || (typeof d.code === "number" && d.code >= 400)) {
      throw new ExchangeApiError(d.message ?? "CoinDCX error", d.code ?? 400, path, "COINDCX");
    }
  }

  return data as T;
}

async function signedPost<T>(path: string, bodyFields: Record<string, unknown>, creds: ExchangeCredentials): Promise<T> {
  const timestamp = nowTs();
  const payload = { ...bodyFields, timestamp };
  const jsonBody = compactSignPayload(payload);
  const signature = sign(creds.apiSecret, jsonBody);

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-AUTH-APIKEY": creds.apiKey,
      "X-AUTH-SIGNATURE": signature,
    },
    body: jsonBody,
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ExchangeApiError(text.slice(0, 200), res.status, path, "COINDCX");
  }

  if (typeof data === "object" && data !== null && "status" in data) {
    const d = data as { status?: string; message?: string; code?: number };
    if (d.status === "error" || (typeof d.code === "number" && d.code >= 400 && d.code !== 200)) {
      throw new ExchangeApiError(d.message ?? "CoinDCX error", d.code ?? res.status, path, "COINDCX");
    }
  }

  return data as T;
}

function mapOrderStatus(s: string): string {
  const u = s.toUpperCase();
  const map: Record<string, string> = {
    OPEN: "NEW",
    UNTRIGGERED: "NEW",
    INIT: "NEW",
    PARTIALLY_FILLED: "PARTIALLY_FILLED",
    FILLED: "FILLED",
    CANCELLED: "CANCELED",
    CANCELED: "CANCELED",
    PARTIALLY_CANCELLED: "PARTIALLY_CANCELED",
    REJECTED: "REJECTED",
  };
  return map[u] ?? u;
}

interface CdCxOrderRaw {
  id: string;
  pair: string;
  side: string;
  status: string;
  order_type: string;
  price?: number;
  stop_price?: number;
  avg_price?: number;
  total_quantity?: number;
  remaining_quantity?: number;
  created_at?: number;
  updated_at?: number;
}

function mapCdCxOrder(o: CdCxOrderRaw, internalSymbol: string): Order {
  const side = o.side?.toLowerCase() === "sell" ? "SELL" : "BUY";
  const ot = (o.order_type ?? "").toUpperCase();
  const px = o.price != null ? String(o.price) : "0";
  const avg = o.avg_price != null ? String(o.avg_price) : "0";
  const orig = o.total_quantity != null ? String(o.total_quantity) : "0";
  const rem = o.remaining_quantity != null ? String(o.remaining_quantity) : "0";
  const execQty =
    o.total_quantity != null && o.remaining_quantity != null
      ? String(Math.max(0, o.total_quantity - o.remaining_quantity))
      : "0";

  return {
    orderId: o.id,
    symbol: internalSymbol,
    status: mapOrderStatus(o.status ?? ""),
    clientOrderId: "",
    price: px,
    avgPrice: avg,
    origQty: orig,
    executedQty: execQty,
    cumQuote: "0",
    type: ot,
    side,
    stopPrice: o.stop_price != null ? String(o.stop_price) : "0",
    time: o.created_at ?? 0,
    updateTime: o.updated_at ?? o.created_at ?? 0,
  };
}

interface CdCxInstrument {
  pair: string;
  price_increment: number;
  quantity_increment: number;
  min_quantity: number;
  max_quantity: number;
  min_notional: number;
  max_leverage_long?: number;
  max_leverage_short?: number;
}

const infoCache: { symbols: Map<string, SymbolInfo>; ts: number } = { symbols: new Map(), ts: 0 };
const CACHE_TTL_MS = 4 * 60 * 60 * 1000;

export class CoinDcxConnector implements ExchangeConnector {
  readonly name = "COINDCX" as const;

  normalizeSymbol(signalSymbol: string): string {
    return signalSymbol.replace(/\.P$/i, "");
  }

  async getAllPrices(_testnet?: boolean): Promise<Map<string, number>> {
    const res = await fetch(PUBLIC_PRICES_URL, { cache: "no-store" });
    const data = (await res.json()) as {
      prices?: Record<string, { mp?: number; ls?: number; mkt?: string }>;
    };
    const map = new Map<string, number>();
    const prices = data.prices ?? {};
    for (const [pairKey, v] of Object.entries(prices)) {
      const mp =
        typeof v.mp === "number"
          ? v.mp
          : typeof v.ls === "number"
            ? v.ls
            : 0;
      if (!mp) continue;
      map.set(pairKey.toUpperCase(), mp);
      if (v.mkt) map.set(String(v.mkt).toUpperCase(), mp);
      map.set(internalSymbolFromCoinDcxPair(pairKey), mp);
    }
    return map;
  }

  async getExchangeInfo(forceRefresh = false, _testnet?: boolean): Promise<Map<string, SymbolInfo>> {
    if (!forceRefresh && infoCache.symbols.size > 0 && Date.now() - infoCache.ts < CACHE_TTL_MS) {
      return infoCache.symbols;
    }

    const res = await fetch(
      `${API_BASE}/exchange/v1/derivatives/futures/data/active_instruments?margin_currency_short_name[]=USDT`,
      { cache: "no-store" },
    );
    const pairs = (await res.json()) as string[];
    const map = new Map<string, SymbolInfo>();

    const BATCH = 25;
    for (let i = 0; i < pairs.length; i += BATCH) {
      const chunk = pairs.slice(i, i + BATCH);
      await Promise.all(
        chunk.map(async (pair) => {
          try {
            const infRes = await fetch(
              `${API_BASE}/exchange/v1/derivatives/futures/data/instrument?pair=${encodeURIComponent(pair)}&margin_currency_short_name=${USDT_MARGIN}`,
              { cache: "no-store" },
            );
            const body = (await infRes.json()) as { instrument?: CdCxInstrument };
            const s = body.instrument;
            if (!s) return;
            const step = s.quantity_increment;
            const tick = s.price_increment;
            const internal = internalSymbolFromCoinDcxPair(s.pair);
            const qtyPrecision = Math.max(0, Math.round(-Math.log10(step)));
            const pricePrecision = Math.max(0, Math.round(-Math.log10(tick)));
            const maxLev = Math.min(
              Math.max(s.max_leverage_long ?? 10, s.max_leverage_short ?? 10),
              125,
            );

            map.set(internal, {
              symbol: internal,
              pricePrecision,
              quantityPrecision: qtyPrecision,
              minQty: s.min_quantity,
              maxQty: s.max_quantity,
              stepSize: step,
              tickSize: tick,
              minNotional: s.min_notional,
              maxLeverage: maxLev,
            });
          } catch {
            /* skip instrument */
          }
        }),
      );
    }

    infoCache.symbols = map;
    infoCache.ts = Date.now();
    return map;
  }

  async getSymbolInfo(symbol: string, testnet?: boolean): Promise<SymbolInfo> {
    const map = await this.getExchangeInfo(false, testnet);
    const internal = coinDcxPairFromInternal(symbol).startsWith("B-")
      ? internalSymbolFromCoinDcxPair(coinDcxPairFromInternal(symbol))
      : symbol.replace(/\.P$/i, "").toUpperCase();

    const info = map.get(internal);
    if (!info) throw new Error(`Symbol ${symbol} not found on CoinDCX USDT futures`);
    return info;
  }

  async getBalance(creds: ExchangeCredentials): Promise<FuturesBalance[]> {
    const rows = await signedGetJsonBody<Array<{ currency_short_name: string; balance: string; locked_balance?: string }>>(
      "/exchange/v1/derivatives/futures/wallets",
      {},
      creds,
    );

    return rows.map((w) => ({
      asset: w.currency_short_name,
      balance: w.balance ?? "0",
      availableBalance: String(parseFloat(w.balance ?? "0") - parseFloat(w.locked_balance ?? "0")),
      crossUnPnl: "0",
    }));
  }

  async getUsdtBalance(creds: ExchangeCredentials): Promise<{ total: number; available: number }> {
    const balances = await this.getBalance(creds);
    const usdt = balances.find((b) => b.asset === "USDT");
    const total = parseFloat(usdt?.balance ?? "0");
    const avail = parseFloat(usdt?.availableBalance ?? "0");
    return { total, available: avail };
  }

  /**
   * Stable CoinDCX account id — survives API key rotation (same as dashboard).
   */
  async getAccountUid(creds: ExchangeCredentials): Promise<string | null> {
    try {
      const rows = await signedPost<Array<{ coindcx_id?: string }>>("/exchange/v1/users/info", {}, creds);
      const id = rows?.[0]?.coindcx_id;
      return id ?? null;
    } catch {
      return null;
    }
  }

  async getPositions(creds: ExchangeCredentials): Promise<FuturesPosition[]> {
    const rows = await signedPost<
      Array<{
        pair: string;
        active_pos: number;
        avg_price: number;
        mark_price: number;
        liquidation_price: number;
        leverage: number | null;
        margin_type: string;
        locked_user_margin?: number;
        margin_currency_short_name?: string;
      }>
    >("/exchange/v1/derivatives/futures/positions", {
      page: "1",
      size: "100",
      margin_currency_short_name: [USDT_MARGIN],
    }, creds);

    return rows
      .filter((p) => (p.margin_currency_short_name ?? USDT_MARGIN) === USDT_MARGIN)
      .filter((p) => Math.abs(p.active_pos ?? 0) > 1e-12)
      .map((p) => ({
        symbol: internalSymbolFromCoinDcxPair(p.pair),
        positionAmt: String(p.active_pos ?? 0),
        entryPrice: String(p.avg_price ?? 0),
        markPrice: String(p.mark_price ?? 0),
        unRealizedProfit: "0",
        liquidationPrice: String(p.liquidation_price ?? 0),
        leverage: String(p.leverage ?? 1),
        marginType: p.margin_type === "crossed" ? "cross" : "isolated",
        isolatedMargin: String(p.locked_user_margin ?? 0),
        positionSide: "BOTH",
      }));
  }

  async getPosition(symbol: string, creds: ExchangeCredentials): Promise<FuturesPosition | null> {
    const pair = coinDcxPairFromInternal(symbol);
    const internal = internalSymbolFromCoinDcxPair(pair);
    const rows = await signedPost<
      Array<{
        pair: string;
        active_pos: number;
        avg_price: number;
        mark_price: number;
        liquidation_price: number;
        leverage: number | null;
        margin_type: string;
        locked_user_margin?: number;
      }>
    >("/exchange/v1/derivatives/futures/positions", {
      page: "1",
      size: "10",
      pairs: pair,
      margin_currency_short_name: [USDT_MARGIN],
    }, creds);

    const p = rows.find((r) => r.pair === pair);
    if (!p || Math.abs(p.active_pos ?? 0) < 1e-12) return null;

    return {
      symbol: internal,
      positionAmt: String(p.active_pos ?? 0),
      entryPrice: String(p.avg_price ?? 0),
      markPrice: String(p.mark_price ?? 0),
      unRealizedProfit: "0",
      liquidationPrice: String(p.liquidation_price ?? 0),
      leverage: String(p.leverage ?? 1),
      marginType: p.margin_type === "crossed" ? "cross" : "isolated",
      isolatedMargin: String(p.locked_user_margin ?? 0),
      positionSide: "BOTH",
    };
  }

  async setMarginType(_symbol: string, marginType: "ISOLATED" | "CROSSED", creds: ExchangeCredentials): Promise<void> {
    const pair = coinDcxPairFromInternal(_symbol);
    try {
      await signedPost("/exchange/v1/derivatives/futures/positions/margin_type", {
        pair,
        margin_type: marginType === "ISOLATED" ? "isolated" : "crossed",
      }, creds);
    } catch (e) {
      if (e instanceof ExchangeApiError && e.message.toLowerCase().includes("already")) return;
    }
  }

  async setLeverage(symbol: string, leverage: number, creds: ExchangeCredentials): Promise<void> {
    const pair = coinDcxPairFromInternal(symbol);
    try {
      await signedPost("/exchange/v1/derivatives/futures/positions/update_leverage", {
        pair,
        leverage: String(Math.min(leverage, 125)),
      }, creds);
    } catch (e) {
      if (e instanceof ExchangeApiError) return;
      throw e;
    }
  }

  private async createOrder(
    internalSymbol: string,
    order: Record<string, unknown>,
    creds: ExchangeCredentials,
  ): Promise<Order> {
    const jsonBody = compactSignPayload({
      timestamp: nowTs(),
      order: {
        notification: "no_notification",
        margin_currency_short_name: USDT_MARGIN,
        ...order,
      },
    });
    const signature = sign(creds.apiSecret, jsonBody);

    const res = await fetch(`${API_BASE}/exchange/v1/derivatives/futures/orders/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-AUTH-APIKEY": creds.apiKey,
        "X-AUTH-SIGNATURE": signature,
      },
      body: jsonBody,
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ExchangeApiError(text.slice(0, 200), res.status, "/orders/create", "COINDCX");
    }

    const arr = Array.isArray(data) ? data : [data];
    const raw = arr[0] as CdCxOrderRaw | undefined;
    if (!raw?.id) {
      const err = data as { message?: string; status?: string };
      throw new ExchangeApiError(err.message ?? "Order create failed", res.status, "/orders/create", "COINDCX");
    }

    await new Promise((r) => setTimeout(r, 400));
    return this.getOrder(internalSymbol, raw.id, creds);
  }

  async placeMarketOrder(symbol: string, side: "BUY" | "SELL", quantity: number, creds: ExchangeCredentials): Promise<Order> {
    const pair = coinDcxPairFromInternal(symbol);
    const internal = internalSymbolFromCoinDcxPair(pair);
    return this.createOrder(
      internal,
      {
        side: side === "BUY" ? "buy" : "sell",
        pair,
        order_type: "market_order",
        price: null,
        stop_price: null,
        total_quantity: quantity,
        time_in_force: null,
      },
      creds,
    );
  }

  async placeStopMarket(
    symbol: string,
    side: "BUY" | "SELL",
    stopPrice: number,
    quantity: number,
    creds: ExchangeCredentials,
    tickSize: number,
  ): Promise<Order> {
    const pair = coinDcxPairFromInternal(symbol);
    const internal = internalSymbolFromCoinDcxPair(pair);
    const trig = roundToTick(stopPrice, tickSize);
    const o = await this.createOrder(
      internal,
      {
        side: side === "BUY" ? "buy" : "sell",
        pair,
        order_type: "stop_market",
        price: null,
        stop_price: trig,
        total_quantity: quantity,
        time_in_force: null,
      },
      creds,
    );
    return {
      ...o,
      type: "STOP_MARKET",
      stopPrice: String(trig),
      status: "NEW",
    };
  }

  async placeTakeProfitMarket(
    symbol: string,
    side: "BUY" | "SELL",
    stopPrice: number,
    quantity: number,
    creds: ExchangeCredentials,
    tickSize: number,
  ): Promise<Order> {
    const pair = coinDcxPairFromInternal(symbol);
    const internal = internalSymbolFromCoinDcxPair(pair);
    const trig = roundToTick(stopPrice, tickSize);
    const o = await this.createOrder(
      internal,
      {
        side: side === "BUY" ? "buy" : "sell",
        pair,
        order_type: "take_profit_market",
        price: null,
        stop_price: trig,
        total_quantity: quantity,
        time_in_force: null,
      },
      creds,
    );
    return {
      ...o,
      type: "TAKE_PROFIT_MARKET",
      stopPrice: String(trig),
      status: "NEW",
    };
  }

  async placeMarketClose(symbol: string, side: "BUY" | "SELL", quantity: number, creds: ExchangeCredentials): Promise<Order> {
    const closeSide = side === "BUY" ? "SELL" : "BUY";
    return this.placeMarketOrder(symbol, closeSide, quantity, creds);
  }

  async cancelOrder(symbol: string, orderId: string, creds: ExchangeCredentials): Promise<Order> {
    await signedPost("/exchange/v1/derivatives/futures/orders/cancel", { id: orderId }, creds);
    return {
      orderId,
      symbol: internalSymbolFromCoinDcxPair(coinDcxPairFromInternal(symbol)),
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
    const pair = coinDcxPairFromInternal(symbol);
    const rows = await signedPost<Array<{ id: string; pair: string }>>("/exchange/v1/derivatives/futures/positions", {
      page: "1",
      size: "50",
      pairs: pair,
      margin_currency_short_name: [USDT_MARGIN],
    }, creds);

    const pos = rows.find((r) => r.pair === pair);
    if (!pos) return;

    try {
      await signedPost("/exchange/v1/derivatives/futures/positions/cancel_all_open_orders_for_position", { id: pos.id }, creds);
    } catch {
      /* best effort */
    }
  }

  async getOrder(symbol: string, orderId: string, creds: ExchangeCredentials): Promise<Order> {
    const internal = coinDcxPairFromInternal(symbol).startsWith("B-")
      ? internalSymbolFromCoinDcxPair(coinDcxPairFromInternal(symbol))
      : symbol.replace(/\.P$/i, "").toUpperCase();

    for (const st of ["open", "filled", "untriggered", "partially_filled"]) {
      for (const sd of ["buy", "sell"]) {
        const rows = await signedPost<CdCxOrderRaw[]>("/exchange/v1/derivatives/futures/orders", {
          status: st,
          side: sd,
          page: "1",
          size: "100",
          margin_currency_short_name: [USDT_MARGIN],
        }, creds);

        const hit = rows.find((o) => o.id === orderId);
        if (hit) return mapCdCxOrder(hit, internal);
      }
    }

    throw new ExchangeApiError(`Order ${orderId} not found`, 404, "/orders", "COINDCX");
  }

  async getOpenOrders(symbol: string, creds: ExchangeCredentials): Promise<Order[]> {
    const pair = coinDcxPairFromInternal(symbol);
    const internal = internalSymbolFromCoinDcxPair(pair);
    const out: Order[] = [];

    for (const sd of ["buy", "sell"]) {
      const rows = await signedPost<CdCxOrderRaw[]>("/exchange/v1/derivatives/futures/orders", {
        status: "open,untriggered,partially_filled",
        side: sd,
        page: "1",
        size: "200",
        margin_currency_short_name: [USDT_MARGIN],
      }, creds);

      for (const o of rows) {
        if (o.pair === pair) out.push(mapCdCxOrder(o, internal));
      }
    }

    return out;
  }

  async getAllOrders(symbol: string, creds: ExchangeCredentials, limit = 50): Promise<Order[]> {
    const pair = coinDcxPairFromInternal(symbol);
    const internal = internalSymbolFromCoinDcxPair(pair);
    const out: Order[] = [];

    for (const st of ["filled", "cancelled", "open"]) {
      for (const sd of ["buy", "sell"]) {
        const rows = await signedPost<CdCxOrderRaw[]>("/exchange/v1/derivatives/futures/orders", {
          status: st,
          side: sd,
          page: "1",
          size: String(Math.min(limit, 100)),
          margin_currency_short_name: [USDT_MARGIN],
        }, creds);

        for (const o of rows) {
          if (o.pair === pair) out.push(mapCdCxOrder(o, internal));
        }
      }
    }

    return out.slice(0, limit);
  }

  async getClosedPnl(symbol: string, creds: ExchangeCredentials, startTime?: number): Promise<ClosedPnlRecord[]> {
    const pair = coinDcxPairFromInternal(symbol);
    const internal = internalSymbolFromCoinDcxPair(pair);
    const startMs = startTime != null && Number.isFinite(startTime) ? startTime : 0;

    type CdCxPosTxn = {
      pair: string;
      stage?: string;
      amount?: number;
      fee_amount?: number;
      price_in_usdt?: number;
      created_at?: number;
      margin_currency_short_name?: string;
      position_id?: string;
      side?: string;
      order_side?: string;
    };

    const seen = new Set<string>();
    const out: ClosedPnlRecord[] = [];

    /**
     * CoinDCX "Get Transactions" rejects `stage: "all"` (422). Valid stages per docs:
     * default, funding, exit, tpsl_exit, liquidation — fetch each and merge.
     * @see https://docs.coindcx.com/#positions-transactions
     */
    const TRANSACTION_STAGES = ["default", "funding", "exit", "tpsl_exit", "liquidation"] as const;

    /** CoinDCX returns `created_at` in ms (13 digits); older rows may use seconds. */
    const createdAtMs = (raw: number | undefined | null): number => {
      if (raw == null || Number.isNaN(raw)) return 0;
      return raw < 1e12 ? raw * 1000 : raw;
    };

    const ingestRows = (rows: CdCxPosTxn[] | null | undefined, stage: string) => {
      if (!rows?.length) return;
      for (const r of rows) {
        if (r.pair !== pair || r.margin_currency_short_name !== USDT_MARGIN) continue;
        if (r.created_at == null) continue;

        const cms = createdAtMs(r.created_at);
        if (startMs > 0 && cms > 0 && cms < startMs) continue;

        const dedupeKey =
          r.position_id && r.created_at != null
            ? `${r.position_id}:${r.created_at}:${stage}`
            : `${stage}:${r.created_at}:${r.amount}:${r.fee_amount}:${r.price_in_usdt}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const rawSide = r.side ?? r.order_side;
        const sideNorm =
          rawSide != null && String(rawSide).trim() !== ""
            ? String(rawSide).toUpperCase()
            : null;

        const gross = r.amount ?? 0;
        const fees = r.fee_amount ?? 0;
        out.push({
          symbol: internal,
          closedPnl: gross + fees,
          qty: 0,
          avgEntryPrice: r.price_in_usdt ?? 0,
          avgExitPrice: r.price_in_usdt ?? 0,
          createdTime: cms > 0 ? cms : (r.created_at ?? 0),
          side: sideNorm,
        });
      }
    };

    const maxPagesPerStage = 25;
    const path = "/exchange/v1/derivatives/futures/positions/transactions";

    for (const stage of TRANSACTION_STAGES) {
      for (let page = 1; page <= maxPagesPerStage; page++) {
        let rows: CdCxPosTxn[];
        try {
          rows = await signedPost<CdCxPosTxn[]>(
            path,
            {
              stage,
              page: String(page),
              size: "200",
              margin_currency_short_name: [USDT_MARGIN],
            },
            creds,
          );
        } catch (e) {
          if (e instanceof ExchangeApiError && e.code === 422) break;
          throw e;
        }

        ingestRows(rows, stage);
        if (!rows?.length || rows.length < 200) break;
      }
    }

    return out;
  }
}
