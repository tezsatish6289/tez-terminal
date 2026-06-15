import { CRYPTO_BOTS } from "@/lib/crypto-bots";
import {
  BOT_SOURCE_BTC_ZONE,
  BOT_SOURCE_ETH_ZONE,
  BOT_SOURCE_PATTERN,
  BOT_SOURCE_SOL_ZONE,
  BOT_SOURCE_XRP_ZONE,
  classifyBotSource,
  type BotSourceFilter,
} from "@/lib/bot-source-constants";

/**
 * Bot Source filter — shared helpers for the per-bot performance filter
 * pills shown on `/simulation`, `/freedombot/records`, and
 * `/freedombot/performance`.
 *
 * Backed by the optional `botSource?: string` field stamped on each
 * `SimTrade` (see `src/lib/simulator.ts`). Missing/undefined →
 * "PATTERN" (legacy + new pattern-signal trades). Non-PATTERN values
 * are written by zone bots (currently only "BTC_ZONE"; ETH_ZONE etc.
 * follow in later PRs).
 *
 * The "All" filter shows the actual shared-capital reality (one
 * collection, one running sum). Per-bot filters show a *counterfactual*
 * equity curve — "what would have happened if only this bot ran,
 * starting from `simState.startingCapital`?". See `docs/zone-bots.md`
 * §"Performance tracking" for the rationale.
 *
 * The bot-source constants, `BotSourceFilter` type, and
 * `classifyBotSource` helper live in `bot-source-constants.ts` to keep
 * this file's `CRYPTO_BOTS` dependency from creating a circular import.
 * They're re-exported below so existing call sites keep working.
 */

export {
  BOT_SOURCE_PATTERN,
  BOT_SOURCE_BTC_ZONE,
  BOT_SOURCE_ETH_ZONE,
  BOT_SOURCE_SOL_ZONE,
  BOT_SOURCE_XRP_ZONE,
  classifyBotSource,
  isZoneBotSource,
};
export type { BotSourceFilter };

/** Pills rendered, in display order. Add ETH/SOL/XRP entries here when
 *  their bots ship — every page picks them up automatically. */
export interface BotSourcePillOption {
  id:    BotSourceFilter;
  label: string;
  /** Optional short label for narrow viewports. */
  short?: string;
}

// Note: `id: "PATTERN"` is the internal discriminator (matches the
// SimTrade.botSource string used everywhere — Firestore docs, cron
// guards, opt-in helper, etc.) and is kept stable on purpose. Only
// the UI labels track the product brand ("Crypto Bot"), so renames
// here are display-only and don't touch the data model.
export const BOT_SOURCE_PILLS: BotSourcePillOption[] = [
  { id: "ALL", label: "All Bots", short: "All" },
  ...CRYPTO_BOTS.map((b) => ({
    id: b.botSource as Exclude<BotSourceFilter, "ALL">,
    label: b.label,
    short: b.shortLabel,
  })),
];

/** Predicate factory used by the dashboards to filter their full trade
 *  list before passing it into `buildEquityCurve` / table renderers /
 *  metric calculators. */
export function matchesBotSource(filter: BotSourceFilter) {
  if (filter === "ALL") return () => true;
  return (t: { botSource?: string | null }) => classifyBotSource(t.botSource) === filter;
}

/** Lookup helper for inline labels (e.g. "vs Crypto Bot" tooltip text). */
export function botSourceLabel(filter: BotSourceFilter): string {
  const found = BOT_SOURCE_PILLS.find((p) => p.id === filter);
  return found?.label ?? filter;
}
