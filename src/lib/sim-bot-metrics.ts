import { buildEquityCurve } from "@/lib/equity-curve";
import {
  matchesBotSource,
  type BotSourceFilter,
} from "@/lib/bot-source-filter";
import type { SimTrade } from "@/lib/simulator";

type PerBotFilter = Exclude<BotSourceFilter, "ALL">;

/** Counterfactual fund value if only this bot's closed trades ran from start. */
export function computeBotCapital(
  closedTrades: SimTrade[],
  startingCapital: number,
  filter: PerBotFilter,
): number {
  const filtered = closedTrades.filter(matchesBotSource(filter));
  if (filtered.length === 0) return startingCapital;
  return buildEquityCurve(filtered, startingCapital).finalCapital;
}

export function countBotOpen(
  openTrades: SimTrade[],
  filter: PerBotFilter,
): number {
  return openTrades.filter(matchesBotSource(filter)).length;
}

export function countBotClosed(
  closedTrades: SimTrade[],
  filter: PerBotFilter,
): number {
  return closedTrades.filter(matchesBotSource(filter)).length;
}
