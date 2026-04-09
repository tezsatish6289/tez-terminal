/**
 * Liquidity WebSocket Server
 *
 * Persistent Node.js process. Run alongside Next.js:
 *   npm run liquidity:ws
 *
 * Responsibilities:
 *   1. Connects to Bybit public liquidation WS (wss://stream.bybit.com/v5/public/linear)
 *   2. Subscribes to `liquidation.{SYMBOL}` for each active crypto signal
 *   3. Every 5s  → detectSweep() per symbol → writeSweepUpdate() to Firestore
 *   4. Every 30s → fetchOIContext() per symbol → writeOIUpdate() to Firestore
 *   5. Every 60s → fetchOrderBookContext() per symbol → writeOBUpdate() to Firestore
 *   6. Every 60s → re-reads active signal symbols from Firestore → adjust subscriptions
 *   7. Ping/pong every 20s to keep WS alive
 *   8. Exponential backoff reconnect on disconnect/error
 *
 * Auth:
 *   - Local: set GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   - Cloud Run / Firebase App Hosting: uses ADC automatically
 *
 * Adding a new exchange:
 *   - Implement the LiquiditySourceAdapter interface below
 *   - Register it in LiquidityWSServer.adapters
 *   - The event buffer and sweep detection are exchange-agnostic
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import WebSocket from "ws";

// Use relative paths from scripts/ → src/
import { detectSweep } from "../src/lib/liquidity/sweep-detector";
import { fetchOIContext, evictOICache } from "../src/lib/liquidity/oi-context";
import {
  fetchOrderBookContext,
  evictOBCache,
} from "../src/lib/liquidity/orderbook-context";
import {
  writeSweepUpdate,
  writeOIUpdate,
  writeOBUpdate,
} from "../src/lib/liquidity/firestore-cache";
import type {
  LiqEvent,
  LiqSource,
  SweepDetection,
  SweepResult,
} from "../src/lib/liquidity/types";

// ── Firebase init ─────────────────────────────────────────────

function initFirebase(): Firestore {
  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.FIREBASE_PROJECT_ID;
  console.log(`[LiqWS] Initializing Firebase. projectId=${projectId ?? "auto"}`);
  const app =
    getApps().length === 0 ? initializeApp({ projectId }) : getApps()[0];
  const db = getFirestore(app);
  // Use REST instead of gRPC — avoids DEADLINE_EXCEEDED issues in Cloud Run
  // where gRPC load balancer picks are slow (13s+).
  db.settings({ preferRest: true });
  return db;
}

// ── Constants ─────────────────────────────────────────────────

const BYBIT_WS_URL = "wss://stream.bybit.com/v5/public/linear";
const SWEEP_INTERVAL_MS = 5_000;
const OI_INTERVAL_MS = 30_000;
const OB_INTERVAL_MS = 60_000;
const SYMBOL_REFRESH_MS = 60_000;
const PING_INTERVAL_MS = 20_000;
const EVENT_BUFFER_TTL_MS = 35_000;
const MAX_RECONNECT_DELAY_MS = 60_000;
const MAX_SYMBOLS_PER_CONNECTION = 50; // Bybit limit
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
  private db: Firestore;
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

  constructor(db: Firestore) {
    this.db = db;
  }

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
      console.log(
        `[LiqWS] Subscribe ack: success=${success} conn_id=${msg.conn_id ?? ""}`,
      );
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

    const symbol = data.symbol;
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

    // Bybit allows batching topics in one subscribe message
    // Stay within MAX_SYMBOLS_PER_CONNECTION per message
    for (let i = 0; i < symbols.length; i += MAX_SYMBOLS_PER_CONNECTION) {
      const chunk = symbols.slice(i, i + MAX_SYMBOLS_PER_CONNECTION);
      const args = chunk.map((s) => `liquidation.${s}`);
      this.wsSend({ op: "subscribe", args });
    }
  }

  private subscribeSymbols(symbols: string[]): void {
    if (
      !this.ws ||
      this.ws.readyState !== WebSocket.OPEN ||
      symbols.length === 0
    )
      return;
    const args = symbols.map((s) => `liquidation.${s}`);
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
    const args = symbols.map((s) => `liquidation.${s}`);
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

      writeSweepUpdate(this.db, symbol, detection).catch((err) =>
        console.error(`[LiqWS][sweep] Firestore write failed for ${symbol}:`, err),
      );

      if (result.detected) {
        console.log(
          `[LiqWS] SWEEP ${symbol} ${result.side} ${result.strength.toFixed(1)}σ ` +
            `sell5s=$${Math.round(result.sellVol5s / 1000)}k ` +
            `buy5s=$${Math.round(result.buyVol5s / 1000)}k`,
        );
      }
    }
  }

  private async runOICycle(): Promise<void> {
    for (const symbol of this.subscribedSymbols) {
      try {
        const oi = await fetchOIContext(symbol);
        if (oi) {
          await writeOIUpdate(this.db, symbol, oi);
        }
      } catch (err) {
        console.error(`[LiqWS][oi] Failed for ${symbol}:`, err);
      }
    }
  }

  private async runOBCycle(): Promise<void> {
    for (const symbol of this.subscribedSymbols) {
      const state = this.symbolStates.get(symbol);
      const price = state?.lastPrice ?? 0;
      if (price <= 0) continue;

      try {
        const ob = await fetchOrderBookContext(symbol, price);
        if (ob) {
          await writeOBUpdate(this.db, symbol, ob);
        }
      } catch (err) {
        console.error(`[LiqWS][ob] Failed for ${symbol}:`, err);
      }
    }
  }

  // ── Symbol discovery from Firestore ──────────────────────

  private async refreshSymbols(): Promise<void> {
    console.log("[LiqWS] refreshSymbols: querying Firestore...");
    try {
      const snap = await Promise.race([
        this.db.collection("signals").where("status", "==", "ACTIVE").get(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Firestore query timed out after 15s")),
            15_000,
          ),
        ),
      ]);
      console.log(`[LiqWS] refreshSymbols: got ${snap.size} active signals`);

      const freshSymbols = new Set<string>();
      for (const doc of snap.docs) {
        const data = doc.data();
        const assetType: string = data.assetType ?? "CRYPTO";
        const symbol: string = data.symbol ?? "";
        const exchange: string = (data.exchange ?? "").toUpperCase();

        // Only subscribe to crypto, non-Indian-stock symbols
        // Accept any exchange for the liquidation feed — Bybit WS covers
        // all perp symbols regardless of where the signal originates,
        // since crypto markets are highly correlated cross-exchange.
        if (
          symbol &&
          assetType !== "INDIAN_STOCKS" &&
          exchange !== "NSE" &&
          exchange !== "BSE" &&
          exchange !== "MCX"
        ) {
          freshSymbols.add(symbol.toUpperCase());
        }
      }

      const toAdd = [...freshSymbols].filter(
        (s) => !this.subscribedSymbols.has(s),
      );
      const toRemove = [...this.subscribedSymbols].filter(
        (s) => !freshSymbols.has(s),
      );

      // Update internal tracking
      for (const s of toAdd) {
        this.subscribedSymbols.add(s);
        if (!this.symbolStates.has(s)) {
          this.symbolStates.set(s, emptyState());
        }
      }
      for (const s of toRemove) {
        this.subscribedSymbols.delete(s);
        this.symbolStates.delete(s);
        evictOICache(s);
        evictOBCache(s);
      }

      // Push subscription changes to the open WS
      this.subscribeSymbols(toAdd);
      this.unsubscribeSymbols(toRemove);

      if (toAdd.length > 0 || toRemove.length > 0) {
        console.log(
          `[LiqWS] Symbols: +${toAdd.length} -${toRemove.length} ` +
            `total=${this.subscribedSymbols.size}`,
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
    const db = initFirebase();
    const server = new LiquidityWSServer(db);
    await server.start();
  } catch (err) {
    console.error("[LiqWS] FATAL startup error:", err);
    process.exit(1);
  }
})();
