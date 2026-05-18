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
