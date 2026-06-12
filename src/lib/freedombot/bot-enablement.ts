/**
 * Per-bot live enable/disable on the shared exchange secrets doc.
 *
 * Live eligibility is gated by TWO things on `users/{uid}/secrets/{exchange}`:
 *
 *   1. `autoTradeEnabled` — the per-(user × exchange) MASTER switch. The
 *      dispatcher's discovery query filters on it, so it must be `true` for
 *      ANY live trade on that exchange.
 *   2. A per-bot switch:
 *        • zone bots  → `zoneBotsEnabled.<asset>` (btc/eth/sol/xrp)
 *        • Crypto Bot → `patternBotEnabled` (default true when absent)
 *
 * The bug this guards against: pause/stop used to flip the MASTER switch off
 * for ANY bot, so stopping one zone bot killed live trading for the Crypto Bot
 * and every other zone on that exchange. These helpers flip only the relevant
 * per-bot switch, and drop the master only when the LAST crypto bot on the
 * exchange goes off (so the user still reads as fully paused).
 *
 * NOTE: the returned patches use dotted keys (e.g. "zoneBotsEnabled.btc"), so
 * callers MUST apply them with `ref.update(...)` (which interprets dotted paths
 * as nested fields), never `ref.set(..., { merge: true })`.
 */
import { isCryptoPerpDeployKey, zoneFieldFromDeployKey } from "@/lib/crypto-bots";
import {
  zoneBotsEnabledFieldKey,
  type ZoneBotsEnabledMap,
} from "@/lib/freedombot/zone-bot-subscription";

type SecretData = Record<string, unknown> | undefined | null;

/** Crypto (pattern) bot is opted in unless explicitly turned off. Absent ⇒ on
 *  (backward compatible with every pre-existing user). */
export function isPatternBotEnabled(secretData: SecretData): boolean {
  return (secretData?.patternBotEnabled as boolean | undefined) !== false;
}

function zoneFlags(secretData: SecretData): ZoneBotsEnabledMap {
  return (secretData?.zoneBotsEnabled as ZoneBotsEnabledMap | undefined) ?? {};
}

function anyZoneEnabled(z: ZoneBotsEnabledMap): boolean {
  return z.btc === true || z.eth === true || z.sol === true || z.xrp === true;
}

/** True if the user has at least one crypto-perp bot live on this exchange. */
export function anyCryptoBotEnabled(secretData: SecretData): boolean {
  return isPatternBotEnabled(secretData) || anyZoneEnabled(zoneFlags(secretData));
}

/**
 * Firestore patch to PAUSE/STOP a single bot WITHOUT disturbing the user's
 * other bots on the same exchange. Pass the deployment's `bot` deploy key
 * (CRYPTO / BTC / ETH / SOL / XRP / INDIAN_STOCKS / …) and the current
 * secrets-doc data. Apply with `ref.update(...)`.
 */
export function disableBotPatch(
  deployKey: string,
  secretData: SecretData,
): Record<string, unknown> {
  // Non-crypto-perp bots (Indian stocks / gold / silver) live on their own
  // exchange secrets doc, not shared with the crypto bots, so the legacy
  // master-switch flip is already isolated and correct.
  if (!isCryptoPerpDeployKey(deployKey)) {
    return { autoTradeEnabled: false };
  }

  const zoneField = zoneFieldFromDeployKey(deployKey);
  const patch: Record<string, unknown> = {};

  let patternAfter = isPatternBotEnabled(secretData);
  const z = { ...zoneFlags(secretData) };

  if (zoneField) {
    patch[zoneBotsEnabledFieldKey(zoneField)] = false;
    z[zoneField] = false;
  } else {
    patch.patternBotEnabled = false;
    patternAfter = false;
  }

  // Only drop the shared master switch when nothing crypto remains enabled.
  if (!patternAfter && !anyZoneEnabled(z)) {
    patch.autoTradeEnabled = false;
  }

  return patch;
}

/**
 * Firestore patch to (re)ENABLE a single bot and ensure the shared master
 * switch is on. Apply with `ref.update(...)`.
 */
export function enableBotPatch(deployKey: string): Record<string, unknown> {
  const patch: Record<string, unknown> = { autoTradeEnabled: true };
  if (!isCryptoPerpDeployKey(deployKey)) return patch;

  const zoneField = zoneFieldFromDeployKey(deployKey);
  if (zoneField) {
    patch[zoneBotsEnabledFieldKey(zoneField)] = true;
  } else {
    patch.patternBotEnabled = true;
  }
  return patch;
}
