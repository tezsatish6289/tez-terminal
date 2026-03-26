import { getLeverage } from "./leverage";

// ── Configuration ────────────────────────────────────────────

export const SIM_CONFIG = {
  STARTING_CAPITAL: 1000,
  RISK_PER_TRADE: 0.01,         // 1% of capital
  MAX_OPEN_TRADES: 5,
  CONFIDENCE_MIN: 55,
  CONFIDENCE_MIN_LOW_SAMPLE: 60, // when < 3 active signals on side+TF
  LIVE_WIN_RATE_MIN: 0.65,
  LIVE_WIN_RATE_SAMPLE_MIN: 3,
  ALGO_HIST_WIN_RATE_MIN: 0.60,
  ALGO_HIST_SAMPLE_MIN: 5,
  BIAS_GAP_MIN: 10,             // must exceed this for "Go Bull"/"Go Bear"
  DAILY_DRAWDOWN_LIMIT: 0.03,   // 3% of starting capital
  EXCHANGE_FEE: 0.0005,         // 0.05% per transaction
  TP1_CLOSE_PCT: 0.50,
  TP2_CLOSE_PCT: 0.25,
  TP3_CLOSE_PCT: 0.25,
  // Incubated signal selection
  INCUBATED_SL_CONSUMED_MAX: 0.40,
  INCUBATED_TP1_CONSUMED_MAX: 0.50,
  // Market turn detection (batch layer)
  TURN_LOOKBACK_TF_MULTIPLIER: 3,       // lookback window = timeframe × 3
  TURN_SAME_SIDE_SL_WARN: 0.30,         // 30% same-side SL → warning
  TURN_OPP_SIDE_TP_CONFIRM: 0.25,       // 25% opposite-side TP → confirms turn
  TURN_SINGLE_CONDITION_TRIGGER: 0.50,   // 50% alone triggers exit
  // Individual score degradation
  SCORE_FLOOR: 38,                       // exit if live score drops below this
} as const;

// ── Types ────────────────────────────────────────────────────

export interface SimulatorState {
  capital: number;
  startingCapital: number;
  dailyPnl: number;
  dailyFees: number;
  dailyPnlResetDate: string;    // "2026-03-19"
  coolOffUntil: string | null;
  totalRealizedPnl: number;
  totalFeesPaid: number;
  totalTradesTaken: number;
  totalWins: number;
  totalLosses: number;
  isActive: boolean;
  lastUpdated: string;
}

export interface SimTrade {
  id?: string;
  signalId: string;
  symbol: string;
  side: "BUY" | "SELL";
  timeframe: string;
  algo: string;
  entryPrice: number;
  positionSize: number;
  leverage: number;
  stopLoss: number;
  trailingSl: number | null;
  tp1: number;
  tp2: number;
  tp3: number;
  status: "OPEN" | "CLOSED";
  remainingPct: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  slHit: boolean;
  realizedPnl: number;
  currentPrice: number | null;
  unrealizedPnl: number;
  fees: number;
  confidenceScore: number;
  biasAtEntry: string;
  liveWinRateAtEntry: number;
  algoWinRateAtEntry: number;
  capitalAtEntry: number;
  openedAt: string;
  closedAt: string | null;
  closeReason: string | null;
  events: SimTradeEvent[];
}

export interface SimTradeEvent {
  type: "OPEN" | "TP1" | "TP2" | "TP3" | "SL";
  price: number;
  pnl: number;
  fee: number;
  closePct: number;
  timestamp: string;
}

export interface SimLog {
  timestamp: string;
  action: string;
  details: string;
  signalId?: string;
  symbol?: string;
  capital?: number;
  pnl?: number;
}

export interface TradeEvaluation {
  canTrade: boolean;
  reason: string;
  positionSize?: number;
}

// ── Compute unrealized P&L for an open trade ─────────────────

export function computeUnrealizedPnl(trade: SimTrade, currentPrice: number): number {
  const isBuy = trade.side === "BUY";
  const priceDelta = isBuy
    ? currentPrice - trade.entryPrice
    : trade.entryPrice - currentPrice;
  const pctMove = priceDelta / trade.entryPrice;
  return trade.positionSize * trade.remainingPct * pctMove * trade.leverage;
}

// ── Incubated signal candidate ────────────────────────────────

