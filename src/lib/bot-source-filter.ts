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
 */

// Discriminator values — must match `SimTrade.botSource` writes.
export const BOT_SOURCE_PATTERN = "PATTERN";
export const BOT_SOURCE_BTC_ZONE = "BTC_ZONE";
// Add ETH_ZONE / SOL_ZONE / XRP_ZONE here as those bots ship.

/** Filter pill values. "ALL" includes every trade regardless of source. */
export type BotSourceFilter = "ALL" | "PATTERN" | "BTC_ZONE";

/** Pills rendered, in display order. Add ETH/SOL/XRP entries here when
 *  their bots ship — every page picks them up automatically. */
export interface BotSourcePillOption {
  id:    BotSourceFilter;
  label: string;
  /** Optional short label for narrow viewports. */
  short?: string;
}

export const BOT_SOURCE_PILLS: BotSourcePillOption[] = [
  { id: "ALL",       label: "All Bots",   short: "All" },
  { id: "PATTERN",   label: "Pattern",    short: "Pattern" },
  { id: "BTC_ZONE",  label: "BTC Zone",   short: "BTC" },
];

/** Normalise an optional `botSource` field to a canonical bucket so the
 *  filter pill set stays stable even as new bot types appear. Any
 *  unknown value (e.g. a future "ETH_ZONE" before its pill is added)
 *  collapses to "PATTERN" so trades are never silently hidden. */
export function classifyBotSource(raw: string | null | undefined): Exclude<BotSourceFilter, "ALL"> {
  if (raw === BOT_SOURCE_BTC_ZONE) return "BTC_ZONE";
  // Anything else — including null/undefined/legacy values — is pattern.
  return "PATTERN";
}

/** Predicate factory used by the dashboards to filter their full trade
 *  list before passing it into `buildEquityCurve` / table renderers /
 *  metric calculators. */
export function matchesBotSource(filter: BotSourceFilter) {
  if (filter === "ALL") return () => true;
  return (t: { botSource?: string | null }) => classifyBotSource(t.botSource) === filter;
}

/** Lookup helper for inline labels (e.g. "vs Pattern" tooltip text). */
export function botSourceLabel(filter: BotSourceFilter): string {
  const found = BOT_SOURCE_PILLS.find((p) => p.id === filter);
  return found?.label ?? filter;
}
