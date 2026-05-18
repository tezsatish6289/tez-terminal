export interface TradingPrefs {
  riskPerTrade: number;
  maxConcurrentTrades: number;
  dailyLossLimit: number;
}

export const DEFAULT_TRADING_PREFS: TradingPrefs = {
  riskPerTrade: 0.5,
  maxConcurrentTrades: 1,
  dailyLossLimit: 5,
};

export const RISK_PER_TRADE_OPTIONS = [0.25, 0.5, 0.75, 1] as const;
export const MAX_CONCURRENT_OPTIONS = [1, 2, 3, 5] as const;
export const DAILY_LOSS_OPTIONS = [2, 3, 5, 10] as const;
