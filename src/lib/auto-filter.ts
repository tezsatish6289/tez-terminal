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

export const AUTO_FILTER_THRESHOLD = 55;
export const STALE_CANDLE_LIMIT = 6;
export const MIN_REGIME_SAMPLE = 5;

// ── Market Regime (Phase 2) ────────────────────────────────

export interface RegimeEntry {
  winRate: number;
  sampleSize: number;
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
const REGIME_STALENESS_MS = 5 * 60 * 1000;
const REGIME_MA_PERIOD = 5;
const SL_WINDOW_CANDLES = 6;

export function isRegimeStale(lastUpdated?: string): boolean {
  if (!lastUpdated) return true;
  return Date.now() - new Date(lastUpdated).getTime() > REGIME_STALENESS_MS;
}

export function getAdjustedThreshold(
  winRate: number,
  sampleSize: number,
  recentSlCount: number = 0,
): number {
  if (sampleSize < MIN_REGIME_SAMPLE) return AUTO_FILTER_THRESHOLD;

  const wrAdjust = (0.5 - winRate) * REGIME_WR_SCALE;
  const slPenalty = Math.min(recentSlCount * REGIME_SL_PENALTY, REGIME_SL_CAP);
  const raw = AUTO_FILTER_THRESHOLD + wrAdjust + slPenalty;

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
          s.receivedAt &&
          now - new Date(s.receivedAt).getTime() < slWindowMs,
      ).length;

      const total = wins + losses;
      if (total < 3 && recentSlCount === 0) continue;

      const winRate = total > 0 ? wins / total : 0.5;
      const sampleSize = total + recentSlCount;

      const key = `${tfId}_${side}`;
      const rawThreshold = getAdjustedThreshold(winRate, sampleSize, recentSlCount);
      const prevHistory = previousRegime?.[key]?.thresholdHistory ?? [];
      const newHistory = [...prevHistory, rawThreshold].slice(-REGIME_MA_PERIOD);
      const smoothed = Math.round(
        newHistory.reduce((a, b) => a + b, 0) / newHistory.length,
      );

      regime[key] = {
        winRate,
        sampleSize,
        wins,
        losses,
        recentSlCount,
        adjustedThreshold: smoothed,
        thresholdHistory: newHistory,
        lastUpdated: new Date().toISOString(),
      };
    }
  }

  return regime;
}

// ── Timeframe metadata ──────────────────────────────────────

const TF_RANK: Record<string, number> = {
  "1": 0, "5": 1, "15": 2, "60": 3, "240": 4, "D": 5,
};

