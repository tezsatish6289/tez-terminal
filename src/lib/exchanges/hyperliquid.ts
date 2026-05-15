/**
 * Hyperliquid perp connector (main wallet + API agent wallet).
 *
 * Perps are USDC-margined; the app UI shows pairs like `BTC-USDC`. The REST API
 * identifies markets by **coin** (e.g. `BTC`). We normalize symbols to a canonical
 * `COINUSDC` form (while still accepting Bybit-style `COINUSDT` / `COINUSDT.P` signals).
 *
 * Credentials (same Firestore shape as other venues):
 *   - apiKey    → main wallet address (0x...) — Info API user scope (same as HL docs for “info requests”)
 *   - apiSecret → API agent wallet **private key** (0x + 64 hex) — signs exchange actions (not the agent’s public address from the HL API table)
 *
 * Users authorize the agent at https://app.hyperliquid.xyz/API
 * Docs: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint
 */
import {
  HttpTransport,
  InfoClient,
  ExchangeClient,
  ApiRequestError,
} from "@nktkas/hyperliquid";
import { formatPrice, formatSize } from "@nktkas/hyperliquid/utils";
import { isAddress, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
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

const HL_MIN_NOTIONAL_USD = 10;
const INFO_CACHE_TTL_MS = 4 * 60 * 60 * 1000;

type HlClients = {
  transport: HttpTransport;
  info: InfoClient;
  exchange: ExchangeClient;
  master: `0x${string}`;
};

const metaCache: {
  map: Map<string, SymbolInfo>;
  byCoin: Map<string, { assetId: number; szDecimals: number; maxLev: number }>;
  ts: number;
  testnet?: boolean;
} = { map: new Map(), byCoin: new Map(), ts: 0 };

function normalizePrivateKey(secret: string): `0x${string}` {
  const t = secret.trim();
  const hex = t.startsWith("0x") || t.startsWith("0X") ? t : `0x${t}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) {
    throw new ExchangeApiError("Agent private key must be 64 hex chars (with optional 0x prefix)", 400, "/", "HYPERLIQUID");
  }
  return hex as `0x${string}`;
}

function normalizeMasterAddress(key: string): `0x${string}` {
  const t = key.trim();
  if (!isAddress(t)) {
    throw new ExchangeApiError("Invalid main wallet address (apiKey must be your 0x master address)", 400, "/", "HYPERLIQUID");
  }
  return getAddress(t) as `0x${string}`;
}

/** Canonical perp symbol we store for HL (matches venue quote currency). */
function internalFromCoin(coin: string): string {
  return `${coin.toUpperCase()}USDC`;
}

/** Strip UI/API wrappers to get HL **coin** name for mids, orders, filters. */
function coinFromInternal(symbol: string): string {
  let s = symbol.replace(/\.P$/i, "").trim().toUpperCase().replace(/-/g, "");
  if (s.endsWith("USDC")) return s.slice(0, -4);
  if (s.endsWith("USDT")) return s.slice(0, -4);
  return s;
}

function hlError(e: unknown, endpoint: string): Error {
  if (e instanceof ApiRequestError) {
    const msg = e.message || JSON.stringify(e.response ?? "");
    return new ExchangeApiError(msg.slice(0, 400), 400, endpoint, "HYPERLIQUID");
  }
  return e instanceof Error ? e : new Error(String(e));
}

function clients(creds: ExchangeCredentials): HlClients {
  const master = normalizeMasterAddress(creds.apiKey);
  const wallet = privateKeyToAccount(normalizePrivateKey(creds.apiSecret));
  const transport = new HttpTransport({ isTestnet: !!creds.testnet });
  const info = new InfoClient({ transport });
  const exchange = new ExchangeClient({ transport, wallet });
  return { transport, info, exchange, master };
}

/** Parses {@link InfoClient.orderStatus} — HL nests details under `order.order`. */
function extractOrderStatus(resp: unknown): {
  oid: number;
  avgPx?: string;
  totalSz?: string;
  processingStatus?: string;
} | null {
  if (typeof resp !== "object" || resp === null) return null;
  const r = resp as { status?: string; order?: { status?: string; order?: Record<string, unknown> } };
  if (r.status === "unknownOid") return null;
  if (r.status !== "order" || !r.order?.order) return null;
  const wrap = r.order;
  const inner = wrap.order;
  if (!inner || typeof inner.oid !== "number") return null;
  const oid = inner.oid;
  const processingStatus = typeof wrap.status === "string" ? wrap.status : undefined;
  const origSz = typeof inner.origSz === "string" ? inner.origSz : undefined;
  const sz = typeof inner.sz === "string" ? inner.sz : undefined;
  const totalSz = processingStatus === "filled" ? origSz ?? sz : origSz ?? sz;
  return { oid, processingStatus, totalSz, avgPx: undefined };
}

function mapPlaceStatuses(
  resp: unknown,
  internalSymbol: string,
  side: "BUY" | "SELL",
  orderType: string,
): Order {
  const r = resp as {
    response?: { data?: { statuses?: unknown[] } };
  };
  const st = r.response?.data?.statuses?.[0] as Record<string, unknown> | string | undefined;
  if (st === undefined || st === null) {
    throw new ExchangeApiError("Empty order response", 500, "/exchange", "HYPERLIQUID");
  }
  if (typeof st === "string") {
    if (st === "waitingForFill" || st === "waitingForTrigger") {
      throw new ExchangeApiError(`Order pending: ${st}`, 500, "/exchange", "HYPERLIQUID");
    }
    throw new ExchangeApiError(`Unexpected order status: ${st}`, 500, "/exchange", "HYPERLIQUID");
  }
  if ("error" in st && typeof st.error === "string") {
    throw new ExchangeApiError(st.error, 400, "/exchange", "HYPERLIQUID");
  }
  if ("filled" in st && typeof st.filled === "object" && st.filled) {
    const f = st.filled as { oid?: number; avgPx?: string; totalSz?: string };
    return {
      orderId: String(f.oid ?? ""),
      symbol: internalSymbol,
      status: "FILLED",
      clientOrderId: "",
      price: f.avgPx ?? "0",
      avgPrice: f.avgPx ?? "0",
      origQty: f.totalSz ?? "0",
      executedQty: f.totalSz ?? "0",
      cumQuote: "0",
      type: orderType,
      side,
      stopPrice: "0",
      time: Date.now(),
      updateTime: Date.now(),
    };
  }
  if ("resting" in st && typeof st.resting === "object" && st.resting) {
    const x = st.resting as { oid?: number };
    return {
      orderId: String(x.oid ?? ""),
      symbol: internalSymbol,
      status: "NEW",
      clientOrderId: "",
      price: "0",
      avgPrice: "0",
      origQty: "0",
      executedQty: "0",
      cumQuote: "0",
      type: orderType,
      side,
      stopPrice: "0",
      time: Date.now(),
      updateTime: Date.now(),
    };
  }
  throw new ExchangeApiError(JSON.stringify(st).slice(0, 200), 500, "/exchange", "HYPERLIQUID");
}

export class HyperliquidConnector implements ExchangeConnector {
  readonly name = "HYPERLIQUID" as const;

  normalizeSymbol(signalSymbol: string): string {
    let s = signalSymbol.replace(/\.P$/i, "").trim().toUpperCase();
    s = s.replace(/-/g, "");
    if (s.endsWith("USDT")) s = `${s.slice(0, -4)}USDC`;
    else if (!s.endsWith("USDC") && /^[A-Z0-9]+$/.test(s)) {
      s = `${s}USDC`;
    }
    return s;
  }

  async getAllPrices(testnet?: boolean): Promise<Map<string, number>> {
    const transport = new HttpTransport({ isTestnet: !!testnet });
    const info = new InfoClient({ transport });
    const mids = await info.allMids();
    const map = new Map<string, number>();
    for (const [coin, px] of Object.entries(mids)) {
      const p = parseFloat(String(px));
      if (!Number.isFinite(p) || p <= 0) continue;
      const u = coin.toUpperCase();
      map.set(u, p);
      map.set(`${u}USDC`, p);
      map.set(`${u}USDT`, p);
    }
    return map;
  }

  async getExchangeInfo(forceRefresh = false, testnet?: boolean): Promise<Map<string, SymbolInfo>> {
    const tn = !!testnet;
    if (!forceRefresh && metaCache.map.size > 0 && metaCache.testnet === tn && Date.now() - metaCache.ts < INFO_CACHE_TTL_MS) {
      return metaCache.map;
    }

    const transport = new HttpTransport({ isTestnet: tn });
    const info = new InfoClient({ transport });
    const [meta] = await info.metaAndAssetCtxs();
    const map = new Map<string, SymbolInfo>();
    const byCoin = new Map<string, { assetId: number; szDecimals: number; maxLev: number }>();

    meta.universe.forEach((asset, index) => {
      const coin = asset.name;
      const coinU = coin.toUpperCase();
      const internal = internalFromCoin(coin);
      const legacyUsdt = `${coinU}USDT`;
      const szDec = asset.szDecimals ?? 0;
      const stepSize = 10 ** -szDec;
      const maxDecimals = Math.max(0, 6 - szDec);
      const tickSize = 10 ** -maxDecimals;
      const maxLev = asset.maxLeverage ?? 20;

      byCoin.set(coinU, { assetId: index, szDecimals: szDec, maxLev });

      const sym: SymbolInfo = {
        symbol: internal,
        pricePrecision: Math.max(0, maxDecimals),
        quantityPrecision: szDec,
        minQty: stepSize,
        maxQty: 1e12,
        stepSize,
        tickSize,
        minNotional: HL_MIN_NOTIONAL_USD,
        maxLeverage: maxLev,
      };
      map.set(internal, sym);
      map.set(legacyUsdt, sym);
    });

    metaCache.map = map;
    metaCache.byCoin = byCoin;
    metaCache.ts = Date.now();
    metaCache.testnet = tn;
    return map;
  }

  async getSymbolInfo(symbol: string, testnet?: boolean): Promise<SymbolInfo> {
    const m = await this.getExchangeInfo(false, testnet);
    const internal = this.normalizeSymbol(symbol);
    const info = m.get(internal);
    if (!info) {
      const coin = coinFromInternal(internal);
      throw new Error(
        `No Hyperliquid perp for "${coin}" (from ${internal}). That coin is not in HL's perp universe — Bybit-style signals include many alts Hyperliquid does not list. HL quotes perps vs USDC (UI: e.g. ${coin}-USDC).`,
      );
    }
    return info;
  }

  private async assetRow(symbol: string, testnet?: boolean) {
    const internal = this.normalizeSymbol(symbol);
    const coin = coinFromInternal(internal);
    await this.getExchangeInfo(false, testnet);
    const row = metaCache.byCoin.get(coin);
    if (!row) throw new Error(`Unknown Hyperliquid coin: ${coin}`);
    return { assetId: row.assetId, szDecimals: row.szDecimals, maxLev: row.maxLev, coin, internal };
  }

  /** VWAP for a single `oid` from recent user fills (orderStatus does not include avg fill price). */
  private async vwapFromUserFills(
    info: InfoClient,
    master: `0x${string}`,
    oid: number,
    szDecimals: number,
  ): Promise<{ avgPx: string; totalSz: string } | null> {
    try {
      const fills = await info.userFills({ user: master });
      const rows = (fills as { oid?: number; px?: string; sz?: string }[]).filter((f) => Number(f.oid) === oid);
      if (rows.length === 0) return null;
      let sumPxSz = 0;
      let sumSz = 0;
      for (const f of rows) {
        const px = parseFloat(String(f.px ?? "0"));
        const sz = parseFloat(String(f.sz ?? "0"));
        if (!Number.isFinite(px) || !Number.isFinite(sz) || sz <= 0) continue;
        sumPxSz += px * sz;
        sumSz += sz;
      }
      if (sumSz <= 1e-18) return null;
      const avg = sumPxSz / sumSz;
      return {
        avgPx: formatPrice(String(avg), szDecimals, "perp"),
        totalSz: formatSize(String(sumSz), szDecimals),
      };
    } catch {
      return null;
    }
  }

  /** After a market-style limit, wait for fill + fills row (placement may return `resting` briefly). */
  private async pollUntilMarketFilled(
    info: InfoClient,
    master: `0x${string}`,
    oid: number,
    szDecimals: number,
    timeoutMs: number,
  ): Promise<{ avgPx: string; totalSz: string }> {
    const deadline = Date.now() + timeoutMs;
    let lastProc: string | undefined;
    while (Date.now() < deadline) {
      const st = await info.orderStatus({ user: master, oid });
      if (typeof st !== "object" || st === null) {
        await new Promise((r) => setTimeout(r, 150));
        continue;
      }
      const s = st as { status?: string };
      if (s.status === "unknownOid") {
        await new Promise((r) => setTimeout(r, 150));
        continue;
      }
      if (s.status !== "order") {
        await new Promise((r) => setTimeout(r, 150));
        continue;
      }
      const wrap = (st as { order?: { status?: string } }).order;
      const proc = wrap?.status;
      lastProc = typeof proc === "string" ? proc : undefined;
      if (proc === "filled") {
        for (let i = 0; i < 25; i++) {
          const ag = await this.vwapFromUserFills(info, master, oid, szDecimals);
          if (ag) return ag;
          await new Promise((r) => setTimeout(r, 120));
        }
        throw new ExchangeApiError(`Order ${oid} marked filled but fills not visible yet`, 500, "/info", "HYPERLIQUID");
      }
      if (proc && proc !== "open" && proc !== "triggered") {
        throw new ExchangeApiError(`Order ${oid}: ${proc}`, 400, "/info", "HYPERLIQUID");
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new ExchangeApiError(`Order ${oid} not filled (${lastProc ?? "timeout"})`, 408, "/info", "HYPERLIQUID");
  }

  /**
   * HL unified / portfolio-margin accounts report balances via spotClearinghouseState,
   * not perp clearinghouseState (per HL docs). Classic perp accounts use clearinghouseState.
   */
  private async isUnifiedStyleAccount(info: InfoClient, master: `0x${string}`): Promise<boolean> {
    try {
      const mode = await info.userAbstraction({ user: master });
      return mode === "unifiedAccount" || mode === "portfolioMargin";
    } catch {
      return false;
    }
  }

  private async spotUsdcBalances(
    info: InfoClient,
    master: `0x${string}`,
  ): Promise<{ total: number; available: number }> {
    try {
      const spot = await info.spotClearinghouseState({ user: master });
      let total = 0;
      let hold = 0;
      for (const row of spot.balances ?? []) {
        if (String(row.coin ?? "").toUpperCase() !== "USDC") continue;
        const t = parseFloat(String(row.total ?? "0"));
        const h = parseFloat(String(row.hold ?? "0"));
        if (Number.isFinite(t)) total += t;
        if (Number.isFinite(h)) hold += h;
      }
      return { total, available: Math.max(0, total - hold) };
    } catch {
      return { total: 0, available: 0 };
    }
  }

  private async resolveUsdcBalance(creds: ExchangeCredentials): Promise<{ total: number; available: number }> {
    const { info, master } = clients(creds);
    const spot = await this.spotUsdcBalances(info, master);
    const unified = await this.isUnifiedStyleAccount(info, master);

    if (unified) {
      return spot;
    }

    try {
      const st = await info.clearinghouseState({ user: master });
      const perpTotal = parseFloat(String(st.marginSummary?.accountValue ?? "0"));
      const perpAvail = parseFloat(String(st.withdrawable ?? "0"));
      if (perpTotal > 0 || spot.total <= 0) {
        return { total: perpTotal, available: perpAvail };
      }
      return spot;
    } catch (e) {
      if (spot.total > 0) return spot;
      throw hlError(e, "/info");
    }
  }

  async getBalance(creds: ExchangeCredentials): Promise<FuturesBalance[]> {
    try {
      const { total, available } = await this.resolveUsdcBalance(creds);
      return [
        {
          asset: "USDC",
          balance: String(total),
          availableBalance: String(available),
          crossUnPnl: "0",
        },
      ];
    } catch (e) {
      throw e instanceof ExchangeApiError ? e : hlError(e, "/info");
    }
  }

  async getUsdtBalance(creds: ExchangeCredentials): Promise<{ total: number; available: number }> {
    return this.resolveUsdcBalance(creds);
  }

  /** Actionable copy when resolved USDC balance is zero (live logs / deploy). */
  async describeZeroPerpBalance(creds: ExchangeCredentials): Promise<string> {
    const master = normalizeMasterAddress(creds.apiKey);
    const short = `${master.slice(0, 6)}…${master.slice(-4)}`;
    const { info } = clients(creds);
    const unified = await this.isUnifiedStyleAccount(info, master);
    if (unified) {
      return (
        `No USDC balance detected for Hyperliquid wallet ${short} (unified account mode). ` +
        `Deposit USDC on app.hyperliquid.xyz — you do not need Spot → Perps transfer in unified mode. Bybit balance is separate.`
      );
    }
    const spot = await this.spotUsdcBalances(info, master);
    if (spot.total > 0) {
      return (
        `No USDC in Hyperliquid perps for wallet ${short}, but ~$${spot.total.toFixed(2)} USDC is in HL spot. ` +
        `Transfer Spot → Perps on app.hyperliquid.xyz, or enable unified account in HL settings.`
      );
    }
    return (
      `No USDC in Hyperliquid for wallet ${short} (production). ` +
      `Deposit USDC on app.hyperliquid.xyz. Bybit or other exchanges do not fund this account.`
    );
  }

  /** Stable id for dedupe — main wallet address. */
  async getAccountUid(creds: ExchangeCredentials): Promise<string | null> {
    try {
      return normalizeMasterAddress(creds.apiKey);
    } catch {
      return null;
    }
  }

  async getPositions(creds: ExchangeCredentials): Promise<FuturesPosition[]> {
    const { info, master } = clients(creds);
    const st = await info.clearinghouseState({ user: master });
    const out: FuturesPosition[] = [];
    for (const row of st.assetPositions ?? []) {
      const raw = row as { position?: Record<string, unknown> };
      const p = raw.position ?? (row as Record<string, unknown>);
      const coin = String(p.coin ?? "");
      if (!coin) continue;
      const szi = parseFloat(String(p.szi ?? "0"));
      if (Math.abs(szi) < 1e-12) continue;
      const internal = internalFromCoin(coin);
      const levRaw = p.leverage as { value?: number } | number | undefined;
      const lev =
        typeof levRaw === "object" && levRaw !== null && "value" in levRaw
          ? Number((levRaw as { value: number }).value)
          : Number(levRaw ?? 1);
      const posVal = parseFloat(String(p.positionValue ?? "0"));
      const markPx = Math.abs(szi) > 1e-12 && posVal ? String(Math.abs(posVal / szi)) : String(p.entryPx ?? "0");
      out.push({
        symbol: internal,
        positionAmt: String(szi),
        entryPrice: String(p.entryPx ?? "0"),
        markPrice: markPx,
        unRealizedProfit: String(p.unrealizedPnl ?? "0"),
        liquidationPrice: String(p.liquidationPx ?? "0"),
        leverage: String(Number.isFinite(lev) ? lev : 1),
        marginType: "isolated",
        isolatedMargin: String(p.marginUsed ?? "0"),
        positionSide: "BOTH",
      });
    }
    return out;
  }

  async getPosition(symbol: string, creds: ExchangeCredentials): Promise<FuturesPosition | null> {
    const rows = await this.getPositions(creds);
    const internal = this.normalizeSymbol(symbol);
    return rows.find((r) => r.symbol === internal) ?? null;
  }

  async setMarginType(symbol: string, marginType: "ISOLATED" | "CROSSED", creds: ExchangeCredentials): Promise<void> {
    const { exchange } = clients(creds);
    const { assetId, maxLev } = await this.assetRow(symbol, creds.testnet);
    try {
      await exchange.updateLeverage({
        asset: assetId,
        isCross: marginType === "CROSSED",
        leverage: 1,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("leverage") || msg.toLowerCase().includes("cross")) return;
    }
    void maxLev;
  }

  async setLeverage(symbol: string, leverage: number, creds: ExchangeCredentials): Promise<void> {
    const { exchange } = clients(creds);
    const { assetId, maxLev } = await this.assetRow(symbol, creds.testnet);
    const lev = Math.max(1, Math.min(Math.floor(leverage), maxLev, 125));
    try {
      await exchange.updateLeverage({
        asset: assetId,
        isCross: false,
        leverage: lev,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("leverage")) return;
      throw hlError(e, "/exchange");
    }
  }

  private async iocMarketPrice(
    coin: string,
    side: "BUY" | "SELL",
    szDecimals: number,
    creds: ExchangeCredentials,
  ): Promise<string> {
    const { info } = clients(creds);
    const mids = await info.allMids();
    const mid = parseFloat(String(mids[coin] ?? "0"));
    if (!mid) throw new ExchangeApiError(`No mid price for ${coin}`, 404, "/info", "HYPERLIQUID");
    const raw = side === "BUY" ? mid * 1.08 : mid * 0.92;
    return formatPrice(String(raw), szDecimals, "perp");
  }

  async placeMarketOrder(symbol: string, side: "BUY" | "SELL", quantity: number, creds: ExchangeCredentials): Promise<Order> {
    const { exchange } = clients(creds);
    const { assetId, coin, internal, szDecimals } = await this.assetRow(symbol, creds.testnet);
    const px = await this.iocMarketPrice(coin, side, szDecimals, creds);
    const sz = formatSize(String(quantity), szDecimals);
    try {
      const resp = await exchange.order({
        orders: [
          {
            a: assetId,
            b: side === "BUY",
            p: px,
            s: sz,
            r: false,
            t: { limit: { tif: "FrontendMarket" } },
          },
        ],
        grouping: "na",
      });
      let ord = mapPlaceStatuses(resp, internal, side, "MARKET");
      if (ord.status === "NEW" && parseFloat(ord.executedQty) <= 0 && ord.orderId) {
        const oid = Number(ord.orderId);
        if (Number.isFinite(oid)) {
          const { info, master } = clients(creds);
          const fill = await this.pollUntilMarketFilled(info, master, oid, szDecimals, 12_000);
          ord = {
            ...ord,
            status: "FILLED",
            price: fill.avgPx,
            avgPrice: fill.avgPx,
            origQty: fill.totalSz,
            executedQty: fill.totalSz,
          };
        }
      }
      return ord;
    } catch (e) {
      throw hlError(e, "/exchange");
    }
  }

  async placeStopMarket(
    symbol: string,
    side: "BUY" | "SELL",
    stopPrice: number,
    quantity: number,
    creds: ExchangeCredentials,
    tickSize: number,
  ): Promise<Order> {
    const { exchange } = clients(creds);
    const { assetId, internal, szDecimals } = await this.assetRow(symbol, creds.testnet);
    const trig = roundToTick(stopPrice, tickSize);
    const px = formatPrice(String(trig), szDecimals, "perp");
    const sz = formatSize(String(quantity), szDecimals);
    try {
      const resp = await exchange.order({
        orders: [
          {
            a: assetId,
            b: side === "BUY",
            p: px,
            s: sz,
            r: false,
            t: { trigger: { isMarket: true, triggerPx: px, tpsl: "sl" } },
          },
        ],
        grouping: "na",
      });
      const o = mapPlaceStatuses(resp, internal, side, "STOP_MARKET");
      return { ...o, stopPrice: String(trig), status: "NEW" };
    } catch (e) {
      throw hlError(e, "/exchange");
    }
  }

  async placeTakeProfitMarket(
    symbol: string,
    side: "BUY" | "SELL",
    stopPrice: number,
    quantity: number,
    creds: ExchangeCredentials,
    tickSize: number,
  ): Promise<Order> {
    const { exchange } = clients(creds);
    const { assetId, internal, szDecimals } = await this.assetRow(symbol, creds.testnet);
    const trig = roundToTick(stopPrice, tickSize);
    const px = formatPrice(String(trig), szDecimals, "perp");
    const sz = formatSize(String(quantity), szDecimals);
    try {
      const resp = await exchange.order({
        orders: [
          {
            a: assetId,
            b: side === "BUY",
            p: px,
            s: sz,
            r: false,
            t: { trigger: { isMarket: true, triggerPx: px, tpsl: "tp" } },
          },
        ],
        grouping: "na",
      });
      const o = mapPlaceStatuses(resp, internal, side, "TAKE_PROFIT_MARKET");
      return { ...o, stopPrice: String(trig), status: "NEW" };
    } catch (e) {
      throw hlError(e, "/exchange");
    }
  }

  async placeMarketClose(symbol: string, side: "BUY" | "SELL", quantity: number, creds: ExchangeCredentials): Promise<Order> {
    const { exchange } = clients(creds);
    const { assetId, coin, internal, szDecimals } = await this.assetRow(symbol, creds.testnet);
    const px = await this.iocMarketPrice(coin, side, szDecimals, creds);
    const sz = formatSize(String(quantity), szDecimals);
    try {
      const resp = await exchange.order({
        orders: [
          {
            a: assetId,
            b: side === "BUY",
            p: px,
            s: sz,
            r: true,
            t: { limit: { tif: "FrontendMarket" } },
          },
        ],
        grouping: "na",
      });
      let ord = mapPlaceStatuses(resp, internal, side, "MARKET");
      if (ord.status === "NEW" && parseFloat(ord.executedQty) <= 0 && ord.orderId) {
        const oid = Number(ord.orderId);
        if (Number.isFinite(oid)) {
          const { info, master } = clients(creds);
          const fill = await this.pollUntilMarketFilled(info, master, oid, szDecimals, 12_000);
          ord = {
            ...ord,
            status: "FILLED",
            price: fill.avgPx,
            avgPrice: fill.avgPx,
            origQty: fill.totalSz,
            executedQty: fill.totalSz,
          };
        }
      }
      return ord;
    } catch (e) {
      throw hlError(e, "/exchange");
    }
  }

  async cancelOrder(symbol: string, orderId: string, creds: ExchangeCredentials): Promise<Order> {
    const { exchange } = clients(creds);
    const { assetId, internal } = await this.assetRow(symbol, creds.testnet);
    const oid = Number(orderId);
    if (!Number.isFinite(oid)) {
      throw new ExchangeApiError("Invalid order id", 400, "/exchange", "HYPERLIQUID");
    }
    try {
      await exchange.cancel({ cancels: [{ a: assetId, o: oid }] });
    } catch (e) {
      throw hlError(e, "/exchange");
    }
    return {
      orderId,
      symbol: internal,
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
    const { info, master, exchange } = clients(creds);
    const { assetId, coin } = await this.assetRow(symbol, creds.testnet);
    const rows = await info.openOrders({ user: master });
    const cancels: { a: number; o: number }[] = [];
    for (const o of rows as { coin?: string; oid?: number }[]) {
      if (String(o.coin ?? "").toUpperCase() === coin.toUpperCase() && typeof o.oid === "number") {
        cancels.push({ a: assetId, o: o.oid });
      }
    }
    if (cancels.length === 0) return;
    try {
      await exchange.cancel({ cancels });
    } catch {
      /* best effort */
    }
  }

  private mapFrontendOrder(o: Record<string, unknown>, internal: string): Order {
    const oid = o.oid as number | undefined;
    const side = String(o.side ?? "B") === "A" ? "SELL" : "BUY";
    const sz = String(o.sz ?? "0");
    const limitPx = String(o.limitPx ?? "0");
    const orderType = String(o.orderType ?? "");
    const isTrigger = orderType.toLowerCase().includes("trigger") || parseFloat(String(o.triggerPx ?? 0)) > 0;
    return {
      orderId: String(oid ?? ""),
      symbol: internal,
      status: "NEW",
      clientOrderId: "",
      price: limitPx,
      avgPrice: "0",
      origQty: sz,
      executedQty: "0",
      cumQuote: "0",
      type: isTrigger ? "STOP_MARKET" : "LIMIT",
      side,
      stopPrice: String(o.triggerPx ?? "0"),
      time: Date.now(),
      updateTime: Date.now(),
    };
  }

  async getOrder(symbol: string, orderId: string, creds: ExchangeCredentials): Promise<Order> {
    const { info, master } = clients(creds);
    const internal = this.normalizeSymbol(symbol);
    const oid = Number(orderId);
    if (!Number.isFinite(oid)) {
      throw new ExchangeApiError(`Order ${orderId} not found`, 404, "/info", "HYPERLIQUID");
    }
    try {
      const st = await info.orderStatus({ user: master, oid });
      const parsed = extractOrderStatus(st);
      if (parsed) {
        const { szDecimals } = await this.assetRow(symbol, creds.testnet);
        const filled = parsed.processingStatus === "filled";
        let avgPx = parsed.avgPx;
        let totalSz = parsed.totalSz ?? "0";
        if (filled) {
          const fromFills = await this.vwapFromUserFills(info, master, oid, szDecimals);
          if (fromFills) {
            avgPx = fromFills.avgPx;
            totalSz = fromFills.totalSz;
          }
        }
        return {
          orderId: String(parsed.oid),
          symbol: internal,
          status: filled ? "FILLED" : "NEW",
          clientOrderId: "",
          price: avgPx ?? "0",
          avgPrice: avgPx ?? "0",
          origQty: totalSz,
          executedQty: filled ? totalSz : "0",
          cumQuote: "0",
          type: "",
          side: "",
          stopPrice: "0",
          time: Date.now(),
          updateTime: Date.now(),
        };
      }
    } catch {
      /* fall through */
    }

    const open = await info.openOrders({ user: master });
    for (const row of open as Record<string, unknown>[]) {
      if (Number(row.oid) === oid) return this.mapFrontendOrder(row, internal);
    }

    throw new ExchangeApiError(`Order ${orderId} not found`, 404, "/info", "HYPERLIQUID");
  }

  async getOpenOrders(symbol: string, creds: ExchangeCredentials): Promise<Order[]> {
    const { info, master } = clients(creds);
    const internal = this.normalizeSymbol(symbol);
    const coin = coinFromInternal(internal);
    const rows = await info.openOrders({ user: master });
    return (rows as Record<string, unknown>[])
      .filter((o) => String(o.coin ?? "").toUpperCase() === coin.toUpperCase())
      .map((o) => this.mapFrontendOrder(o, internal));
  }

  async getAllOrders(symbol: string, creds: ExchangeCredentials, limit = 50): Promise<Order[]> {
    const { info, master } = clients(creds);
    const internal = this.normalizeSymbol(symbol);
    const coin = coinFromInternal(internal);
    const hist = await info.historicalOrders({ user: master });
    const out: Order[] = [];
    for (const o of hist as Record<string, unknown>[]) {
      if (String(o.coin ?? "").toUpperCase() !== coin.toUpperCase()) continue;
      const oid = o.oid as number | undefined;
      const side = String(o.side ?? "B") === "A" ? "SELL" : "BUY";
      const status = String(o.status ?? "open").toUpperCase();
      const mapped =
        status.includes("FILL") || status === "FILLED"
          ? "FILLED"
          : status.includes("CANCEL")
            ? "CANCELED"
            : "NEW";
      out.push({
        orderId: String(oid ?? ""),
        symbol: internal,
        status: mapped,
        clientOrderId: "",
        price: String(o.limitPx ?? o.px ?? "0"),
        avgPrice: String(o.avgPx ?? "0"),
        origQty: String(o.sz ?? "0"),
        executedQty: String(o.totalSz ?? o.sz ?? "0"),
        cumQuote: "0",
        type: String(o.orderType ?? ""),
        side,
        stopPrice: String(o.triggerPx ?? "0"),
        time: Number(o.timestamp ?? Date.now()),
        updateTime: Date.now(),
      });
      if (out.length >= limit) break;
    }
    return out;
  }
}
