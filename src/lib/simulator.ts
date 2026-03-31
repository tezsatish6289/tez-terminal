import { getLeverage } from "./leverage";

// ── Configuration ────────────────────────────────────────────

export const SIM_CONFIG = {
  STARTING_CAPITAL: 1000,
  RISK_PER_TRADE_BASE: 0.01,    // 1% base risk
  RISK_PER_TRADE_STREAK: 0.015, // 1.5% risk when streak is active
  MAX_OPEN_TRADES_BASE: 3,      // start with 3, scales with streak
  MAX_OPEN_TRADES_CAP: 6,       // hard cap
  STREAK_WINS_TO_SCALE: 2,      // 2 consecutive wins → +1 max trade
  CONFIDENCE_MIN: 45,
  CONFIDENCE_MIN_LOW_SAMPLE: 50,
  LIVE_WIN_RATE_SAMPLE_MIN: 3,
  EXCHANGE_FEE: 0.00055,         // Bybit standard taker fee (0.055%)
  TP1_CLOSE_PCT: 0.20,
  TP2_CLOSE_PCT: 0.0,
  TP3_CLOSE_PCT: 0.0,
  // Incubated signal selection
  INCUBATED_SL_CONSUMED_MAX: 0.50,
  INCUBATED_TP1_CONSUMED_MAX: 0.65,
  // Market turn detection (batch layer)
  TURN_LOOKBACK_TF_MULTIPLIER: 3,       // lookback window = timeframe × 3
  TURN_SAME_SIDE_SL_WARN: 0.30,         // 30% same-side SL → warning
  TURN_OPP_SIDE_TP_CONFIRM: 0.25,       // 25% opposite-side TP → confirms turn
  TURN_SINGLE_CONDITION_TRIGGER: 0.50,   // 50% alone triggers exit
} as const;

export type SimConfigType = typeof SIM_CONFIG;

/**
 * Merge hardcoded defaults with Firestore overrides.
 * Callers read `config/simulator_params` once and pass overrides here.
 */
export function getEffectiveSimConfig(
  overrides?: Partial<Record<keyof SimConfigType, number>>,
): SimConfigType {
  if (!overrides || Object.keys(overrides).length === 0) return SIM_CONFIG;
  const merged = { ...SIM_CONFIG } as Record<string, number>;
  for (const [k, v] of Object.entries(overrides)) {
    if (k in SIM_CONFIG && typeof v === "number") merged[k] = v;
  }
  return merged as unknown as SimConfigType;
}

// ── Types ────────────────────────────────────────────────────

export interface SimulatorState {
  capital: number;
  startingCapital: number;
  dailyPnl: number;
  dailyFees: number;
  dailyPnlResetDate: string;    // "2026-03-19"
  coolOffUntil: string | null;  // kept for backward compat, no longer used
  totalRealizedPnl: number;
  totalFeesPaid: number;
  totalTradesTaken: number;
  totalWins: number;
  totalLosses: number;
  isActive: boolean;
  lastUpdated: string;
  // Adaptive streak tracking
  consecutiveWins: number;      // current win streak on streakSide
  streakSide: "BUY" | "SELL" | null;
  currentMaxTrades: number;     // dynamic max open trades (1 → scales with streak)
}

