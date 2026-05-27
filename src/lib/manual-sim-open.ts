import { getLeverage } from "@/lib/leverage";
import { SIM_COCKPIT_BOTS, type CockpitBotId } from "@/lib/sim-cockpit-bots";
import {
  BOT_SOURCE_PATTERN,
  classifyBotSource,
  type BotSourceFilter,
} from "@/lib/bot-source-filter";
import {
  VALID_ZONE_LEVERAGES,
  type SimBotSettings,
  type ZoneLeverage,
} from "@/lib/sim-bot-settings";
import type { SimTrade, SimulatorState } from "@/lib/simulator";
import type { ZoneBotAsset } from "@/lib/zone-bot-config";
import { ZONE_BOT_SOURCE } from "@/lib/zone-bot-config";

export type ManualTradeSide = "BUY" | "SELL";
export type ManualMirrorMode = "sim" | "sim_and_live";

export interface ManualOpenTradeInput {
  botId: CockpitBotId;
  symbol: string;
  exchange: string;
  side: ManualTradeSide;
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  mirrorMode: ManualMirrorMode;
  timeframe?: string;
  note?: string;
  /** User-chosen leverage (3/5/10×). When unset or invalid, the API falls
   *  back to the legacy timeframe-derived default (= 3× for the 60m
   *  timeframe used by every manual trade). */
  leverage?: number;
}

/** Coerce a leverage value from a request body to one of `VALID_ZONE_LEVERAGES`
 *  or `null` when missing / invalid. Silent coerce — never throws. Mirrors the
 *  clamp semantics used by `parseZoneBotSettings`. */
export function coerceManualLeverage(raw: unknown): ZoneLeverage | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return (VALID_ZONE_LEVERAGES as readonly number[]).includes(raw)
    ? (raw as ZoneLeverage)
    : null;
}

export interface ManualOpenTradeResult {
  tradeId: string;
  positionSize: number;
  leverage: number;
  riskPctUsed: number;
  botSource: string;
  liveMirrorAttempted: boolean;
}

const ZONE_ASSETS = new Set<ZoneBotAsset>(["btc", "eth", "sol", "xrp"]);

export function normalizePerpSymbol(raw: string): string {
  const s = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return s;
  return s.endsWith(".P") ? s : `${s}.P`;
}

export function botSourceForCockpit(botId: CockpitBotId): Exclude<BotSourceFilter, "ALL"> {
  const bot = SIM_COCKPIT_BOTS.find((b) => b.id === botId);
  return bot?.botSource ?? BOT_SOURCE_PATTERN;
}

export function resolveManualRiskPct(
  botId: CockpitBotId,
  settings: SimBotSettings,
  state: SimulatorState,
): number {
  if (botId === "crypto") {
    const streakGate = settings.streakWinsToScale ?? 2;
    const hasStreak = (state.consecutiveWins ?? 0) >= streakGate;
    if (hasStreak && settings.riskPerTradeStreakPct != null) {
      return settings.riskPerTradeStreakPct;
    }
  }
  return settings.riskPerTradePct;
}

export function computeManualPositionSize(
  state: SimulatorState,
  riskPct: number,
  entryPrice: number,
  stopLoss: number,
  timeframe: string,
  /** Optional user-chosen leverage (3/5/10×). When set, overrides the
   *  legacy timeframe-derived default. Pre-2026-05-27 callers that omit
   *  it keep getting `getLeverage(timeframe, "CRYPTO")` = 3× for the
   *  manual sheet's `"60"` timeframe. */
  leverageOverride?: number,
): { size: number; leverage: number; skip: boolean; reason?: string } {
  const leverage =
    typeof leverageOverride === "number" &&
    Number.isFinite(leverageOverride) &&
    leverageOverride > 0
      ? leverageOverride
      : getLeverage(timeframe, "CRYPTO");
  const slDist = Math.abs(entryPrice - stopLoss);
  if (slDist <= 0 || entryPrice <= 0 || leverage <= 0) {
    return { size: 0, leverage, skip: true, reason: "Invalid entry or stop loss" };
  }
  const slDistPct = slDist / entryPrice;
  let posNotional = (state.capital * riskPct) / (slDistPct * leverage);
  const hardCap = state.capital * 0.05;
  if (posNotional > hardCap) posNotional = hardCap;
  posNotional = Math.round(posNotional * 100) / 100;
  if (posNotional < 1) {
    return {
      size: posNotional,
      leverage,
      skip: true,
      reason: `Position size $${posNotional.toFixed(2)} below $1 minimum`,
    };
  }
  return { size: posNotional, leverage, skip: false };
}

export function validateManualOpenInput(input: ManualOpenTradeInput): string | null {
  const symbol = normalizePerpSymbol(input.symbol);
  if (!symbol || symbol.length < 4) return "Symbol required (e.g. BTCUSDT.P)";
  if (!/^[A-Z0-9]+\.P$/.test(symbol)) {
    return "Symbol must be a Bybit perp (e.g. BTCUSDT.P)";
  }

  const ex = input.exchange.trim().toUpperCase();
  if (ex !== "BYBIT") return "Only BYBIT is supported for manual crypto perps";

  const { entryPrice, stopLoss, tp1, tp2, tp3, side } = input;
  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(stopLoss) ||
    !Number.isFinite(tp1) ||
    !Number.isFinite(tp2) ||
    !Number.isFinite(tp3)
  ) {
    return "Entry, SL, and TP levels must be numbers";
  }
  if (entryPrice <= 0 || stopLoss <= 0) return "Entry and SL must be positive";

  if (side === "BUY") {
    if (stopLoss >= entryPrice) return "Long: stop loss must be below entry";
    if (tp1 <= entryPrice || tp2 <= entryPrice || tp3 <= entryPrice) {
      return "Long: TP levels should be above entry";
    }
  } else {
    if (stopLoss <= entryPrice) return "Short: stop loss must be above entry";
    if (tp1 >= entryPrice || tp2 >= entryPrice || tp3 >= entryPrice) {
      return "Short: TP levels should be below entry";
    }
  }

  return null;
}

export function zoneAssetFromBotId(botId: CockpitBotId): ZoneBotAsset | null {
  return ZONE_ASSETS.has(botId as ZoneBotAsset) ? (botId as ZoneBotAsset) : null;
}

export function directionFromSide(side: ManualTradeSide): "BULL" | "BEAR" {
  return side === "BUY" ? "BULL" : "BEAR";
}

export function defaultSymbolForBot(botId: CockpitBotId): string {
  switch (botId) {
    case "btc":
      return "BTCUSDT.P";
    case "eth":
      return "ETHUSDT.P";
    case "sol":
      return "SOLUSDT.P";
    case "xrp":
      return "XRPUSDT.P";
    default:
      return "BTCUSDT.P";
  }
}

export function botSourceLabel(source: string): string {
  return classifyBotSource(source);
}

/** Manual punches from the cockpit (synthetic signal id / algo MANUAL). */
export function isManualSimTrade(
  trade: Pick<SimTrade, "algo" | "signalId">,
): boolean {
  if (trade.algo === "MANUAL") return true;
  return typeof trade.signalId === "string" && trade.signalId.startsWith("manual-");
}

export { ZONE_BOT_SOURCE };
