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
 */

export const AUTO_FILTER_THRESHOLD = 55;

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

// ── Factor 1: Multi-Timeframe Confluence (0-25) ─────────────

function scoreMtfConfluence(
  signal: SignalForScoring,
  allSignals: SignalForScoring[],
): number {
  const MAX = 25;
  const signalRank = TF_RANK[signal.timeframe];
  if (signalRank == null) return MAX * 0.4;

  const activeSignals = allSignals.filter(
    (s) =>
      s.id !== signal.id &&
      s.status !== "INACTIVE" &&
      !s.slHitAt &&
      TF_RANK[s.timeframe] != null,
  );

  // Same-symbol signals on other timeframes
  const sameSymbol = activeSignals.filter((s) => s.symbol === signal.symbol);
  const sameSymbolHigher = sameSymbol.filter(
    (s) => TF_RANK[s.timeframe]! > signalRank,
  );
  const sameSymbolLower = sameSymbol.filter(
    (s) => TF_RANK[s.timeframe]! < signalRank,
  );

  let score = 0;

  if (sameSymbol.length > 0) {
    // Higher TF agreement — the most valuable confluence signal
    for (const htf of sameSymbolHigher) {
      if (htf.type === signal.type) {
        const tfGap = TF_RANK[htf.timeframe]! - signalRank;
        score += 7 + tfGap * 2;
      } else {
        score -= 6;
      }
    }

    // Lower TF confirmation — minor but useful
    for (const ltf of sameSymbolLower) {
      score += ltf.type === signal.type ? 3 : -2;
    }
  } else {
    // No same-symbol signals — fall back to market-wide higher-TF direction
    const higherTfAll = activeSignals.filter(
      (s) => TF_RANK[s.timeframe]! > signalRank,
    );
    if (higherTfAll.length >= 3) {
      const aligned = higherTfAll.filter(
        (s) => s.type === signal.type,
      ).length;
      const ratio = aligned / higherTfAll.length;
      if (ratio > 0.65) score += 8;
      else if (ratio > 0.5) score += 5;
      else if (ratio < 0.35) score -= 3;
    }
  }

  // BTC correlation bias (crypto-specific)
  const btcSignals = activeSignals.filter(
    (s) => s.symbol.includes("BTC") && s.symbol !== signal.symbol,
  );
  if (btcSignals.length > 0) {
    const btcWinningBuy = btcSignals.filter(
      (s) => s.type === "BUY" && s.pnl > 0,
    ).length;
    const btcWinningSell = btcSignals.filter(
      (s) => s.type === "SELL" && s.pnl > 0,
    ).length;
    const btcDir = btcWinningBuy >= btcWinningSell ? "BUY" : "SELL";
    score += signal.type === btcDir ? 3 : -2;
  }

  // Sentiment alignment from webhook computation
  if (signal.aligned) score += 4;

  return Math.max(0, Math.min(MAX, score));
}

// ── Factor 2: Momentum & Market Regime (0-25) ──────────────

function scoreMomentum(
  signal: SignalForScoring,
  allSignals: SignalForScoring[],
): number {
  const MAX = 25;
  const threshold = PNL_THRESHOLDS[signal.timeframe] ?? 0.5;
  let score = 0;

  // A. Price action direction (0-12)
  const pnl = signal.pnl;
  if (pnl > threshold * 3) score += 12;
  else if (pnl > threshold * 2) score += 10;
  else if (pnl > threshold) score += 8;
  else if (pnl > 0) score += 5;
  else if (pnl > -threshold * 0.5) score += 3;
  else if (pnl > -threshold) score += 1;

  // B. TP1 progress — how far toward target? (0-5)
  if (signal.tp1 != null && signal.currentPrice != null) {
    const entryToTp1 = Math.abs(signal.tp1 - signal.price);
    const entryToCurrent =
      signal.type === "BUY"
        ? signal.currentPrice - signal.price
        : signal.price - signal.currentPrice;

    if (entryToTp1 > 0) {
      const progress = entryToCurrent / entryToTp1;
      if (progress >= 0.75) score += 5;
      else if (progress >= 0.5) score += 4;
      else if (progress >= 0.25) score += 3;
      else if (progress > 0) score += 2;
    }
  }

  // C. Market regime — overall TF performance (0-8)
  const sameTf = allSignals.filter(
    (s) =>
      s.timeframe === signal.timeframe &&
      s.id !== signal.id &&
      s.status !== "INACTIVE",
  );

  if (sameTf.length >= 3) {
    const winning = sameTf.filter((s) => s.pnl > threshold).length;
    const losing = sameTf.filter((s) => s.pnl < -threshold).length;
    const total = sameTf.length;
    const winRatio = winning / total;
    const lossRatio = losing / total;

    if (winRatio > 0.6) score += 8;
    else if (winRatio > 0.45) score += 6;
    else if (winRatio > lossRatio) score += 4;
    else if (lossRatio > 0.6) score += 1;
    else score += 3;
  } else {
    score += 4;
  }

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
): number {
  const MAX = 15;
  const key = `${signal.algo}|${signal.timeframe}`;
  const stats = statsMap.get(key);

  if (stats && stats.sampleSize >= 3) {
    return scoreFromStats(stats, MAX);
  }

  // Fall back to algo-only stats (aggregate across all TFs)
  let bestAlgoStats: AlgoTfStats | null = null;
  for (const [k, v] of statsMap) {
    if (k.startsWith(signal.algo + "|") && v.sampleSize >= 3) {
      if (!bestAlgoStats || v.sampleSize > bestAlgoStats.sampleSize) {
        bestAlgoStats = v;
      }
    }
  }

  if (bestAlgoStats) return scoreFromStats(bestAlgoStats, MAX);

  return Math.round(MAX * 0.5);
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
      algoPerformance: Math.round(scoreAlgoPerformance(signal, algoStats)),
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
