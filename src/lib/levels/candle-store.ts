/**
 * Firestore-backed shared store for closed daily candles.
 *
 * One document per symbol under `config/candle_daily_{KEY}`. Closed bars are
 * immutable, so every viewer reads from here and Dhan is only hit to backfill
 * or append newly-closed sessions (see `candle-store-core` for the fetch plan).
 *
 * Best-effort: any Firestore failure degrades to an empty store, and the caller
 * falls back to fetching directly from Dhan — the chart never breaks.
 */

import "server-only";
import { getAdminFirestore } from "@/firebase/admin";
import type { DailyOhlcCandle } from "./daily-candle-live";
import type { DailyStoreState } from "./candle-store-core";
import type { IntradayBar, IntradayStoreState } from "./intraday-store-core";

const DOC_PREFIX = "candle_daily_";
const INTRADAY_DOC_PREFIX = "candle_intraday_";

function symbolKey(symbol: string): string {
  return symbol.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function docId(symbol: string): string {
  return `config/${DOC_PREFIX}${symbolKey(symbol)}`;
}

function intradayDocId(symbol: string, interval: string): string {
  return `config/${INTRADAY_DOC_PREFIX}${symbolKey(symbol)}_${symbolKey(interval)}`;
}

function isValidBar(b: unknown): b is DailyOhlcCandle {
  if (!b || typeof b !== "object") return false;
  const r = b as Record<string, unknown>;
  return (
    typeof r.time === "number" &&
    Number.isFinite(r.time) &&
    typeof r.open === "number" &&
    typeof r.high === "number" &&
    typeof r.low === "number" &&
    typeof r.close === "number" &&
    Number.isFinite(r.open) &&
    Number.isFinite(r.high) &&
    Number.isFinite(r.low) &&
    Number.isFinite(r.close)
  );
}

/** Load a symbol's closed daily series; empty on any failure. */
export async function loadDailyStore(symbol: string): Promise<DailyStoreState> {
  try {
    const db = getAdminFirestore();
    const snap = await db.doc(docId(symbol)).get();
    const data = snap.data();
    const raw = data?.bars;
    const bars: DailyOhlcCandle[] = Array.isArray(raw) ? raw.filter(isValidBar) : [];
    bars.sort((a, b) => a.time - b.time);
    return {
      bars,
      updatedThrough: typeof data?.updatedThrough === "string" ? data.updatedThrough : null,
      checkedThroughMs:
        typeof data?.checkedThroughMs === "number" ? data.checkedThroughMs : null,
      coversFrom: typeof data?.coversFrom === "string" ? data.coversFrom : null,
    };
  } catch {
    return { bars: [], updatedThrough: null, checkedThroughMs: null, coversFrom: null };
  }
}

/** Persist a symbol's closed daily series. Best-effort (never throws). */
export async function saveDailyStore(
  symbol: string,
  bars: readonly DailyOhlcCandle[],
  updatedThrough: string | null,
  checkedThroughMs: number,
  coversFrom: string | null,
): Promise<void> {
  try {
    const db = getAdminFirestore();
    await db.doc(docId(symbol)).set(
      {
        symbol: symbol.toUpperCase(),
        bars,
        updatedThrough,
        checkedThroughMs,
        coversFrom,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  } catch {
    /* best-effort */
  }
}

function isValidIntradayBar(b: unknown): b is IntradayBar {
  if (!b || typeof b !== "object") return false;
  const r = b as Record<string, unknown>;
  return (
    typeof r.time === "number" &&
    Number.isFinite(r.time) &&
    typeof r.open === "number" &&
    typeof r.high === "number" &&
    typeof r.low === "number" &&
    typeof r.close === "number" &&
    Number.isFinite(r.open) &&
    Number.isFinite(r.high) &&
    Number.isFinite(r.low) &&
    Number.isFinite(r.close)
  );
}

/** Load a symbol's closed intraday series for an interval; empty on failure. */
export async function loadIntradayStore(
  symbol: string,
  interval: string,
): Promise<IntradayStoreState> {
  try {
    const db = getAdminFirestore();
    const snap = await db.doc(intradayDocId(symbol, interval)).get();
    const data = snap.data();
    const raw = data?.bars;
    const bars: IntradayBar[] = Array.isArray(raw) ? raw.filter(isValidIntradayBar) : [];
    bars.sort((a, b) => a.time - b.time);
    return {
      bars,
      lastClosedSec: typeof data?.lastClosedSec === "number" ? data.lastClosedSec : null,
      coversFromSec: typeof data?.coversFromSec === "number" ? data.coversFromSec : null,
      checkedThroughMs:
        typeof data?.checkedThroughMs === "number" ? data.checkedThroughMs : null,
    };
  } catch {
    return { bars: [], lastClosedSec: null, coversFromSec: null, checkedThroughMs: null };
  }
}

/** Persist a symbol's closed intraday series. Best-effort (never throws). */
export async function saveIntradayStore(
  symbol: string,
  interval: string,
  bars: readonly IntradayBar[],
  lastClosedSec: number | null,
  coversFromSec: number | null,
  checkedThroughMs: number,
): Promise<void> {
  try {
    const db = getAdminFirestore();
    await db.doc(intradayDocId(symbol, interval)).set(
      {
        symbol: symbol.toUpperCase(),
        interval,
        bars,
        lastClosedSec,
        coversFromSec,
        checkedThroughMs,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  } catch {
    /* best-effort */
  }
}
