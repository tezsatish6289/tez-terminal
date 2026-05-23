/**
 * Bot-level policy gates — currently just the live-mirroring switch.
 *
 * The lifecycle is intentionally *bot-level entry gating only*. Once a
 * sim trade is created and a live mirror exists, the cascade for SL/TP,
 * trailing SL, manual close, kill switch, and the `sync-live-trades`
 * retry net always follows the simulator — that's how running trades
 * stay in sync. This module gates the FAN-OUT decision (new sim → live
 * mirrors fire?) and nothing else.
 *
 * Gate placement is the critical detail (see commit message): the check
 * must happen at fan-out time in `live-execution.ts`, not at sim-trade
 * creation time. Reading the flag inside `executeForAllUsers` means the
 * value as-of the moment the live mirror would fire is what counts —
 * flipping the toggle OFF between sim creation and live dispatch is
 * honored.
 *
 * Backwards compat: `liveMirroringEnabled === undefined` is treated as
 * `true`. Existing bots that have been mirroring all along keep doing
 * so on deploy with zero migration. Only an explicit `false` set via
 * the cockpit UI puts a bot into SIM_ONLY mode.
 */
import type { Firestore } from "firebase-admin/firestore";
import {
  parseSimBotSettings,
  SIM_BOT_SETTINGS_DOC,
} from "@/lib/sim-bot-settings";
import type { CockpitBotId } from "@/lib/sim-cockpit-bots";
import { SIM_COCKPIT_BOTS } from "@/lib/sim-cockpit-bots";
import { cryptoBotByBotSource } from "@/lib/crypto-bots";

const VALID_COCKPIT_IDS = new Set<CockpitBotId>(
  SIM_COCKPIT_BOTS.map((b) => b.id),
);

/**
 * Map an internal `botSource` (`"PATTERN"`, `"BTC_ZONE"`, ...) to its
 * cockpit id (`"crypto"`, `"btc"`, ...). Returns null for unknown
 * sources — callers should default to "live mirroring allowed" so an
 * unrecognised bot doesn't silently stop firing live trades.
 */
export function cockpitIdFromBotSource(
  botSource: string | null | undefined,
): CockpitBotId | null {
  const def = cryptoBotByBotSource(botSource);
  return def ? def.id : null;
}

/**
 * Resolve the bot's live-mirroring policy at the current moment.
 *
 * Returns `true` (allow live fan-out) when:
 *   - the bot doc doesn't exist (never configured),
 *   - the `liveMirroringEnabled` field is missing or non-boolean
 *     (legacy bots — undefined is treated as ON),
 *   - the field is explicitly `true`.
 *
 * Returns `false` only when an admin has explicitly set the flag to
 * `false` via the cockpit UI. Bot id mismatches default to `true` for
 * the same reason — better to fan out a live mirror that an admin
 * later cancels than to silently quiesce a live signal.
 */
export async function isLiveMirroringEnabledForBotId(
  db: Firestore,
  botId: CockpitBotId,
): Promise<boolean> {
  if (!VALID_COCKPIT_IDS.has(botId)) return true;
  try {
    const snap = await db.doc(SIM_BOT_SETTINGS_DOC[botId]).get();
    if (!snap.exists) return true;
    const parsed = parseSimBotSettings(
      botId,
      snap.data() as Record<string, unknown>,
    );
    return parsed.liveMirroringEnabled !== false;
  } catch (e) {
    // Soft-fail: never block live mirroring on a Firestore read blip.
    // Worst case the bot fans out one extra signal; the cascade and
    // retry-net stay correct because sim is the source of truth.
    console.warn(
      `[BotPolicy] failed to read live-mirroring flag for ${botId}:`,
      e instanceof Error ? e.message : String(e),
    );
    return true;
  }
}

/**
 * Convenience overload — same check, but starting from the internal
 * `botSource` string used everywhere in the trade engine.
 */
export async function isLiveMirroringEnabledForBotSource(
  db: Firestore,
  botSource: string | null | undefined,
): Promise<boolean> {
  const botId = cockpitIdFromBotSource(botSource);
  if (!botId) return true;
  return isLiveMirroringEnabledForBotId(db, botId);
}
