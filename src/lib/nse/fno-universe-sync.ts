/**
 * Discover the live NSE F&O equity universe and persist to Firestore.
 *
 * Sources (merged):
 *   1. NSE FO pre-open list — `/api/market-data-pre-open?key=FO` (authoritative when session works).
 *   2. Dhan scrip master — NSE OPTSTK/FUTSTK underlyings that also have an NSE_EQ row.
 *
 * Scheduled daily from `daily-housekeeping`; crons read the persisted list via
 * `loadFnoUniverse()` (see fno-universe-runtime.ts).
 */

import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import type { NseSession } from "@/lib/nse/client";
import {
  FNO_UNIVERSE as FNO_UNIVERSE_SEED,
  orderFnoSymbols,
} from "@/lib/nse/fno-universe";
import {
  fetchDhanInstrumentCsv,
  parseDhanEquityMaster,
} from "@/lib/dhan-instruments-sync";
import {
  parseDhanFnoUnderlyings,
  sanitizeFnoStockSymbols,
} from "@/lib/nse/fno-universe-parse";

export const FNO_UNIVERSE_DOC = "config/fno_universe";

const NSE_FO_PREOPEN = "https://www.nseindia.com/api/market-data-pre-open?key=FO";

export interface FnoUniverseDoc {
  symbols: string[];
  lastSyncedAt: string;
  source: "merged" | "nse_only" | "dhan_only" | "seed";
  nseCount: number | null;
  dhanCount: number | null;
  added: string[];
  removed: string[];
}

export interface SyncFnoUniverseResult {
  syncedAt: string;
  total: number;
  added: string[];
  removed: string[];
  source: FnoUniverseDoc["source"];
  nseCount: number | null;
  dhanCount: number | null;
  symbols: string[];
}

interface NseFoPreOpenRow {
  metadata?: { symbol?: string };
}

/** NSE FO pre-open — one call returns the full F&O stock list (~210 symbols). */
export async function fetchNseFnoUnderlyings(session: NseSession): Promise<string[]> {
  const json = await session.fetchJson<{ data?: NseFoPreOpenRow[] }>(NSE_FO_PREOPEN);
  const rows = json.data ?? [];
  const symbols = rows
    .map((r) => r.metadata?.symbol?.trim().toUpperCase())
    .filter((s): s is string => Boolean(s));
  return sanitizeFnoStockSymbols(symbols);
}

function mergeUniverseSources(nse: string[] | null, dhan: string[]): {
  symbols: string[];
  source: FnoUniverseDoc["source"];
} {
  const nseSet = nse?.length ? new Set(nse) : null;
  const dhanSet = new Set(dhan);

  if (nseSet && nseSet.size > 0 && dhanSet.size > 0) {
    const merged = sanitizeFnoStockSymbols([...nseSet, ...dhanSet]);
    return { symbols: orderFnoSymbols(merged), source: "merged" };
  }
  if (nseSet && nseSet.size > 0) {
    return { symbols: orderFnoSymbols([...nseSet]), source: "nse_only" };
  }
  if (dhanSet.size > 0) {
    return { symbols: orderFnoSymbols([...dhanSet]), source: "dhan_only" };
  }
  return { symbols: [...FNO_UNIVERSE_SEED], source: "seed" };
}

/** Pull live lists, merge, persist, return diff vs previous doc. */
export async function syncFnoUniverse(
  db: Firestore,
  opts: { session?: NseSession | null } = {},
): Promise<SyncFnoUniverseResult> {
  const now = new Date().toISOString();
  const prevSnap = await db.doc(FNO_UNIVERSE_DOC).get();
  const prevSymbols = ((prevSnap.data()?.symbols ?? FNO_UNIVERSE_SEED) as string[]).map((s) =>
    s.toUpperCase(),
  );
  const prevSet = new Set(prevSymbols);

  let nseList: string[] | null = null;
  if (opts.session) {
    try {
      nseList = await fetchNseFnoUnderlyings(opts.session);
    } catch {
      nseList = null;
    }
  }

  let dhanList: string[] = [];
  try {
    const csv = await fetchDhanInstrumentCsv();
    dhanList = parseDhanFnoUnderlyings(csv);
    // Also warm equity map side-effect-free (used immediately after by Dhan sync).
    parseDhanEquityMaster(csv);
  } catch {
    dhanList = [];
  }

  const { symbols, source } = mergeUniverseSources(nseList, dhanList);
  const nextSet = new Set(symbols);
  const added = symbols.filter((s) => !prevSet.has(s));
  const removed = prevSymbols.filter((s) => !nextSet.has(s));

  const doc: FnoUniverseDoc = {
    symbols,
    lastSyncedAt: now,
    source,
    nseCount: nseList?.length ?? null,
    dhanCount: dhanList.length || null,
    added,
    removed,
  };

  await db.doc(FNO_UNIVERSE_DOC).set(doc);

  return {
    syncedAt: now,
    total: symbols.length,
    added,
    removed,
    source,
    nseCount: nseList?.length ?? null,
    dhanCount: dhanList.length || null,
    symbols,
  };
}