export interface IncubatedCandidate {
  id: string;
  symbol: string;
  type: "BUY" | "SELL";
  timeframe: string;
  algo: string;
  entryPrice: number;        // original signal entry
  currentPrice: number;      // live market price
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  confidenceScore: number;
  tp1Hit: boolean;
  slHitAt: string | null;
}

export interface IncubatedResult {
  selected: IncubatedCandidate[];
  skipped: { symbol: string; reason: string }[];
}

export function selectIncubatedSignals(params: {
  candidates: IncubatedCandidate[];
  state: SimulatorState;
  bullScore: number;
  bearScore: number;
  openTrades: SimTrade[];
  liveWinRates: Map<string, { winRate: number | null; sampleSize: number }>;
  algoStats: Map<string, { winRate: number | null; sampleSize: number }>;
}): IncubatedResult {
  const { candidates, state, bullScore, bearScore, openTrades, liveWinRates, algoStats } = params;
  const selected: IncubatedCandidate[] = [];
  const skipped: { symbol: string; reason: string }[] = [];

  const currentState = checkDailyReset(state);

  if (!currentState.isActive) return { selected, skipped };

  // Cool-off check
  if (currentState.coolOffUntil && new Date() < new Date(currentState.coolOffUntil)) {
    return { selected, skipped };
  }

  // Bias gate
  const biasGap = bullScore - bearScore;
  const isBullBias = biasGap > SIM_CONFIG.BIAS_GAP_MIN;
  const isBearBias = biasGap < -SIM_CONFIG.BIAS_GAP_MIN;
  if (!isBullBias && !isBearBias) return { selected, skipped };
  const biasedSide = isBullBias ? "BUY" : "SELL";

  const currentOpen = openTrades.filter((t) => t.status === "OPEN");
  const openSymbols = new Set(currentOpen.map((t) => t.symbol));
  const openSignalIds = new Set(currentOpen.map((t) => t.signalId));

  // Sort by confidence score descending — pick the best first
  const sorted = [...candidates].sort((a, b) => b.confidenceScore - a.confidenceScore);

  for (const c of sorted) {
    if (currentOpen.length + selected.length >= SIM_CONFIG.MAX_OPEN_TRADES) break;

    // Already in simulator
    if (openSignalIds.has(c.id)) {
      skipped.push({ symbol: c.symbol, reason: "Already in simulator" });
      continue;
    }

    // Already selected in this batch
    if (selected.some((s) => s.id === c.id)) continue;

    // Side must match bias
    if (c.type !== biasedSide) {
      skipped.push({ symbol: c.symbol, reason: `Side ${c.type} != bias ${biasedSide}` });
      continue;
    }

    // No duplicate symbols
    if (openSymbols.has(c.symbol) || selected.some((s) => s.symbol === c.symbol)) {
      skipped.push({ symbol: c.symbol, reason: "Duplicate symbol" });
      continue;
    }

    // TP1 already hit or SL already hit — skip
    if (c.tp1Hit || c.slHitAt) {
      skipped.push({ symbol: c.symbol, reason: c.slHitAt ? "SL already hit" : "TP1 already hit" });
      continue;
    }

    // Price drift check — dynamic based on SL and TP1 distance
    const isBuy = c.type === "BUY";
    const slDistance = Math.abs(c.entryPrice - c.stopLoss);
    const tp1Distance = Math.abs(c.tp1 - c.entryPrice);

    if (slDistance <= 0 || tp1Distance <= 0) {
      skipped.push({ symbol: c.symbol, reason: "Invalid SL/TP1 distance" });
      continue;
    }

    const priceMovedAgainst = isBuy
      ? c.entryPrice - c.currentPrice
      : c.currentPrice - c.entryPrice;

    if (priceMovedAgainst > 0 && priceMovedAgainst / slDistance > SIM_CONFIG.INCUBATED_SL_CONSUMED_MAX) {
      skipped.push({ symbol: c.symbol, reason: `${(priceMovedAgainst / slDistance * 100).toFixed(0)}% of SL consumed (>${SIM_CONFIG.INCUBATED_SL_CONSUMED_MAX * 100}%)` });
      continue;
    }

    const priceMovedInFavor = isBuy
      ? c.currentPrice - c.entryPrice
      : c.entryPrice - c.currentPrice;

    if (priceMovedInFavor > 0 && priceMovedInFavor / tp1Distance > SIM_CONFIG.INCUBATED_TP1_CONSUMED_MAX) {
      skipped.push({ symbol: c.symbol, reason: `${(priceMovedInFavor / tp1Distance * 100).toFixed(0)}% of TP1 consumed (>${SIM_CONFIG.INCUBATED_TP1_CONSUMED_MAX * 100}%)` });
      continue;
    }

    // Confidence threshold
    const regimeKey = `${c.timeframe}_${c.type}`;
    const liveEntry = liveWinRates.get(regimeKey);
    const liveSampleSize = liveEntry?.sampleSize ?? 0;
    const liveWinRate = liveEntry?.winRate ?? null;

    const minConfidence = liveSampleSize < SIM_CONFIG.LIVE_WIN_RATE_SAMPLE_MIN
      ? SIM_CONFIG.CONFIDENCE_MIN_LOW_SAMPLE
      : SIM_CONFIG.CONFIDENCE_MIN;

    if (c.confidenceScore < minConfidence) {
      skipped.push({ symbol: c.symbol, reason: `Score ${c.confidenceScore} < ${minConfidence}` });
      continue;
    }

    // Live win rate check
    if (liveSampleSize >= SIM_CONFIG.LIVE_WIN_RATE_SAMPLE_MIN) {
      if (liveWinRate != null && liveWinRate < SIM_CONFIG.LIVE_WIN_RATE_MIN) {
        skipped.push({ symbol: c.symbol, reason: `Live WR ${(liveWinRate * 100).toFixed(0)}% < 65% for ${c.type}|${c.timeframe}` });
        continue;
      }
    }

    // Algo historical win rate check
    const algoKey = `${c.algo}|${c.timeframe}`;
    const algoEntry = algoStats.get(algoKey);
    const algoSampleSize = algoEntry?.sampleSize ?? 0;
    const algoWinRate = algoEntry?.winRate ?? null;

    if (algoSampleSize >= SIM_CONFIG.ALGO_HIST_SAMPLE_MIN) {
      if (algoWinRate != null && algoWinRate < SIM_CONFIG.ALGO_HIST_WIN_RATE_MIN) {
        skipped.push({ symbol: c.symbol, reason: `Algo WR ${(algoWinRate * 100).toFixed(0)}% < 60% for ${c.algo}|${c.timeframe}` });
        continue;
      }
    }

    // SL / TP validation
    if (c.stopLoss <= 0 || !c.tp1 || !c.tp2 || !c.tp3) {
      skipped.push({ symbol: c.symbol, reason: "Missing SL/TP levels" });
      continue;
    }

    selected.push(c);
  }

  return { selected, skipped };
}

