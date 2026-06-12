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

export const RISK_PER_TRADE_OPTIONS = [1, 1.5, 2, 3] as const;
export const MAX_CONCURRENT_OPTIONS = [1, 2, 3, 5] as const;
export const DAILY_LOSS_OPTIONS = [2, 3, 5, 10] as const;

const ZONE_DEPLOY_KEYS = ["BTC", "ETH", "SOL", "XRP"] as const;

/**
 * Per-bot allowed values for `maxConcurrentTrades`.
 * Crypto Bot — 1, 2, 3, 4, or 5 concurrent positions. This pool is
 *   shared by native pattern trades AND attached zone-bot mirrors
 *   (each open trade = 1 slot), so 4 must be selectable to let a
 *   subscriber hold all four attached zone bots at once.
 * Zone bots — 1 only (one position at a time in the simulator).
 */
export function allowedMaxConcurrentForBot(bot: string): readonly number[] {
  const key = bot.toUpperCase();
  if (key === "CRYPTO") return [1, 2, 3, 4, 5];
  if ((ZONE_DEPLOY_KEYS as readonly string[]).includes(key)) return [1];
  return MAX_CONCURRENT_OPTIONS;
}

/** Clamp / snap `maxConcurrentTrades` to the per-bot allowed set. */
export function clampMaxConcurrentForBot(bot: string, raw: unknown): number {
  const allowed = allowedMaxConcurrentForBot(bot);
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.trunc(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0) {
    return allowed[0] ?? DEFAULT_TRADING_PREFS.maxConcurrentTrades;
  }
  if ((allowed as readonly number[]).includes(n)) return n;
  let best = allowed[0]!;
  let bestDist = Math.abs(best - n);
  for (const opt of allowed.slice(1)) {
    const dist = Math.abs(opt - n);
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

/** Effective risk % for live trading and UI (maps legacy values → 1%). */
export function resolveRiskPerTrade(stored: unknown): number {
  if (typeof stored !== "number" || !Number.isFinite(stored)) {
    return DEFAULT_TRADING_PREFS.riskPerTrade;
  }
  if (isRiskPerTrade(stored)) return stored;
  if (stored === LEGACY_DEFAULT_RISK_PER_TRADE) {
    return DEFAULT_TRADING_PREFS.riskPerTrade;
  }
  return DEFAULT_TRADING_PREFS.riskPerTrade;
}

export function snapRiskPerTradeForBot(raw: unknown): number {
  return resolveRiskPerTrade(raw);
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
