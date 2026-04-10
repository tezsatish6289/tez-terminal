/**
 * Liquidity System — Shared Types
 *
 * Used by the WS server (scripts/liquidity-ws-server.ts),
 * the scoring engine (liquidity-scorer.ts), and the cron
 * integration (sync-simulator/route.ts).
 */

// ── Exchange identifiers ─────────────────────────────────────

export type LiqSide = "Buy" | "Sell"; // Bybit/Binance convention
export type SweepSide = "SELL_LIQ" | "BUY_LIQ"; // SELL_LIQ = longs flushed = bullish
export type LiqSource = "BYBIT" | "BINANCE" | "MEXC";

// ── Raw liquidation event ─────────────────────────────────────

export interface LiqEvent {
  symbol: string;
  side: LiqSide;
  size: number;       // USD notional (qty × price)
  price: number;
  timestamp: number;  // ms epoch
  source: LiqSource;
}

// ── Sweep detection result ────────────────────────────────────
// detectSweep() returns SweepResult (stateless, per-call).
// The WS server merges it with persistence fields to build SweepDetection
// which is written to Firestore.

export interface SweepResult {
  detected: boolean;
  side: SweepSide | null;
  strength: number;              // σ above mean in current 5s window
  weightedSweepPrice: number | null;
  sellVol5s: number;
  buyVol5s: number;
  sellMean: number;
  sellSigma: number;
  buyMean: number;
  buySigma: number;
}

export interface SweepDetection extends SweepResult {
  // Persisted across multiple 5s checks — survives after spike ends
  lastSweepAt: string | null;       // ISO timestamp of most recent spike
  lastSweepSide: SweepSide | null;
  lastSweepStrength: number;
  updatedAt: string;
}

// ── Open interest context ─────────────────────────────────────

export interface OISnapshot {
  ts: number;    // ms epoch
  oi: number;    // open interest value
  price: number; // mark price at that interval
}

export interface OIContext {
  snapshots: OISnapshot[];
  priceOICorrelation: number; // Pearson r between Δprice and ΔOI: -1 to +1
  oiChange5m: number;         // % change over last 5 min
  oiChange30m: number;        // % change over last 30 min
  fundingRate: number;        // current 8-hour funding rate (raw, e.g. 0.0001)
  updatedAt: string;
}

// ── Order book context ────────────────────────────────────────

export interface OBBand {
  bidVol: number;
  askVol: number;
  imbalance: number; // (bid - ask) / (bid + ask), range -1 to +1
}

export interface OBWall {
  price: number;
  side: "bid" | "ask";
  size: number;
  distancePct: number; // % distance from current price
}

export interface OrderBookContext {
  currentPrice: number;
  bands: {
    tight: OBBand;      // ±0.1%
    structural: OBBand; // ±0.3%
    extended: OBBand;   // ±1.0%
  };
  walls: OBWall[]; // orders ≥ 3× avg size within ±1%
  updatedAt: string;
}

// ── Per-symbol Firestore cache doc ───────────────────────────

export interface LiquidityCache {
  symbol: string;
  sweep: SweepDetection;
  oi: OIContext | null;
  ob: OrderBookContext | null;
  updatedAt: string;
}

// ── Scoring output ────────────────────────────────────────────

export interface LiquidityContextScore {
  score: number;                        // 0–20
  sweepGatePassed: boolean | null | undefined; // true / false / null|undefined (no data)
  sweepAgeMs: number | null;
  reasons: string[];
}

// ── Runtime configuration (from config/simulator_params) ─────

export interface LiquidityConfig {
  enabled: boolean;           // master switch
  sweepGateEnabled: boolean;  // apply soft sweep gate to incubation
  sweepScoreEnabled: boolean; // include sweep component in score
  oiEnabled: boolean;         // include OI component in score
  obEnabled: boolean;         // include order book component in score
  sweepWindowMs: number;      // max age for a valid sweep (default 3 min)
  sweepMinSigma: number;      // minimum σ to qualify as a spike (default 2.5)
  sweepMinUSD: number;        // minimum notional to qualify (default $50k)
}

export const DEFAULT_LIQUIDITY_CONFIG: LiquidityConfig = {
  enabled: true,
  sweepGateEnabled: true,
  sweepScoreEnabled: true,
  oiEnabled: true,
  obEnabled: true,
  sweepWindowMs: 180_000,
  sweepMinSigma: 2.5,
  sweepMinUSD: 50_000,
};

export function parseLiquidityConfig(
  params: Record<string, unknown>,
): LiquidityConfig {
  const d = DEFAULT_LIQUIDITY_CONFIG;
  return {
    enabled:           typeof params.liquidityEnabled           === "boolean" ? params.liquidityEnabled           : d.enabled,
    sweepGateEnabled:  typeof params.liquiditySweepGateEnabled  === "boolean" ? params.liquiditySweepGateEnabled  : d.sweepGateEnabled,
    sweepScoreEnabled: typeof params.liquiditySweepScoreEnabled === "boolean" ? params.liquiditySweepScoreEnabled : d.sweepScoreEnabled,
    oiEnabled:         typeof params.liquidityOIEnabled         === "boolean" ? params.liquidityOIEnabled         : d.oiEnabled,
    obEnabled:         typeof params.liquidityOBEnabled         === "boolean" ? params.liquidityOBEnabled         : d.obEnabled,
    sweepWindowMs:     typeof params.liquiditySweepWindowMs     === "number"  ? params.liquiditySweepWindowMs     : d.sweepWindowMs,
    sweepMinSigma:     typeof params.liquiditySweepMinSigma     === "number"  ? params.liquiditySweepMinSigma     : d.sweepMinSigma,
    sweepMinUSD:       typeof params.liquiditySweepMinUSD       === "number"  ? params.liquiditySweepMinUSD       : d.sweepMinUSD,
  };
}
