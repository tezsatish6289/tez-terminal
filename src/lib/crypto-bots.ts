/**
 * Canonical crypto bot registry — one name everywhere (cockpit, stats,
 * freedombot.ai). Internal `botSource` strings stay stable in Firestore.
 */
import {
  BOT_SOURCE_BTC_ZONE,
  BOT_SOURCE_ETH_ZONE,
  BOT_SOURCE_PATTERN,
  BOT_SOURCE_SOL_ZONE,
  BOT_SOURCE_XRP_ZONE,
  type BotSourceFilter,
  classifyBotSource,
} from "@/lib/bot-source-filter";

export type CryptoBotId = "crypto" | "btc" | "eth" | "sol" | "xrp";

/** Deploy / marketing key (FreedomBot dashboard, records tabs). */
export type DeployBotKey = "CRYPTO" | "BTC" | "ETH" | "SOL" | "XRP";

export interface CryptoBotDefinition {
  id: CryptoBotId;
  /** Product name — cockpit, stats, performance, deploy. */
  label: string;
  shortLabel: string;
  botSource: Exclude<BotSourceFilter, "ALL">;
  deployKey: DeployBotKey;
  /** Tab icon when no coin logo (Crypto Bot). */
  icon: string;
  logo: string | null;
  /** Default when `publicLive` is unset in Firestore. */
  defaultPublicLive: boolean;
}

export const CRYPTO_BOTS: readonly CryptoBotDefinition[] = [
  {
    id: "crypto",
    label: "Crypto Bot",
    shortLabel: "Crypto",
    botSource: BOT_SOURCE_PATTERN,
    deployKey: "CRYPTO",
    icon: "₿",
    logo: null,
    defaultPublicLive: true,
  },
  {
    id: "btc",
    label: "Bitcoin Bot",
    shortLabel: "BTC",
    botSource: BOT_SOURCE_BTC_ZONE,
    deployKey: "BTC",
    icon: "BTC",
    logo: "/freedombot/coins/btc.png",
    defaultPublicLive: false,
  },
  {
    id: "eth",
    label: "Ethereum Bot",
    shortLabel: "ETH",
    botSource: BOT_SOURCE_ETH_ZONE,
    deployKey: "ETH",
    icon: "ETH",
    logo: "/freedombot/coins/eth.png",
    defaultPublicLive: false,
  },
  {
    id: "sol",
    label: "Solana Bot",
    shortLabel: "SOL",
    botSource: BOT_SOURCE_SOL_ZONE,
    deployKey: "SOL",
    icon: "SOL",
    logo: "/freedombot/coins/sol.png",
    defaultPublicLive: false,
  },
  {
    id: "xrp",
    label: "XRP Bot",
    shortLabel: "XRP",
    botSource: BOT_SOURCE_XRP_ZONE,
    deployKey: "XRP",
    icon: "XRP",
    logo: "/freedombot/coins/xrp.png",
    defaultPublicLive: false,
  },
] as const;

const BY_ID = new Map(CRYPTO_BOTS.map((b) => [b.id, b]));
const BY_DEPLOY = new Map(CRYPTO_BOTS.map((b) => [b.deployKey, b]));
const BY_SOURCE = new Map(CRYPTO_BOTS.map((b) => [b.botSource, b]));

export function getCryptoBot(id: CryptoBotId): CryptoBotDefinition {
  return BY_ID.get(id)!;
}

export function cryptoBotByDeployKey(key: DeployBotKey): CryptoBotDefinition {
  return BY_DEPLOY.get(key)!;
}

export function cryptoBotByBotSource(
  source: string | null | undefined,
): CryptoBotDefinition | null {
  const bucket = classifyBotSource(source);
  const bot = CRYPTO_BOTS.find((b) => b.botSource === bucket);
  return bot ?? getCryptoBot("crypto");
}

export function cryptoBotLabel(id: CryptoBotId): string {
  return getCryptoBot(id).label;
}

/** Zone-bot-config labels — same product names. */
export const ZONE_BOT_PRODUCT_LABEL: Record<
  Exclude<CryptoBotId, "crypto">,
  string
> = {
  btc: getCryptoBot("btc").label,
  eth: getCryptoBot("eth").label,
  sol: getCryptoBot("sol").label,
  xrp: getCryptoBot("xrp").label,
};
