/**
 * Build and maintain F&O → Dhan security ID mappings in Firestore.
 *
 * Docs:
 *   • config/dhan_instruments      — flat SYMBOL → securityId (used by LTP + option chain)
 *   • config/dhan_fno_instruments  — per FNO_UNIVERSE symbol status + audit metadata
 */

import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import { fetchDhanEquityExpiries } from "@/lib/dhan-option-chain";
import { invalidateDhanSecurityIdCache } from "@/lib/dhan-candles";
import { dhanSymbolCandidates } from "@/lib/dhan-symbol-aliases";
import { loadFnoUniverse } from "@/lib/nse/fno-universe-runtime";

export const DHAN_CSV_URL = "https://images.dhan.co/api-data/api-scrip-master.csv";
export const DHAN_INSTRUMENTS_DOC = "config/dhan_instruments";
export const DHAN_FNO_INSTRUMENTS_DOC = "config/dhan_fno_instruments";
export const DHAN_FNO_VALIDATE_CURSOR_DOC = "config/dhan_fno_validate_cursor";

const EQUITY_SERIES = new Set(["EQ", "BE", "BZ", "SM", "ST"]);

export type DhanFnoMapStatus =
  | "missing"
  | "mapped"
  | "manual"
  | "validated"
  | "invalid_chain";

export interface DhanFnoInstrumentEntry {
  securityId: number | null;
  dhanSymbol: string | null;
  status: DhanFnoMapStatus;
  optionChainOk: boolean | null;
  lastError: string | null;
  updatedAt: string;
}

export interface DhanFnoInstrumentsDoc {
  lastSyncedAt: string | null;
  lastValidatedAt: string | null;
  entries: Record<string, DhanFnoInstrumentEntry>;
}

export interface DhanCsvMaster {
  /** NSE equity trading symbol → security id (NSE_EQ). */
  nseEquityBySymbol: Map<string, number>;
}

function parseCsvLine(line: string): string[] {
  return line.split(",").map((c) => c.trim().replace(/"/g, ""));
}

/** Parse Dhan compact scrip master — NSE equity rows only. */
export function parseDhanEquityMaster(csv: string): DhanCsvMaster {
  const lines = csv.split("\n");
  if (lines.length < 2) throw new Error("dhan_csv_empty");

  const header = parseCsvLine(lines[0]);
  const exchIdx = header.indexOf("SEM_EXM_EXCH_ID");
  const segIdx = header.indexOf("SEM_SEGMENT");
  const secIdIdx = header.indexOf("SEM_SMST_SECURITY_ID");
  const symbolIdx = header.indexOf("SEM_TRADING_SYMBOL");
  const seriesIdx = header.indexOf("SEM_SERIES");
  const instrIdx = header.indexOf("SEM_INSTRUMENT_NAME");

  if (exchIdx === -1 || segIdx === -1 || secIdIdx === -1 || symbolIdx === -1) {
    throw new Error(`dhan_csv_bad_header:${header.slice(0, 8).join(",")}`);
  }

  const nseEquityBySymbol = new Map<string, number>();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length <= Math.max(exchIdx, segIdx, secIdIdx, symbolIdx)) continue;

    if (cols[exchIdx]?.toUpperCase() !== "NSE") continue;
    if (cols[segIdx]?.toUpperCase() !== "E") continue;

    const instrName = (cols[instrIdx] ?? "").toUpperCase();
    if (instrName && instrName !== "EQUITY" && instrName !== "EQUITIES") continue;

    const series = (cols[seriesIdx] ?? "").toUpperCase();
    if (series && !EQUITY_SERIES.has(series)) continue;

    const symbol = cols[symbolIdx]?.toUpperCase();
    const secId = Number.parseInt(cols[secIdIdx] ?? "", 10);
    if (!symbol || !Number.isFinite(secId) || secId <= 0) continue;

    nseEquityBySymbol.set(symbol, secId);
  }

  return { nseEquityBySymbol };
}

export function resolveFnoSymbolOnMaster(
  fnoSymbol: string,
  master: DhanCsvMaster,
): { securityId: number; dhanSymbol: string } | null {
  for (const candidate of dhanSymbolCandidates(fnoSymbol)) {
    const id = master.nseEquityBySymbol.get(candidate);
    if (id != null) return { securityId: id, dhanSymbol: candidate };
  }
  return null;
}

