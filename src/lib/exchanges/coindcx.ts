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

/**
 * Unrealized P&L for a CoinDCX position.
 *
 * CoinDCX's positions endpoint does not return an unrealized field, so we
 * derive it from the fields that ARE returned:
 *
 *   pnl = (mark − entry) × active_pos
 *
 * `active_pos` is signed — positive=long, negative=short — so the sign of
 * the result is correct without an explicit side branch.
 *
 * Returns "0" if any input is missing/non-finite/zero so we never make the
 * existing behaviour worse than the previous hard-coded placeholder.
 * Stringified to match `FuturesPosition.unRealizedProfit` (other connectors
 * also stringify; the calling code reparses with `parseFloat`).
 */
function computeCoinDcxUnrealizedProfit(
  activePos: number | undefined | null,
  avgPrice: number | undefined | null,
  markPrice: number | undefined | null,
): string {
  const pos = typeof activePos === "number" && Number.isFinite(activePos) ? activePos : 0;
  const entry = typeof avgPrice === "number" && Number.isFinite(avgPrice) ? avgPrice : 0;
  const mark = typeof markPrice === "number" && Number.isFinite(markPrice) ? markPrice : 0;
  if (pos === 0 || entry <= 0 || mark <= 0) return "0";
  const pnl = (mark - entry) * pos;
  if (!Number.isFinite(pnl)) return "0";
  return String(Number(pnl.toFixed(8)));
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

/** Cloudflare / CoinDCX burst limits (error 1015) on wallet endpoints. */
function isCdCxTransientError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    msg.includes("1015") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    (msg.includes("500") && msg.includes("wallets"))
  );
}

async function withCdCxRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isCdCxTransientError(e) || i >= attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw last;
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

function symbolInfoFromCdCxInstrument(s: CdCxInstrument): SymbolInfo {
  const step = s.quantity_increment;
  const tick = s.price_increment;
  const internal = internalSymbolFromCoinDcxPair(s.pair);
  const qtyPrecision = Math.max(0, Math.round(-Math.log10(step)));
  const pricePrecision = Math.max(0, Math.round(-Math.log10(tick)));
  const maxLev = Math.min(
    Math.max(s.max_leverage_long ?? 10, s.max_leverage_short ?? 10),
    125,
  );
  return {
    symbol: internal,
    pricePrecision,
    quantityPrecision: qtyPrecision,
    minQty: s.min_quantity,
    maxQty: s.max_quantity,
    stepSize: step,
    tickSize: tick,
    minNotional: s.min_notional,
    maxLeverage: maxLev,
  };
}

