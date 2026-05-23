/**
 * `publicLive` — global flag per bot for freedombot.ai surfaces.
 */
import type { Firestore } from "firebase-admin/firestore";
import {
  CRYPTO_BOTS,
  type CryptoBotId,
} from "@/lib/crypto-bots";
import {
  classifyBotSource,
  type BotSourceFilter,
} from "@/lib/bot-source-filter";
import { SIM_BOT_SETTINGS_DOC } from "@/lib/sim-bot-settings";

export type PublicBotFlags = Record<CryptoBotId, boolean>;

export function defaultPublicBotFlags(): PublicBotFlags {
  return Object.fromEntries(
    CRYPTO_BOTS.map((b) => [b.id, b.defaultPublicLive]),
  ) as PublicBotFlags;
}

export async function loadPublicBotFlags(db: Firestore): Promise<PublicBotFlags> {
  const flags = defaultPublicBotFlags();
  await Promise.all(
    CRYPTO_BOTS.map(async (bot) => {
      const snap = await db.doc(SIM_BOT_SETTINGS_DOC[bot.id]).get();
      if (!snap.exists) return;
      const raw = snap.data()?.publicLive;
      if (typeof raw === "boolean") flags[bot.id] = raw;
    }),
  );
  return flags;
}

/** Bot-source values that may appear on public pages / in public aggregates. */
export function publicBotSources(flags: PublicBotFlags): Exclude<BotSourceFilter, "ALL">[] {
  return CRYPTO_BOTS.filter((b) => flags[b.id]).map((b) => b.botSource);
}

/** Trades from bots that are not public are always excluded on consumer pages. */
export function tradeIsFromPublicBot(
  trade: { botSource?: string | null },
  flags: PublicBotFlags,
): boolean {
  const source = classifyBotSource(trade.botSource);
  const bot = CRYPTO_BOTS.find((b) => b.botSource === source);
  return bot != null && flags[bot.id];
}

export function tradeMatchesSelectedPublicBot(
  trade: { botSource?: string | null },
  selectedBotId: CryptoBotId,
  flags: PublicBotFlags,
): boolean {
  if (!tradeIsFromPublicBot(trade, flags)) return false;
  const selected = CRYPTO_BOTS.find((b) => b.id === selectedBotId);
  if (!selected) return false;
  return classifyBotSource(trade.botSource) === selected.botSource;
}