// ── Trailing SL: move SL to breakeven at 50% of TP1 distance ─

export function computeTrailingSl(trade: SimTrade, currentPrice: number): number | null {
  if (trade.status !== "OPEN") return trade.trailingSl;

  const isBuy = trade.side === "BUY";
  const tp1Distance = Math.abs(trade.tp1 - trade.entryPrice);
  if (tp1Distance <= 0) return trade.trailingSl;

  const priceMovedInFavor = isBuy
    ? currentPrice - trade.entryPrice
    : trade.entryPrice - currentPrice;

  const tp1Progress = priceMovedInFavor / tp1Distance;

  // Once price crosses 50% of entry→TP1, move SL to breakeven
  if (tp1Progress >= 0.50) {
    const currentTrailing = trade.trailingSl;
    // Only move SL in the favorable direction, never back
    if (currentTrailing == null) {
      return trade.entryPrice;
    }
    // Keep the better of existing trailing SL and breakeven
    if (isBuy) {
      return Math.max(currentTrailing, trade.entryPrice);
    } else {
      return Math.min(currentTrailing, trade.entryPrice);
    }
  }

  return trade.trailingSl;
}

// ── Market Turn Detection ────────────────────────────────────

const TF_MINUTES: Record<string, number> = {
  "5": 5, "15": 15, "60": 60, "240": 240, "D": 1440,
};

export interface MarketTurnSignal {
  side: "BUY" | "SELL";
  sameSideSlRate: number;
  oppSideTpRate: number;
  triggered: boolean;
  reason: string;
}

export interface MarketTurnInput {
  symbol: string;
  type: "BUY" | "SELL";
  timeframe: string;
  status: string;
  receivedAt: string;
  slHitAt: string | null;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  confidenceScore: number;
}

