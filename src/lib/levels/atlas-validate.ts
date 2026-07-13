/**
 * Atlas idea-validation engine — deterministic, LLM-free.
 *
 * User states a bias (bullish | bearish). We run independent checks against
 * levels, OI, news, and PVT, then tally a verdict. No composite score, no
 * trade instructions.
 */

import {
  SENTIMENT_LABEL_THRESHOLDS,
  type NewsSentimentLabel,
} from "@/lib/levels/news-types";
import type { OiHistoryEntry } from "@/lib/oi-history";
import { SCORE_CONFIG } from "@/lib/levels/strategy-score";

export type IdeaBias = "bullish" | "bearish";
export type CheckStatus = "support" | "conflict" | "neutral";
export type ValidateVerdict = "aligned" | "partially_aligned" | "not_aligned";

export type ValidateCheckId =
  | "sr_location"
  | "oi_day"
  | "oi_history"
  | "news"
  | "daily_pvt"
  | "intraday_pvt";

export interface ValidateCheck {
  id: ValidateCheckId;
  label: string;
  status: CheckStatus;
  reason: string;
}

export interface AtlasValidateInputs {
  symbol: string;
  label?: string | null;
  bias: IdeaBias;
  spot: number | null;
  supportLow: number | null;
  supportHigh: number | null;
  resistanceLow: number | null;
  resistanceHigh: number | null;
  putOiChangePct: number | null;
  callOiChangePct: number | null;
  oiHistory?: readonly OiHistoryEntry[] | null;
  newsScore: number | null;
  newsLabel?: NewsSentimentLabel | null;
  newsNote?: string | null;
  /** Daily PVT slope since zone entry (toe-dip), −1…+1. */
  dailyPvtSlope: number | null;
  /** 15m intraday PVT slope (zone-anchored when possible), −1…+1. */
  intradayPvtSlope: number | null;
  ivPercentile?: number | null;
  volRegimeFlag?: string | null;
}

export interface AtlasValidateResult {
  symbol: string;
  label: string;
  bias: IdeaBias;
  spot: number | null;
  checks: ValidateCheck[];
  verdict: ValidateVerdict;
  summary: string;
  invalidation: string | null;
  caveats: string[];
}

/** Day-Δ OI spread below this % is noise. */
const OI_DAY_NEUTRAL_PCT = 8;
/** Need at least this many history points to score a multi-day OI trend. */
const OI_HISTORY_MIN_POINTS = 4;
/** Lookback window for OI history slope. */
const OI_HISTORY_LOOKBACK = 8;
/** Relative OI change (newer vs older) that counts as a real trend. */
const OI_HISTORY_TREND_PCT = 8;
/** |PVT| below this is flat. */
const PVT_NEUTRAL = 0.15;

const isNum = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

function mid(lo: number | null, hi: number | null): number | null {
  if (isNum(lo) && isNum(hi)) return (lo + hi) / 2;
  if (isNum(lo)) return lo;
  if (isNum(hi)) return hi;
  return null;
}

