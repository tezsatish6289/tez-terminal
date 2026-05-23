/**
 * Leaf module — bot-source string constants and the no-dependency
 * `classifyBotSource` helper.
 *
 * Lives in its own file so both `bot-source-filter.ts` (which builds
 * `BOT_SOURCE_PILLS` from `CRYPTO_BOTS`) and `crypto-bots.ts` (which
 * references the constants when defining `CRYPTO_BOTS`) can import the
 * values without creating a circular import. Webpack hoists imports to
 * the top of the bundle and the previous cycle caused
 * `ReferenceError: Cannot access 'e' before initialization` when one
 * side tried to read a constant before its initialiser had run.
 */

// Discriminator values — must match `SimTrade.botSource` writes.
export const BOT_SOURCE_PATTERN = "PATTERN";
export const BOT_SOURCE_BTC_ZONE = "BTC_ZONE";
export const BOT_SOURCE_ETH_ZONE = "ETH_ZONE";
export const BOT_SOURCE_SOL_ZONE = "SOL_ZONE";
export const BOT_SOURCE_XRP_ZONE = "XRP_ZONE";

/** Filter pill values. "ALL" includes every trade regardless of source. */
export type BotSourceFilter =
  | "ALL"
  | "PATTERN"
  | "BTC_ZONE"
  | "ETH_ZONE"
  | "SOL_ZONE"
  | "XRP_ZONE";

/** Normalise an optional `botSource` field to a canonical bucket so the
 *  filter pill set stays stable even as new bot types appear. Any
 *  unknown value (e.g. a future ZONE before its pill is added) collapses
 *  to "PATTERN" so trades are never silently hidden. */
export function classifyBotSource(
  raw: string | null | undefined,
): Exclude<BotSourceFilter, "ALL"> {
  if (raw === BOT_SOURCE_BTC_ZONE) return "BTC_ZONE";
  if (raw === BOT_SOURCE_ETH_ZONE) return "ETH_ZONE";
  if (raw === BOT_SOURCE_SOL_ZONE) return "SOL_ZONE";
  if (raw === BOT_SOURCE_XRP_ZONE) return "XRP_ZONE";
  return "PATTERN";
}
