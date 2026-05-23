/**
 * Simulation cockpit — five Deribit zone cards (Crypto Bot + 4 zone bots).
 */
import {
  CRYPTO_BOTS,
  type CryptoBotId,
} from "@/lib/crypto-bots";
import type { BotSourceFilter } from "@/lib/bot-source-filter";

export type CockpitBotId = CryptoBotId;

export interface SimCockpitBot {
  id: CockpitBotId;
  label: string;
  /** Firestore config doc id under `config/`. */
  suggestedDoc: string;
  /** Trade filter (counterfactual performance + open count). */
  botSource: Exclude<BotSourceFilter, "ALL">;
}

const SUGGESTED_DOC: Record<CockpitBotId, string> = {
  crypto: "suggested_zones",
  btc: "suggested_zones_btc",
  eth: "suggested_zones_eth",
  sol: "suggested_zones_sol",
  xrp: "suggested_zones_xrp",
};

export const SIM_COCKPIT_BOTS: readonly SimCockpitBot[] = CRYPTO_BOTS.map((b) => ({
  id: b.id,
  label: b.label,
  suggestedDoc: SUGGESTED_DOC[b.id],
  botSource: b.botSource,
})) as readonly SimCockpitBot[];
