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
import { ivPercentile } from "@/lib/zones/vol-regime";
import { istDateKey, IV_HISTORY_CAP } from "@/lib/iv-history";

const NSE_ALL_INDICES = "https://www.nseindia.com/api/allIndices";
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