const CANDLE_MINUTES: Record<string, number> = {
  "1": 1, "5": 5, "15": 15, "60": 60, "240": 240, "D": 1440,
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

// ── BTC Sentiment types ─────────────────────────────────────

export interface SentimentReading {
  sentiment: "bullish" | "bearish" | "neutral";
  score: number;
  rawScore: number;
  timeframe: string;
  receivedAt: string;
}

export interface TfSentimentAnalysis {
  current: SentimentReading;
  direction: number;         // +1 bullish, -1 bearish, 0 neutral
  smoothTrend: number;       // rate of change of smooth score
  rawMomentum: number;       // rate of change of raw score
  divergence: number;        // raw - smooth (positive = raw leading up)
  divergenceTrend: number;   // is divergence widening (+) or narrowing (-)
  confidence: number;        // 0-1 how much to trust this reading
}

/**
 * Processes raw sentiment docs into per-timeframe analysis with
 * trend direction, momentum, and raw-vs-smooth divergence.
 */
export function buildSentimentMap(
  readings: SentimentReading[],
): Map<string, TfSentimentAnalysis> {
  const result = new Map<string, TfSentimentAnalysis>();

  // Group by timeframe, sorted newest first
  const byTf = new Map<string, SentimentReading[]>();
  for (const r of readings) {
    if (!byTf.has(r.timeframe)) byTf.set(r.timeframe, []);
    byTf.get(r.timeframe)!.push(r);
  }

  for (const [tf, tfReadings] of byTf) {
    const sorted = tfReadings.sort(
      (a, b) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    );
    if (sorted.length === 0) continue;

    const current = sorted[0];
    const direction =
      current.sentiment === "bullish"
        ? 1
        : current.sentiment === "bearish"
          ? -1
          : 0;

    let smoothTrend = 0;
    let rawMomentum = 0;
    let divergence = current.rawScore - current.score;
    let divergenceTrend = 0;

    if (sorted.length >= 2) {
      const prev = sorted[1];
      smoothTrend = current.score - prev.score;
      rawMomentum = current.rawScore - prev.rawScore;
      const prevDivergence = prev.rawScore - prev.score;
      divergenceTrend = divergence - prevDivergence;
    }

    if (sorted.length >= 3) {
      // Use 3-point average for smoother trend estimation
      const scores = sorted.slice(0, 3).map((r) => r.score);
      const rawScores = sorted.slice(0, 3).map((r) => r.rawScore);
      smoothTrend = (scores[0] - scores[2]) / 2;
      rawMomentum = (rawScores[0] - rawScores[2]) / 2;
    }

    // Confidence based on freshness of the reading
    const ageMs = Date.now() - new Date(current.receivedAt).getTime();
    const candleMins = CANDLE_MINUTES[tf] ?? 15;
    const ageInCandles = ageMs / (candleMins * 60 * 1000);
    const confidence = ageInCandles <= 2 ? 1 : ageInCandles <= 5 ? 0.8 : 0.5;

    result.set(tf, {
      current,
      direction,
      smoothTrend,
      rawMomentum,
      divergence,
      divergenceTrend,
      confidence,
    });
  }

  return result;
}

// ── Factor 1: Multi-Timeframe Confluence (0-25) ─────────────

const TF_IDS_ASCENDING = ["1", "5", "15", "60", "240", "D"];

function scoreMtfConfluence(
  signal: SignalForScoring,
  allSignals: SignalForScoring[],
  btcSentiment: Map<string, TfSentimentAnalysis>,
): number {
  const MAX = 25;
  const signalRank = TF_RANK[signal.timeframe];
  if (signalRank == null) return Math.round(MAX * 0.4);

  const activeSignals = allSignals.filter(
    (s) =>
      s.id !== signal.id &&
      s.status !== "INACTIVE" &&
      !s.slHitAt &&
      TF_RANK[s.timeframe] != null,
  );

  const isBuySignal = signal.type === "BUY";
  let score = 0;

  // ─── A. Same-symbol cross-TF signals (0-4 bonus) ───
  // Rare but valuable when available — kept as a small bonus, not a pillar
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
    score += Math.max(-2, Math.min(4, symScore));
  }

  // ─── B. BTC Sentiment 4D — equal-weight tripod (0-21) ───
  if (btcSentiment.size > 0) {
    const EACH = 7;

    // B1. Same-TF sentiment direction + raw momentum (0-7)
    let b1 = 0;
    const sameTfSent = btcSentiment.get(signal.timeframe);
    if (sameTfSent) {
      const aligned =
        (isBuySignal && sameTfSent.direction === 1) ||
        (!isBuySignal && sameTfSent.direction === -1);
      const opposed =
        (isBuySignal && sameTfSent.direction === -1) ||
        (!isBuySignal && sameTfSent.direction === 1);

      if (aligned) b1 += 4 * sameTfSent.confidence;
      else if (opposed) b1 -= 3 * sameTfSent.confidence;

      // Raw momentum in signal's direction
      const momentumAligned = isBuySignal
        ? sameTfSent.rawMomentum > 0
        : sameTfSent.rawMomentum < 0;
      const momentumOpposed = isBuySignal
        ? sameTfSent.rawMomentum < 0
        : sameTfSent.rawMomentum > 0;
      if (momentumAligned) b1 += 3 * sameTfSent.confidence;
      else if (momentumOpposed) b1 -= 1;
    }
    score += Math.max(-3, Math.min(EACH, Math.round(b1)));

    // B2. Higher-TF sentiment alignment (0-7)
    let b2 = 0;
    const higherTfs = TF_IDS_ASCENDING.filter(
      (tf) => (TF_RANK[tf] ?? 0) > signalRank,
    );
    if (higherTfs.length > 0) {
      let alignedCount = 0;
      let opposedCount = 0;
      let totalWeight = 0;
      for (const htf of higherTfs) {
        const htfSent = btcSentiment.get(htf);
        if (!htfSent) continue;
        const tfGap = (TF_RANK[htf] ?? 0) - signalRank;
        const weight = (1 + tfGap * 0.3) * htfSent.confidence;
        totalWeight += weight;
        const aligned =
          (isBuySignal && htfSent.direction === 1) ||
          (!isBuySignal && htfSent.direction === -1);
        const opposed =
          (isBuySignal && htfSent.direction === -1) ||
          (!isBuySignal && htfSent.direction === 1);
        if (aligned) alignedCount += weight;
        else if (opposed) opposedCount += weight;
      }
      if (totalWeight > 0) {
        const alignRatio = alignedCount / totalWeight;
        const opposeRatio = opposedCount / totalWeight;
        if (alignRatio > 0.7) b2 = EACH;
        else if (alignRatio > 0.5) b2 = EACH * 0.7;
        else if (opposeRatio > 0.7) b2 = -3;
        else if (opposeRatio > 0.5) b2 = -1;
        else b2 = EACH * 0.3;
      }
    }
    score += Math.max(-3, Math.min(EACH, Math.round(b2)));

    // B3. Divergence analysis: raw vs smooth + smooth trend (0-7)
    let b3 = 0;
    const primaryTf = sameTfSent ?? btcSentiment.get("60");
    if (primaryTf) {
      // Divergence: raw leading smooth in signal's direction = strengthening
      const divAligned = isBuySignal
        ? primaryTf.divergence > 0
        : primaryTf.divergence < 0;
      const divOpposed = isBuySignal
        ? primaryTf.divergence < 0
        : primaryTf.divergence > 0;

      if (divAligned) b3 += 2 * primaryTf.confidence;
      else if (divOpposed) b3 -= 1.5 * primaryTf.confidence;

      // Divergence trend: gap widening in signal's direction = accelerating
      const trendWidening = isBuySignal
        ? primaryTf.divergenceTrend > 0
        : primaryTf.divergenceTrend < 0;
      const trendNarrowing = isBuySignal
        ? primaryTf.divergenceTrend < 0
        : primaryTf.divergenceTrend > 0;

      if (trendWidening) b3 += 2 * primaryTf.confidence;
      else if (trendNarrowing) b3 -= 1;

      // Smooth trend confirmation
      const smoothAligned = isBuySignal
        ? primaryTf.smoothTrend > 0
        : primaryTf.smoothTrend < 0;
      if (smoothAligned) b3 += 3 * primaryTf.confidence;
      else b3 -= 1;
    }
    score += Math.max(-3, Math.min(EACH, Math.round(b3)));
  } else {
    // No BTC sentiment data — fall back to signal's aligned flag
    if (signal.aligned) score += 7;
  }

  return Math.max(0, Math.min(MAX, score));
}

