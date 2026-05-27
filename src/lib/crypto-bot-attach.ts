/**
 * Crypto Bot ↔ Zone Bot silent attach configuration.
 *
 * Lets admin "bundle" any zone bot (BTC / ETH / SOL / XRP) into Crypto
 * Bot. When a zone bot opens a sim trade, Crypto Bot opens a parallel
 * sim trade ("mirror") with its own position sizing, capital tracking,
 * blockchain memo, and records-tab presence. The mirror is tagged with
 * `attachedFrom = "<ZONE>_ZONE"` and `parentSimTradeId = "<parent>"` so
 * its origin is auditable and the parent → mirror close cascade can
 * find it.
 *
 * ── Three modes per zone bot (default "off") ─────────────────────────
 *
 *   "off"   Zone bot operates exactly as today. No mirror is opened.
 *           Records pages, live execution — all unchanged.
 *
 *   "sim"   When the zone bot opens a sim trade, Crypto Bot also opens
 *           a mirror sim trade. The mirror gets its own memo and shows
 *           up on the Crypto Bot card / Crypto records tab natively.
 *           NO live execution for Crypto Bot subscribers (PR 2b scope).
 *
 *   "live"  Everything in "sim" PLUS the mirror fans out to Crypto Bot
 *           subscribers on their exchanges (PR 2c — subject to symbol
 *           dedup + solo-subscriber precedence + per-user cap).
 *
 * ── Trust mechanic ───────────────────────────────────────────────────
 *
 * Solo subscribers of a zone bot ALWAYS win. If a user has explicitly
 * enabled BTC zone bot for themselves (`zoneBotsEnabled.btc = true`),
 * the attach path is skipped for that user when live mode fires — they
 * get exactly one BTC fill via the solo path with zone-bot sizing.
 * Disabling solo later silently re-enables the attach path on the next
 * signal.
 *
 * This module owns only the CONFIG (parsing + lookup helpers). The
 * mirror open/close orchestration lives in
 * `src/lib/crypto-bot-attach-mirror.ts`, which is the only place that
 * touches sim_state, simulator_trades, or blockchain queues for the
 * attach feature. Keeps this file leaf-shaped and easy to test.
 */
import type { Firestore } from "firebase-admin/firestore";
import {
  BOT_SOURCE_BTC_ZONE,
  BOT_SOURCE_ETH_ZONE,
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

// ── Logging keys ─────────────────────────────────────────────────────

/** Single-source-of-truth log action strings written to
 *  `simulator_logs.action` (mirror open path) and
 *  `live_trade_logs.action` (fan-out, PR 2c). Grep on these to validate
 *  attach behavior end-to-end without touching trade data. */
export const ATTACH_LOG_KEYS = {
  // ── PR 2b: mirror sim trade open / close ──────────────────────────
  /** Mirror sim trade successfully opened for Crypto Bot. */
  mirrorOpened: "ATTACH_MIRROR_OPENED",
  /** Mirror sim trade open skipped — reason in details. */
  mirrorSkipped: "ATTACH_MIRROR_SKIPPED",
  /** Mirror sim trade open threw — parent zone trade is unaffected. */
  mirrorOpenError: "ATTACH_MIRROR_OPEN_ERROR",
  /** Parent zone trade closed → mirror cascaded closed. */
  mirrorCascadeClosed: "ATTACH_MIRROR_CASCADE_CLOSED",
  /** Cascade close threw on a specific mirror — manual intervention. */
  mirrorCascadeError: "ATTACH_MIRROR_CASCADE_ERROR",
  // ── PR 2c: live fan-out (not used in 2b) ──────────────────────────
  /** Sim mode: would have fired a live trade — recorded for review. */
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
