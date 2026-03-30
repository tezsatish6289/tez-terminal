const CRYPTO_LEVERAGE: Record<string, number> = {
  "5": 10,
  "15": 5,
  "60": 3,
  "240": 3,
  "D": 1,
};

const STOCK_LEVERAGE: Record<string, number> = {
  "5": 5,
  "15": 1,
  "60": 1,
  "240": 1,
  "D": 1,
};

export const LEVERAGE_MAP = CRYPTO_LEVERAGE;

export function getLeverage(timeframe: string | undefined | null, assetType?: string): number {
  if (!timeframe) return 1;
  const tf = String(timeframe).toUpperCase();
  const isStock = assetType?.toUpperCase().includes("INDIAN") || assetType?.toUpperCase().includes("STOCK");
  const map = isStock ? STOCK_LEVERAGE : CRYPTO_LEVERAGE;
  return map[tf] ?? 1;
}

export function getLeverageLabel(timeframe: string | undefined | null, assetType?: string): string {
  return `${getLeverage(timeframe, assetType)}x`;
}
