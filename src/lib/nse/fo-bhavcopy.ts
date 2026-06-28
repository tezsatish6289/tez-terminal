/**
 * NSE F&O Bhavcopy (UDiFF) reader — the historical OI source for "History mode".
 *
 * NSE publishes a daily end-of-day derivatives file covering every contract
 * (every strike × expiry) with end-of-day OI. Unlike `option-chain-v3` (live
 * snapshot only), these archives go back years, so we can *reconstruct* the
 * daily put-wall / call-wall / max-pain series for any index or stock.
 *
 *   URL: https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_{YYYYMMDD}_F_0000.csv.zip
 *
 * The wall + max-pain definitions here mirror `index-options-zones.ts` exactly so
 * historical points line up with the live chart:
 *   • put wall  → strike below spot with the highest put OI
 *   • call wall → strike above spot with the highest call OI
 *   • max pain  → strike minimising total option payout
 *
 * Fetch goes through `nseFetch` so `NSE_HTTPS_PROXY` (Indian egress) applies —
 * the archive host geo-blocks datacenter IPs just like the JSON APIs.
 */

import { unzipSync, strFromU8 } from "fflate";
import { nseFetch } from "@/lib/nse-fetch";
import { BROWSER_HEADERS } from "@/lib/nse-session";
import type { OiHistoryEntry } from "@/lib/oi-history";

/** A single option contract row distilled from the bhavcopy (only fields we use). */
export interface FoOptionRow {
  symbol: string;
  /** "IDO" index option, "STO" stock option, etc. */
  finInstrmTp: string;
  /** `YYYY-MM-DD`. */
  expiry: string;
  strike: number;
  /** "CE" | "PE". */
  optionType: "CE" | "PE";
  openInterest: number;
  changeInOI: number;
  /** Underlying price stamped on the row (spot proxy). */
  underlying: number | null;
}

/** `YYYYMMDD` for the archive filename. */
function yyyymmdd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function foBhavcopyUrl(date: Date): string {
  return `https://nsearchives.nseindia.com/content/fo/BhavCopy_NSE_FO_0_0_0_${yyyymmdd(date)}_F_0000.csv.zip`;
}

/** Minimal CSV line splitter (handles optional double-quoted fields). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Normalise an NSE date cell (ISO `YYYY-MM-DD` or `DD-MMM-YYYY`) to `YYYY-MM-DD`. */
const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};
export function normalizeBhavDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})T/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})$/);
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon) return `${m[3]}-${mon}-${String(m[1]).padStart(2, "0")}`;
  }
  return null;
}

/** Parse the full UDiFF CSV text into the option rows we care about. Pure. */
export function parseFoBhavcopyCsv(csv: string): FoOptionRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);

  const iSym = col("TckrSymb");
  const iTp = col("FinInstrmTp");
  const iXpry = col("XpryDt");
  const iStrk = col("StrkPric");
  const iOpt = col("OptnTp");
  const iOi = col("OpnIntrst");
  const iChg = col("ChngInOpnIntrst");
  const iUnd = col("UndrlygPric");
  if (iSym < 0 || iStrk < 0 || iOpt < 0 || iOi < 0) return [];

  const rows: FoOptionRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const f = splitCsvLine(lines[i]);
    const optRaw = (f[iOpt] ?? "").trim().toUpperCase();
    if (optRaw !== "CE" && optRaw !== "PE") continue; // skip futures
    const strike = Number(f[iStrk]);
    if (!Number.isFinite(strike) || strike <= 0) continue;
    const expiry = normalizeBhavDate(f[iXpry]);
    if (!expiry) continue;
    const oi = Number(f[iOi]);
    const und = iUnd >= 0 ? Number(f[iUnd]) : NaN;
    rows.push({
      symbol: (f[iSym] ?? "").trim().toUpperCase(),
      finInstrmTp: iTp >= 0 ? (f[iTp] ?? "").trim().toUpperCase() : "",
      expiry,
      strike,
      optionType: optRaw,
      openInterest: Number.isFinite(oi) ? oi : 0,
      changeInOI: iChg >= 0 && Number.isFinite(Number(f[iChg])) ? Number(f[iChg]) : 0,
      underlying: Number.isFinite(und) && und > 0 ? und : null,
    });
  }
  return rows;
}

/** Max-pain strike — same payout-minimising definition as the live zone engine. */
function computeMaxPain(strikes: Map<number, { callOI: number; putOI: number }>): number | null {
  const list = [...strikes.keys()].sort((a, b) => a - b);
  if (!list.length) return null;
  let best = list[0];
  let minPayout = Infinity;
  for (const s of list) {
    let p = 0;
    for (const [k, { callOI, putOI }] of strikes) {
      if (s > k) p += (s - k) * callOI;
      if (s < k) p += (k - s) * putOI;
    }
    if (p < minPayout) { minPayout = p; best = s; }
  }
  return best;
}

/** Pick the front expiry on a given day: nearest expiry on/after the trade date. */
export function pickFrontExpiry(expiries: readonly string[], tradeDate: string): string | null {
  const sorted = [...new Set(expiries)].sort((a, b) => a.localeCompare(b));
  return sorted.find((e) => e >= tradeDate) ?? sorted[sorted.length - 1] ?? null;
}

