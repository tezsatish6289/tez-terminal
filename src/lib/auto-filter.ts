/**
 * Auto-Filter Scoring Engine
 *
 * Scores each signal on two factors (0-100):
 *
 *   1. Price Structure  (0-80) — Pattern A (holding/loading) or
 *                                Pattern B (tested SL zone, rejected, recovering)
 *                                detected from up to 12 candle-frequency snapshots
 *   2. Signal Freshness (0-20) — Age in candles relative to the signal's TF
 *
 * Hard gates (applied before scoring; fail = score capped at 20):
 *   - Dynamic RR: (TP2 − currentPrice) / (currentPrice − SL) ≥ 1.5
 *   - SL consumed: price must not have moved > 30% into SL distance
 *
 * Signals scoring ≥ AUTO_FILTER_THRESHOLD (45) are eligible for simulator entry.
 *
 * Price snapshots (priceSnapshots[], lastSnapshotAt) are written to each
 * signal doc by sync-prices once per completed candle of the signal's TF.
 *
 * Runs server-side (sync-prices cron). Client reads pre-computed scores.
 */

import { getEffectivePnl } from "./pnl";

export const AUTO_FILTER_THRESHOLD = 45;
export const STALE_CANDLE_LIMIT = 6;
export const MIN_REGIME_SAMPLE = 5;

// ── Market Regime (Phase 2) ────────────────────────────────

export interface RegimeEntry {
  winRate: number;
  sampleSize: number;
  activeCount: number;
  wins: number;
  losses: number;
  recentSlCount: number;
  adjustedThreshold: number;
  thresholdHistory: number[];
  lastUpdated: string;
}

export type MarketRegimeData = Record<string, RegimeEntry>;

const REGIME_WR_SCALE = 40;
const REGIME_SL_PENALTY = 3;
const REGIME_SL_CAP = 15;
const REGIME_MIN_THRESHOLD = 35;
const REGIME_MAX_THRESHOLD = 85;
const REGIME_STALENESS_CANDLES = 3;
const REGIME_MA_PERIOD = 5;
const SL_WINDOW_CANDLES = 6;

const CROWDING_FREE_SLOTS = 5;
const CROWDING_PER_SIGNAL = 2;

const OPP_SL_ORIGINAL_BENEFIT = 2;
const OPP_SL_TRAILING_BENEFIT = 1;
const OPP_SL_BENEFIT_CAP = 8;

export function isRegimeStale(lastUpdated?: string, timeframe?: string): boolean {
  if (!lastUpdated) return true;
  const candleMs = (CANDLE_MINUTES[timeframe ?? "15"] ?? 15) * 60 * 1000;
  const stalenessMs = candleMs * REGIME_STALENESS_CANDLES;
  return Date.now() - new Date(lastUpdated).getTime() > stalenessMs;
}

export function getAdjustedThreshold(
  winRate: number,
  sampleSize: number,
  recentSlCount: number = 0,
  baseOverride?: number,
  activeSideCount: number = 0,
  oppOriginalSlCount: number = 0,
  oppTrailingSlCount: number = 0,
): number {
  const base = baseOverride ?? AUTO_FILTER_THRESHOLD;
  if (sampleSize < MIN_REGIME_SAMPLE) return base;

  const wrAdjust = (0.5 - winRate) * REGIME_WR_SCALE;
  const slPenalty = Math.min(recentSlCount * REGIME_SL_PENALTY, REGIME_SL_CAP);

  const crowdingPenalty = Math.max(0, activeSideCount - CROWDING_FREE_SLOTS) * CROWDING_PER_SIGNAL;

  const oppSlBenefit = Math.min(
    oppOriginalSlCount * OPP_SL_ORIGINAL_BENEFIT + oppTrailingSlCount * OPP_SL_TRAILING_BENEFIT,
    OPP_SL_BENEFIT_CAP,
  );

  const raw = base + wrAdjust + slPenalty + crowdingPenalty - oppSlBenefit;

  return Math.round(
    Math.max(REGIME_MIN_THRESHOLD, Math.min(REGIME_MAX_THRESHOLD, raw)),
  );
}

interface RegimeSignal {
  timeframe: string;
  type: string;
  autoFilterPassed?: boolean | null;
  status: string;
  price: number;
  currentPrice?: number | null;
  tp1Hit?: boolean;
  slHitAt?: string | null;
  receivedAt?: string;
}

