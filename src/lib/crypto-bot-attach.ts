/**
 * Crypto Bot ↔ Zone Bot silent attach configuration.
 *
 * Lets admin "bundle" any zone bot (BTC / ETH / SOL / XRP) into Crypto
 * Bot's subscriber pool. When a zone bot opens a sim trade, that trade
 * can be silently delivered to Crypto Bot subscribers in addition to
 * the zone bot's own solo subscribers.
 *
 * ── Three modes per zone bot (default "off") ─────────────────────────
 *
 *   "off"   Zone bot operates exactly as today. Nothing about the bot
 *           is exposed to Crypto Bot subscribers. Records pages, live
 *           execution — all unchanged.
 *
 *   "sim"   The sim trade is tagged for Crypto Bot in records pages
 *           (Crypto tab will list it with the same on-chain link as
 *           the BTC tab). NO live execution for Crypto Bot subscribers.
 *           Use this to publish a zone bot's track record under Crypto
 *           Bot before turning on live execution — build trust first.
 *
 *   "live"  Everything in "sim" PLUS the silent attach gate in
 *           `executeForAllUsers` fires real live trades for Crypto Bot
 *           subscribers (subject to dedup, symbol guard, and the
 *           Crypto cap pool).
 *
 * ── Trust mechanic ───────────────────────────────────────────────────
 *
 * Solo subscribers of a zone bot ALWAYS win. If a user has explicitly
 * enabled BTC zone bot for themselves (`zoneBotsEnabled.btc = true`),
 * the attach path is skipped for that user — they get exactly one BTC
 * fill via the solo path with zone-bot sizing. Disabling solo later
 * silently re-enables the attach path on the next signal.
 *
 * ── PR 1 scope ───────────────────────────────────────────────────────
 *
 * This module is PLUMBING ONLY in the initial commit. No production
 * code reads or writes these settings yet. The decision engine (sim
 * trade tagging, attach gate, dedup, cap pool) ships in PR 2; the
 * records-page filters in PR 3. Until then, attach config defaults to
 * "off" for every bot and has no observable effect.
 */
import type { Firestore } from "firebase-admin/firestore";
import {
  BOT_SOURCE_BTC_ZONE,
  BOT_SOURCE_ETH_ZONE,
  BOT_SOURCE_PATTERN,
  BOT_SOURCE_SOL_ZONE,
  BOT_SOURCE_XRP_ZONE,
} from "@/lib/bot-source-constants";
import type { ZoneBotAsset } from "@/lib/zone-bot-config";
import { ZONE_BOT_REGISTRY } from "@/lib/zone-bot-config";

// ── Mode type ────────────────────────────────────────────────────────

export type AttachMode = "off" | "sim" | "live";

export const ATTACH_MODES: readonly AttachMode[] = ["off", "sim", "live"] as const;

export type AttachedZoneBots = Record<ZoneBotAsset, AttachMode>;

/** Safe default — every zone bot is "off" (no attach behavior). */
export const ATTACHED_ZONE_BOTS_DEFAULT: AttachedZoneBots = {
  btc: "off",
  eth: "off",
  sol: "off",
  xrp: "off",
};

// ── Firestore wiring ─────────────────────────────────────────────────

/** Config lives on the same doc as the rest of Crypto Bot's settings,
 *  under a dedicated field so it can't collide with future additions. */
export const CRYPTO_BOT_ATTACH_CONFIG_DOC = "config/sim_bot_crypto_settings";
export const CRYPTO_BOT_ATTACH_FIELD = "attachedZoneBots" as const;

// ── Delivery markers (for `deliveredAs` on simulator_trades) ─────────

/** Pushed into `simulator_trades.deliveredAs` when the trade is part
 *  of Crypto Bot's strategy — either a pattern signal (native) or a
 *  zone-bot signal whose attach mode is "sim" / "live". */
export const DELIVERED_TO_CRYPTO = "CRYPTO";

/** Per-zone-bot marker, kept symmetric so `deliveredAs` always lists
 *  every subscriber pool that received the trade. */
export const DELIVERED_TO_BY_ASSET: Record<ZoneBotAsset, string> = {
  btc: "BTC",
  eth: "ETH",
  sol: "SOL",
  xrp: "XRP",
};

// ── Parsing ──────────────────────────────────────────────────────────

function coerceMode(raw: unknown): AttachMode {
  if (raw === "live") return "live";
  if (raw === "sim") return "sim";
  return "off";
}

/** Pure parser — never throws. Bad/missing input → safe defaults.
 *  Unknown keys are ignored. Per-asset values fall back to "off". */