export function detectMarketTurn(
  allSignals: MarketTurnInput[],
  side: "BUY" | "SELL",
  timeframe: string,
): MarketTurnSignal {
  const oppSide = side === "BUY" ? "SELL" : "BUY";
  const tfMinutes = TF_MINUTES[timeframe] ?? 60;
  const lookbackMs = tfMinutes * SIM_CONFIG.TURN_LOOKBACK_TF_MULTIPLIER * 60 * 1000;
  const cutoff = Date.now() - lookbackMs;

  const recentSignals = allSignals.filter((s) => {
    const t = new Date(s.receivedAt).getTime();
    return t >= cutoff && s.timeframe === timeframe;
  });

  const sameSide = recentSignals.filter((s) => s.type === side);
  const oppositeSide = recentSignals.filter((s) => s.type === oppSide);

  const sameSideSlCount = sameSide.filter((s) => s.slHitAt != null).length;
  const sameSideTotal = sameSide.length;
  const sameSideSlRate = sameSideTotal > 0 ? sameSideSlCount / sameSideTotal : 0;

  const oppTpCount = oppositeSide.filter((s) => s.tp1Hit || s.tp2Hit || s.tp3Hit).length;
  const oppTotal = oppositeSide.length;
  const oppTpRate = oppTotal > 0 ? oppTpCount / oppTotal : 0;

  // Confirmed turn: both conditions met
  if (sameSideSlRate >= SIM_CONFIG.TURN_SAME_SIDE_SL_WARN && oppTpRate >= SIM_CONFIG.TURN_OPP_SIDE_TP_CONFIRM) {
    return {
      side,
      sameSideSlRate,
      oppSideTpRate: oppTpRate,
      triggered: true,
      reason: `Confirmed turn: ${(sameSideSlRate * 100).toFixed(0)}% same-side SL (${sameSideSlCount}/${sameSideTotal}) + ${(oppTpRate * 100).toFixed(0)}% opp-side TP (${oppTpCount}/${oppTotal}) in ${timeframe} lookback`,
    };
  }

  // Single condition at high rate
  if (sameSideSlRate >= SIM_CONFIG.TURN_SINGLE_CONDITION_TRIGGER) {
    return {
      side,
      sameSideSlRate,
      oppSideTpRate: oppTpRate,
      triggered: true,
      reason: `High SL rate: ${(sameSideSlRate * 100).toFixed(0)}% same-side SL (${sameSideSlCount}/${sameSideTotal}) in ${timeframe} lookback`,
    };
  }

  if (oppTpRate >= SIM_CONFIG.TURN_SINGLE_CONDITION_TRIGGER) {
    return {
      side,
      sameSideSlRate,
      oppSideTpRate: oppTpRate,
      triggered: true,
      reason: `High opp TP rate: ${(oppTpRate * 100).toFixed(0)}% opp-side TP (${oppTpCount}/${oppTotal}) in ${timeframe} lookback`,
    };
  }

  return {
    side,
    sameSideSlRate,
    oppSideTpRate: oppTpRate,
    triggered: false,
    reason: `No turn: ${(sameSideSlRate * 100).toFixed(0)}% SL, ${(oppTpRate * 100).toFixed(0)}% opp TP`,
  };
}

// ── Helper: get today's date string in UTC ───────────────────

