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
  { id: "ALL",       label: "All Bots",    short: "All" },
  { id: "PATTERN",   label: "Crypto Bot",  short: "Crypto" },
  { id: "BTC_ZONE",  label: "BTC Zone",    short: "BTC" },
  { id: "ETH_ZONE",  label: "ETH Zone",    short: "ETH" },
  { id: "SOL_ZONE",  label: "SOL Zone",    short: "SOL" },
  { id: "XRP_ZONE",  label: "XRP Zone",    short: "XRP" },
];

/** Normalise an optional `botSource` field to a canonical bucket so the
 *  filter pill set stays stable even as new bot types appear. Any
 *  unknown value (e.g. a future "ETH_ZONE" before its pill is added)
 *  collapses to "PATTERN" so trades are never silently hidden. */
export function classifyBotSource(raw: string | null | undefined): Exclude<BotSourceFilter, "ALL"> {
  if (raw === BOT_SOURCE_BTC_ZONE) return "BTC_ZONE";
  if (raw === BOT_SOURCE_ETH_ZONE) return "ETH_ZONE";
  if (raw === BOT_SOURCE_SOL_ZONE) return "SOL_ZONE";
  if (raw === BOT_SOURCE_XRP_ZONE) return "XRP_ZONE";
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

/** Lookup helper for inline labels (e.g. "vs Crypto Bot" tooltip text). */
export function botSourceLabel(filter: BotSourceFilter): string {
  const found = BOT_SOURCE_PILLS.find((p) => p.id === filter);
  return found?.label ?? filter;
}