/**
 * Core reducer: turn the already-filtered rows for ONE symbol into an OI-wall
 * snapshot (front expiry put/call walls + max pain). Returns null when the chain
 * is empty. Pure.
 */
function snapshotFromSymbolRows(
  symRows: readonly FoOptionRow[],
  tradeDate: string,
): OiHistoryEntry | null {
  if (!symRows.length) return null;

  const expiry = pickFrontExpiry(symRows.map((r) => r.expiry), tradeDate);
  if (!expiry) return null;
  const chainRows = symRows.filter((r) => r.expiry === expiry);
  if (!chainRows.length) return null;

  const strikes = new Map<number, { callOI: number; putOI: number }>();
  let spot: number | null = null;
  for (const r of chainRows) {
    if (spot == null && r.underlying != null) spot = r.underlying;
    const cur = strikes.get(r.strike) ?? { callOI: 0, putOI: 0 };
    if (r.optionType === "CE") cur.callOI += r.openInterest;
    else cur.putOI += r.openInterest;
    strikes.set(r.strike, cur);
  }
  if (!strikes.size) return null;

  // Fall back to max-pain if the underlying wasn't stamped (split walls around it).
  const ref = spot ?? computeMaxPain(strikes) ?? 0;

  let putStrike: number | null = null;
  let putOI = 0;
  let callStrike: number | null = null;
  let callOI = 0;
  for (const [strike, { callOI: cOI, putOI: pOI }] of strikes) {
    if (strike < ref && pOI > putOI) { putOI = pOI; putStrike = strike; }
    if (strike > ref && cOI > callOI) { callOI = cOI; callStrike = strike; }
  }

  return {
    date: tradeDate,
    spot,
    putStrike,
    putOI: putStrike != null ? putOI : null,
    callStrike,
    callOI: callStrike != null ? callOI : null,
    maxPain: computeMaxPain(strikes),
    expiry,
  };
}

/**
 * Reduce one day's bhavcopy rows to a single OI-wall snapshot for `symbol`,
 * reading the front-month chain. Returns null when the symbol/chain is absent.
 */
export function computeOiSnapshot(
  rows: readonly FoOptionRow[],
  symbol: string,
  tradeDate: string,
): OiHistoryEntry | null {
  const sym = symbol.toUpperCase();
  return snapshotFromSymbolRows(rows.filter((r) => r.symbol === sym), tradeDate);
}

/**
 * Reduce one day's bhavcopy into OI-wall snapshots for EVERY symbol in one pass
 * (group by symbol once, then reduce). This is the scalable path: parse a single
 * market-wide file → compact per-symbol snapshots for all ~250 F&O names. Pure.
 */
export function computeAllOiSnapshots(
  rows: readonly FoOptionRow[],
  tradeDate: string,
): Record<string, OiHistoryEntry> {
  const bySymbol = new Map<string, FoOptionRow[]>();
  for (const r of rows) {
    const arr = bySymbol.get(r.symbol);
    if (arr) arr.push(r);
    else bySymbol.set(r.symbol, [r]);
  }
  const out: Record<string, OiHistoryEntry> = {};
  for (const [symbol, symRows] of bySymbol) {
    const snap = snapshotFromSymbolRows(symRows, tradeDate);
    if (snap) out[symbol] = snap;
  }
  return out;
}

/** Unzip raw bhavcopy zip bytes → CSV text. Reused for NSE downloads and GCS-cached zips. */
export function unzipBhavcopyCsv(buf: Uint8Array, label = "bhavcopy"): string {
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    // Not a ZIP (PK header) — usually an NSE bot-challenge HTML page.
    throw new Error(`${label} not a zip (got ${buf.length}b)`);
  }
  const files = unzipSync(buf);
  const name = Object.keys(files).find((n) => n.toLowerCase().endsWith(".csv"));
  if (!name) throw new Error(`${label} has no csv`);
  return strFromU8(files[name]);
}

/**
 * Download one day's F&O bhavcopy zip bytes from NSE. Returns null when the file
 * doesn't exist (weekend / holiday → 404). Throws only on unexpected errors.
 */
export async function fetchFoBhavcopyZip(
  date: Date,
  cookies: string = "",
): Promise<Uint8Array | null> {
  const url = foBhavcopyUrl(date);
  const res = await nseFetch(url, {
    headers: {
      ...BROWSER_HEADERS,
      Accept: "application/zip,application/octet-stream,*/*",
      Referer: "https://www.nseindia.com/all-reports-derivatives",
      ...(cookies ? { Cookie: cookies } : {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 404) return null; // non-trading day
  if (!res.ok) throw new Error(`bhavcopy ${yyyymmdd(date)} HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Download + unzip one day's F&O bhavcopy. Returns the CSV text, or null when the
 * file doesn't exist (weekend / holiday → 404). Throws only on unexpected errors.
 */
export async function fetchFoBhavcopyCsv(
  date: Date,
  cookies: string = "",
): Promise<string | null> {
  const buf = await fetchFoBhavcopyZip(date, cookies);
  if (!buf) return null;
  return unzipBhavcopyCsv(buf, `bhavcopy ${yyyymmdd(date)}`);
}
