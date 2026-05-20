/**
 * Simulation cockpit — four Deribit zone cards (Crypto Bot + 3 zone bots).
 * XRP is omitted (no Deribit chain; no fourth zone bot planned).
 */
import {
  BOT_SOURCE_BTC_ZONE,
  BOT_SOURCE_PATTERN,
  type BotSourceFilter,
} from "@/lib/bot-source-filter";
import { ZONE_BOT_SOURCE, type ZoneBotAsset } from "@/lib/zone-bot-config";

export type CockpitBotId = "crypto" | ZoneBotAsset;

export interface SimCockpitBot {
  id: CockpitBotId;
  label: string;
  /** Firestore config doc id under `config/`. */
  suggestedDoc: string;
  /** Trade filter (counterfactual performance + open count). */
  botSource: Exclude<BotSourceFilter, "ALL">;
}

export const SIM_COCKPIT_BOTS: readonly SimCockpitBot[] = [
  {
    id: "crypto",
    label: "Crypto Bot",
    suggestedDoc: "suggested_zones",
    botSource: BOT_SOURCE_PATTERN,
  },
  {
    id: "btc",
    label: "BTC Zone",
    suggestedDoc: "suggested_zones_btc",
    botSource: BOT_SOURCE_BTC_ZONE,
  },
  {
    id: "eth",
    label: "ETH Zone",
    suggestedDoc: "suggested_zones_eth",
    botSource: ZONE_BOT_SOURCE.eth as Exclude<BotSourceFilter, "ALL">,
  },
  {
    id: "sol",
    label: "SOL Zone",
    suggestedDoc: "suggested_zones_sol",
    botSource: ZONE_BOT_SOURCE.sol as Exclude<BotSourceFilter, "ALL">,
  },
] as const;