function fmtLevel(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: n < 100 ? 2 : 0 })}`;
}

function bandEdges(
  lo: number | null,
  hi: number | null,
): { low: number; high: number } | null {
  if (!isNum(lo) && !isNum(hi)) return null;
  if (isNum(lo) && isNum(hi)) {
    return { low: Math.min(lo, hi), high: Math.max(lo, hi) };
  }
  const v = (lo ?? hi)!;
  return { low: v, high: v };
}

function aligns(bias: IdeaBias, signal: "bullish" | "bearish"): CheckStatus {
  return bias === signal ? "support" : "conflict";
}

function statusFromSignal(
  bias: IdeaBias,
  signal: "bullish" | "bearish" | "neutral",
): CheckStatus {
  if (signal === "neutral") return "neutral";
  return aligns(bias, signal);
}

/** Spot sitting in / through support or resistance. */
export function checkSrLocation(inputs: AtlasValidateInputs): ValidateCheck {
  const label = "Spot vs support / resistance";
  const { spot, bias } = inputs;
  const support = bandEdges(inputs.supportLow, inputs.supportHigh);
  const resistance = bandEdges(inputs.resistanceLow, inputs.resistanceHigh);

  if (!isNum(spot) || (!support && !resistance)) {
    return {
      id: "sr_location",
      label,
      status: "neutral",
      reason: "Support / resistance bands are not available yet for this symbol.",
    };
  }

  if (support && spot < support.low) {
    return {
      id: "sr_location",
      label,
      status: statusFromSignal(bias, "bearish"),
      reason: `Price is below support ${fmtLevel(support.low)} — the bull floor has given way.`,
    };
  }
  if (resistance && spot > resistance.high) {
    return {
      id: "sr_location",
      label,
      status: statusFromSignal(bias, "bullish"),
      reason: `Price is above resistance ${fmtLevel(resistance.high)} — the bear cap has given way.`,
    };
  }
  if (support && spot >= support.low && spot <= support.high) {
    return {
      id: "sr_location",
      label,
      status: statusFromSignal(bias, "bullish"),
      reason: `Price is holding inside the support band (${fmtLevel(support.low)}–${fmtLevel(support.high)}).`,
    };
  }
  if (resistance && spot >= resistance.low && spot <= resistance.high) {
    return {
      id: "sr_location",
      label,
      status: statusFromSignal(bias, "bearish"),
      reason: `Price is pressing the resistance band (${fmtLevel(resistance.low)}–${fmtLevel(resistance.high)}).`,
    };
  }

  const sMid = mid(inputs.supportLow, inputs.supportHigh);
  const rMid = mid(inputs.resistanceLow, inputs.resistanceHigh);
  if (isNum(sMid) && isNum(rMid) && rMid !== sMid) {
    const pos = (spot - sMid) / (rMid - sMid);
    if (pos <= 0.35) {
      return {
        id: "sr_location",
        label,
        status: statusFromSignal(bias, "bullish"),
        reason: `Price is closer to support (${fmtLevel(sMid)}) than resistance.`,
      };
    }
    if (pos >= 0.65) {
      return {
        id: "sr_location",
        label,
        status: statusFromSignal(bias, "bearish"),
        reason: `Price is closer to resistance (${fmtLevel(rMid)}) than support.`,
      };
    }
  }

  return {
    id: "sr_location",
    label,
    status: "neutral",
    reason: "Price sits mid-corridor between support and resistance — no clear hold or reject yet.",
  };
}

/** Day-over-day put vs call wall OI buildup. */
export function checkOiDay(inputs: AtlasValidateInputs): ValidateCheck {
  const label = "OI wall (today)";
  const put = isNum(inputs.putOiChangePct) ? inputs.putOiChangePct : null;
  const call = isNum(inputs.callOiChangePct) ? inputs.callOiChangePct : null;
  if (put == null && call == null) {
    return {
      id: "oi_day",
      label,
      status: "neutral",
      reason: "Day-over-day OI change at the walls is not available.",
    };
  }
  const putV = put ?? 0;
  const callV = call ?? 0;
  const spread = putV - callV;
  if (Math.abs(spread) < OI_DAY_NEUTRAL_PCT) {
    return {
      id: "oi_day",
      label,
      status: "neutral",
      reason: "Put and call wall OI are moving similarly today — no clear buildup edge.",
    };
  }
  if (spread > 0) {
    return {
      id: "oi_day",
      label,
      status: statusFromSignal(inputs.bias, "bullish"),
      reason: `Put-wall OI is building vs call wall (put ${putV >= 0 ? "+" : ""}${putV.toFixed(1)}% · call ${callV >= 0 ? "+" : ""}${callV.toFixed(1)}%).`,
    };
  }
  return {
    id: "oi_day",
    label,
    status: statusFromSignal(inputs.bias, "bearish"),
    reason: `Call-wall OI is building vs put wall (call ${callV >= 0 ? "+" : ""}${callV.toFixed(1)}% · put ${putV >= 0 ? "+" : ""}${putV.toFixed(1)}%).`,
  };
}

/** Multi-day put vs call wall OI trend from history series. */
export function checkOiHistory(inputs: AtlasValidateInputs): ValidateCheck {
  const label = "OI history";
  const hist = inputs.oiHistory ?? [];
  const usable = hist.filter(
    (e) => (isNum(e.putOI) || isNum(e.callOI)) && typeof e.date === "string",
  );
  if (usable.length < OI_HISTORY_MIN_POINTS) {
    return {
      id: "oi_history",
      label,
      status: "neutral",
      reason: "Not enough OI history yet to read a multi-day wall trend.",
    };
  }
  const window = usable.slice(-OI_HISTORY_LOOKBACK);
  const first = window[0]!;
  const last = window[window.length - 1]!;
  const putOld = isNum(first.putOI) ? first.putOI : null;
  const putNew = isNum(last.putOI) ? last.putOI : null;
  const callOld = isNum(first.callOI) ? first.callOI : null;
  const callNew = isNum(last.callOI) ? last.callOI : null;

  const putPct =
    putOld != null && putOld > 0 && putNew != null
      ? ((putNew - putOld) / putOld) * 100
      : null;
  const callPct =
    callOld != null && callOld > 0 && callNew != null
      ? ((callNew - callOld) / callOld) * 100
      : null;

  if (putPct == null && callPct == null) {
    return {
      id: "oi_history",
      label,
      status: "neutral",
      reason: "OI history rows are missing put/call sizes for a trend read.",
    };
  }

  const putT = putPct ?? 0;
  const callT = callPct ?? 0;
  const spread = putT - callT;
  const days = window.length;

  if (Math.abs(spread) < OI_HISTORY_TREND_PCT) {
    return {
      id: "oi_history",
      label,
      status: "neutral",
      reason: `Over the last ${days} sessions, put and call wall OI have moved roughly in line.`,
    };
  }
  if (spread > 0) {
    return {
      id: "oi_history",
      label,
      status: statusFromSignal(inputs.bias, "bullish"),
      reason: `Over the last ${days} sessions, put-wall OI has strengthened vs the call wall.`,
    };
  }
  return {
    id: "oi_history",
    label,
    status: statusFromSignal(inputs.bias, "bearish"),
    reason: `Over the last ${days} sessions, call-wall OI has strengthened vs the put wall.`,
  };
}

/** News sentiment vs bias. */
export function checkNews(inputs: AtlasValidateInputs): ValidateCheck {
  const label = "News sentiment";
  if (!isNum(inputs.newsScore)) {
    return {
      id: "news",
      label,
      status: "neutral",
      reason: "News sentiment is not available for this symbol right now.",
    };
  }
  const score = inputs.newsScore;
  let signal: "bullish" | "bearish" | "neutral" = "neutral";
  if (score >= SENTIMENT_LABEL_THRESHOLDS.bullishMin) signal = "bullish";
  else if (score <= SENTIMENT_LABEL_THRESHOLDS.bearishMax) signal = "bearish";

  const tone =
    inputs.newsLabel ??
    (signal === "neutral" ? "neutral" : signal);
  const note = inputs.newsNote?.trim();
  const base =
    signal === "neutral"
      ? `News tone is mixed (score ${score}/100).`
      : `News tone is ${tone} (score ${score}/100).`;

  return {
    id: "news",
    label,
    status: statusFromSignal(inputs.bias, signal),
    reason: note ? `${base} ${note}` : base,
  };
}

/** Daily PVT confirmation since price entered the S/R zone. */
export function checkDailyPvt(inputs: AtlasValidateInputs): ValidateCheck {
  const label = "Daily PVT since zone";
  if (!isNum(inputs.dailyPvtSlope)) {
    return {
      id: "daily_pvt",
      label,
      status: "neutral",
      reason:
        "No open support/resistance event yet, or not enough daily sessions since the zone hit for a PVT read.",
    };
  }
  if (Math.abs(inputs.dailyPvtSlope) < PVT_NEUTRAL) {
    return {
      id: "daily_pvt",
      label,
      status: "neutral",
      reason: "Daily PVT since the zone hit is flat — no clear multi-session volume confirmation yet.",
    };
  }
  if (inputs.dailyPvtSlope > 0) {
    return {
      id: "daily_pvt",
      label,
      status: statusFromSignal(inputs.bias, "bullish"),
      reason: "Daily PVT has risen since the zone hit — volume-backed accumulation after entry.",
    };
  }
  return {
    id: "daily_pvt",
    label,
    status: statusFromSignal(inputs.bias, "bearish"),
    reason: "Daily PVT has fallen since the zone hit — volume-backed distribution after entry.",
  };
}

/** 15m intraday PVT — zone-anchored when an open event exists, else recent session. */
export function checkIntradayPvt(inputs: AtlasValidateInputs): ValidateCheck {
  const label = "Intraday PVT (15m)";
  if (!isNum(inputs.intradayPvtSlope)) {
    return {
      id: "intraday_pvt",
      label,
      status: "neutral",
      reason: "Intraday PVT is not available (no usable volume or candles yet).",
    };
  }
  if (Math.abs(inputs.intradayPvtSlope) < PVT_NEUTRAL) {
    return {
      id: "intraday_pvt",
      label,
      status: "neutral",
      reason: "Intraday PVT is flat — no clear volume-backed push on the 15m chart yet.",
    };
  }
  if (inputs.intradayPvtSlope > 0) {
    return {
      id: "intraday_pvt",
      label,
      status: statusFromSignal(inputs.bias, "bullish"),
      reason: "Intraday PVT slopes up on 15m — volume-backed buying into the current zone.",
    };
  }
  return {
    id: "intraday_pvt",
    label,
    status: statusFromSignal(inputs.bias, "bearish"),
    reason: "Intraday PVT slopes down on 15m — volume-backed selling into the current zone.",
  };
}

function hardBrokenFloor(inputs: AtlasValidateInputs): boolean {
  const support = bandEdges(inputs.supportLow, inputs.supportHigh);
  return (
    inputs.bias === "bullish" &&
    isNum(inputs.spot) &&
    !!support &&
    inputs.spot < support.low
  );
}

function hardBrokenCap(inputs: AtlasValidateInputs): boolean {
  const resistance = bandEdges(inputs.resistanceLow, inputs.resistanceHigh);
  return (
    inputs.bias === "bearish" &&
    isNum(inputs.spot) &&
    !!resistance &&
    inputs.spot > resistance.high
  );
}

export function tallyVerdict(
  checks: readonly ValidateCheck[],
  inputs: AtlasValidateInputs,
): ValidateVerdict {
  if (hardBrokenFloor(inputs) || hardBrokenCap(inputs)) return "not_aligned";

  let supports = 0;
  let conflicts = 0;
  for (const c of checks) {
    if (c.status === "support") supports += 1;
    else if (c.status === "conflict") conflicts += 1;
  }

  if (conflicts === 0 && supports >= 2) return "aligned";
  if (supports === 0 && conflicts >= 2) return "not_aligned";
  return "partially_aligned";
}

function invalidationLine(inputs: AtlasValidateInputs): string | null {
  if (inputs.bias === "bullish") {
    const support = bandEdges(inputs.supportLow, inputs.supportHigh);
    if (!support) return null;
    return `Idea weakens if price breaks below ${fmtLevel(support.low)}.`;
  }
  const resistance = bandEdges(inputs.resistanceLow, inputs.resistanceHigh);
  if (!resistance) return null;
  return `Idea weakens if price reclaims above ${fmtLevel(resistance.high)}.`;
}

function buildCaveats(inputs: AtlasValidateInputs): string[] {
  const out: string[] = [];
  const ivHigh =
    (isNum(inputs.ivPercentile) && inputs.ivPercentile >= SCORE_CONFIG.ivHighPct) ||
    (inputs.volRegimeFlag ?? "").toUpperCase() === "ELEVATED" ||
    (inputs.volRegimeFlag ?? "").toUpperCase() === "EARNINGS";
  if (ivHigh) {
    out.push(
      "IV is elevated — option premiums are rich; that does not confirm or deny your bias, but long options cost more.",
    );
  }
  return out;
}

function buildSummary(
  inputs: AtlasValidateInputs,
  verdict: ValidateVerdict,
  invalidation: string | null,
): string {
  const name = (inputs.label?.trim() || inputs.symbol).toUpperCase();
  const biasWord = inputs.bias === "bullish" ? "Bullish" : "Bearish";
  const inv = invalidation ? ` ${invalidation}` : "";

  switch (verdict) {
    case "aligned":
      return `Your ${biasWord.toLowerCase()} idea on ${name} lines up with the checks we ran.${inv}`;
    case "not_aligned":
      return `Your ${biasWord.toLowerCase()} idea on ${name} conflicts with the current evidence.${inv}`;
    default:
      return `Your ${biasWord.toLowerCase()} idea on ${name} is only partially aligned — some checks support it, others push back.${inv}`;
  }
}

/** Run all checks and produce a structured validation card. */
export function validateTradeIdea(inputs: AtlasValidateInputs): AtlasValidateResult {
  const checks: ValidateCheck[] = [
    checkSrLocation(inputs),
    checkOiDay(inputs),
    checkOiHistory(inputs),
    checkNews(inputs),
    checkDailyPvt(inputs),
    checkIntradayPvt(inputs),
  ];
  const verdict = tallyVerdict(checks, inputs);
  const invalidation = invalidationLine(inputs);
  return {
    symbol: inputs.symbol,
    label: inputs.label?.trim() || inputs.symbol,
    bias: inputs.bias,
    spot: inputs.spot,
    checks,
    verdict,
    summary: buildSummary(inputs, verdict, invalidation),
    invalidation,
    caveats: buildCaveats(inputs),
  };
}
