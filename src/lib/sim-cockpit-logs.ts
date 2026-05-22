import {
  BOT_SOURCE_BTC_ZONE,
  BOT_SOURCE_ETH_ZONE,
  BOT_SOURCE_SOL_ZONE,
  BOT_SOURCE_XRP_ZONE,
  type BotSourceFilter,
} from "@/lib/bot-source-filter";
import type { SimLog } from "@/lib/simulator";

const ZONE_TAG = new RegExp(
  `\\[(${BOT_SOURCE_BTC_ZONE}|${BOT_SOURCE_ETH_ZONE}|${BOT_SOURCE_SOL_ZONE}|${BOT_SOURCE_XRP_ZONE})\\]`,
);

type PerBotSource = Exclude<BotSourceFilter, "ALL">;

/** Best-effort log filter when `SimLog` has no `botSource` field. */
export function matchesLogForBotSource(
  log: SimLog,
  botSource: PerBotSource,
): boolean {
  const details = log.details ?? "";
  const action = log.action ?? "";
  const sym = (log.symbol ?? "").toUpperCase();

  if (botSource === BOT_SOURCE_BTC_ZONE) {
    return (
      details.includes(`[${BOT_SOURCE_BTC_ZONE}]`) ||
      (action.includes("ZONE_BOT") && sym.includes("BTC"))
    );
  }
  if (botSource === BOT_SOURCE_ETH_ZONE) {
    return (
      details.includes(`[${BOT_SOURCE_ETH_ZONE}]`) ||
      (action.includes("ZONE_BOT") && sym.includes("ETH"))
    );
  }
  if (botSource === BOT_SOURCE_SOL_ZONE) {
    return (
      details.includes(`[${BOT_SOURCE_SOL_ZONE}]`) ||
      (action.includes("ZONE_BOT") && sym.includes("SOL"))
    );
  }
  if (botSource === BOT_SOURCE_XRP_ZONE) {
    return (
      details.includes(`[${BOT_SOURCE_XRP_ZONE}]`) ||
      (action.includes("ZONE_BOT") && sym.includes("XRP"))
    );
  }

  // Crypto / pattern bot — exclude zone-bot decorated lines.
  if (ZONE_TAG.test(details)) return false;
  if (action.startsWith("ZONE_BOT")) return false;
  return true;
}
