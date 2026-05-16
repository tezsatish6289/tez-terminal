/**
 * Per-user opt-in for zone-bot live mirroring.
 *
 * Live-trade eligibility today is a single field: `autoTradeEnabled` on
 * the user's exchange secrets doc. That single switch grants the user
 * EVERY mirrored trade `executeForAllUsers` is invoked for.
 *
 * The zone bots are a brand-new sub-system with a different risk
 * profile (no signal score / pattern context, just zone math), so we
 * MUST gate them behind an explicit second opt-in or we'd silently
 * enroll every existing pattern-bot user without their consent.
 *
 * The shape stored on `users/{uid}/secrets/{exchangeId}`:
 *
 *   zoneBotsEnabled: {
 *     btc?: boolean;   // BTC Zone Bot (only one wired today)
 *     eth?: boolean;   // future
 *     sol?: boolean;   // future
 *     xrp?: boolean;   // future
 *   }
 *
 * Missing field / missing key → false (default OFF). Existing pattern-
 * bot users are unaffected until they explicitly flip the per-bot
 * switch in the dashboard UI.
 */

/** Map of bot-source discriminator → secrets-doc field key. The
 *  presence of an entry here is what makes a bot "shippable" — any
 *  botSource NOT in this map is treated as unknown and refused. This
 *  is deliberately stricter than `classifyBotSource` in
 *  `bot-source-filter.ts` (which collapses unknown values to "PATTERN"
 *  so UI filters stay usable); for live-money mirroring, unknown =
 *  refuse, never silently fall through to pattern's "every user gets
 *  it" semantics. */
const BOT_SOURCE_TO_FIELD: Record<string, "btc" | "eth" | "sol" | "xrp"> = {
  BTC_ZONE: "btc",
  ETH_ZONE: "eth",
  SOL_ZONE: "sol",
  XRP_ZONE: "xrp",
};

export interface ZoneBotsEnabledMap {
  btc?: boolean;
  eth?: boolean;
  sol?: boolean;
  xrp?: boolean;
}

/**
 * Returns true if this user has opted into receiving live mirrors for
 * the given bot-source. Called by `executeForAllUsers` per
 * (user × exchange × secrets-doc) tuple, AFTER the existing
 * `autoTradeEnabled === true` check.
 *
 *   • Pattern trades (botSource null/undefined/"PATTERN") → true.
 *     Existing behaviour: any autoTradeEnabled user gets pattern
 *     mirrors. No regression.
 *
 *   • Known zone-bot trades (BTC_ZONE, ETH_ZONE, SOL_ZONE, XRP_ZONE)
 *     → require an explicit `secretData.zoneBotsEnabled[<bot>] ===
 *     true`. Default false.
 *
 *   • Unknown botSource → false, so we never silently mirror a bot
 *     before it's been deliberately wired (UI, opt-in, etc.).
 */
export function userOptedIntoBot(
  secretData: Record<string, unknown> | undefined | null,
  botSource: string | null | undefined,
): boolean {
  if (botSource == null || botSource === "PATTERN") return true;

  const field = BOT_SOURCE_TO_FIELD[botSource];
  if (!field) return false;

  const map = (secretData?.zoneBotsEnabled as ZoneBotsEnabledMap | undefined) ?? {};
  return map[field] === true;
}

/** Canonical field key for the settings PUT payload — used as the
 *  Firestore dotted-path so multiple bots can be toggled without
 *  clobbering each other's enabled state. */
export function zoneBotsEnabledFieldKey(bot: "btc" | "eth" | "sol" | "xrp"): string {
  return `zoneBotsEnabled.${bot}`;
}