// ── Factor 2: Entry Quality & Market Regime (0-25) ──────────

function scoreMomentum(
  signal: SignalForScoring,
  allSignals: SignalForScoring[],
): number {
  const MAX = 25;
  const threshold = PNL_THRESHOLDS[signal.timeframe] ?? 0.5;
  let score = 0;

  // ─── A. 3D Entry Quality (0-10) ───
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
    // Healthy pullback: thesis proven, never showed weakness, near entry
    score += 10;
  } else if (hadPositiveExcursion && neverWentNegative && pnl > 0) {
    // At or near peak with clean history
    score += 9;
  } else if (pnl > 0 && pnl <= threshold) {
    // Small positive, sweet spot for fresh entries
    score += 8;
  } else if (hadPositiveExcursion && neverWentNegative && pnl <= 0 && pnl > -threshold * 0.3) {
    // Pulled back to entry, never negative beyond noise — still healthy
    score += 7;
  } else if (hadPositiveExcursion && !neverWentNegative && pnl > 0) {
    // Volatile but currently positive — went both ways
    score += 5;
  } else if (!hadPositiveExcursion && neverWentNegative) {
    // Fresh/untested — no excursion data yet
    score += 5;
  } else if (pnl > threshold * 2) {
    // Extended — working but late entry risk
    score += 4;
  } else if (hadPositiveExcursion && !neverWentNegative && pnl <= 0) {
    // Was working but went both ways, now flat/negative
    score += 2;
  } else if (pnl > -threshold) {
    // Mildly negative
    score += 2;
  } else {
    // Deep negative, never showed positive excursion
    score += 0;
  }

  // ─── B. Side-Aware Market Regime (0-15) ───
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

  // Same-side performance (0-9)
  if (sameSide.length >= 2) {
    const sameWinning = sameSide.filter((s) => s.pnl > threshold).length;
    const sameLosing = sameSide.filter((s) => s.pnl < -threshold).length;
    const sameWinRate = sameWinning / sameSide.length;
    const sameLossRate = sameLosing / sameSide.length;

    if (sameWinRate > 0.65) regimeScore += 9;
    else if (sameWinRate > 0.5) regimeScore += 7;
    else if (sameWinRate > sameLossRate) regimeScore += 5;
    else if (sameLossRate > 0.65) regimeScore += 0;
    else regimeScore += 3;
  } else {
    regimeScore += 4;
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

  score += Math.max(0, Math.min(15, regimeScore));

  return Math.max(0, Math.min(MAX, score));
}

// ── Factor 3: Risk-Reward Quality (0-15) ────────────────────

function scoreRiskReward(signal: SignalForScoring): number {
  const MAX = 15;

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

// ── Factor 4: Historical Algo Performance (0-15) ────────────

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
  const MAX = 15;
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

// ── Factor 5: Trade Health / Drawdown (0-12) ────────────────

function scoreTradeHealth(signal: SignalForScoring): number {
  const MAX = 12;

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
  btcSentiment?: Map<string, TfSentimentAnalysis>,
): Map<string, ScoredSignal> {
  const algoStats = computeAlgoTfStats(allSignals);
  const sentimentMap = btcSentiment ?? new Map();
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
      mtfConfluence: Math.round(scoreMtfConfluence(signal, allSignals, sentimentMap)),
      momentum: Math.round(scoreMomentum(signal, allSignals)),
      riskReward: Math.round(scoreRiskReward(signal)),
      algoPerformance: Math.round(scoreAlgoPerformance(signal, algoStats, allSignals)),
      tradeHealth: Math.round(scoreTradeHealth(signal)),
      freshness: Math.round(scoreFreshness(signal)),
    };

    const rawScore = Object.values(breakdown).reduce((a, b) => a + b, 0);

    // Synergy bonus: multiple strong factors compound confidence
    const factorMaxes = [25, 25, 15, 15, 12, 8];
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

export function mapFirestoreSentiment(doc: any): SentimentReading {
  return {
    sentiment: doc.sentiment ?? "neutral",
    score: Number(doc.score ?? 0),
    rawScore: Number(doc.rawScore ?? 0),
    timeframe: String(doc.timeframe ?? "15"),
    receivedAt: doc.receivedAt ?? "",
  };
}
