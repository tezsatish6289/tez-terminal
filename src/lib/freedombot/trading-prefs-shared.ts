export interface TradingPrefs {
  riskPerTrade: number;
  maxConcurrentTrades: number;
  dailyLossLimit: number;
}

/** Platform defaults for new users and missing fields. */
export const DEFAULT_TRADING_PREFS: TradingPrefs = {
  riskPerTrade: 1,
  maxConcurrentTrades: 1,
  dailyLossLimit: 3,
};

/** Previous platform defaults — treat as "unset" and map to current defaults. */
export const LEGACY_DEFAULT_RISK_PER_TRADE = 0.5;
export const LEGACY_DEFAULT_DAILY_LOSS_LIMIT = 5;

export const RISK_PER_TRADE_OPTIONS = [0.25, 0.5, 0.75, 1] as const;
export const MAX_CONCURRENT_OPTIONS = [1, 2, 3, 5] as const;
export const DAILY_LOSS_OPTIONS = [2, 3, 5, 10] as const;

/**
 * Per-bot bounds on `maxConcurrentTrades`. The shared
 * `MAX_CONCURRENT_OPTIONS` is the master set; this table restricts which
 * of those values are allowed for a given deploy key.
 *
 * Crypto Bot's pattern engine produces a healthy stream of signals across
 * the perp universe, so a too-low cap starves the bot of upside while
 * adding zero risk reduction (per-trade risk is set separately). We
 * enforce min=3, max=5 — the floor lifts users off the legacy
 * platform-default of 1 (which was a pre-multi-bot value); the ceiling
 * keeps the worst-case exposure bounded.
 *
 * Zone bots only run one position at a time in the simulator, so the
 * default stays at 1 but the table doesn't constrain (lets us flex the
 * cap later without a code change). Anything not listed here is treated
 * as unconstrained, i.e. any value in `MAX_CONCURRENT_OPTIONS` is fine.
 */
export const MAX_CONCURRENT_BOUNDS_BY_BOT: Record<string, { min: number; max: number }> = {
  CRYPTO: { min: 3, max: 5 },
};

/** Allowed discrete options for `maxConcurrentTrades` for a specific bot.
 *  Subset of `MAX_CONCURRENT_OPTIONS` filtered by `MAX_CONCURRENT_BOUNDS_BY_BOT`. */
export function allowedMaxConcurrentForBot(bot: string): readonly number[] {
  const bounds = MAX_CONCURRENT_BOUNDS_BY_BOT[bot];
  if (!bounds) return MAX_CONCURRENT_OPTIONS;
  return MAX_CONCURRENT_OPTIONS.filter((n) => n >= bounds.min && n <= bounds.max);
}

/** Clamp a `maxConcurrentTrades` value to the per-bot bounds and snap to
 *  the nearest allowed discrete option. Used at every read/write boundary
 *  so a stale low value on a Crypto deployment can never bypass the floor.
 *
 *  Snap policy when the value falls between allowed steps: pick the
 *  nearest allowed option, breaking ties downward (towards safer / lower
 *  concurrency). For Crypto the allowed set is `[3, 5]`, so any
 *  value ≤ 4 snaps to 3 and any ≥ 5 stays at 5. */
export function clampMaxConcurrentForBot(bot: string, raw: unknown): number {
  const allowed = allowedMaxConcurrentForBot(bot);
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.trunc(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0) {
    return allowed[0] ?? DEFAULT_TRADING_PREFS.maxConcurrentTrades;
  }
  const bounds = MAX_CONCURRENT_BOUNDS_BY_BOT[bot];
  if (!bounds) {
    // Unconstrained bots: pass through if it's a valid option, else
    // fall back to platform default.
    return (MAX_CONCURRENT_OPTIONS as readonly number[]).includes(n)
      ? n
      : DEFAULT_TRADING_PREFS.maxConcurrentTrades;
  }
  const clamped = Math.max(bounds.min, Math.min(bounds.max, n));
  // Snap to nearest allowed option, ties favour the lower (safer) value.
  let best = allowed[0]!;
  let bestDist = Math.abs(best - clamped);
  for (const opt of allowed.slice(1)) {
    const dist = Math.abs(opt - clamped);
    if (dist < bestDist) {
      best = opt;
      bestDist = dist;
    }
  }
  return best;
}

function isRiskPerTrade(n: number): n is (typeof RISK_PER_TRADE_OPTIONS)[number] {
  return (RISK_PER_TRADE_OPTIONS as readonly number[]).includes(n);
}

function isDailyLoss(n: number): n is (typeof DAILY_LOSS_OPTIONS)[number] {
  return (DAILY_LOSS_OPTIONS as readonly number[]).includes(n);
}

/** Effective risk % for live trading and UI (maps legacy 0.5% → 1%). */
export function resolveRiskPerTrade(stored: unknown): number {
  if (typeof stored !== "number" || !Number.isFinite(stored)) {
    return DEFAULT_TRADING_PREFS.riskPerTrade;
  }
  if (stored === LEGACY_DEFAULT_RISK_PER_TRADE) {
    return DEFAULT_TRADING_PREFS.riskPerTrade;
  }
  return isRiskPerTrade(stored) ? stored : DEFAULT_TRADING_PREFS.riskPerTrade;
}

/** Effective daily loss cap % (maps legacy 5% → 3%). */
export function resolveDailyLossLimit(stored: unknown): number {
  if (typeof stored !== "number" || !Number.isFinite(stored)) {
    return DEFAULT_TRADING_PREFS.dailyLossLimit;
  }
  if (stored === LEGACY_DEFAULT_DAILY_LOSS_LIMIT) {
    return DEFAULT_TRADING_PREFS.dailyLossLimit;
  }
  return isDailyLoss(stored) ? stored : DEFAULT_TRADING_PREFS.dailyLossLimit;
}

export function secretNeedsTradingDefaultsMigration(
  data: Record<string, unknown> | undefined | null,
): { riskPerTrade?: number; dailyLossLimit?: number } {
  if (!data) return {};
  const updates: { riskPerTrade?: number; dailyLossLimit?: number } = {};
  const risk = data.riskPerTrade;
  if (
    risk === undefined ||
    risk === null ||
    risk === LEGACY_DEFAULT_RISK_PER_TRADE
  ) {
    updates.riskPerTrade = DEFAULT_TRADING_PREFS.riskPerTrade;
  }
  const daily = data.dailyLossLimit;
  if (
    daily === undefined ||
    daily === null ||
    daily === LEGACY_DEFAULT_DAILY_LOSS_LIMIT
  ) {
    updates.dailyLossLimit = DEFAULT_TRADING_PREFS.dailyLossLimit;
  }
  return updates;
}
