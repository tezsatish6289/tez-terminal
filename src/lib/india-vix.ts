/**
 * India VIX — the market-wide implied-volatility gauge for NIFTY.
 *
 * One clean, free signal that calibrates "is the whole market stressed right
 * now?" without per-symbol history. Used as the `vixPercentile` backdrop in the
 * volatility-regime engine: a level sitting in elevated VIX is higher-risk even
 * if that single name's own IV looks ordinary.
 *
 * Source: NSE `allIndices` (already part of the cookie handshake) carries an
 * `INDIA VIX` row. We snapshot it once per IST day into a rolling series and
 * precompute its percentile so every zone compute just reads one cheap doc.
 *
 * The state doc lives at `config/india_vix_state`:
 *   { value, percentile, history: [{date,value}], updatedAt }
 */

import type { Firestore } from "firebase-admin/firestore";
import type { NseSession } from "@/lib/nse/client";
import { nseFetch } from "@/lib/nse-fetch";
import { API_HEADERS, BROWSER_HEADERS } from "@/lib/nse-session";
import { ivPercentile } from "@/lib/zones/vol-regime";
import { istDateKey, IV_HISTORY_CAP } from "@/lib/iv-history";

/** NSE historical endpoints reject the option-chain Referer the session sends. */
const HISTORICAL_REFERER = "https://www.nseindia.com/reports-indices-historical-index-data";

const NSE_ALL_INDICES = "https://www.nseindia.com/api/allIndices";
const NSE_VIX_HISTORY = "https://www.nseindia.com/api/historical/vixhistory";
const NSE_INDICES_HISTORY = "https://www.nseindia.com/api/historical/indicesHistory";
export const INDIA_VIX_DOC = "config/india_vix_state";

interface AllIndicesRow {
  index?: string;
  indexSymbol?: string;
  last?: number;
}
interface AllIndicesResponse {
  data?: AllIndicesRow[];
}

interface VixHistoryEntry {
  date: string;
  value: number;
}

/** Pull the current India VIX level from NSE `allIndices`. Throws on NSE block. */
export async function fetchIndiaVix(session: NseSession): Promise<number | null> {
  const json = await session.fetchJson<AllIndicesResponse>(NSE_ALL_INDICES);
  const rows = json.data ?? [];
  for (const row of rows) {
    const name = (row.index ?? row.indexSymbol ?? "").toUpperCase();
    if (name === "INDIA VIX") {
      const v = Number(row.last);
      return Number.isFinite(v) && v > 0 ? v : null;
    }
  }
  return null;
}

// ── Historical backfill (one-time seed so percentile is meaningful day 1) ──

interface VixHistoryRow {
  EOD_TIMESTAMP?: string;
  TIMESTAMP?: string;
  mTIMESTAMP?: string;
  date?: string;
  EOD_CLOSE_INDEX_VAL?: number | string;
  close?: number | string;
  CLOSE?: number | string;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Normalise NSE date strings (`DD-MMM-YYYY` or ISO) to a `YYYY-MM-DD` key. */
export function vixDateKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})$/);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon === undefined) return null;
    const d = new Date(Date.UTC(Number(m[3]), mon, Number(m[1])));
    return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

/**
 * Parse NSE vixhistory rows into a clean, ascending, deduped daily series.
 * Permissive about field names across NSE response variants. Pure.
 */
