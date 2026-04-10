/**
 * Liquidity WebSocket Server
 *
 * Persistent Node.js process. Run alongside Next.js:
 *   npm run liquidity:ws
 *
 * Responsibilities:
 *   1. Connects to Bybit public liquidation WS (wss://stream.bybit.com/v5/public/linear)
 *   2. Subscribes to `liquidation.{SYMBOL}` for each active crypto signal
 *   3. Every 5s  → detectSweep() per symbol → POST /api/internal/liquidity-cache (sweep)
 *   4. Every 30s → fetchOIContext() per symbol → POST /api/internal/liquidity-cache (oi)
 *   5. Every 60s → fetchOrderBookContext() per symbol → POST /api/internal/liquidity-cache (ob)
 *   6. Every 60s → GET /api/internal/active-signals → adjust WS subscriptions
 *   7. Ping/pong every 20s to keep WS alive
 *   8. Exponential backoff reconnect on disconnect/error
 *
 * Data flow: Cloud Run WS server → Next.js app proxy API → Firestore
 * (Direct Cloud Run → Firestore fails: GCP restricted VIP routing requires
 *  Private Google Access which the Cloud Run default network lacks.)
 *
 * Adding a new exchange:
 *   - Implement the LiquiditySourceAdapter interface below
 *   - Register it in LiquidityWSServer.adapters
 *   - The event buffer and sweep detection are exchange-agnostic
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import WebSocket from "ws";

// Use relative paths from scripts/ → src/
import { detectSweep } from "../src/lib/liquidity/sweep-detector";
import { fetchOIContext, evictOICache } from "../src/lib/liquidity/oi-context";
import {
  fetchOrderBookContext,
  evictOBCache,
} from "../src/lib/liquidity/orderbook-context";
import type {
  LiqEvent,
  LiqSource,
  SweepDetection,
  SweepResult,
} from "../src/lib/liquidity/types";

// ── Next.js app proxy config ──────────────────────────────────
//
// Cloud Run cannot reach firestore.googleapis.com directly (restricted VIP
// routing requires Private Google Access). Instead, the WS server calls the
// Next.js app (Firebase App Hosting) which has full Firestore access.

const NEXT_APP_URL = (process.env.NEXT_APP_URL ?? "").replace(/\/$/, "");
const LIQUIDITY_WS_SECRET = process.env.LIQUIDITY_WS_SECRET ?? "";

// ── Concurrency limiter ───────────────────────────────────────
// Prevents flooding the Next.js proxy with too many simultaneous requests.
// With 100+ symbols, naive fire-and-forget creates hundreds of concurrent
// connections per minute, exhausting the proxy's connection pool.
const PROXY_MAX_CONCURRENCY = 6;
let proxyConcurrent = 0;
const proxyQueue: Array<() => void> = [];

function proxyAcquire(): Promise<void> {
  if (proxyConcurrent < PROXY_MAX_CONCURRENCY) {
    proxyConcurrent++;
    return Promise.resolve();
  }
  return new Promise((resolve) => proxyQueue.push(resolve));
}

function proxyRelease(): void {
  const next = proxyQueue.shift();
  if (next) {
    next();
  } else {
    proxyConcurrent--;
  }
}

async function callNextApp<T = unknown>(
  method: "GET" | "POST",
  path: string,
  body?: object,
  timeoutMs = 30_000,
  maxRetries = 2,
): Promise<T> {
  if (!NEXT_APP_URL) throw new Error("NEXT_APP_URL env var is not set");
  if (!LIQUIDITY_WS_SECRET) throw new Error("LIQUIDITY_WS_SECRET env var is not set");

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 2_000 * attempt));
    }

    await proxyAcquire();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${NEXT_APP_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${LIQUIDITY_WS_SECRET}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);
      proxyRelease();
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(timer);
      proxyRelease();
      lastErr = err;
      if (attempt < maxRetries) {
        console.warn(`[LiqWS] proxy ${method} ${path} attempt ${attempt + 1} failed, retrying...`);
      }
    }
  }
  throw lastErr;
}

async function testConnectivity(): Promise<void> {
  console.log(`[LiqWS] Testing connectivity to Next.js proxy at ${NEXT_APP_URL}...`);
  if (!NEXT_APP_URL || !LIQUIDITY_WS_SECRET) {
    console.error("[LiqWS] NEXT_APP_URL or LIQUIDITY_WS_SECRET not set — proxy calls will fail");
    return;
  }
  try {
    const result = await callNextApp<{ symbols: string[] }>(
      "GET",
      "/api/internal/active-signals",
    );
    console.log(
      `[LiqWS] Next.js proxy OK. Active symbols: ${result.symbols.join(", ") || "(none)"}`,
    );
  } catch (err) {
    console.error("[LiqWS] Next.js proxy UNREACHABLE:", err);
  }
}

// ── Constants ─────────────────────────────────────────────────

const BYBIT_WS_URL = "wss://stream.bybit.com/v5/public/linear";
const SWEEP_INTERVAL_MS = 5_000;
const OI_INTERVAL_MS = 120_000;  // 2 min — 120 symbols × ~500ms each ≈ 60s per cycle
const OB_INTERVAL_MS = 180_000;  // 3 min — gives OI cycle time to finish first
const SYMBOL_REFRESH_MS = 60_000;
const PING_INTERVAL_MS = 20_000;
const EVENT_BUFFER_TTL_MS = 35_000;
const MAX_RECONNECT_DELAY_MS = 60_000;
const MAX_SYMBOLS_PER_CONNECTION = 10; // Bybit limit: max 10 args per subscribe message
const SWEEP_MIN_SIGMA = parseFloat(process.env.LIQUIDITY_SWEEP_MIN_SIGMA ?? "2.5");
const SWEEP_MIN_USD = parseFloat(process.env.LIQUIDITY_SWEEP_MIN_USD ?? "50000");

// ── Per-symbol in-memory state ────────────────────────────────

interface SymbolState {
  events: LiqEvent[];
  // Persistence fields for SweepDetection (survive across 5s cycles)
  lastSweepAt: string | null;
  lastSweepSide: SweepDetection["lastSweepSide"];
  lastSweepStrength: number;
  weightedSweepPrice: number | null;
  // Timestamps of last REST fetches (used to respect in-memory TTLs)
  oiLastFetchAt: number;
  obLastFetchAt: number;
  // Most recent mark price (used for order book context)
  lastPrice: number;
}

function emptyState(): SymbolState {
  return {
    events: [],
    lastSweepAt: null,
    lastSweepSide: null,
    lastSweepStrength: 0,
    weightedSweepPrice: null,
    oiLastFetchAt: 0,
    obLastFetchAt: 0,
    lastPrice: 0,
  };
}

// ── Build SweepDetection for Firestore from result + state ────

function buildSweepDetection(
  result: SweepResult,
  state: SymbolState,
): SweepDetection {
  const now = new Date().toISOString();
  // Update persistence fields if a new spike was just detected
  if (result.detected && result.side !== null) {
    state.lastSweepAt = now;
    state.lastSweepSide = result.side;
    state.lastSweepStrength = result.strength;
    state.weightedSweepPrice = result.weightedSweepPrice;
  }

  return {
    ...result,
    lastSweepAt: state.lastSweepAt,
    lastSweepSide: state.lastSweepSide,
    lastSweepStrength: state.lastSweepStrength,
    weightedSweepPrice: state.weightedSweepPrice,
    updatedAt: now,
  };
}

// ── Main server class ─────────────────────────────────────────

class LiquidityWSServer {
  private ws: WebSocket | null = null;
  private symbolStates = new Map<string, SymbolState>();
  private subscribedSymbols = new Set<string>();
  private reconnectDelay = 2_000;
  private isShuttingDown = false;

  // Timer handles
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private oiTimer: ReturnType<typeof setInterval> | null = null;
  private obTimer: ReturnType<typeof setInterval> | null = null;
  private symbolRefreshTimer: ReturnType<typeof setInterval> | null = null;

  async start(): Promise<void> {
    console.log("[LiqWS] Starting liquidity WebSocket server...");

    // Load initial symbol list before opening WS
    await this.refreshSymbols();

    this.connect();
    this.startTimers();

    // Graceful shutdown
    process.on("SIGINT", () => this.shutdown("SIGINT"));
    process.on("SIGTERM", () => this.shutdown("SIGTERM"));
  }

  // ── WebSocket connection ──────────────────────────────────

  private connect(): void {
    if (this.isShuttingDown) return;
    console.log(`[LiqWS] Connecting to ${BYBIT_WS_URL}...`);

    this.ws = new WebSocket(BYBIT_WS_URL);

    this.ws.on("open", () => {
      console.log("[LiqWS] Connected. Subscribing to symbols...");
      this.reconnectDelay = 2_000; // reset backoff
      this.subscribeAll();
    });

    this.ws.on("message", (raw: WebSocket.RawData) => {
      try {
        this.handleMessage(raw.toString());
      } catch (err) {
        console.error("[LiqWS] Message handler error:", err);
      }
    });

    this.ws.on("close", (code, reason) => {
      console.warn(
        `[LiqWS] Disconnected (code=${code} reason=${reason}). Reconnecting in ${this.reconnectDelay}ms...`,
      );
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      console.error("[LiqWS] WebSocket error:", err.message);
      // 'close' fires after 'error' on most platforms; scheduleReconnect handles it
    });
  }

  private scheduleReconnect(): void {
    if (this.isShuttingDown) return;
    setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
  }

  // ── Message handling ──────────────────────────────────────

  private handleMessage(raw: string): void {
    const msg = JSON.parse(raw) as Record<string, unknown>;

    // Pong / op responses
    if (msg.op === "pong" || msg.ret_msg === "pong") return;
    if (msg.op === "subscribe") {
      const success = msg.success === true;
      const retMsg = String(msg.ret_msg ?? "");
      if (!success) {
        console.error(`[LiqWS] Subscribe FAILED: ${retMsg} conn_id=${msg.conn_id ?? ""}`);
      } else {
        console.log(`[LiqWS] Subscribe ack: success=true conn_id=${msg.conn_id ?? ""}`);
      }
      return;
    }

    // Liquidation event
    const topic = String(msg.topic ?? "");
    if (!topic.startsWith("liquidation.")) return;

    const data = msg.data as {
      symbol: string;
      side: "Buy" | "Sell";
      size: string;
      price: string;
      updatedTime?: number;
    } | null;

    if (!data) return;

    // Bybit sends symbol as "BTCUSDT"; our internal format is "BTCUSDT.P"
    const rawSymbol = data.symbol;
    const symbol = rawSymbol.endsWith(".P") ? rawSymbol : `${rawSymbol}.P`;
    const price = parseFloat(data.price);
    const qty = parseFloat(data.size);
    if (!symbol || isNaN(price) || isNaN(qty) || qty <= 0) return;

    // USD notional = qty × price (Bybit Futures quantities are in contracts)
    const sizeUSD = qty * price;
    const ts = data.updatedTime ?? Date.now();

    const event: LiqEvent = {
      symbol,
      side: data.side,
      size: sizeUSD,
      price,
      timestamp: ts,
      source: "BYBIT",
    };

    // Append to per-symbol buffer
    let state = this.symbolStates.get(symbol);
    if (!state) {
      state = emptyState();
      this.symbolStates.set(symbol, state);
    }
    state.events.push(event);
    if (price > 0) state.lastPrice = price;
  }

  // ── Subscription management ───────────────────────────────

  private subscribeAll(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const symbols = [...this.subscribedSymbols];
    if (symbols.length === 0) return;

    // Bybit WS topic format: "liquidation.BTCUSDT" (no .P suffix).
    // Our internal symbol format adds .P (e.g. "BTCUSDT.P"), strip it here.
    // Max 10 args per message; stagger batches 200ms apart to avoid rate limits.
    for (let i = 0; i < symbols.length; i += MAX_SYMBOLS_PER_CONNECTION) {
      const chunk = symbols.slice(i, i + MAX_SYMBOLS_PER_CONNECTION);
      const args = chunk.map((s) => `liquidation.${s.replace(/\.P$/, "")}`);
      if (i === 0) {
        this.wsSend({ op: "subscribe", args });
      } else {
        setTimeout(() => this.wsSend({ op: "subscribe", args }), (i / MAX_SYMBOLS_PER_CONNECTION) * 200);
      }
    }
  }

  private subscribeSymbols(symbols: string[]): void {
    if (
      !this.ws ||
      this.ws.readyState !== WebSocket.OPEN ||
      symbols.length === 0
    )
      return;
    const args = symbols.map((s) => `liquidation.${s.replace(/\.P$/, "")}`);
    this.wsSend({ op: "subscribe", args });
    console.log(`[LiqWS] Subscribed: ${symbols.join(", ")}`);
  }

  private unsubscribeSymbols(symbols: string[]): void {
    if (
      !this.ws ||
      this.ws.readyState !== WebSocket.OPEN ||
      symbols.length === 0
    )
      return;
    const args = symbols.map((s) => `liquidation.${s.replace(/\.P$/, "")}`);
    this.wsSend({ op: "unsubscribe", args });
    console.log(`[LiqWS] Unsubscribed: ${symbols.join(", ")}`);
  }

  private wsSend(payload: object): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(payload));
  }

  // ── Timer cycles ──────────────────────────────────────────

  private startTimers(): void {
    // Heartbeat
    this.pingTimer = setInterval(() => {
      this.wsSend({ op: "ping" });
    }, PING_INTERVAL_MS);

    // Sweep detection — every 5s
    this.sweepTimer = setInterval(() => this.runSweepCycle(), SWEEP_INTERVAL_MS);

    // OI + funding rate — every 30s
    this.oiTimer = setInterval(() => this.runOICycle(), OI_INTERVAL_MS);

    // Order book — every 60s
    this.obTimer = setInterval(() => this.runOBCycle(), OB_INTERVAL_MS);

    // Symbol refresh — every 60s
    this.symbolRefreshTimer = setInterval(
      () => this.refreshSymbols(),
      SYMBOL_REFRESH_MS,
    );
  }

  private runSweepCycle(): void {
    const now = Date.now();
    for (const [symbol, state] of this.symbolStates) {
      // Prune stale events (older than 35s)
      state.events = state.events.filter(
        (e) => now - e.timestamp <= EVENT_BUFFER_TTL_MS,
      );

      const result = detectSweep(state.events, SWEEP_MIN_SIGMA, SWEEP_MIN_USD, now);
      const detection = buildSweepDetection(result, state);

      // Only write to the proxy when a sweep is detected.
      // Writing on every 5s tick for all 114 symbols (~23 req/s) saturates
      // the Next.js proxy even when there is nothing to report.
      if (result.detected) {
        callNextApp("POST", "/api/internal/liquidity-cache", {
          symbol,
          type: "sweep",
          data: detection,
        }).catch((err) =>
          console.error(`[LiqWS][sweep] Write failed for ${symbol}:`, err),
        );

        console.log(
          `[LiqWS] SWEEP ${symbol} ${result.side} ${result.strength.toFixed(1)}σ ` +
            `sell5s=$${Math.round(result.sellVol5s / 1000)}k ` +
            `buy5s=$${Math.round(result.buyVol5s / 1000)}k`,
        );
      }
    }
  }

  private async runOICycle(): Promise<void> {
    const symbols = [...this.subscribedSymbols];
    // Fetch all OI data concurrently (Bybit REST, no rate limit concerns at this scale)
    const results = await Promise.allSettled(
      symbols.map((symbol) => fetchOIContext(symbol).then((oi) => ({ symbol, oi }))),
    );

    const updates = results
      .filter(
        (r): r is PromiseFulfilledResult<{ symbol: string; oi: NonNullable<unknown> }> =>
          r.status === "fulfilled" && r.value.oi !== null,
      )
      .map(({ value: { symbol, oi } }) => ({ symbol, type: "oi" as const, data: oi }));

    if (updates.length === 0) return;

    try {
      await callNextApp("POST", "/api/internal/liquidity-cache/batch", { updates });
      console.log(`[LiqWS][oi] Batch wrote ${updates.length} symbols`);
    } catch (err) {
      console.error("[LiqWS][oi] Batch write failed:", err);
    }
  }

  private async runOBCycle(): Promise<void> {
    const symbols = [...this.subscribedSymbols];
    // Fetch all OB data concurrently
    const results = await Promise.allSettled(
      symbols.map(async (symbol) => {
        const state = this.symbolStates.get(symbol);
        const price = state?.lastPrice ?? 0;
        if (price <= 0) return { symbol, ob: null };
        const ob = await fetchOrderBookContext(symbol, price);
        return { symbol, ob };
      }),
    );

    const updates = results
      .filter(
        (r): r is PromiseFulfilledResult<{ symbol: string; ob: NonNullable<unknown> }> =>
          r.status === "fulfilled" && r.value.ob !== null,
      )
      .map(({ value: { symbol, ob } }) => ({ symbol, type: "ob" as const, data: ob }));

    if (updates.length === 0) return;

    try {
      await callNextApp("POST", "/api/internal/liquidity-cache/batch", { updates });
      console.log(`[LiqWS][ob] Batch wrote ${updates.length} symbols`);
    } catch (err) {
      console.error("[LiqWS][ob] Batch write failed:", err);
    }
  }

  // ── Symbol discovery via Next.js proxy ───────────────────

  private async refreshSymbols(): Promise<void> {
    console.log("[LiqWS] refreshSymbols: calling Next.js proxy...");
    try {
      const result = await callNextApp<{ symbols: string[] }>(
        "GET",
        "/api/internal/active-signals",
        undefined,
        60_000, // 60s — allows for Next.js cold-start + Firestore query
        2,      // retry up to 2 times
      );
      const freshSymbols = new Set(result.symbols);
      console.log(`[LiqWS] refreshSymbols: got ${freshSymbols.size} active symbols`);

      const toAdd = [...freshSymbols].filter((s) => !this.subscribedSymbols.has(s));
      const toRemove = [...this.subscribedSymbols].filter((s) => !freshSymbols.has(s));

      for (const s of toAdd) {
        this.subscribedSymbols.add(s);
        if (!this.symbolStates.has(s)) this.symbolStates.set(s, emptyState());
      }
      for (const s of toRemove) {
        this.subscribedSymbols.delete(s);
        this.symbolStates.delete(s);
        evictOICache(s);
        evictOBCache(s);
      }

      this.subscribeSymbols(toAdd);
      this.unsubscribeSymbols(toRemove);

      if (toAdd.length > 0 || toRemove.length > 0) {
        console.log(
          `[LiqWS] Symbols: +${toAdd.length} -${toRemove.length} total=${this.subscribedSymbols.size}`,
        );
      }
    } catch (err) {
      console.error("[LiqWS] Symbol refresh failed:", err);
    }
  }

  // ── Graceful shutdown ─────────────────────────────────────

  private shutdown(signal: string): void {
    console.log(`[LiqWS] ${signal} received — shutting down...`);
    this.isShuttingDown = true;

    // Clear all timers
    [
      this.pingTimer,
      this.sweepTimer,
      this.oiTimer,
      this.obTimer,
      this.symbolRefreshTimer,
    ].forEach((t) => t && clearInterval(t));

    this.ws?.close(1000, "Server shutdown");
    console.log("[LiqWS] Shutdown complete.");
    process.exit(0);
  }
}

// ── Health check HTTP server (required by Cloud Run) ─────────
// Cloud Run expects the container to listen on PORT even for
// non-HTTP workloads. This tiny server satisfies that requirement
// and provides a /health endpoint for uptime monitoring.

import { createServer } from "http";

function startHealthServer(): void {
  const port = parseInt(process.env.PORT ?? "8080", 10);
  const srv = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", ts: Date.now() }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  srv.listen(port, () => {
    console.log(`[LiqWS] Health server listening on port ${port}`);
  });
}

// ── Entry point ───────────────────────────────────────────────

process.on("uncaughtException", (err) => {
  console.error("[LiqWS] UNCAUGHT EXCEPTION:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[LiqWS] UNHANDLED REJECTION:", reason);
  process.exit(1);
});

(async () => {
  try {
    startHealthServer();
    await testConnectivity();
    const server = new LiquidityWSServer();
    await server.start();
  } catch (err) {
    console.error("[LiqWS] FATAL startup error:", err);
    process.exit(1);
  }
})();
