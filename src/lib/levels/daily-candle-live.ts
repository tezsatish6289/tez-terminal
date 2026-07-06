/**
 * Merge today's forming daily bar onto historical daily candles.
 *
 * Dhan's historical daily API only returns completed sessions. During the
 * trading day we append today's bar from the lightweight marketfeed OHLC/quote
 * snapshot (one API call per symbol) instead of aggregating intraday candles.
 */

export interface DailyOhlcCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  /** True when OHLC comes from marketfeed, not finalized EOD historical. */
  live?: boolean;
}

/** Snapshot from Dhan /marketfeed/ohlc or /marketfeed/quote. */
export interface DhanMarketOhlcSnapshot {
  last_price: number;
  ohlc?: {
    open: number;
    close: number;
    high: number;
    low: number;
  };
  volume?: number;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function istDateKeyFromEpochSec(epochSec: number): string {
  return new Date(epochSec * 1000 + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function istTodayKey(nowMs: number = Date.now()): string {
  return new Date(nowMs + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function isIstWeekday(nowMs: number = Date.now()): boolean {
  const day = new Date(nowMs + IST_OFFSET_MS).getUTCDay();
  return day >= 1 && day <= 5;
}

/** Midnight IST as UTC epoch seconds — aligns with how we key Dhan daily bars. */
export function istDayStartEpochSec(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return Math.floor(Date.now() / 1000);
  return Math.floor((Date.UTC(y, m - 1, d) - IST_OFFSET_MS) / 1000);
}

function n(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Build today's daily bar from a Dhan marketfeed snapshot.
 * Uses last_price as the live close during the session.
 */
export function todayBarFromMarketSnapshot(
  snap: DhanMarketOhlcSnapshot | null | undefined,
  todayKey: string = istTodayKey(),
): DailyOhlcCandle | null {
  if (!snap?.ohlc) return null;
  const open = n(snap.ohlc.open);
  const high = n(snap.ohlc.high);
  const low = n(snap.ohlc.low);
  const last = n(snap.last_price);
  if (open == null || high == null || low == null || last == null) return null;
  if (open <= 0 || high <= 0 || low <= 0 || last <= 0) return null;

  const volume = n(snap.volume);
  return {
    time: istDayStartEpochSec(todayKey),
    open,
    high: Math.max(high, last),
    low: Math.min(low, last),
    close: last,
    ...(volume != null && volume > 0 ? { volume } : {}),
    live: true,
  };
}

/**
 * Append or replace today's session bar on a daily series.
 * No-op when todayBar is null or history already ends on a future day.
 */
export function mergeTodaySessionBar<T extends DailyOhlcCandle>(
  daily: readonly T[],
  todayBar: DailyOhlcCandle | null,
): T[] {
  if (!daily.length || !todayBar) return [...daily];

  const todayKey = istDateKeyFromEpochSec(todayBar.time);
  const last = daily[daily.length - 1]!;
  const lastKey = istDateKeyFromEpochSec(last.time);
  if (lastKey > todayKey) return [...daily];

  if (lastKey === todayKey) {
    return [...daily.slice(0, -1), { ...last, ...todayBar } as T];
  }

  return [...daily, todayBar as T];
}

/** Merge a marketfeed today bar onto daily history (weekdays only). */
export function enrichDailyWithTodayMarketBar<T extends DailyOhlcCandle>(
  daily: readonly T[],
  snap: DhanMarketOhlcSnapshot | null | undefined,
  nowMs: number = Date.now(),
): T[] {
  if (!daily.length || !isIstWeekday(nowMs)) return [...daily];
  const todayBar = todayBarFromMarketSnapshot(snap, istTodayKey(nowMs));
  return mergeTodaySessionBar(daily, todayBar);
}