export function parseVixHistory(rows: VixHistoryRow[]): VixHistoryEntry[] {
  const byDate = new Map<string, number>();
  for (const row of rows) {
    const date = vixDateKey(row.EOD_TIMESTAMP ?? row.TIMESTAMP ?? row.mTIMESTAMP ?? row.date);
    if (!date) continue;
    const value = Number(row.EOD_CLOSE_INDEX_VAL ?? row.close ?? row.CLOSE);
    if (!Number.isFinite(value) || value <= 0) continue;
    byDate.set(date, value); // last write wins on dupes
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function ddmmyyyy(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}-${mon}-${d.getUTCFullYear()}`;
}

/** Pull rows out of the assorted shapes NSE history endpoints return. */
function extractHistoryRows(json: unknown): VixHistoryRow[] {
  if (Array.isArray(json)) return json as VixHistoryRow[];
  const obj = json as { data?: unknown };
  if (Array.isArray(obj?.data)) return obj.data as VixHistoryRow[];
  const nested = (obj?.data as { indexCloseOnlineRecords?: unknown })?.indexCloseOnlineRecords;
  if (Array.isArray(nested)) return nested as VixHistoryRow[];
  return [];
}

/**
 * Visit the historical-data page to pick up the extra cookies NSE sets there
 * (its `/api/historical/*` endpoints serve a bot-challenge page without them).
 * Returns the session cookies augmented with any Set-Cookie from the page.
 */
async function warmHistoricalCookies(baseCookies: string): Promise<string> {
  try {
    const res = await nseFetch(HISTORICAL_REFERER, {
      headers: { ...BROWSER_HEADERS, Cookie: baseCookies },
      signal: AbortSignal.timeout(15_000),
    });
    const set = (res.headers as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
    const extra = set.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
    return extra ? `${baseCookies}; ${extra}` : baseCookies;
  } catch {
    return baseCookies;
  }
}

/**
 * Raw NSE history GET with the historical-page Referer + warmed cookies + a
 * browser-like header set. The shared `session.fetchJson` sends the option-chain
 * Referer, which the historical endpoints answer with non-JSON — hence this
 * dedicated path.
 */
async function fetchHistoryJson(url: string, cookies: string): Promise<unknown> {
  const res = await nseFetch(url, {
    headers: {
      ...API_HEADERS,
      Cookie: cookies,
      Referer: HISTORICAL_REFERER,
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Dest": "empty",
      "X-Requested-With": "XMLHttpRequest",
    },
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.text()).trim();
  if (!body) throw new Error(`empty body (HTTP ${res.status}) for ${url}`);
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`non-JSON (HTTP ${res.status}) for ${url}: ${body.slice(0, 120)}`);
  }
}

/**
 * Fetch India VIX OHLC history for the last `days` days. Tries the dedicated
 * `vixhistory` endpoint first, then falls back to `indicesHistory?indexType=
 * INDIA VIX` (the path that returns `data.indexCloseOnlineRecords`). Throws only
 * if both yield nothing usable.
 */
export async function fetchIndiaVixHistory(
  session: NseSession,
  days: number,
  now: number = Date.now(),
): Promise<VixHistoryEntry[]> {
  const to = new Date(now);
  const from = new Date(now - days * 86_400_000);
  const range = `from=${ddmmyyyy(from)}&to=${ddmmyyyy(to)}`;
  const urls = [
    `${NSE_VIX_HISTORY}?${range}`,
    `${NSE_INDICES_HISTORY}?indexType=${encodeURIComponent("INDIA VIX")}&${range}`,
  ];

  const cookies = await warmHistoricalCookies(session.cookies);
  let lastErr: unknown = null;
  for (const url of urls) {
    try {
      const json = await fetchHistoryJson(url, cookies);
      const parsed = parseVixHistory(extractHistoryRows(json));
      if (parsed.length) return parsed;
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

export interface IndiaVixBackfillResult {
  ok: boolean;
  samples: number;
  value: number | null;
  percentile: number | null;
  error?: string;
}

/**
 * One-time seed of the India VIX series from NSE history so the percentile is
 * meaningful immediately instead of after ~20 daily snapshots. Best-effort.
 */
export async function backfillIndiaVix(
  db: Firestore,
  session: NseSession,
  days = 365,
): Promise<IndiaVixBackfillResult> {
  try {
    const history = (await fetchIndiaVixHistory(session, days)).slice(-IV_HISTORY_CAP);
    if (!history.length) {
      return { ok: false, samples: 0, value: null, percentile: null, error: "no history rows" };
    }
    const latest = history[history.length - 1];
    const prior = history.slice(0, -1).map((e) => e.value);
    const percentile = ivPercentile(prior, latest.value);
    await db.doc(INDIA_VIX_DOC).set({
      value: latest.value,
      percentile,
      history,
      updatedAt: new Date().toISOString(),
      backfilledAt: new Date().toISOString(),
    });
    return { ok: true, samples: history.length, value: latest.value, percentile };
  } catch (e) {
    return { ok: false, samples: 0, value: null, percentile: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Parse an NSE "Download (.csv)" India VIX export into a clean daily series.
 * Header looks like `Date ,Open ,High ,Low ,Close ,Prev. Close ,Change ,% Change`
 * with `DD-MON-YYYY` dates. Permissive: locates the date + close columns by
 * name so column order / spacing changes don't break it. Pure.
 */
export function parseVixCsv(text: string): VixHistoryEntry[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const dateIdx = header.findIndex((h) => h === "date" || h.startsWith("date"));
  let closeIdx = header.findIndex((h) => h === "close");
  if (closeIdx === -1) closeIdx = header.findIndex((h) => h.includes("close") && !h.includes("prev"));
  if (dateIdx === -1 || closeIdx === -1) return [];

  const byDate = new Map<string, number>();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const date = vixDateKey(cols[dateIdx]?.trim());
    const value = Number(String(cols[closeIdx] ?? "").replace(/["',]/g, "").trim());
    if (!date || !Number.isFinite(value) || value <= 0) continue;
    byDate.set(date, value);
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Seed the India VIX state from an already-parsed series (e.g. a CSV upload),
 * with no NSE dependency. Caps to ~1 trading year and ranks the latest reading
 * against the rest so the percentile is live immediately.
 */
export async function seedIndiaVix(
  db: Firestore,
  entries: VixHistoryEntry[],
): Promise<IndiaVixBackfillResult> {
  const history = [...entries].sort((a, b) => a.date.localeCompare(b.date)).slice(-IV_HISTORY_CAP);
  if (!history.length) {
    return { ok: false, samples: 0, value: null, percentile: null, error: "no usable rows" };
  }
  const latest = history[history.length - 1];
  const percentile = ivPercentile(history.slice(0, -1).map((e) => e.value), latest.value);
  await db.doc(INDIA_VIX_DOC).set({
    value: latest.value,
    percentile,
    history,
    updatedAt: new Date().toISOString(),
    seededAt: new Date().toISOString(),
  });
  return { ok: true, samples: history.length, value: latest.value, percentile };
}

/** Append today's VIX, deduped by IST day, capped to ~1 trading year. Pure. */
export function appendDailyVix(
  history: readonly VixHistoryEntry[],
  dateKey: string,
  value: number,
  cap: number = IV_HISTORY_CAP,
): VixHistoryEntry[] {
  if (!Number.isFinite(value)) return [...history];
  if (history.length && history[history.length - 1].date === dateKey) return [...history];
  const next = [...history, { date: dateKey, value }];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

export interface IndiaVixState {
  value: number | null;
  percentile: number | null;
}

/** Load the precomputed India VIX value + percentile; null-safe. */
export async function loadIndiaVixState(db: Firestore): Promise<IndiaVixState> {
  try {
    const snap = await db.doc(INDIA_VIX_DOC).get();
    const data = snap.data();
    const value = typeof data?.value === "number" && Number.isFinite(data.value) ? data.value : null;
    const percentile =
      typeof data?.percentile === "number" && Number.isFinite(data.percentile) ? data.percentile : null;
    return { value, percentile };
  } catch {
    return { value: null, percentile: null };
  }
}

export interface IndiaVixRefreshResult {
  ok: boolean;
  value: number | null;
  percentile: number | null;
  samples: number;
  error?: string;
}

/**
 * Snapshot India VIX, append to history (once/day), recompute its percentile,
 * and persist. Best-effort: returns an error result rather than throwing.
 */
export async function refreshIndiaVix(
  db: Firestore,
  session: NseSession,
  now: number = Date.now(),
): Promise<IndiaVixRefreshResult> {
  try {
    const value = await fetchIndiaVix(session);
    if (value == null) {
      return { ok: false, value: null, percentile: null, samples: 0, error: "India VIX not found in allIndices" };
    }

    const snap = await db.doc(INDIA_VIX_DOC).get();
    const raw = snap.data()?.history;
    const history: VixHistoryEntry[] = Array.isArray(raw)
      ? raw.filter(
          (e): e is VixHistoryEntry =>
            e && typeof e.date === "string" && typeof e.value === "number" && Number.isFinite(e.value),
        )
      : [];

    const nextHistory = appendDailyVix(history, istDateKey(now), value);
    // Percentile of the live value within the (pre-append) history so today's
    // reading is ranked against prior sessions, not itself.
    const percentile = ivPercentile(history.map((e) => e.value), value);

    await db.doc(INDIA_VIX_DOC).set({
      value,
      percentile,
      history: nextHistory,
      updatedAt: new Date().toISOString(),
    });

    return { ok: true, value, percentile, samples: nextHistory.length };
  } catch (e) {
    return { ok: false, value: null, percentile: null, samples: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
