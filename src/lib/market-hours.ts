/**
 * Market hours awareness for asset types with fixed trading sessions.
 * Crypto markets are 24/7 and always open.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function getISTDate(utcDate: Date = new Date()): Date {
  return new Date(utcDate.getTime() + IST_OFFSET_MS);
}

export function isIndianMarketOpen(now: Date = new Date()): boolean {
  const ist = getISTDate(now);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false;

  const hours = ist.getUTCHours();
  const mins = ist.getUTCMinutes();
  const timeInMins = hours * 60 + mins;
  return timeInMins >= 9 * 60 && timeInMins < 16 * 60; // 9:00 AM - 4:00 PM IST
}

export function isMarketOpen(assetType: string, now: Date = new Date()): boolean {
  const upper = assetType.toUpperCase();
  if (upper.includes("INDIAN") || upper.includes("STOCK")) return isIndianMarketOpen(now);
  return true; // crypto is always open
}

export function getAssetTypeForExchange(exchange: string): string {
  if (exchange === "DHAN") return "INDIAN STOCKS";
  return "CRYPTO";
}