export async function fetchDhanInstrumentCsv(): Promise<string> {
  const res = await fetch(DHAN_CSV_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`dhan_csv_fetch_${res.status}`);
  return res.text();
}

function emptyEntry(now: string): DhanFnoInstrumentEntry {
  return {
    securityId: null,
    dhanSymbol: null,
    status: "missing",
    optionChainOk: null,
    lastError: null,
    updatedAt: now,
  };
}

export interface SyncDhanFnoResult {
  syncedAt: string;
  mapped: number;
  missing: string[];
  total: number;
  sample: Array<{ symbol: string; securityId: number; dhanSymbol: string }>;
}

/** Pull Dhan CSV and map every F&O symbol into Firestore. */
export async function syncDhanFnoInstruments(
  db: Firestore,
  opts: { symbols?: string[] } = {},
): Promise<SyncDhanFnoResult> {
  const universe = opts.symbols?.length ? opts.symbols : [...(await loadFnoUniverse(db))];
  const csv = await fetchDhanInstrumentCsv();
  const master = parseDhanEquityMaster(csv);
  const now = new Date().toISOString();

  const prevSnap = await db.doc(DHAN_FNO_INSTRUMENTS_DOC).get();
  const prevEntries = (prevSnap.data()?.entries ?? {}) as Record<string, DhanFnoInstrumentEntry>;

  const entries: Record<string, DhanFnoInstrumentEntry> = { ...prevEntries };
  const instrumentUpdates: Record<string, number> = {};
  const missing: string[] = [];
  const sample: SyncDhanFnoResult["sample"] = [];

  for (const sym of universe) {
    const prev = prevEntries[sym];
    if (prev?.status === "manual" && prev.securityId != null) {
      entries[sym] = { ...prev, updatedAt: now };
      instrumentUpdates[sym] = prev.securityId;
      continue;
    }

    const hit = resolveFnoSymbolOnMaster(sym, master);
    if (!hit) {
      entries[sym] = { ...emptyEntry(now), lastError: "not_in_dhan_csv" };
      missing.push(sym);
      continue;
    }

    entries[sym] = {
      securityId: hit.securityId,
      dhanSymbol: hit.dhanSymbol,
      status: "mapped",
      optionChainOk: null,
      lastError: null,
      updatedAt: now,
    };
    instrumentUpdates[sym] = hit.securityId;
    if (sample.length < 15) {
      sample.push({ symbol: sym, securityId: hit.securityId, dhanSymbol: hit.dhanSymbol });
    }
  }

  const fnoDoc: DhanFnoInstrumentsDoc = {
    lastSyncedAt: now,
    lastValidatedAt: prevSnap.data()?.lastValidatedAt ?? null,
    entries,
  };

  const existingInstruments = await db.doc(DHAN_INSTRUMENTS_DOC).get();
  const mergedInstruments: Record<string, unknown> = {
    ...(existingInstruments.data() ?? {}),
    ...instrumentUpdates,
    lastUpdated: now,
    lastFnoSyncAt: now,
  };

  await db.doc(DHAN_FNO_INSTRUMENTS_DOC).set(fnoDoc);
  await db.doc(DHAN_INSTRUMENTS_DOC).set(mergedInstruments, { merge: true });
  invalidateDhanSecurityIdCache();

  return {
    syncedAt: now,
    mapped: universe.length - missing.length,
    missing,
    total: universe.length,
    sample,
  };
}

export interface ValidateDhanFnoResult {
  validatedAt: string;
  checked: number;
  ok: number;
  invalid: Array<{ symbol: string; error: string }>;
}

function validationPriority(
  sym: string,
  entry: DhanFnoInstrumentEntry | undefined,
): number {
  if (!entry?.securityId) return 99;
  if (entry.status === "manual") return 98;
  if (entry.status === "invalid_chain" || entry.optionChainOk === false) return 0;
  if (entry.status === "mapped") return 1;
  if (entry.status === "validated") return 2;
  return 3;
}

