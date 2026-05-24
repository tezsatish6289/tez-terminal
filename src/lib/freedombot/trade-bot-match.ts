/**
 * Client-safe helpers to match live_trades to a deployment's bot.
 * Kept separate from aggregates.ts so client components can filter trades
 * without importing firebase-admin.
 */

import { classifyBotSource } from "@/lib/bot-source-constants";
import {
  cryptoBotByBotSource,
  cryptoBotByDeployKey,
  type DeployBotKey,
} from "@/lib/crypto-bots";

export function botSourceForDeployKey(deployKey: string): string {
  try {
    return cryptoBotByDeployKey(deployKey as DeployBotKey).botSource;
  } catch {
    return "PATTERN";
  }
}

export function tradeMatchesDeployBot(
  trade: { botSource?: string | null },
  deployBot: string,
): boolean {
  const expected = botSourceForDeployKey(deployBot);
  return classifyBotSource(trade.botSource) === expected;
}

export function deployBotFromTradeSource(botSource: string | null | undefined): string {
  return cryptoBotByBotSource(botSource)?.deployKey ?? "CRYPTO";
}
