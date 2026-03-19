/**
 * Auto-Filter Scoring Engine
 *
 * Predicts signal profitability using a 6-factor weighted scoring system.
 * Each active signal gets a confidence score (0-100):
 *
 *   1. Multi-Timeframe Confluence  (0-25)  — Direction alignment across TFs
 *   2. Momentum & Market Regime    (0-25)  — Price action + environment
 *   3. Risk-Reward Quality         (0-15)  — TP distance vs SL distance
 *   4. Historical Algo Performance (0-15)  — Win rate of algo+TF combo
 *   5. Trade Health / Drawdown     (0-12)  — Adverse excursion analysis
 *   6. Signal Freshness            (0-8)   — Time decay relative to TF
 *
 * Signals scoring >= AUTO_FILTER_THRESHOLD pass the auto-filter.
 *
 * Runs server-side (webhook after() + sync-prices cron) and stores
 * scores on each signal document. Client reads pre-computed scores.
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
): number {
  const base = baseOverride ?? AUTO_FILTER_THRESHOLD;
  if (sampleSize < MIN_REGIME_SAMPLE) return base;

  const wrAdjust = (0.5 - winRate) * REGIME_WR_SCALE;
  const slPenalty = Math.min(recentSlCount * REGIME_SL_PENALTY, REGIME_SL_CAP);

  const crowdingPenalty = Math.max(0, activeSideCount - CROWDING_FREE_SLOTS) * CROWDING_PER_SIGNAL;

  const raw = base + wrAdjust + slPenalty + crowdingPenalty;

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
          s.autoFilterPassed === true &&
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
          s.autoFilterPassed === true &&
          s.status === "INACTIVE" &&
          s.slHitAt != null &&
          !s.tp1Hit &&
          String(s.timeframe) === tfId &&
          s.type === side &&
          now - new Date(s.slHitAt).getTime() < slWindowMs,
      ).length;

      const activeCount = active.length;
      const total = wins + losses;
      if (activeCount < 3 && recentSlCount === 0) continue;

      const winRate = total > 0 ? wins / total : 0.5;
      const sampleSize = activeCount + recentSlCount;

      const activeSideTfCount = active.length;

      const key = `${tfId}_${side}`;
      const rawThreshold = getAdjustedThreshold(winRate, sampleSize, recentSlCount, baseThresholdOverride, activeSideTfCount);
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

const CANDLE_MINUTES: Record<string, number> = {
  "1": 1, "5": 5, "15": 15, "60": 60, "240": 240, "D": 1440, "W": 10080,
};

const PNL_THRESHOLDS: Record<string, number> = {
  "5": 0.3, "15": 0.5, "60": 1.0, "240": 2.0, "D": 3.0,
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
}

export interface ScoreBreakdown {
  mtfConfluence: number;
  momentum: number;
  riskReward: number;
  algoPerformance: number;
  tradeHealth: number;
  freshness: number;
}

export interface ScoredSignal {
  signalId: string;
  score: number;
  label: string;
  color: string;
  breakdown: ScoreBreakdown;
}

interface AlgoTfStats {
  winRate: number;
  profitFactor: number;
  sampleSize: number;
}

// ── Factor 1: Cross-TF Signal Confluence (0-4) ──────────────

function scoreMtfConfluence(
  signal: SignalForScoring,
  allSignals: SignalForScoring[],
): number {
  const MAX = 4;
  const signalRank = TF_RANK[signal.timeframe];
  if (signalRank == null) return Math.round(MAX * 0.4);

  const activeSignals = allSignals.filter(
    (s) =>
      s.id !== signal.id &&
      s.status !== "INACTIVE" &&
      !s.slHitAt &&
      TF_RANK[s.timeframe] != null,
  );

  let score = 0;

  // Same-symbol cross-TF signals: higher TF aligned = strong confirmation
  const sameSymbol = activeSignals.filter((s) => s.symbol === signal.symbol);
  if (sameSymbol.length > 0) {
    let symScore = 0;
    for (const other of sameSymbol) {
      const isHigher = TF_RANK[other.timeframe]! > signalRank;
      const aligned = other.type === signal.type;
      if (isHigher) {
        symScore += aligned ? 3 : -2;
      } else {
        symScore += aligned ? 1 : -1;
      }
    }
    score += Math.max(-2, Math.min(MAX, symScore));
  }

  return Math.max(0, Math.min(MAX, score));
}

// ── Factor 2: Entry Quality & Market Regime (0-28) ──────────

function scoreMomentum(
  signal: SignalForScoring,
  allSignals: SignalForScoring[],
): number {
  const MAX = 28;
  const threshold = PNL_THRESHOLDS[signal.timeframe] ?? 0.5;
  let score = 0;

  // ─── A. 3D Entry Quality (0-12) ───
  // Three dimensions: current PnL, positive excursion, negative excursion
  const isBuy = signal.type === "BUY";
  const entry = signal.price;
  const pnl = signal.pnl;

  // Positive excursion: how far did price go in the right direction?
  let positiveExcursion = 0;
  if (signal.maxUpsidePrice != null) {
    positiveExcursion = isBuy
      ? ((signal.maxUpsidePrice - entry) / entry) * 100
      : ((entry - signal.maxUpsidePrice) / entry) * 100;
  }

  // Negative excursion: did price ever go against us?
  let negativeExcursion = 0;
  if (signal.maxDrawdownPrice != null) {
    negativeExcursion = isBuy
      ? ((entry - signal.maxDrawdownPrice) / entry) * 100
      : ((signal.maxDrawdownPrice - entry) / entry) * 100;
  }

  const hadPositiveExcursion = positiveExcursion > threshold * 0.3;
  const neverWentNegative = negativeExcursion < threshold * 0.15;
  const isPulledBack = hadPositiveExcursion && pnl < positiveExcursion * 0.5;

  if (hadPositiveExcursion && neverWentNegative && isPulledBack && pnl >= 0) {
    score += 12;
  } else if (hadPositiveExcursion && neverWentNegative && pnl > 0) {
    score += 11;
  } else if (pnl > 0 && pnl <= threshold) {
    score += 10;
  } else if (hadPositiveExcursion && neverWentNegative && pnl <= 0 && pnl > -threshold * 0.3) {
    score += 8;
  } else if (hadPositiveExcursion && !neverWentNegative && pnl > 0) {
    score += 6;
  } else if (!hadPositiveExcursion && neverWentNegative) {
    score += 6;
  } else if (pnl > threshold * 2) {
    score += 5;
  } else if (hadPositiveExcursion && !neverWentNegative && pnl <= 0) {
    score += 2;
  } else if (pnl > -threshold) {
    score += 2;
  } else {
    score += 0;
  }

  // ─── B. Side-Aware Market Regime (0-16) ───
  // "Are signals on MY side winning?" + "Are signals on the OTHER side losing?"
  const sameTfActive = allSignals.filter(
    (s) =>
      s.timeframe === signal.timeframe &&
      s.id !== signal.id &&
      s.status !== "INACTIVE" &&
      !s.slHitAt,
  );

  const sameSide = sameTfActive.filter((s) => s.type === signal.type);
  const oppSide = sameTfActive.filter((s) => s.type !== signal.type);

  let regimeScore = 0;

  // Same-side performance (0-10)
  if (sameSide.length >= 2) {
    const sameWinning = sameSide.filter((s) => s.pnl > threshold).length;
    const sameLosing = sameSide.filter((s) => s.pnl < -threshold).length;
    const sameWinRate = sameWinning / sameSide.length;
    const sameLossRate = sameLosing / sameSide.length;

    if (sameWinRate > 0.65) regimeScore += 10;
    else if (sameWinRate > 0.5) regimeScore += 8;
    else if (sameWinRate > sameLossRate) regimeScore += 5;
    else if (sameLossRate > 0.65) regimeScore += 0;
    else regimeScore += 3;
  } else {
    regimeScore += 5;
  }

  // Opposite-side performance as contrarian confirmation (0-6)
  if (oppSide.length >= 2) {
    const oppLosing = oppSide.filter((s) => s.pnl < -threshold).length;
    const oppWinning = oppSide.filter((s) => s.pnl > threshold).length;
    const oppLossRate = oppLosing / oppSide.length;
    const oppWinRate = oppWinning / oppSide.length;

    if (oppLossRate > 0.65) regimeScore += 6;
    else if (oppLossRate > 0.5) regimeScore += 4;
    else if (oppWinRate > 0.65) regimeScore -= 2;
    else regimeScore += 2;
  } else {
    regimeScore += 2;
  }

  // ─── C. Recent SL Damage — same side, same TF (penalty: 0 to -5) ───
  const now = Date.now();
  const candleMs = (CANDLE_MINUTES[signal.timeframe] ?? 15) * 60 * 1000;
  const slWindowMs = candleMs * 6;

  const recentSlSameSideTf = allSignals.filter(
    (s) =>
      s.slHitAt != null &&
      s.type === signal.type &&
      s.timeframe === signal.timeframe &&
      now - new Date(s.slHitAt).getTime() < slWindowMs,
  ).length;

  if (recentSlSameSideTf >= 3) regimeScore -= 5;
  else if (recentSlSameSideTf >= 2) regimeScore -= 3;
  else if (recentSlSameSideTf >= 1) regimeScore -= 1;

  // ─── D. Cross-TF Side Destruction (penalty: 0 to -3) ───
  const crossTfWindowMs = 6 * 60 * 60 * 1000;
  const recentSlAll = allSignals.filter(
    (s) =>
      s.slHitAt != null &&
      now - new Date(s.slHitAt).getTime() < crossTfWindowMs,
  );

  if (recentSlAll.length >= 4) {
    const sameSideSlCount = recentSlAll.filter(
      (s) => s.type === signal.type,
    ).length;
    const sideRatio = sameSideSlCount / recentSlAll.length;

    if (sideRatio >= 0.8) regimeScore -= 3;
    else if (sideRatio >= 0.65) regimeScore -= 2;
  }

  score += Math.max(0, Math.min(16, regimeScore));

  return Math.max(0, Math.min(MAX, score));
}

// ── Factor 3: Risk-Reward Quality (0-18) ────────────────────

function scoreRiskReward(signal: SignalForScoring): number {
  const MAX = 18;

  if (
    signal.tp1 == null ||
    signal.stopLoss == null ||
    signal.stopLoss === 0
  ) {
    return MAX * 0.4;
  }

  const isBuy = signal.type === "BUY";
  const tpDistance = isBuy
    ? signal.tp1 - signal.price
    : signal.price - signal.tp1;
  const slDistance = isBuy
    ? signal.price - signal.stopLoss
    : signal.stopLoss - signal.price;

  if (slDistance <= 0 || tpDistance <= 0) return MAX * 0.3;

  const rr = tpDistance / slDistance;

  if (rr >= 3.0) return MAX;
  if (rr >= 2.5) return Math.round(MAX * 0.9);
  if (rr >= 2.0) return Math.round(MAX * 0.8);
  if (rr >= 1.5) return Math.round(MAX * 0.65);
  if (rr >= 1.0) return Math.round(MAX * 0.5);
  if (rr >= 0.75) return Math.round(MAX * 0.35);
  return Math.round(MAX * 0.2);
}

// ── Factor 4: Historical Algo Performance (0-22) ────────────

function computeAlgoTfStats(
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

function scoreFromStats(stats: AlgoTfStats, max: number): number {
  let score = 0;

  // Win rate component (up to 70% of max)
  if (stats.winRate >= 0.75) score += max * 0.7;
  else if (stats.winRate >= 0.65) score += max * 0.6;
  else if (stats.winRate >= 0.55) score += max * 0.5;
  else if (stats.winRate >= 0.45) score += max * 0.35;
  else score += max * 0.2;

  // Profit factor bonus (up to 30% of max)
  if (stats.profitFactor >= 2.5) score += max * 0.3;
  else if (stats.profitFactor >= 2.0) score += max * 0.25;
  else if (stats.profitFactor >= 1.5) score += max * 0.2;
  else if (stats.profitFactor >= 1.0) score += max * 0.1;

  return Math.min(max, Math.round(score));
}

function scoreAlgoPerformance(
  signal: SignalForScoring,
  statsMap: Map<string, AlgoTfStats>,
  allSignals: SignalForScoring[],
): number {
  const MAX = 22;
  const key = `${signal.algo}|${signal.timeframe}`;
  const stats = statsMap.get(key);

  let baseScore: number;

  if (stats && stats.sampleSize >= 3) {
    baseScore = scoreFromStats(stats, MAX);
  } else {
    // Fall back to algo-only stats (aggregate across all TFs)
    let bestAlgoStats: AlgoTfStats | null = null;
    for (const [k, v] of statsMap) {
      if (k.startsWith(signal.algo + "|") && v.sampleSize >= 3) {
        if (!bestAlgoStats || v.sampleSize > bestAlgoStats.sampleSize) {
          bestAlgoStats = v;
        }
      }
    }
    baseScore = bestAlgoStats
      ? scoreFromStats(bestAlgoStats, MAX)
      : Math.round(MAX * 0.5);
  }

  // Recent algo SL penalty: if this algo is failing RIGHT NOW on this TF
  const now = Date.now();
  const candleMs = (CANDLE_MINUTES[signal.timeframe] ?? 15) * 60 * 1000;
  const recentWindow = candleMs * 6;

  const recentAlgoSl = allSignals.filter(
    (s) =>
      s.algo === signal.algo &&
      s.timeframe === signal.timeframe &&
      s.slHitAt != null &&
      now - new Date(s.slHitAt).getTime() < recentWindow,
  ).length;

  if (recentAlgoSl >= 3) baseScore -= 4;
  else if (recentAlgoSl >= 2) baseScore -= 2;
  else if (recentAlgoSl >= 1) baseScore -= 1;

  return Math.max(0, Math.min(MAX, baseScore));
}

// ── Factor 5: Trade Health / Drawdown (0-20) ────────────────

function scoreTradeHealth(signal: SignalForScoring): number {
  const MAX = 20;

  if (signal.maxDrawdownPrice == null || signal.currentPrice == null) {
    return Math.round(MAX * 0.5);
  }

  const isBuy = signal.type === "BUY";
  const entry = signal.price;

  // Max adverse excursion (positive = went against us)
  const maxAdverse = isBuy
    ? ((entry - signal.maxDrawdownPrice) / entry) * 100
    : ((signal.maxDrawdownPrice - entry) / entry) * 100;

  const effectiveSL = signal.originalStopLoss ?? signal.stopLoss;
  const slDistance =
    effectiveSL && effectiveSL > 0
      ? isBuy
        ? ((entry - effectiveSL) / entry) * 100
        : ((effectiveSL - entry) / entry) * 100
      : null;

  let score = 0;

  if (maxAdverse <= 0) {
    // Never went into drawdown — pristine trade
    score = MAX;
  } else if (slDistance && slDistance > 0) {
    const drawdownRatio = maxAdverse / slDistance;

    if (drawdownRatio < 0.2) score = Math.round(MAX * 0.9);
    else if (drawdownRatio < 0.4) score = Math.round(MAX * 0.7);
    else if (drawdownRatio < 0.6) score = Math.round(MAX * 0.5);
    else if (drawdownRatio < 0.8) score = Math.round(MAX * 0.3);
    else score = Math.round(MAX * 0.15);

    // Recovery bonus: bounced from drawdown back to profit
    if (maxAdverse > 0 && signal.pnl > 0) {
      score = Math.min(MAX, score + Math.round(MAX * 0.15));
    }
  } else {
    const threshold = PNL_THRESHOLDS[signal.timeframe] ?? 0.5;
    if (maxAdverse < threshold * 0.5) score = Math.round(MAX * 0.7);
    else if (maxAdverse < threshold) score = Math.round(MAX * 0.5);
    else if (maxAdverse < threshold * 2) score = Math.round(MAX * 0.3);
    else score = Math.round(MAX * 0.15);
  }

  return Math.max(0, Math.min(MAX, score));
}

// ── Factor 6: Signal Freshness (0-8) ────────────────────────

function scoreFreshness(signal: SignalForScoring): number {
  const MAX = 8;
  const candleMinutes = CANDLE_MINUTES[signal.timeframe] ?? 15;
  const ageMs = Date.now() - new Date(signal.receivedAt).getTime();
  const ageInCandles = ageMs / (candleMinutes * 60 * 1000);

  if (ageInCandles <= 2) return MAX;
  if (ageInCandles <= 5) return Math.round(MAX * 0.85);
  if (ageInCandles <= 10) return Math.round(MAX * 0.7);
  if (ageInCandles <= 20) return Math.round(MAX * 0.55);
  if (ageInCandles <= 40) return Math.round(MAX * 0.4);
  return Math.round(MAX * 0.25);
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
): Map<string, ScoredSignal> {
  const algoStats = computeAlgoTfStats(allSignals);
  const scores = new Map<string, ScoredSignal>();

  // Score only active, unresolved signals
  const candidates = allSignals.filter(
    (s) =>
      s.status !== "INACTIVE" &&
      !s.tp1Hit &&
      !s.tp2Hit &&
      !s.tp3Hit &&
      !s.slHitAt,
  );

  for (const signal of candidates) {
    const breakdown: ScoreBreakdown = {
      mtfConfluence: Math.round(scoreMtfConfluence(signal, allSignals)),
      momentum: Math.round(scoreMomentum(signal, allSignals)),
      riskReward: Math.round(scoreRiskReward(signal)),
      algoPerformance: Math.round(scoreAlgoPerformance(signal, algoStats, allSignals)),
      tradeHealth: Math.round(scoreTradeHealth(signal)),
      freshness: Math.round(scoreFreshness(signal)),
    };

    const rawScore = Object.values(breakdown).reduce((a, b) => a + b, 0);

    // Synergy bonus: multiple strong factors compound confidence
    const factorMaxes = [4, 28, 18, 22, 20, 8];
    const factorValues = Object.values(breakdown);
    const strongCount = factorValues.filter(
      (v, i) => v / factorMaxes[i] >= 0.7,
    ).length;
    const synergyBonus = strongCount >= 5 ? 5 : strongCount >= 4 ? 3 : 0;

    const finalScore = Math.min(100, rawScore + synergyBonus);
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
  };
}