/** Pick the next batch of symbols to validate, rotating through the universe daily. */
export async function validateDhanFnoOptionChainsRotating(
  db: Firestore,
  opts: { symbols?: string[]; limit?: number } = {},
): Promise<ValidateDhanFnoResult> {
  const universe = opts.symbols?.length ? opts.symbols : [...(await loadFnoUniverse(db))];
  const snap = await db.doc(DHAN_FNO_INSTRUMENTS_DOC).get();
  const doc = snap.data() as DhanFnoInstrumentsDoc | undefined;
  const entries = { ...(doc?.entries ?? {}) };

  const cursorSnap = await db.doc(DHAN_FNO_VALIDATE_CURSOR_DOC).get();
  const cursor =
    typeof cursorSnap.data()?.index === "number" && Number.isFinite(cursorSnap.data()!.index)
      ? (cursorSnap.data()!.index as number)
      : 0;

  const limit = opts.limit ?? 20;
  const ordered = [...universe].sort((a, b) => {
    const pa = validationPriority(a, entries[a]);
    const pb = validationPriority(b, entries[b]);
    if (pa !== pb) return pa - pb;
    return universe.indexOf(a) - universe.indexOf(b);
  });

  const n = ordered.length;
  const targets: string[] = [];
  if (n > 0) {
    const start = ((cursor % n) + n) % n;
    for (let i = 0; i < n && targets.length < limit; i++) {
      const sym = ordered[(start + i) % n]!;
      const e = entries[sym];
      if (e?.securityId != null && e.status !== "manual") targets.push(sym);
    }
    await db.doc(DHAN_FNO_VALIDATE_CURSOR_DOC).set({
      index: (start + Math.max(targets.length, 1)) % n,
      updatedAt: new Date().toISOString(),
    });
  }

  return validateDhanFnoOptionChains(db, { symbols: targets, limit: targets.length, entries, doc });
}

/** Probe Dhan option-chain expiry API for mapped symbols (slow — ~3s per symbol). */
export async function validateDhanFnoOptionChains(
  db: Firestore,
  opts: {
    symbols?: string[];
    limit?: number;
    entries?: Record<string, DhanFnoInstrumentEntry>;
    doc?: DhanFnoInstrumentsDoc;
  } = {},
): Promise<ValidateDhanFnoResult> {
  const snap = opts.doc ? null : await db.doc(DHAN_FNO_INSTRUMENTS_DOC).get();
  const doc = opts.doc ?? (snap?.data() as DhanFnoInstrumentsDoc | undefined);
  const entries = { ...(opts.entries ?? doc?.entries ?? {}) };
  const now = new Date().toISOString();

  let targets = opts.symbols?.length
    ? opts.symbols.map((s) => s.toUpperCase())
    : (await loadFnoUniverse(db)).filter((s) => {
        const e = entries[s];
        return e?.securityId != null && e.status !== "manual";
      });

  const limit = opts.limit ?? 15;
  targets = targets.slice(0, limit);

  const invalid: ValidateDhanFnoResult["invalid"] = [];
  let ok = 0;

  for (const sym of targets) {
    const entry = entries[sym] ?? emptyEntry(now);
    const securityId = entry.securityId;
    if (securityId == null) continue;

    try {
      const expiries = await fetchDhanEquityExpiries(securityId);
      if (!expiries.length) throw new Error("no_expiries");
      entries[sym] = {
        ...entry,
        status: "validated",
        optionChainOk: true,
        lastError: null,
        updatedAt: now,
      };
      ok++;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      entries[sym] = {
        ...entry,
        status: "invalid_chain",
        optionChainOk: false,
        lastError: error.slice(0, 200),
        updatedAt: now,
      };
      invalid.push({ symbol: sym, error });
    }
  }

  await db.doc(DHAN_FNO_INSTRUMENTS_DOC).set(
    {
      lastSyncedAt: doc?.lastSyncedAt ?? null,
      lastValidatedAt: now,
      entries,
    },
    { merge: true },
  );

  return { validatedAt: now, checked: targets.length, ok, invalid };
}

export interface ManualDhanFnoPatch {
  symbol: string;
  securityId: number;
  dhanSymbol?: string;
}