function utcDateString(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

// ── Initialize simulator state ───────────────────────────────

export function createInitialState(): SimulatorState {
  return {
    capital: SIM_CONFIG.STARTING_CAPITAL,
    startingCapital: SIM_CONFIG.STARTING_CAPITAL,
    dailyPnl: 0,
    dailyFees: 0,
    dailyPnlResetDate: utcDateString(),
    coolOffUntil: null,
    totalRealizedPnl: 0,
    totalFeesPaid: 0,
    totalTradesTaken: 0,
    totalWins: 0,
    totalLosses: 0,
    isActive: true,
    lastUpdated: new Date().toISOString(),
  };
}

// ── Daily reset check ────────────────────────────────────────

export function checkDailyReset(state: SimulatorState): SimulatorState {
  const today = utcDateString();
  if (state.dailyPnlResetDate !== today) {
    return {
      ...state,
      dailyPnl: 0,
      dailyFees: 0,
      dailyPnlResetDate: today,
      coolOffUntil: null,
    };
  }
  return state;
}

// ── Evaluate whether to take a trade ─────────────────────────

export function evaluateTrade(params: {
  state: SimulatorState;
  signal: {
    id: string;
    symbol: string;
    type: "BUY" | "SELL";
    timeframe: string;
    algo: string;
    price: number;
    stopLoss: number | null;
    tp1: number | null;
    tp2: number | null;
    tp3: number | null;
    confidenceScore: number;
  };
  bullScore: number;
  bearScore: number;
  liveWinRate: number | null;
  liveSampleSize: number;
  algoWinRate: number | null;
  algoSampleSize: number;
  openTrades: SimTrade[];
}): TradeEvaluation {
  const { state, signal, bullScore, bearScore, liveWinRate, liveSampleSize, algoWinRate, algoSampleSize, openTrades } = params;

  if (!state.isActive) {
    return { canTrade: false, reason: "Simulator is paused" };
  }

  // Daily reset
  const currentState = checkDailyReset(state);

  // Cool-off check
  if (currentState.coolOffUntil) {
    const coolOffEnd = new Date(currentState.coolOffUntil);
    if (new Date() < coolOffEnd) {
      return { canTrade: false, reason: `Cool-off active until ${currentState.coolOffUntil}` };
    }
  }

  // Bias gate: must have clear directional bias
  const biasGap = bullScore - bearScore;
  const isBullBias = biasGap > SIM_CONFIG.BIAS_GAP_MIN;
  const isBearBias = biasGap < -SIM_CONFIG.BIAS_GAP_MIN;

  if (!isBullBias && !isBearBias) {
    return { canTrade: false, reason: `No clear bias (bull=${bullScore} bear=${bearScore} gap=${Math.abs(biasGap)})` };
  }

  // Signal must match bias side
  const biasedSide = isBullBias ? "BUY" : "SELL";
  if (signal.type !== biasedSide) {
    return { canTrade: false, reason: `Signal is ${signal.type} but bias favors ${biasedSide}` };
  }

  // Confidence check
  const minConfidence = liveSampleSize < SIM_CONFIG.LIVE_WIN_RATE_SAMPLE_MIN
    ? SIM_CONFIG.CONFIDENCE_MIN_LOW_SAMPLE
    : SIM_CONFIG.CONFIDENCE_MIN;

  if (signal.confidenceScore < minConfidence) {
    return { canTrade: false, reason: `Score ${signal.confidenceScore} < ${minConfidence} threshold` };
  }

  // Live win rate check (if enough samples)
  if (liveSampleSize >= SIM_CONFIG.LIVE_WIN_RATE_SAMPLE_MIN) {
    if (liveWinRate != null && liveWinRate < SIM_CONFIG.LIVE_WIN_RATE_MIN) {
      return { canTrade: false, reason: `Live win rate ${(liveWinRate * 100).toFixed(0)}% < 65% for ${signal.type} on ${signal.timeframe}` };
    }
  }

  // Algo historical win rate check (if enough samples)
  if (algoSampleSize >= SIM_CONFIG.ALGO_HIST_SAMPLE_MIN) {
    if (algoWinRate != null && algoWinRate < SIM_CONFIG.ALGO_HIST_WIN_RATE_MIN) {
      return { canTrade: false, reason: `Algo historical win rate ${(algoWinRate * 100).toFixed(0)}% < 60% for ${signal.algo}|${signal.timeframe}` };
    }
  }

  // Max open trades
  const currentOpen = openTrades.filter((t) => t.status === "OPEN");
  if (currentOpen.length >= SIM_CONFIG.MAX_OPEN_TRADES) {
    return { canTrade: false, reason: `Max open trades reached (${currentOpen.length}/${SIM_CONFIG.MAX_OPEN_TRADES})` };
  }

  // Duplicate symbol
  if (currentOpen.some((t) => t.symbol === signal.symbol)) {
    return { canTrade: false, reason: `Already have open trade on ${signal.symbol}` };
  }

  // SL validation
  if (signal.stopLoss == null || signal.stopLoss <= 0) {
    return { canTrade: false, reason: "No valid stop loss" };
  }

  if (signal.tp1 == null || signal.tp2 == null || signal.tp3 == null) {
    return { canTrade: false, reason: "Missing TP levels" };
  }

  // Position sizing: risk 1% of capital
  const isBuy = signal.type === "BUY";
  const slDistancePct = isBuy
    ? (signal.price - signal.stopLoss) / signal.price
    : (signal.stopLoss - signal.price) / signal.price;

  if (slDistancePct <= 0) {
    return { canTrade: false, reason: "Invalid SL distance" };
  }

  const leverage = getLeverage(signal.timeframe);
  const riskAmount = currentState.capital * SIM_CONFIG.RISK_PER_TRADE;
  const positionSize = riskAmount / (slDistancePct * leverage);

  if (positionSize > currentState.capital * 0.5) {
    return { canTrade: false, reason: `Position size $${positionSize.toFixed(2)} exceeds 50% of capital` };
  }

  if (positionSize < 1) {
    return { canTrade: false, reason: "Position size too small" };
  }

  return {
    canTrade: true,
    reason: "All checks passed",
    positionSize: Math.round(positionSize * 100) / 100,
  };
}

// ── Open a trade ─────────────────────────────────────────────

export function openTrade(params: {
  signal: {
    id: string;
    symbol: string;
    type: "BUY" | "SELL";
    timeframe: string;
    algo: string;
    price: number;
    stopLoss: number;
    tp1: number;
    tp2: number;
    tp3: number;
    confidenceScore: number;
  };
  positionSize: number;
  state: SimulatorState;
  bullScore: number;
  bearScore: number;
  liveWinRate: number;
  algoWinRate: number;
}): { trade: SimTrade; updatedState: SimulatorState; log: SimLog } {
  const { signal, positionSize, state, bullScore, bearScore, liveWinRate, algoWinRate } = params;
  const leverage = getLeverage(signal.timeframe);
  const entryFee = positionSize * SIM_CONFIG.EXCHANGE_FEE;
  const biasLabel = bullScore > bearScore ? "Go Bull" : "Go Bear";

  const trade: SimTrade = {
    signalId: signal.id,
    symbol: signal.symbol,
    side: signal.type,
    timeframe: signal.timeframe,
    algo: signal.algo,
    entryPrice: signal.price,
    positionSize,
    leverage,
    stopLoss: signal.stopLoss,
    trailingSl: null,
    tp1: signal.tp1,
    tp2: signal.tp2,
    tp3: signal.tp3,
    status: "OPEN",
    remainingPct: 1.0,
    tp1Hit: false,
    tp2Hit: false,
    tp3Hit: false,
    slHit: false,
    realizedPnl: 0,
    currentPrice: signal.price,
    unrealizedPnl: 0,
    fees: entryFee,
    confidenceScore: signal.confidenceScore,
    biasAtEntry: biasLabel,
    liveWinRateAtEntry: liveWinRate,
    algoWinRateAtEntry: algoWinRate,
    capitalAtEntry: state.capital,
    openedAt: new Date().toISOString(),
    closedAt: null,
    closeReason: null,
    events: [{
      type: "OPEN",
      price: signal.price,
      pnl: 0,
      fee: entryFee,
      closePct: 0,
      timestamp: new Date().toISOString(),
    }],
  };

  const updatedState: SimulatorState = {
    ...state,
    capital: state.capital - entryFee,
    dailyFees: state.dailyFees + entryFee,
    totalFeesPaid: state.totalFeesPaid + entryFee,
    totalTradesTaken: state.totalTradesTaken + 1,
    lastUpdated: new Date().toISOString(),
  };

  const log: SimLog = {
    timestamp: new Date().toISOString(),
    action: "TRADE_OPENED",
    details: `${signal.type} ${signal.symbol} on ${signal.timeframe} | size=$${positionSize.toFixed(2)} lev=${leverage}x score=${signal.confidenceScore} bias=${biasLabel} fee=$${entryFee.toFixed(4)}`,
    signalId: signal.id,
    symbol: signal.symbol,
    capital: updatedState.capital,
  };

  return { trade, updatedState, log };
}

// ── Process a TP/SL hit on a simulator trade ─────────────────

export function processTradeExit(params: {
  trade: SimTrade;
  state: SimulatorState;
  exitType: "TP1" | "TP2" | "TP3" | "SL";
  exitPrice: number;
}): { updatedTrade: SimTrade; updatedState: SimulatorState; log: SimLog } | null {
  const { trade, state, exitType, exitPrice } = params;

  if (trade.status === "CLOSED") return null;

  const isBuy = trade.side === "BUY";
  const pricePnlPct = isBuy
    ? (exitPrice - trade.entryPrice) / trade.entryPrice
    : (trade.entryPrice - exitPrice) / trade.entryPrice;

  let closePct: number;
  let newTp1Hit = trade.tp1Hit;
  let newTp2Hit = trade.tp2Hit;
  let newTp3Hit = trade.tp3Hit;
  let newSlHit = trade.slHit;

  switch (exitType) {
    case "TP1":
      if (trade.tp1Hit) return null;
      closePct = SIM_CONFIG.TP1_CLOSE_PCT;
      newTp1Hit = true;
      break;
    case "TP2":
      if (trade.tp2Hit) return null;
      closePct = SIM_CONFIG.TP2_CLOSE_PCT;
      newTp2Hit = true;
      break;
    case "TP3":
      if (trade.tp3Hit) return null;
      closePct = trade.remainingPct; // close everything remaining
      newTp3Hit = true;
      break;
    case "SL":
      closePct = trade.remainingPct; // close everything remaining
      newSlHit = true;
      break;
    default:
      return null;
  }

  const closingSize = trade.positionSize * closePct;
  const pnl = closingSize * pricePnlPct * trade.leverage;
  const exitFee = closingSize * SIM_CONFIG.EXCHANGE_FEE;
  const netPnl = pnl - exitFee;

  const newRemainingPct = exitType === "SL" || exitType === "TP3"
    ? 0
    : trade.remainingPct - closePct;

  const isClosed = newRemainingPct <= 0.001;
  const isWin = exitType !== "SL";

  const event: SimTradeEvent = {
    type: exitType,
    price: exitPrice,
    pnl: netPnl,
    fee: exitFee,
    closePct,
    timestamp: new Date().toISOString(),
  };

  const updatedTrade: SimTrade = {
    ...trade,
    tp1Hit: newTp1Hit,
    tp2Hit: newTp2Hit,
    tp3Hit: newTp3Hit,
    slHit: newSlHit,
    remainingPct: Math.max(0, newRemainingPct),
    realizedPnl: trade.realizedPnl + netPnl,
    currentPrice: exitPrice,
    unrealizedPnl: isClosed ? 0 : trade.unrealizedPnl,
    fees: trade.fees + exitFee,
    status: isClosed ? "CLOSED" : "OPEN",
    closedAt: isClosed ? new Date().toISOString() : trade.closedAt,
    closeReason: isClosed ? exitType : trade.closeReason,
    events: [...trade.events, event],
  };

  const newDailyPnl = state.dailyPnl + netPnl;
  const drawdownTriggered = newDailyPnl <= -(state.startingCapital * SIM_CONFIG.DAILY_DRAWDOWN_LIMIT);

  // Cool-off: rest of the day (midnight UTC)
  let coolOffUntil = state.coolOffUntil;
  if (drawdownTriggered && !coolOffUntil) {
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    coolOffUntil = tomorrow.toISOString();
  }

  const updatedState: SimulatorState = {
    ...state,
    capital: state.capital + netPnl,
    dailyPnl: newDailyPnl,
    dailyFees: state.dailyFees + exitFee,
    totalRealizedPnl: state.totalRealizedPnl + netPnl,
    totalFeesPaid: state.totalFeesPaid + exitFee,
    totalWins: state.totalWins + (isClosed && isWin ? 1 : 0),
    totalLosses: state.totalLosses + (isClosed && !isWin ? 1 : 0),
    coolOffUntil,
    lastUpdated: new Date().toISOString(),
  };

  const log: SimLog = {
    timestamp: new Date().toISOString(),
    action: exitType === "SL" ? "SL_HIT" : "TP_HIT",
    details: `${exitType} on ${trade.symbol} | closed ${(closePct * 100).toFixed(0)}% @ $${exitPrice.toFixed(4)} pnl=$${netPnl.toFixed(4)} fee=$${exitFee.toFixed(4)}${drawdownTriggered ? " ⚠️ COOL-OFF ACTIVATED" : ""}`,
    signalId: trade.signalId,
    symbol: trade.symbol,
    capital: updatedState.capital,
    pnl: netPnl,
  };

  return { updatedTrade, updatedState, log };
}
