export const LEVERAGE_MAP: Record<string, number> = {
  "5": 10,
  "15": 5,
  "60": 3,
  "240": 3,
  "D": 1,
};

export function getLeverage(timeframe: string | undefined | null): number {
  if (!timeframe) return 1;
  const tf = String(timeframe).toUpperCase();
  return LEVERAGE_MAP[tf] ?? 1;
}

export function getLeverageLabel(timeframe: string | undefined | null): string {
  return `${getLeverage(timeframe)}x`;
}