async function fetchCdCxInstrumentForPair(pair: string): Promise<SymbolInfo | null> {
  try {
    const infRes = await fetch(
      `${API_BASE}/exchange/v1/derivatives/futures/data/instrument?pair=${encodeURIComponent(pair)}&margin_currency_short_name=${USDT_MARGIN}`,
      { cache: "no-store" },
    );
    const body = (await infRes.json()) as { instrument?: CdCxInstrument };
    if (!body.instrument) return null;
    return symbolInfoFromCdCxInstrument(body.instrument);
  } catch {
    return null;
  }
}

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
            const info = symbolInfoFromCdCxInstrument(s);
            map.set(info.symbol, info);
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

  async getSymbolInfo(symbol: string, _testnet?: boolean): Promise<SymbolInfo> {
    const internal = coinDcxPairFromInternal(symbol).startsWith("B-")
      ? internalSymbolFromCoinDcxPair(coinDcxPairFromInternal(symbol))
      : symbol.replace(/\.P$/i, "").toUpperCase();

    if (
      infoCache.symbols.size > 0 &&
      Date.now() - infoCache.ts < CACHE_TTL_MS
    ) {
      const hit = infoCache.symbols.get(internal);
      if (hit) return hit;
    }

    const pair = coinDcxPairFromInternal(symbol);
    const single = await fetchCdCxInstrumentForPair(pair);
    if (single) {
      infoCache.symbols.set(single.symbol, single);
      infoCache.ts = Date.now();
      return single;
    }

    const map = await this.getExchangeInfo(true, _testnet);
    const info = map.get(internal);
    if (!info) {
      throw new Error(`Symbol ${symbol} not found on CoinDCX USDT futures`);
    }
    return info;
  }

  async getBalance(creds: ExchangeCredentials): Promise<FuturesBalance[]> {
    const rows = await withCdCxRetry(() =>
      signedGetJsonBody<Array<{ currency_short_name: string; balance: string; locked_balance?: string }>>(
        "/exchange/v1/derivatives/futures/wallets",
        {},
        creds,
      ),
    );

    return rows.map((w) => {
      const free = parseFloat(w.balance ?? "0");
      const locked = parseFloat(w.locked_balance ?? "0");
      // CoinDCX: `balance` is free USDT; total wallet = balance + locked_balance.
      // https://docs.coindcx.com/ — futures wallets endpoint.
      const total = free + locked;
      return {
        asset: w.currency_short_name,
        balance: String(total),
        availableBalance: String(free),
        crossUnPnl: "0",
      };
    });
  }

  async getUsdtBalance(creds: ExchangeCredentials): Promise<{ total: number; available: number }> {
    const balances = await this.getBalance(creds);
    const usdt = balances.find((b) => b.asset === "USDT");
    return {
      total: parseFloat(usdt?.balance ?? "0"),
      available: parseFloat(usdt?.availableBalance ?? "0"),
    };
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
        // CoinDCX's positions endpoint does not return an `unrealized` field
        // directly (the previous "0" placeholder was visible to every code
        // path that read venue PnL — kill switch, force-close PnL display,
        // aggregate reconciliation). Compute it ourselves from the fields
        // that ARE returned: signed P&L = (mark − entry) × active_pos.
        // `active_pos` is already signed (positive=long, negative=short) so
        // shorts get the correct negative-on-rally / positive-on-drop sign
        // for free. Falls back to the safe "0" when either price is
        // missing — never makes things worse than today.
        unRealizedProfit: computeCoinDcxUnrealizedProfit(
          p.active_pos,
          p.avg_price,
          p.mark_price,
        ),
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
      // See `getPositions` above for why we derive this ourselves.
      unRealizedProfit: computeCoinDcxUnrealizedProfit(
        p.active_pos,
        p.avg_price,
        p.mark_price,
      ),
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
    // CoinDCX futures require a dedicated close endpoint
    // (`/positions/exit`) — NOT a side-flipped market order. The latter
    // can be interpreted by the venue as a NEW entry on the opposite side
    // (no `reduceOnly` flag exists on this venue), which is exactly why
    // the NILUSDT.P kill-switch cascade left every CoinDCX user's position
    // open: a "close" SELL market order was placed but the original LONG
    // sat untouched. Bybit/Hyperliquid have `reduceOnly` so the equivalent
    // side flip is safe there.
    //
    // The fix follows CoinDCX's official "exit position" flow:
    //
    //   1. Look up the open position by pair via `/positions`. The
    //      `active_pos` field is signed: positive=long, negative=short,
    //      zero=closed. If the position is already gone (manual close,
    //      SL filled earlier, etc.) we return a synthetic FILLED order so
    //      `protectiveClose` clears Firestore — there's nothing left to
    //      do on the exchange.
    //
    //   2. Call `/positions/exit` with the `position.id`. CoinDCX splits
    //      the close into multiple internal market orders and replies
    //      with a `group_id` (we keep it for downstream PnL reconcile).
    //
    //   3. Verify the close by polling `/positions` again until
    //      `active_pos` drops to zero. Exit-position is async; without
    //      this check we'd mark Firestore CLOSED while the venue still
    //      had the residual size open — exactly the bug that bit us on
    //      Hyperliquid before commit `9320fd0`'s zero-fill guard.
    //
    // Returns an Order in the standard shape with `executedQty` set to
    // the absolute size that was actually closed, so `protectiveClose`
    // can compute approximate PnL. The exact fill price comes later from
    // `sync-exchange-pnl` via the `group_id`.
    const pair = coinDcxPairFromInternal(symbol);
    const internal = internalSymbolFromCoinDcxPair(pair);
    const closeSide: "BUY" | "SELL" = side === "BUY" ? "SELL" : "BUY";

    interface CdCxPositionRow {
      id: string;
      pair: string;
      active_pos?: number;
    }

    const fetchPositionForPair = async (): Promise<CdCxPositionRow | null> => {
      const rows = await signedPost<CdCxPositionRow[]>(
        "/exchange/v1/derivatives/futures/positions",
        { page: "1", size: "10", pairs: pair, margin_currency_short_name: [USDT_MARGIN] },
        creds,
      );
      return rows.find((r) => r.pair === pair) ?? null;
    };

    const synthOrder = (orderId: string, qty: number): Order => ({
      orderId,
      symbol: internal,
      status: "FILLED",
      clientOrderId: "",
      price: "0",
      avgPrice: "0",
      origQty: String(qty),
      executedQty: String(qty),
      cumQuote: "0",
      type: "MARKET",
      side: closeSide,
      stopPrice: "0",
      time: Date.now(),
      updateTime: Date.now(),
    });

    const pos = await fetchPositionForPair();
    const activePos = pos?.active_pos ?? 0;
    const closedQty = Math.abs(activePos);

    if (!pos || closedQty === 0) {
      // Position already gone on the venue — let `protectiveClose` clear
      // the Firestore doc. `quantity` is what the caller _expected_ to
      // close (`trade.remainingQty`); we echo it so PnL math doesn't
      // divide by zero downstream.
      return synthOrder("no-position", quantity);
    }

    interface CdCxExitResponse {
      message?: string;
      status?: number;
      code?: number;
      data?: { group_id?: string };
    }

    const exitResp = await signedPost<CdCxExitResponse>(
      "/exchange/v1/derivatives/futures/positions/exit",
      { id: pos.id },
      creds,
    );
    const groupId = exitResp?.data?.group_id ?? "no-group-id";

    // Poll for actual close — total budget 6s split across ~10 attempts.
    // First check sits at 400ms (matches `createOrder`'s existing wait).
    const POLL_INTERVAL_MS = 600;
    const POLL_BUDGET_MS = 6000;
    const startMs = Date.now();
    while (Date.now() - startMs < POLL_BUDGET_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const pos2 = await fetchPositionForPair();
      const stillOpen = pos2 ? Math.abs(pos2.active_pos ?? 0) : 0;
      if (stillOpen === 0) {
        return synthOrder(groupId, closedQty);
      }
    }

    // We accepted the exit call but the venue hadn't drained the position
    // within budget. Throw so `protectiveClose` keeps Firestore OPEN and
    // the next sync-live-trades cron tick retries — exit-position is
    // idempotent (closing a zero-size position is a no-op on CoinDCX).
    throw new ExchangeApiError(
      `positions/exit accepted (group_id=${groupId}) but ${pair} active_pos did not reach 0 within ${POLL_BUDGET_MS}ms`,
      500,
      "/positions/exit",
      "COINDCX",
    );
  }

  async cancelOrder(symbol: string, orderId: string, creds: ExchangeCredentials): Promise<Order> {
    try {
      await signedPost("/exchange/v1/derivatives/futures/orders/cancel", { id: orderId }, creds);
    } catch (e) {
      // Treat "already cancelled / filled / not found" as success — it's the
      // state we wanted regardless. Rethrow everything else so the verified
      // cancel-and-check loop in `cancelResidualExitOrders` can retry.
      if (e instanceof ExchangeApiError) {
        const m = e.message.toLowerCase();
        const benign =
          m.includes("not found") ||
          m.includes("does not exist") ||
          m.includes("already") ||
          m.includes("invalid order id") ||
          m.includes("filled") ||
          m.includes("cancelled") ||
          m.includes("canceled");
        if (!benign) throw e;
      } else {
        throw e;
      }
    }
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
    const errors: string[] = [];

    // Fast path: cancel all orders attached to the open position. Works when
    // the position is still open (e.g. TP1 hit, cleaning up the old SL).
    let cancelledViaPosition = false;
    try {
      const rows = await signedPost<Array<{ id: string; pair: string }>>("/exchange/v1/derivatives/futures/positions", {
        page: "1",
        size: "50",
        pairs: pair,
        margin_currency_short_name: [USDT_MARGIN],
      }, creds);

      const pos = rows.find((r) => r.pair === pair);
      if (pos) {
        try {
          await signedPost("/exchange/v1/derivatives/futures/positions/cancel_all_open_orders_for_position", { id: pos.id }, creds);
          cancelledViaPosition = true;
        } catch (e) {
          // The position-cancel endpoint can fail if the position closed
          // mid-flight; the per-order fallback below will still verify and
          // retry. Record the error so the caller can surface it.
          if (e instanceof ExchangeApiError) {
            errors.push(`positions/cancel_all_open_orders_for_position: ${e.message}`);
          } else {
            throw e;
          }
        }
      }
    } catch (e) {
      // Fetching the position itself failed (different from "no position"):
      // surface it. The per-order fallback below still runs as a safety net.
      if (e instanceof ExchangeApiError) {
        errors.push(`positions lookup: ${e.message}`);
      } else {
        throw e;
      }
    }

    // Fallback: the position is fully closed (SL or final TP filled it), so
    // the position endpoint returns nothing — but orphaned stop / TP orders
    // can still be sitting open and must be cancelled individually. We also
    // run this when position-cancel succeeded, as a verification pass for
    // anything the venue indexed slightly later.
    let openOrders: Order[] = [];
    try {
      openOrders = await this.getOpenOrders(symbol, creds);
    } catch (e) {
      if (e instanceof ExchangeApiError) {
        errors.push(`getOpenOrders: ${e.message}`);
      } else {
        throw e;
      }
    }

    if (openOrders.length > 0) {
      const outcomes = await Promise.allSettled(
        openOrders.map((o) => this.cancelOrder(symbol, o.orderId, creds)),
      );
      for (let i = 0; i < outcomes.length; i++) {
        const r = outcomes[i];
        if (r.status === "rejected") {
          const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
          errors.push(`cancel ${openOrders[i].orderId}: ${reason}`);
        }
      }
    }

    // Surface any non-benign errors so the verification loop in
    // `cancelResidualExitOrders` knows to retry. If the per-order pass
    // succeeded for everything we found, this short-circuits at the
    // verification step (re-reading getOpenOrders). When position-cancel
    // succeeded and no orphans surfaced, errors is empty.
    if (!cancelledViaPosition && openOrders.length === 0 && errors.length > 0) {
      throw new ExchangeApiError(
        `cancelAllOrders failed for ${symbol}: ${errors.join(" | ")}`,
        500,
        "/positions/cancel_all_open_orders_for_position",
        "COINDCX",
      );
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

  async getClosedPnl(
    symbol: string,
    creds: ExchangeCredentials,
    startTime?: number,
    _endTime?: number,
  ): Promise<ClosedPnlRecord[]> {
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
      parent_id?: string;
      parent_type?: string;
      side?: string;
      order_side?: string;
      // CoinDCX exposes the fill size under one of these keys depending on
      // the stage / endpoint version. Try them in order.
      quantity?: number;
      qty?: number;
      total_quantity?: number;
    };

    const seen = new Set<string>();
    const out: ClosedPnlRecord[] = [];

    /**
     * CoinDCX "Get Transactions" rejects `stage: "all"` (422). Valid stages per docs:
     *   default, funding, exit, tpsl_exit, liquidation
     *
     * We deliberately skip `funding` here — funding payments are an ongoing
     * position-holding cost, not a trade outcome, and should not be folded
     * into realised PnL. (Bybit's `closedPnl` excludes funding for the same
     * reason; we want parity.) If we ever need to surface funding paid per
     * trade we'll fetch it through a dedicated method.
     *
     * @see https://docs.coindcx.com/#positions-transactions
     */
    const TRANSACTION_STAGES = ["default", "exit", "tpsl_exit", "liquidation"] as const;

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

        // CoinDCX `side` on a transaction row is the SIDE OF THE FILL
        // (e.g. `sell` when a LONG position is closed by a market sell), not
        // the side of the parent position. The shared reconciler's optional
        // side-narrow filter (`selectClosedPnlRecordsForTrade`) compares
        // against the trade's POSITION side (BUY/SELL of the original
        // entry), so reporting CoinDCX's order-side here would silently
        // drop every legitimate exit row whenever `parent_id` matching
        // misses (CoinDCX indexes parent_id with a few seconds of lag on
        // `tpsl_exit` rows). Leaving side unset lets the time-window
        // fallback work as intended; parent_id matching, when it lands,
        // is exact regardless.
        // (Contrast Bybit: its closedPnl `side` IS the position side, so
        // bybit.ts surfaces it as-is.)

        // CoinDCX `amount` is the per-transaction P&L credited to the
        // wallet on this exit (or 0 on entries/funding). `fee_amount` is
        // recorded as a SEPARATE wallet debit row in the same transaction
        // ledger, so `amount` is already net of fees from the trader's
        // perspective — matches what shows up in the user's CoinDCX
        // dashboard. (The earlier "gross + fee_amount" attempt double-
        // counted fees against PnL; the current single-field passthrough
        // is correct.)
        //
        // Resolve qty from whichever key CoinDCX populated for this stage.
        // Default 0 (was every row before this commit) — the metric
        // averager in reconcile-exchange-pnl now skips zero-qty rows
        // explicitly so an unresolved qty no longer pollutes the
        // weighted avg-fill columns.
        const qtyRaw = r.quantity ?? r.qty ?? r.total_quantity;
        const qty = typeof qtyRaw === "number" && Number.isFinite(qtyRaw) ? Math.abs(qtyRaw) : 0;

        // CoinDCX transactions do not include the original entry price; the
        // trade's `entryPrice` (stored at open time) is the source of truth
        // for entry. Using NaN here signals the metric averager to skip
        // this row from entry averaging entirely — previously we wrote
        // `price_in_usdt` for BOTH entry and exit, which made the
        // dashboard's "Avg entry" column show the exit price.
        const exitPriceRaw = r.price_in_usdt;
        const isExitRow =
          (typeof r.amount === "number" && r.amount !== 0) ||
          r.stage === "exit" ||
          r.stage === "tpsl_exit" ||
          r.stage === "liquidation";
        const avgExitPrice =
          isExitRow && typeof exitPriceRaw === "number" && Number.isFinite(exitPriceRaw)
            ? exitPriceRaw
            : NaN;

        out.push({
          symbol: internal,
          closedPnl: r.amount ?? 0,
          qty,
          avgEntryPrice: NaN,
          avgExitPrice,
          createdTime: cms > 0 ? cms : (r.created_at ?? 0),
          // `parent_id` on a CoinDCX transaction == the order ID that
          // produced the fill (entry, SL, TP, market close, trailing-SL
          // replacement). Surfacing it as `orderId` lets the shared
          // reconciler match by exact order id (same path Bybit uses)
          // instead of falling back to a wide time window.
          ...(r.parent_id && String(r.parent_id).trim() !== ""
            ? { orderId: String(r.parent_id).trim() }
            : {}),
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
