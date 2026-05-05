/**
 * Market hours awareness for asset types with fixed trading sessions.
 * Crypto markets are 24/7 and always open.
 *
 * Indian market session:
 *   Open:        9:15 AM IST
 *   Entry cutoff: 2:30 PM IST  — no new intraday positions after this
 *   Square-off:  3:15 PM IST  — all open intraday positions force-closed
 *   Close:       3:30 PM IST
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function getISTDate(utcDate: Date = new Date()): Date {
  return new Date(utcDate.getTime() + IST_OFFSET_MS);
}

function istTimeInMins(now: Date = new Date()): { day: number; mins: number } {
  const ist = getISTDate(now);
  return {
    day: ist.getUTCDay(),
    mins: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
  };
}

/** True during the full NSE trading session (9:15 AM – 3:30 PM IST, Mon–Fri). */
export function isIndianMarketOpen(now: Date = new Date()): boolean {
  const { day, mins } = istTimeInMins(now);
  if (day === 0 || day === 6) return false;
  return mins >= 9 * 60 + 15 && mins < 15 * 60 + 30;
}

/**
 * Mon–Fri, 9:00–16:00 IST (inclusive of 4:00 PM).
 * For scheduled NSE option-chain / Nifty zone refresh: skip outside this window to avoid
 * useless calls when the external cron is every 15 minutes, 24/7.
 *
 * Set `NIFTY_ZONES_CRON_IGNORE_WINDOW=true` to always allow (e.g. local testing).
 */
export function isNiftyOptionChainCronWindow(now: Date = new Date()): boolean {
  if (typeof process !== "undefined" && process.env.NIFTY_ZONES_CRON_IGNORE_WINDOW === "true") {
    return true;
  }
  const { day, mins } = istTimeInMins(now);
  if (day === 0 || day === 6) return false;
  return mins >= 9 * 60 && mins <= 16 * 60;
}

/**
 * True only when new intraday entries are allowed.
 * No new trades after 2:00 PM IST — leaves 1h15m for trades to play out
 * before the 3:15 PM mandatory square-off.
 */
export function isIndianMarketEntryAllowed(now: Date = new Date()): boolean {
  const { day, mins } = istTimeInMins(now);
  if (day === 0 || day === 6) return false;
  return mins >= 9 * 60 + 15 && mins < 14 * 60;
}

/**
 * True between 3:15 PM and 3:30 PM IST on weekdays.
 * This is the window when all open intraday positions must be force-squared off.
 */
export function isIndianSquareOffTime(now: Date = new Date()): boolean {
  const { day, mins } = istTimeInMins(now);
  if (day === 0 || day === 6) return false;
  return mins >= 15 * 60 + 15 && mins < 15 * 60 + 30;
}

export function isMarketOpen(assetType: string, now: Date = new Date()): boolean {
  const upper = assetType.toUpperCase();
  if (upper.includes("INDIAN") || upper.includes("STOCK")) return isIndianMarketOpen(now);
  return true;
}

export function getAssetTypeForExchange(exchange: string): string {
  if (exchange === "DHAN") return "INDIAN STOCKS";
  return "CRYPTO";
}
