/**
 * BTC buy-and-hold benchmark aligned to portfolio calendar months.
 * Monthly % = (close − open) / open; cumulative % vs first month open.
 */

export interface BtcMonthlyKline {
  monthKey: string;
  open: number;
  close: number;
}

export interface BtcMonthlyReturnPoint {
  monthKey: string;
  btcMonthlyReturnPct: number;
  btcCumulativeReturnPct: number;
}

export function monthKeyFromUtcMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Parse Bybit / Binance monthly kline rows into keyed candles. */
export function parseMonthlyKlines(rows: { startMs: number; open: number; close: number }[]): Map<string, BtcMonthlyKline> {
  const map = new Map<string, BtcMonthlyKline>();
  for (const row of rows) {
    if (!Number.isFinite(row.open) || !Number.isFinite(row.close) || row.open <= 0) continue;
    const monthKey = monthKeyFromUtcMs(row.startMs);
    map.set(monthKey, { monthKey, open: row.open, close: row.close });
  }
  return map;
}

/**
 * Build BTC return series for the same calendar months as the portfolio chart.
 * Skips months with no kline data.
 */
export function buildBtcMonthlyReturnSeries(
  monthKeys: string[],
  klinesByMonth: Map<string, BtcMonthlyKline>,
): BtcMonthlyReturnPoint[] {
  if (!monthKeys.length) return [];

  const baseline = klinesByMonth.get(monthKeys[0])?.open;
  if (baseline == null || baseline <= 0) return [];

  const out: BtcMonthlyReturnPoint[] = [];
  for (const monthKey of monthKeys) {
    const k = klinesByMonth.get(monthKey);
    if (!k) continue;
    const btcMonthlyReturnPct = parseFloat((((k.close - k.open) / k.open) * 100).toFixed(2));
    const btcCumulativeReturnPct = parseFloat((((k.close - baseline) / baseline) * 100).toFixed(2));
    out.push({ monthKey, btcMonthlyReturnPct, btcCumulativeReturnPct });
  }
  return out;
}

function monthsBetweenInclusive(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

function monthStartMs(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return Date.UTC(y, m - 1, 1);
}

function monthEndMs(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return Date.UTC(y, m, 1) - 1;
}

function currentMonthKey(): string {
  return monthKeyFromUtcMs(Date.now());
}

async function fetchBybitMonthlyKlines(
  fromMonth: string,
  toMonth: string,
): Promise<{ startMs: number; open: number; close: number }[]> {
  const start = monthStartMs(fromMonth);
  const end = monthEndMs(toMonth);
  const limit = Math.min(200, monthsBetweenInclusive(fromMonth, toMonth) + 2);
  const url =
    `https://api.bybit.com/v5/market/kline` +
    `?category=linear&symbol=BTCUSDT&interval=M&start=${start}&end=${end}&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000), next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Bybit klines HTTP ${res.status}`);
  const json = (await res.json()) as { result?: { list?: string[][] } };
  const list = json?.result?.list ?? [];
  return list.map((k) => ({
    startMs: Number(k[0]),
    open: parseFloat(k[1]),
    close: parseFloat(k[4]),
  }));
}

async function fetchBinanceMonthlyKlines(
  fromMonth: string,
  toMonth: string,
): Promise<{ startMs: number; open: number; close: number }[]> {
  const start = monthStartMs(fromMonth);
  const end = monthEndMs(toMonth);
  const limit = Math.min(200, monthsBetweenInclusive(fromMonth, toMonth) + 2);
  const url =
    `https://fapi.binance.com/fapi/v1/klines` +
    `?symbol=BTCUSDT&interval=1M&startTime=${start}&endTime=${end}&limit=${limit}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000), next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Binance klines HTTP ${res.status}`);
  const rows = (await res.json()) as unknown[][];
  return rows.map((k) => ({
    startMs: Number(k[0]),
    open: parseFloat(String(k[1])),
    close: parseFloat(String(k[4])),
  }));
}

/** Fetch monthly BTC/USDT candles — Bybit first, Binance fallback. */
export async function fetchBtcMonthlyKlines(fromMonth: string, toMonth: string): Promise<Map<string, BtcMonthlyKline>> {
  const endMonth = toMonth > currentMonthKey() ? currentMonthKey() : toMonth;
  let rows: { startMs: number; open: number; close: number }[];
  try {
    rows = await fetchBybitMonthlyKlines(fromMonth, endMonth);
  } catch {
    rows = await fetchBinanceMonthlyKlines(fromMonth, endMonth);
  }
  return parseMonthlyKlines(rows);
}

export async function fetchBtcMonthlyReturnSeries(
  monthKeys: string[],
): Promise<BtcMonthlyReturnPoint[]> {
  if (!monthKeys.length) return [];
  const klines = await fetchBtcMonthlyKlines(monthKeys[0], monthKeys[monthKeys.length - 1]);
  return buildBtcMonthlyReturnSeries(monthKeys, klines);
}