export function computeMarketRegime(
  signals: RegimeSignal[],
  previousRegime?: MarketRegimeData,
  baseThresholdOverride?: number,
): MarketRegimeData {
  const now = Date.now();
  const regime: MarketRegimeData = {};

  for (const tfId of Object.keys(CANDLE_MINUTES)) {
    for (const side of ["BUY", "SELL"]) {
      // ── Active win rate (real-time market state) ──
      const active = signals.filter(
        (s) =>
          s.status === "ACTIVE" &&
          !s.tp1Hit &&
          !s.slHitAt &&
          String(s.timeframe) === tfId &&
          s.type === side,
      );

      let wins = 0;
      let losses = 0;
      for (const s of active) {
        const entry = Number(s.price);
        const current = s.currentPrice != null ? Number(s.currentPrice) : entry;
        if (!entry || entry === 0) continue;
        const pnl =
          side === "BUY"
            ? ((current - entry) / entry) * 100
            : ((entry - current) / entry) * 100;
        if (pnl > 0.05) wins++;
        else if (pnl < -0.05) losses++;
      }

      // ── Recent SL hits (confirmed damage) ──
      const candleMs = (CANDLE_MINUTES[tfId] ?? 15) * 60 * 1000;
      const slWindowMs = candleMs * SL_WINDOW_CANDLES;

      const recentSlCount = signals.filter(
        (s) =>
          s.status === "INACTIVE" &&
          s.slHitAt != null &&
          !s.tp1Hit &&
          String(s.timeframe) === tfId &&
          s.type === side &&
          now - new Date(s.slHitAt).getTime() < slWindowMs,
      ).length;

      // ── Opposite-side SL hits (directional evidence) ──
      const oppSide = side === "BUY" ? "SELL" : "BUY";

      const oppOriginalSlCount = signals.filter(
        (s) =>
          s.status === "INACTIVE" &&
          s.slHitAt != null &&
          !s.tp1Hit &&
          String(s.timeframe) === tfId &&
          s.type === oppSide &&
          now - new Date(s.slHitAt).getTime() < slWindowMs,
      ).length;

      const oppTrailingSlCount = signals.filter(
        (s) =>
          s.status === "INACTIVE" &&
          s.slHitAt != null &&
          s.tp1Hit === true &&
          String(s.timeframe) === tfId &&
          s.type === oppSide &&
          now - new Date(s.slHitAt).getTime() < slWindowMs,
      ).length;

      const activeCount = active.length;
      const total = wins + losses;
      if (activeCount < 3 && recentSlCount === 0 && oppOriginalSlCount === 0 && oppTrailingSlCount === 0) continue;

      const winRate = total > 0 ? wins / total : 0.5;
      const sampleSize = activeCount + recentSlCount;

      const activeSideTfCount = active.length;

      const key = `${tfId}_${side}`;
      const rawThreshold = getAdjustedThreshold(winRate, sampleSize, recentSlCount, baseThresholdOverride, activeSideTfCount, oppOriginalSlCount, oppTrailingSlCount);
      const prevHistory = previousRegime?.[key]?.thresholdHistory ?? [];
      const newHistory = [...prevHistory, rawThreshold].slice(-REGIME_MA_PERIOD);

      regime[key] = {
        winRate,
        sampleSize,
        activeCount,
        wins,
        losses,
        recentSlCount,
        adjustedThreshold: rawThreshold,
        thresholdHistory: newHistory,
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  return regime;
}

// ── Timeframe metadata ──────────────────────────────────────

const TF_RANK: Record<string, number> = {
  "1": 0, "5": 1, "15": 2, "60": 3, "240": 4, "D": 5, "W": 6,
};

export const CANDLE_MINUTES: Record<string, number> = {
  "1": 1, "5": 5, "15": 15, "60": 60, "240": 240, "D": 1440, "W": 10080,
};


// ── Types ───────────────────────────────────────────────────

export interface SignalForScoring {
  id: string;
  symbol: string;
  type: "BUY" | "SELL";
  price: number;
  currentPrice: number | null;
  pnl: number;
  timeframe: string;
  receivedAt: string;
  status: string;
  algo: string;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  slHitAt: string | null;
  stopLoss: number | null;
  originalStopLoss: number | null;
  maxUpsidePrice: number | null;
  maxDrawdownPrice: number | null;
  aligned: boolean;
  totalBookedPnl: number | null;
  confidenceScore?: number | null;
  maxConfidenceScore?: number | null;
  // Price structure detection
  priceSnapshots: number[];       // up to 12 prices, one per completed candle
  lastSnapshotAt: string | null;  // ISO timestamp of last snapshot write
}

export interface ScoreBreakdown {
  priceStructure: number;   // 0-80 — Pattern A or B detection
  pattern: "A" | "B" | "none" | "early";
  rrGateFailed: boolean;    // true if dynamic RR gate failed (remaining upside to TP2 < 1.5× risk)
}

export interface ScoredSignal {
  signalId: string;
  score: number;
  label: string;
  color: string;
  breakdown: ScoreBreakdown;
}

export interface AlgoTfStats {
  winRate: number;
  profitFactor: number;
  sampleSize: number;
}

// ── Hard gate: Dynamic RR to TP2 from current price ─────────
// Recomputed every scoring cycle. Fails if remaining TP2 upside
// is less than 1.5× the remaining SL risk from current price.

function checkDynamicRR(signal: SignalForScoring): boolean {
  const cur = signal.currentPrice;
  const tp2 = signal.tp2;
  const sl = signal.stopLoss;
  if (cur == null || tp2 == null || sl == null) return true; // can't check → pass

  const isBuy = signal.type === "BUY";
  const remaining = isBuy ? tp2 - cur : cur - tp2;
  const risk = isBuy ? cur - sl : sl - cur;

  if (risk <= 0 || remaining <= 0) return false;
  return remaining / risk >= 1.5;
}

// ── Pattern A — Holding and loading (0-80) ──────────────────
// Price moved in favour, consolidated in a tight range at that level,
// has not given back the move. Next leg is likely.

function scorePatternA(signal: SignalForScoring): number {
  const snaps = signal.priceSnapshots;
  if (snaps.length < 3) return 0;

  const isBuy = signal.type === "BUY";
  const entry = signal.price;
  const tp1 = signal.tp1;
  if (!tp1) return 0;

  const tp1Distance = Math.abs(tp1 - entry);
  if (tp1Distance <= 0) return 0;

  // Max price reached in favour across all snapshots
  const maxFav = isBuy ? Math.max(...snaps) : Math.min(...snaps);
  const maxExcursion = isBuy ? maxFav - entry : entry - maxFav;

  // Must have moved ≥ 30% toward TP1
  if (maxExcursion < tp1Distance * 0.30) return 0;

  const cur = signal.currentPrice ?? snaps[snaps.length - 1];
  const curExcursion = isBuy ? cur - entry : entry - cur;

  // Must still be holding ≥ 70% of that move (hasn't given it back)
  if (maxExcursion <= 0 || curExcursion < maxExcursion * 0.70) return 0;

  let score = 40; // base: pattern detected

  // Tightness of last 4 snapshots relative to the total move
  const last4 = snaps.slice(-4);
  const totalMove = Math.abs(maxFav - entry);
  const rangeSize = Math.max(...last4) - Math.min(...last4);
  const rangePctActual = totalMove > 0 ? rangeSize / totalMove : 1;

  if (rangePctActual < 0.15) score += 20;
  else if (rangePctActual < 0.25) score += 15;
  else if (rangePctActual < 0.35) score += 8;
  else if (rangePctActual < 0.50) score += 3;

  // How well price held the high (closer to max = stronger)
  const holdPct = curExcursion / maxExcursion;
  if (holdPct >= 0.90) score += 20;
  else if (holdPct >= 0.80) score += 15;
  else score += 8; // ≥ 0.70 already guaranteed above

  return Math.min(80, score);
}

// ── Pattern B — Tested and rejected (0-80) ──────────────────
// Price moved into the SL zone, held in a tight range there,
// then reversed and is now moving in the trade direction.

function scorePatternB(signal: SignalForScoring): number {
  const snaps = signal.priceSnapshots;
  if (snaps.length < 3) return 0;

  const isBuy = signal.type === "BUY";
  const entry = signal.price;
  const sl = signal.stopLoss;
  const tp1 = signal.tp1;
  if (!sl || !tp1) return 0;

  const slDistance = Math.abs(entry - sl);
  const tp1Distance = Math.abs(tp1 - entry);
  if (slDistance <= 0 || tp1Distance <= 0) return 0;

  // Max adverse excursion across all snapshots
  const maxAdv = isBuy ? Math.min(...snaps) : Math.max(...snaps);
  const adverseExcursion = isBuy ? entry - maxAdv : maxAdv - entry;

  // Must have tested 35–90% of SL distance (deep test but didn't hit SL)
  const testRatio = adverseExcursion / slDistance;
  if (testRatio < 0.35 || testRatio > 0.90) return 0;

  // Must have recovered: current price above/below entry
  const cur = signal.currentPrice ?? snaps[snaps.length - 1];
  const curExcursion = isBuy ? cur - entry : entry - cur;
  if (curExcursion <= 0) return 0;

  let score = 35; // base: pattern detected

  // Recovery strength — how far above entry toward TP1
  const recoveryRatio = curExcursion / tp1Distance;
  if (recoveryRatio >= 0.30) score += 20;
  else if (recoveryRatio >= 0.20) score += 15;
  else if (recoveryRatio >= 0.10) score += 10;
  else score += 5;

  // Tightness of the test zone (snapshots inside the adverse area)
  const adverseThresh = isBuy
    ? entry - slDistance * 0.35
    : entry + slDistance * 0.35;
  const advSnaps = snaps.filter((p) => isBuy ? p < adverseThresh : p > adverseThresh);

  if (advSnaps.length >= 2) {
    const testRange = Math.max(...advSnaps) - Math.min(...advSnaps);
    const testRangePct = testRange / slDistance;
    if (testRangePct < 0.10) score += 15;
    else if (testRangePct < 0.20) score += 10;
    else if (testRangePct < 0.30) score += 5;
  } else {
    score += 8; // single-snapshot sharp rejection — strong
  }

  // Momentum confirmation: last 3 snapshots trending in trade direction
  const last3 = snaps.slice(-3);
  if (last3.length === 3) {
    const trending = isBuy
      ? last3[0] < last3[1] && last3[1] < last3[2]
      : last3[0] > last3[1] && last3[1] > last3[2];
    if (trending) score += 10;
  }

  return Math.min(80, score);
}

// ── Price structure: pick best pattern ──────────────────────

function scorePriceStructure(signal: SignalForScoring): {
  score: number;
  pattern: "A" | "B" | "none" | "early";
} {
  const snaps = signal.priceSnapshots ?? [];

  if (snaps.length < 3) {
    // Too early — not enough candles to judge
    return { score: 15, pattern: "early" };
  }

  const scoreA = scorePatternA(signal);
  const scoreB = scorePatternB(signal);

  if (scoreA > 0 && scoreA >= scoreB) return { score: scoreA, pattern: "A" };
  if (scoreB > 0) return { score: scoreB, pattern: "B" };

  // No pattern — check if price is drifting toward SL (bearish for the trade)
  const isBuy = signal.type === "BUY";
  const sl = signal.stopLoss;
  const entry = signal.price;
  const cur = signal.currentPrice ?? snaps[snaps.length - 1];
  if (sl) {
    const slDistance = Math.abs(entry - sl);
    const adverse = isBuy ? entry - cur : cur - entry;
    if (slDistance > 0 && adverse / slDistance > 0.30) {
      return { score: 0, pattern: "none" }; // drifting toward SL
    }
  }

  return { score: 10, pattern: "none" }; // choppy / no information yet
}

// ── Factor 4: Historical Algo Performance (0-22) ────────────

export function computeAlgoTfStats(
  allSignals: SignalForScoring[],
): Map<string, AlgoTfStats> {
  const statsMap = new Map<string, AlgoTfStats>();

  const closed = allSignals.filter(
    (s) => s.status === "INACTIVE" && s.totalBookedPnl != null,
  );

  const groups = new Map<string, number[]>();
  for (const s of closed) {
    const key = `${s.algo}|${s.timeframe}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s.totalBookedPnl!);
  }

  for (const [key, pnls] of groups) {
    const wins = pnls.filter((p) => p > 0).length;
    const winRate = pnls.length > 0 ? wins / pnls.length : 0.5;
    const grossProfit = pnls
      .filter((p) => p > 0)
      .reduce((a, b) => a + b, 0);
    const grossLoss = Math.abs(
      pnls.filter((p) => p < 0).reduce((a, b) => a + b, 0),
    );
    const profitFactor =
      grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 10 : 0;

    statsMap.set(key, { winRate, profitFactor, sampleSize: pnls.length });
  }

  return statsMap;
}


// ── Confidence labels ───────────────────────────────────────

function getConfidenceLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "Strong", color: "text-positive" };
  if (score >= 65) return { label: "Good", color: "text-accent" };
  if (score >= 50) return { label: "Fair", color: "text-amber-400" };
  if (score >= 35) return { label: "Weak", color: "text-orange-400" };
  return { label: "Avoid", color: "text-negative" };
}

// ── Main scoring function ───────────────────────────────────

export function computeAutoFilter(
  allSignals: SignalForScoring[],
  options?: { includeResolved?: boolean },
): Map<string, ScoredSignal> {
  const scores = new Map<string, ScoredSignal>();

  // By default score only unresolved signals (no TP/SL hit).
  // Pass includeResolved:true to also score partially/fully resolved signals
  // (used for open trade management where we need scores even after TP hits).
  const candidates = options?.includeResolved
    ? allSignals
    : allSignals.filter(
        (s) =>
          s.status !== "INACTIVE" &&
          !s.tp1Hit &&
          !s.tp2Hit &&
          !s.tp3Hit &&
          !s.slHitAt,
      );

  for (const signal of candidates) {
    const rrPassed = checkDynamicRR(signal);
    const { score: structureScore, pattern } = scorePriceStructure(signal);

    const rrGateFailed = !rrPassed;

    // Score is purely pattern quality (0-80).
    // RR gate failure doesn't cap the score — it's flagged separately
    // and the entry gate in selectIncubatedSignals reads rrGateFailed directly.
    const finalScore = Math.min(80, structureScore);

    const breakdown: ScoreBreakdown = {
      priceStructure: structureScore,
      pattern,
      rrGateFailed,
    };
    const { label, color } = getConfidenceLabel(finalScore);

    scores.set(signal.id, {
      signalId: signal.id,
      score: finalScore,
      label,
      color,
      breakdown,
    });
  }

  return scores;
}

// ── Server-side helpers ─────────────────────────────────────

export function isSignalStale(receivedAt: string, timeframe: string): boolean {
  const candleMinutes = CANDLE_MINUTES[timeframe] ?? 15;
  const ageMs = Date.now() - new Date(receivedAt).getTime();
  const ageInCandles = ageMs / (candleMinutes * 60 * 1000);
  return ageInCandles > STALE_CANDLE_LIMIT;
}

export function mapFirestoreSignal(doc: { id: string; [key: string]: any }): SignalForScoring {
  const pnl = getEffectivePnl({
    price: Number(doc.price || 0),
    currentPrice: doc.currentPrice != null ? Number(doc.currentPrice) : null,
    type: doc.type || "BUY",
    tp1: doc.tp1 ?? null,
    tp2: doc.tp2 ?? null,
    tp3: doc.tp3 ?? null,
    tp1Hit: doc.tp1Hit ?? false,
    tp2Hit: doc.tp2Hit ?? false,
    tp3Hit: doc.tp3Hit ?? false,
    tp1BookedPnl: doc.tp1BookedPnl ?? null,
    tp2BookedPnl: doc.tp2BookedPnl ?? null,
    tp3BookedPnl: doc.tp3BookedPnl ?? null,
    totalBookedPnl: doc.totalBookedPnl ?? null,
    status: doc.status,
  });

  return {
    id: doc.id,
    symbol: doc.symbol || "",
    type: doc.type as "BUY" | "SELL",
    price: Number(doc.price || 0),
    currentPrice: doc.currentPrice != null ? Number(doc.currentPrice) : null,
    pnl,
    timeframe: String(doc.timeframe || "15"),
    receivedAt: doc.receivedAt || "",
    status: doc.status || "ACTIVE",
    algo: doc.algo || "V8 Reversal",
    tp1: doc.tp1 != null ? Number(doc.tp1) : null,
    tp2: doc.tp2 != null ? Number(doc.tp2) : null,
    tp3: doc.tp3 != null ? Number(doc.tp3) : null,
    tp1Hit: doc.tp1Hit ?? false,
    tp2Hit: doc.tp2Hit ?? false,
    tp3Hit: doc.tp3Hit ?? false,
    slHitAt: doc.slHitAt ?? null,
    stopLoss: doc.stopLoss != null ? Number(doc.stopLoss) : null,
    originalStopLoss: doc.originalStopLoss != null ? Number(doc.originalStopLoss) : null,
    maxUpsidePrice: doc.maxUpsidePrice != null ? Number(doc.maxUpsidePrice) : null,
    maxDrawdownPrice: doc.maxDrawdownPrice != null ? Number(doc.maxDrawdownPrice) : null,
    aligned: doc.aligned ?? false,
    totalBookedPnl: doc.totalBookedPnl ?? null,
    confidenceScore: doc.confidenceScore ?? null,
    maxConfidenceScore: doc.maxConfidenceScore ?? null,
    priceSnapshots: Array.isArray(doc.priceSnapshots) ? doc.priceSnapshots : [],
    lastSnapshotAt: doc.lastSnapshotAt ?? null,
  };
}

