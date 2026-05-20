/**
 * Per-bot open-trade caps — each bot uses its own maxOpenTrades from
 * `config/sim_bot_*_settings`, not a shared global pool.
 */
import { classifyBotSource, type BotSourceFilter } from "@/lib/bot-source-filter";
import type { SimTrade } from "@/lib/simulator";

export function openCryptoTrades(trades: SimTrade[]): SimTrade[] {
  return trades.filter((t) => t.status === "OPEN" && (t.assetType || "CRYPTO") === "CRYPTO");
}

export function countOpenForBotSource(
  trades: SimTrade[],
  botSource: Exclude<BotSourceFilter, "ALL">,
): number {
  return openCryptoTrades(trades).filter(
    (t) => classifyBotSource(t.botSource) === botSource,
  ).length;
}

export function canBotOpenMore(
  trades: SimTrade[],
  botSource: Exclude<BotSourceFilter, "ALL">,
  maxOpenTrades: number,
): { ok: boolean; reason?: string } {
  const n = countOpenForBotSource(trades, botSource);
  if (n >= maxOpenTrades) {
    return {
      ok: false,
      reason: `${botSource} at max open trades (${n}/${maxOpenTrades})`,
    };
  }
  return { ok: true };
}
