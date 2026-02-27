/**
 * Recency-Weighted Market Sentiment Engine
 *
 * ## Problem
 * Flat win/loss counting treats a 10-day-old scalping signal the same as one
 * from 5 minutes ago. In crypto, momentum shifts fast — stale signals should
 * not drive the sentiment label.
 *
 * ## Solution: Exponential Decay Weighted Average PnL
 *
 * Each active signal gets a weight based on its age:
 *
 *   weight = 0.5 ^ (ageMs / halfLifeMs)
 *
 * The half-life is derived from the candle duration:
 *
 *   halfLifeMs = candleMinutes × K × 60 × 1000
 *
 * K is a single tunable constant (admin-adjustable, default 7).
 *   - Lower K → faster reaction, more noise
 *   - Higher K → smoother, slower reaction
 *
 * With K=7:
 *   5min  → half-life  35 min  (reads last ~1-2 hours)
 *   15min → half-life 105 min  (reads last ~3-4 hours)
 *   1hr   → half-life   7 hrs  (reads last ~1 day)
 *   4hr   → half-life  28 hrs  (reads last ~2-3 days)
 *   Daily → half-life   7 days (reads last ~2-3 weeks)
 *
 * ## Scoring
 *
 * For each timeframe, signals are split by side (BUY / SELL).
 * Per side we compute:
 *
 *   weightedPnlSum += weight × pnl
 *   totalWeight    += weight
 *   score = weightedPnlSum / totalWeight   (if totalWeight >= MIN_WEIGHT)
 *
 * Weighted average (not sum) so results are comparable regardless of signal
 * count.
 *
 * ## Classification
 *
 * Each side is classified using a per-timeframe PnL threshold:
 *   - Winning:  score > +threshold
 *   - Losing:   score < -threshold
 *   - Flat:     in between
 *   - Unknown:  totalWeight < MIN_WEIGHT (insufficient recent data)
 *
 * PnL thresholds per timeframe:
 *   5min: ±0.3%  |  15min: ±0.5%  |  1hr: ±1.0%  |  4hr: ±2.0%  |  D: ±3.0%
 *
 * ## Label Mapping
 *
 *   Bulls      | Bears       | Label
 *   -----------|-------------|-------------------
 *   Winning    | Losing      | Bulls in control
 *   Winning    | Flat/Unknown| Bulls in control
 *   Flat       | Losing      | Bulls taking over
 *   Unknown    | Losing      | Bulls taking over
 *   Losing     | Winning     | Bears in control
 *   Flat/Unkn  | Winning     | Bears in control
 *   Losing     | Flat        | Bears taking over
 *   Losing     | Unknown     | Bears taking over
 *   Winning    | Winning     | Both winning
 *   Losing     | Losing      | Choppy market
 *   everything else          | No clear trend
 */

const MIN_WEIGHT = 1.5;

const DEFAULT_K = 7;

const PNL_THRESHOLDS: Record<string, number> = {
  "5": 0.3,
  "15": 0.5,
  "60": 1.0,
  "240": 2.0,
  "D": 3.0,
};

type SideClassification = "winning" | "losing" | "flat" | "unknown";

interface SideScore {
  weightedPnlSum: number;
  totalWeight: number;
  classification: SideClassification;
}

export interface SentimentResult {
  label: string;
  color: string;
  bullScore: SideScore;
  bearScore: SideScore;
}

export interface SignalForSentiment {
  type: "BUY" | "SELL";
  receivedAt: string;
  currentPrice: number | null | undefined;
  price: number;
}

function getCandleMinutes(timeframeId: string): number {
  if (timeframeId === "D") return 1440;
  return Number(timeframeId) || 15;
}

function calculatePnl(
  currentPrice: number | null | undefined,
  entry: number,
  type: string,
): number {
  if (currentPrice == null || !entry || entry === 0) return 0;
  const diff = type === "BUY" ? currentPrice - entry : entry - currentPrice;
  return (diff / entry) * 100;
}

function classifySide(
  weightedPnlSum: number,
  totalWeight: number,
  threshold: number,
): SideScore {
  if (totalWeight < MIN_WEIGHT) {
    return { weightedPnlSum, totalWeight, classification: "unknown" };
  }
  const avg = weightedPnlSum / totalWeight;
  let classification: SideClassification = "flat";
  if (avg > threshold) classification = "winning";
  else if (avg < -threshold) classification = "losing";
  return { weightedPnlSum, totalWeight, classification };
}

export function computeSentiment(
  signals: SignalForSentiment[],
  timeframeId: string,
  k: number = DEFAULT_K,
): SentimentResult {
  const now = Date.now();
  const candleMinutes = getCandleMinutes(timeframeId);
  const halfLifeMs = candleMinutes * k * 60 * 1000;
  const threshold = PNL_THRESHOLDS[timeframeId] ?? 0.5;

  let bullPnlSum = 0;
  let bullWeight = 0;
  let bearPnlSum = 0;
  let bearWeight = 0;

  for (const signal of signals) {
    const ageMs = now - new Date(signal.receivedAt).getTime();
    if (ageMs < 0) continue;
    const weight = Math.pow(0.5, ageMs / halfLifeMs);
    const pnl = calculatePnl(signal.currentPrice, signal.price, signal.type);

    if (signal.type === "BUY") {
      bullPnlSum += weight * pnl;
      bullWeight += weight;
    } else {
      bearPnlSum += weight * pnl;
      bearWeight += weight;
    }
  }

  const bullScore = classifySide(bullPnlSum, bullWeight, threshold);
  const bearScore = classifySide(bearPnlSum, bearWeight, threshold);

  const { label, color } = mapToLabel(bullScore.classification, bearScore.classification);
  return { label, color, bullScore, bearScore };
}

function mapToLabel(
  bull: SideClassification,
  bear: SideClassification,
): { label: string; color: string } {
  // Bulls dominant
  if (bull === "winning" && (bear === "losing" || bear === "flat" || bear === "unknown"))
    return { label: "Bulls in control", color: "text-positive" };

  // Bulls emerging
  if ((bull === "flat" || bull === "unknown") && bear === "losing")
    return { label: "Bulls taking over", color: "text-positive/70" };

  // Bears dominant
  if (bear === "winning" && (bull === "losing" || bull === "flat" || bull === "unknown"))
    return { label: "Bears in control", color: "text-negative" };

  // Bears emerging
  if ((bear === "flat" || bear === "unknown") && bull === "losing")
    return { label: "Bears taking over", color: "text-negative/70" };

  // Both sides winning
  if (bull === "winning" && bear === "winning")
    return { label: "Both winning", color: "text-amber-400" };

  // Both sides losing
  if (bull === "losing" && bear === "losing")
    return { label: "Choppy market", color: "text-muted-foreground" };

  return { label: "No clear trend", color: "text-muted-foreground" };
}