export async function patchDhanFnoInstrument(
  db: Firestore,
  patch: ManualDhanFnoPatch,
): Promise<DhanFnoInstrumentEntry> {
  const sym = patch.symbol.trim().toUpperCase();
  const universe = await loadFnoUniverse(db);
  if (!universe.includes(sym)) {
    throw new Error(`not_in_fno_universe:${sym}`);
  }
  if (!Number.isFinite(patch.securityId) || patch.securityId <= 0) {
    throw new Error("invalid_security_id");
  }

  const now = new Date().toISOString();
  const entry: DhanFnoInstrumentEntry = {
    securityId: patch.securityId,
    dhanSymbol: patch.dhanSymbol?.trim().toUpperCase() ?? sym,
    status: "manual",
    optionChainOk: null,
    lastError: null,
    updatedAt: now,
  };

  const snap = await db.doc(DHAN_FNO_INSTRUMENTS_DOC).get();
  const entries = { ...((snap.data()?.entries ?? {}) as Record<string, DhanFnoInstrumentEntry>) };
  entries[sym] = entry;

  await db.doc(DHAN_FNO_INSTRUMENTS_DOC).set(
    {
      lastSyncedAt: snap.data()?.lastSyncedAt ?? null,
      lastValidatedAt: snap.data()?.lastValidatedAt ?? null,
      entries,
    },
    { merge: true },
  );

  await db.doc(DHAN_INSTRUMENTS_DOC).set(
    { [sym]: patch.securityId, lastUpdated: now },
    { merge: true },
  );

  invalidateDhanSecurityIdCache();
  return entry;
}

let fnoStatusCache: { at: number; entries: Record<string, DhanFnoInstrumentEntry> } | null = null;
const FNO_STATUS_TTL_MS = 5 * 60_000;

export async function loadDhanFnoEntries(
  db: Firestore,
): Promise<Record<string, DhanFnoInstrumentEntry>> {
  if (fnoStatusCache && Date.now() - fnoStatusCache.at < FNO_STATUS_TTL_MS) {
    return fnoStatusCache.entries;
  }
  const snap = await db.doc(DHAN_FNO_INSTRUMENTS_DOC).get();
  const entries = (snap.data()?.entries ?? {}) as Record<string, DhanFnoInstrumentEntry>;
  fnoStatusCache = { at: Date.now(), entries };
  return entries;
}

export function invalidateDhanFnoStatusCache(): void {
  fnoStatusCache = null;
}

/** True when Dhan option chain should not be attempted for this F&O symbol. */
export function isDhanOptionChainBlocked(
  symbol: string,
  entries: Record<string, DhanFnoInstrumentEntry>,
): boolean {
  const e = entries[symbol.toUpperCase()];
  if (!e) return false;
  if (e.status === "invalid_chain" || e.optionChainOk === false) return true;
  if (e.status === "missing" || e.securityId == null) return true;
  const err = e.lastError ?? "";
  return /invalid securityid|unknown_symbol|not_in_dhan_csv/i.test(err);
}

export async function loadDhanFnoReport(db: Firestore) {
  const [snap, universeSnap, universe] = await Promise.all([
    db.doc(DHAN_FNO_INSTRUMENTS_DOC).get(),
    db.doc("config/fno_universe").get(),
    loadFnoUniverse(db),
  ]);
  const data = snap.data() as DhanFnoInstrumentsDoc | undefined;
  const entries = data?.entries ?? {};
  const universeDoc = universeSnap.data();

  const missing = universe.filter((s) => !entries[s]?.securityId);
  const invalidChain = universe.filter(
    (s) => entries[s]?.status === "invalid_chain" || entries[s]?.optionChainOk === false,
  );
  const validated = universe.filter((s) => entries[s]?.status === "validated");
  const manual = universe.filter((s) => entries[s]?.status === "manual");

  return {
    lastSyncedAt: data?.lastSyncedAt ?? null,
    lastValidatedAt: data?.lastValidatedAt ?? null,
    universeSyncedAt:
      typeof universeDoc?.lastSyncedAt === "string" ? universeDoc.lastSyncedAt : null,
    universeSource: typeof universeDoc?.source === "string" ? universeDoc.source : null,
    universeAdded: Array.isArray(universeDoc?.added) ? (universeDoc.added as string[]) : [],
    universeRemoved: Array.isArray(universeDoc?.removed) ? (universeDoc.removed as string[]) : [],
    total: universe.length,
    mapped: universe.length - missing.length,
    missing,
    invalidChain,
    validated: validated.length,
    manual: manual.length,
    entries: universe.map((sym) => ({
      symbol: sym,
      ...(entries[sym] ?? emptyEntry("")),
    })),
  };
}