export interface SimTrade {
  id?: string;
  signalId: string;
  symbol: string;
  exchange: string;
  assetType: string;
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
  highWatermark: number | null;
  unrealizedPnl: number;
  fees: number;
  confidenceScore: number;
  currentScore: number | null;
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
  type: "OPEN" | "TP1" | "TP2" | "TP3" | "SL" | "SL_TO_BE";
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
  assetType?: string;
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
  exchange: string;
  assetType: string;
  type: "BUY" | "SELL";
  timeframe: string;
  algo: string;
  receivedAt: string;        // signal creation time, used for age-based log dedup
  entryPrice: number;        // original signal entry
  currentPrice: number;      // live market price
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  confidenceScore: number;
  tp1Hit: boolean;
  tp2Hit: boolean;           // permanently ineligible if true
  slHitAt: string | null;
  scorePattern?: "A" | "B" | "none" | "early"; // from scoring engine breakdown
  rrGateFailed?: boolean;    // true if dynamic RR gate capped the score
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
  simConfig?: SimConfigType;
}): IncubatedResult {
  const { candidates, state, bullScore, bearScore, openTrades, liveWinRates, algoStats } = params;
  const cfg = params.simConfig ?? SIM_CONFIG;
  const selected: IncubatedCandidate[] = [];
  const skipped: { symbol: string; reason: string }[] = [];

  const currentState = checkDailyReset(state);

  if (!currentState.isActive) return { selected, skipped };

  const maxTrades = currentState.currentMaxTrades ?? cfg.MAX_OPEN_TRADES_BASE;
  const currentOpen = openTrades.filter((t) => t.status === "OPEN");
  const openSymbols = new Set(currentOpen.map((t) => t.symbol));
  const openSignalIds = new Set(currentOpen.map((t) => t.signalId));

  // Sort by confidence score descending — pick the best first
  const sorted = [...candidates].sort((a, b) => b.confidenceScore - a.confidenceScore);

  for (const c of sorted) {
    if (currentOpen.length + selected.length >= maxTrades) break;

    // Already in simulator
    if (openSignalIds.has(c.id)) {
      skipped.push({ symbol: c.symbol, reason: "Already in simulator" });
      continue;
    }

    // Already selected in this batch
    if (selected.some((s) => s.id === c.id)) continue;

    // No duplicate symbols
    if (openSymbols.has(c.symbol) || selected.some((s) => s.symbol === c.symbol)) {
      skipped.push({ symbol: c.symbol, reason: "Duplicate symbol" });
      continue;
    }

    // TP1, TP2, or SL already hit — permanently ineligible, no log
    if (c.tp1Hit || c.tp2Hit || c.slHitAt) continue;

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

    if (priceMovedAgainst > 0 && priceMovedAgainst / slDistance > cfg.INCUBATED_SL_CONSUMED_MAX) {
      skipped.push({ symbol: c.symbol, reason: `${(priceMovedAgainst / slDistance * 100).toFixed(0)}% of SL consumed (>${cfg.INCUBATED_SL_CONSUMED_MAX * 100}%)` });
      continue;
    }

    const priceMovedInFavor = isBuy
      ? c.currentPrice - c.entryPrice
      : c.entryPrice - c.currentPrice;

    if (priceMovedInFavor > 0 && priceMovedInFavor / tp1Distance > cfg.INCUBATED_TP1_CONSUMED_MAX) {
      skipped.push({ symbol: c.symbol, reason: `${(priceMovedInFavor / tp1Distance * 100).toFixed(0)}% of TP1 consumed (>${cfg.INCUBATED_TP1_CONSUMED_MAX * 100}%)` });
      continue;
    }

    // Confidence threshold
    const regimeKey = `${c.timeframe}_${c.type}`;
    const liveEntry = liveWinRates.get(regimeKey);
    const liveSampleSize = liveEntry?.sampleSize ?? 0;
    const liveWinRate = liveEntry?.winRate ?? null;

    const minConfidence = liveSampleSize < cfg.LIVE_WIN_RATE_SAMPLE_MIN
      ? cfg.CONFIDENCE_MIN_LOW_SAMPLE
      : cfg.CONFIDENCE_MIN;

    if (c.confidenceScore < minConfidence) {
      let scoreNote = "";
      if (c.rrGateFailed) {
        scoreNote = " — RR gate: not enough upside to TP2";
      } else if (c.scorePattern === "early") {
        scoreNote = " — too early, snapshots accumulating";
      } else if (c.scorePattern === "none") {
        scoreNote = " — no price structure pattern yet";
      } else if (c.scorePattern === "A" || c.scorePattern === "B") {
        scoreNote = ` — pattern ${c.scorePattern} but RR insufficient`;
      }
      skipped.push({ symbol: c.symbol, reason: `Score ${c.confidenceScore} < ${minConfidence}${scoreNote}` });
      continue;
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

  if (tp1Progress < 0.50) return trade.trailingSl;

  let idealSl: number;

  if (isBuy) {
    if (currentPrice >= trade.tp3 && trade.highWatermark != null && trade.highWatermark > trade.tp3) {
      idealSl = trade.highWatermark - (trade.tp3 - trade.tp2);
    } else if (currentPrice >= trade.tp3) {
      idealSl = trade.tp2;
    } else if (currentPrice >= trade.tp2) {
      idealSl = trade.tp1;
    } else {
      idealSl = trade.entryPrice;
    }
    return trade.trailingSl != null ? Math.max(trade.trailingSl, idealSl) : idealSl;
  } else {
    if (currentPrice <= trade.tp3 && trade.highWatermark != null && trade.highWatermark < trade.tp3) {
      idealSl = trade.highWatermark + (trade.tp2 - trade.tp3);
    } else if (currentPrice <= trade.tp3) {
      idealSl = trade.tp2;
    } else if (currentPrice <= trade.tp2) {
      idealSl = trade.tp1;
    } else {
      idealSl = trade.entryPrice;
    }
    return trade.trailingSl != null ? Math.min(trade.trailingSl, idealSl) : idealSl;
  }
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

// ── Asset-type-specific starting capital ─────────────────────

const STARTING_CAPITAL: Record<string, number> = {
  CRYPTO: 1000,         // USDT
  INDIAN_STOCKS: 100000, // INR
  COMMODITIES: 100000,   // INR
};

// ── Simulator state Firestore doc path ───────────────────────

export function getSimStateDocId(assetType?: string): string {
  if (!assetType || assetType === "CRYPTO") return "simulator_state";
  return `simulator_state_${assetType}`;
}

// ── Initialize simulator state ───────────────────────────────

export function createInitialState(assetType?: string): SimulatorState {
  const capital = STARTING_CAPITAL[assetType ?? "CRYPTO"] ?? SIM_CONFIG.STARTING_CAPITAL;
  return {
    capital,
    startingCapital: capital,
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
    consecutiveWins: 0,
    streakSide: null,
    currentMaxTrades: SIM_CONFIG.MAX_OPEN_TRADES_BASE,
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
  simConfig?: SimConfigType;
}): TradeEvaluation {
  const { state, signal, bullScore, bearScore, liveWinRate, liveSampleSize, algoWinRate, algoSampleSize, openTrades } = params;
  const cfg = params.simConfig ?? SIM_CONFIG;

  if (!state.isActive) {
    return { canTrade: false, reason: "Simulator is paused" };
  }

  // Daily reset
  const currentState = checkDailyReset(state);

  // Confidence check
  const minConfidence = liveSampleSize < cfg.LIVE_WIN_RATE_SAMPLE_MIN
    ? cfg.CONFIDENCE_MIN_LOW_SAMPLE
    : cfg.CONFIDENCE_MIN;

  if (signal.confidenceScore < minConfidence) {
    return { canTrade: false, reason: `Score ${signal.confidenceScore} < ${minConfidence} threshold` };
  }

  // Adaptive max open trades: based on streak
  const maxTrades = currentState.currentMaxTrades ?? cfg.MAX_OPEN_TRADES_BASE;
  const currentOpen = openTrades.filter((t) => t.status === "OPEN");
  if (currentOpen.length >= maxTrades) {
    return { canTrade: false, reason: `Max open trades reached (${currentOpen.length}/${maxTrades}, streak: ${currentState.consecutiveWins ?? 0})` };
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

  // Adaptive risk: 1% base, 1.5% when streak is active
  const hasStreak = (currentState.consecutiveWins ?? 0) >= cfg.STREAK_WINS_TO_SCALE;
  const riskPct = hasStreak ? cfg.RISK_PER_TRADE_STREAK : cfg.RISK_PER_TRADE_BASE;

  const isBuy = signal.type === "BUY";
  const slDistancePct = isBuy
    ? (signal.price - signal.stopLoss) / signal.price
    : (signal.stopLoss - signal.price) / signal.price;

  if (slDistancePct <= 0) {
    return { canTrade: false, reason: "Invalid SL distance" };
  }

  const leverage = getLeverage(signal.timeframe);
  const riskAmount = currentState.capital * riskPct;
  const positionSize = riskAmount / (slDistancePct * leverage);

  if (positionSize > currentState.capital * 0.05) {
    return { canTrade: false, reason: `Position size $${positionSize.toFixed(2)} exceeds 5% of capital` };
  }

  if (positionSize < 1) {
    return { canTrade: false, reason: "Position size too small" };
  }

  return {
    canTrade: true,
    reason: `All checks passed (risk=${(riskPct * 100).toFixed(1)}%, maxTrades=${maxTrades}, streak=${currentState.consecutiveWins ?? 0})`,
    positionSize: Math.round(positionSize * 100) / 100,
  };
}

// ── Open a trade ─────────────────────────────────────────────

export function openTrade(params: {
  signal: {
    id: string;
    symbol: string;
    exchange: string;
    assetType?: string;
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
  const leverage = getLeverage(signal.timeframe, signal.assetType);
  const entryFee = positionSize * SIM_CONFIG.EXCHANGE_FEE;
  const biasLabel = bullScore > bearScore ? "Go Bull" : "Go Bear";

  const trade: SimTrade = {
    signalId: signal.id,
    symbol: signal.symbol,
    exchange: signal.exchange ?? "BINANCE",
    assetType: signal.assetType ?? "CRYPTO",
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
    highWatermark: signal.price,
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

  const cs = (signal.assetType ?? "CRYPTO") === "INDIAN_STOCKS" ? "₹" : "$";
  const log: SimLog = {
    timestamp: new Date().toISOString(),
    action: "TRADE_OPENED",
    details: `${signal.type} ${signal.symbol} on ${signal.timeframe} | size=${cs}${positionSize.toFixed(2)} lev=${leverage}x score=${signal.confidenceScore} bias=${biasLabel} fee=${cs}${entryFee.toFixed(4)} | streak: ${state.consecutiveWins ?? 0} max: ${state.currentMaxTrades ?? 1}`,
    signalId: signal.id,
    symbol: signal.symbol,
    capital: updatedState.capital,
    assetType: signal.assetType ?? "CRYPTO",
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
      closePct = SIM_CONFIG.TP3_CLOSE_PCT;
      newTp3Hit = true;
      break;
    case "SL":
      closePct = trade.remainingPct; // close everything remaining
      newSlHit = true;
      break;
    default:
      return null;
  }

  if (closePct <= 0) {
    // Nothing to close (e.g. TP2_CLOSE_PCT = 0), but still mark the hit
    // so future cycles don't re-detect this as a missed exit.
    const updatedTrade: SimTrade = {
      ...trade,
      tp1Hit: newTp1Hit,
      tp2Hit: newTp2Hit,
      tp3Hit: newTp3Hit,
      slHit: newSlHit,
    };
    const isClosed = updatedTrade.remainingPct <= 0.001;
    if (isClosed) updatedTrade.status = "CLOSED";
    return {
      updatedTrade,
      updatedState: state,
      log: {
        timestamp: new Date().toISOString(),
        action: exitType,
        details: `${trade.symbol} ${exitType} hit at ${exitPrice} (0% close, SL trails)`,
        signalId: trade.signalId,
        symbol: trade.symbol,
        capital: state.capital,
      },
    };
  }

  const closingSize = trade.positionSize * closePct;
  const pnl = closingSize * pricePnlPct * trade.leverage;
  const exitFee = closingSize * SIM_CONFIG.EXCHANGE_FEE;
  const netPnl = pnl - exitFee;

  const newRemainingPct = exitType === "SL"
    ? 0
    : trade.remainingPct - closePct;

  const isClosed = newRemainingPct <= 0.001;

  const event: SimTradeEvent = {
    type: exitType,
    price: exitPrice,
    pnl: netPnl,
    fee: exitFee,
    closePct,
    timestamp: new Date().toISOString(),
  };

  const totalRealizedPnl = trade.realizedPnl + netPnl;

  const updatedTrade: SimTrade = {
    ...trade,
    tp1Hit: newTp1Hit,
    tp2Hit: newTp2Hit,
    tp3Hit: newTp3Hit,
    slHit: newSlHit,
    remainingPct: Math.max(0, newRemainingPct),
    realizedPnl: totalRealizedPnl,
    currentPrice: exitPrice,
    unrealizedPnl: isClosed ? 0 : trade.unrealizedPnl,
    fees: trade.fees + exitFee,
    status: isClosed ? "CLOSED" : "OPEN",
    closedAt: isClosed ? new Date().toISOString() : trade.closedAt,
    closeReason: isClosed ? exitType : trade.closeReason,
    events: [...trade.events, event],
  };

  const newDailyPnl = state.dailyPnl + netPnl;

  // Three-state streak tracking (only on fully closed trades):
  //   WIN: TP2 or TP3 hit → increments streak
  //   BREAKEVEN: closed with non-negative PnL but no TP2/TP3 → streak unchanged
  //   LOSS: closed with negative PnL → resets streak
  let { consecutiveWins = 0, streakSide = null, currentMaxTrades = SIM_CONFIG.MAX_OPEN_TRADES_BASE } = state;
  let streakOutcome: "WIN" | "BREAKEVEN" | "LOSS" | null = null;

  if (isClosed) {
    const isWin = totalRealizedPnl > 0;
    const isLoss = totalRealizedPnl < 0;

    if (isWin) {
      streakOutcome = "WIN";
      if (streakSide === trade.side) {
        consecutiveWins += 1;
      } else {
        consecutiveWins = 1;
        streakSide = trade.side;
      }
      currentMaxTrades = Math.min(
        SIM_CONFIG.MAX_OPEN_TRADES_CAP,
        SIM_CONFIG.MAX_OPEN_TRADES_BASE + Math.max(0, consecutiveWins - SIM_CONFIG.STREAK_WINS_TO_SCALE + 1),
      );
    } else if (isLoss) {
      streakOutcome = "LOSS";
      consecutiveWins = 0;
      streakSide = null;
      currentMaxTrades = SIM_CONFIG.MAX_OPEN_TRADES_BASE;
    } else {
      streakOutcome = "BREAKEVEN";
      // No change to streak — direction was right, just didn't follow through
    }
  }

  // Count wins/losses for overall stats (TP2/TP3 = win, negative PnL = loss)
  const statsWin = isClosed && streakOutcome === "WIN";
  const statsLoss = isClosed && streakOutcome === "LOSS";

  const updatedState: SimulatorState = {
    ...state,
    capital: state.capital + netPnl,
    dailyPnl: newDailyPnl,
    dailyFees: state.dailyFees + exitFee,
    totalRealizedPnl: state.totalRealizedPnl + netPnl,
    totalFeesPaid: state.totalFeesPaid + exitFee,
    totalWins: state.totalWins + (statsWin ? 1 : 0),
    totalLosses: state.totalLosses + (statsLoss ? 1 : 0),
    consecutiveWins,
    streakSide,
    currentMaxTrades,
    lastUpdated: new Date().toISOString(),
  };

  const streakInfo = isClosed && streakOutcome
    ? ` | ${streakOutcome} streak: ${consecutiveWins}${streakSide ? ` ${streakSide}` : ""} → max ${currentMaxTrades}`
    : "";

  const cs = (trade.assetType ?? "CRYPTO") === "INDIAN_STOCKS" ? "₹" : "$";
  const log: SimLog = {
    timestamp: new Date().toISOString(),
    action: exitType === "SL" ? "SL_HIT" : "TP_HIT",
    details: `${exitType} on ${trade.symbol} | closed ${(closePct * 100).toFixed(0)}% @ ${cs}${exitPrice.toFixed(4)} pnl=${cs}${netPnl.toFixed(4)} fee=${cs}${exitFee.toFixed(4)}${streakInfo}`,
    signalId: trade.signalId,
    symbol: trade.symbol,
    capital: updatedState.capital,
    pnl: netPnl,
    assetType: trade.assetType ?? "CRYPTO",
  };

  return { updatedTrade, updatedState, log };
}