export function parseAttachedZoneBots(raw: unknown): AttachedZoneBots {
  const result: AttachedZoneBots = { ...ATTACHED_ZONE_BOTS_DEFAULT };
  if (!raw || typeof raw !== "object") return result;
  const obj = raw as Record<string, unknown>;
  for (const asset of ZONE_BOT_REGISTRY) {
    if (asset in obj) result[asset] = coerceMode(obj[asset]);
  }
  return result;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Map a zone bot's `botSource` string to its asset key. Returns null
 *  for non-zone-bot sources (e.g. "PATTERN", null). */
export function zoneAssetFromBotSource(
  botSource: string | null | undefined,
): ZoneBotAsset | null {
  switch (botSource) {
    case BOT_SOURCE_BTC_ZONE: return "btc";
    case BOT_SOURCE_ETH_ZONE: return "eth";
    case BOT_SOURCE_SOL_ZONE: return "sol";
    case BOT_SOURCE_XRP_ZONE: return "xrp";
    default: return null;
  }
}

/** Resolve the attach mode for a given trade's source. Pattern trades
 *  and unrecognised sources always return "off" — attach is a zone-bot
 *  concept only. */
export function attachModeForBotSource(
  config: AttachedZoneBots,
  botSource: string | null | undefined,
): AttachMode {
  const asset = zoneAssetFromBotSource(botSource);
  if (!asset) return "off";
  return config[asset];
}

/** Build the `deliveredAs` array to stamp on a sim trade at open time.
 *
 *   • Pattern trades        → ["CRYPTO"]
 *   • Zone trade, attach off → ["BTC"] (or ETH/SOL/XRP)
 *   • Zone trade, attach sim → ["BTC", "CRYPTO"]
 *   • Zone trade, attach live → ["BTC", "CRYPTO"]
 *
 * Used by records-page filters to show the same trade in both the
 * solo bot's tab and the Crypto Bot tab. */
export function buildDeliveredAs(
  config: AttachedZoneBots,
  botSource: string | null | undefined,
): string[] {
  if (botSource == null || botSource === BOT_SOURCE_PATTERN) {
    return [DELIVERED_TO_CRYPTO];
  }
  const asset = zoneAssetFromBotSource(botSource);
  if (!asset) return [];
  const out: string[] = [DELIVERED_TO_BY_ASSET[asset]];
  const mode = config[asset];
  if (mode === "sim" || mode === "live") out.push(DELIVERED_TO_CRYPTO);
  return out;
}

/** True when a sim trade should appear in Crypto Bot's records tab.
 *  Pure helper — relies on `deliveredAs` already being stamped at open
 *  time. Historical trades without the field default to "no" so we
 *  never retroactively re-attribute trades that were never delivered. */
export function tradeBelongsToCryptoTab(
  deliveredAs: readonly string[] | null | undefined,
  botSource: string | null | undefined,
): boolean {
  if (botSource == null || botSource === BOT_SOURCE_PATTERN) return true;
  if (!Array.isArray(deliveredAs)) return false;
  return deliveredAs.includes(DELIVERED_TO_CRYPTO);
}

/** Records-page tab filter values. Mirrors `CryptoBotId | "all"`; kept
 *  here so the filter helper stays in the same module as the predicate
 *  it composes around. */
export type RecordsTabFilter = "all" | "crypto" | "btc" | "eth" | "sol" | "xrp";

/** Single source of truth for "does this trade belong in this records
 *  tab?" — used by `/api/admin/blockchain-records` and the unit test
 *  for the route. Centralising the rule prevents the production filter
 *  and the test corpus from silently drifting apart.
 *
 *  Semantics:
 *    • "all"                 → every trade
 *    • "crypto"              → pattern trades + attached zone trades
 *                              (anything with "CRYPTO" in deliveredAs,
 *                              plus the legacy pattern fallback)
 *    • "btc"/"eth"/"sol"/"xrp" → origin bot only. A zone trade with
 *                                attach mode "sim"/"live" still shows
 *                                in its own zone tab AND in Crypto.
 */
export function tradeBelongsToRecordsTab(
  filter: RecordsTabFilter,
  trade: {
    botId: string;
    botSource: string | null | undefined;
    deliveredAs: readonly string[] | null | undefined;
  },
): boolean {
  if (filter === "all") return true;
  if (filter === "crypto") {
    return tradeBelongsToCryptoTab(trade.deliveredAs, trade.botSource);
  }
  return trade.botId === filter;
}

// ── Logging keys ─────────────────────────────────────────────────────

/** Single-source-of-truth log action strings written to
 *  `live_trade_logs.action`. Grep on these to validate attach
 *  behavior end-to-end without touching trade data. */
export const ATTACH_LOG_KEYS = {
  /** Sim mode would have fired a live trade — recorded for review. */
  shadowWouldFire: "ATTACH_SHADOW_WOULD_FIRE",
  /** Live mode: attach path opened a live trade. */
  pathEntry: "ATTACH_PATH_ENTRY",
  /** Admin has not attached this bot to Crypto Bot. */
  skipBotOptOut: "ATTACH_SKIP_BOT_OPT_OUT",
  /** User isn't a Crypto Bot subscriber on this exchange. */
  skipNotCryptoSubscriber: "ATTACH_SKIP_NOT_CRYPTO_SUBSCRIBER",
  /** User already has this symbol open from any other bot. */
  skipSymbolAlreadyOpen: "ATTACH_SKIP_SYMBOL_ALREADY_OPEN",
  /** Crypto cap pool (pattern + attached zones) full for this user. */
  skipCryptoPoolCap: "ATTACH_SKIP_CRYPTO_POOL_CAP",
  /** Decision engine threw — fail-closed, skip user. */
  skipEvalError: "ATTACH_SKIP_EVAL_ERROR",
  /** User is in daily-loss halt. */
  skipDailyLossHalt: "ATTACH_SKIP_DAILY_LOSS_HALT",
} as const;

// ── Loader ───────────────────────────────────────────────────────────

/** Read attach config from the Crypto Bot settings doc. Fail-closed:
 *  any read error returns the safe default (all "off") so the attach
 *  decision engine collapses to a no-op. */
export async function loadAttachedZoneBots(
  db: Firestore,
): Promise<AttachedZoneBots> {
  try {
    const snap = await db.doc(CRYPTO_BOT_ATTACH_CONFIG_DOC).get();
    if (!snap.exists) return { ...ATTACHED_ZONE_BOTS_DEFAULT };
    const data = snap.data() ?? {};
    return parseAttachedZoneBots(data[CRYPTO_BOT_ATTACH_FIELD]);
  } catch (err) {
    console.warn(
      "[CryptoBotAttach] failed to load attach config:",
      err instanceof Error ? err.message : String(err),
    );
    return { ...ATTACHED_ZONE_BOTS_DEFAULT };
  }
}
