/**
 * Pure helpers for discovering NSE F&O equity underlyings (no I/O, testable).
 */

import { INDEX_KEYS } from "@/lib/index-specs";

const DHAN_DERIV_INSTR = new Set(["OPTSTK", "FUTSTK"]);
const NSETEST_RE = /NSETEST/i;
const INDEX_SET = new Set<string>(INDEX_KEYS);

function parseCsvLine(line: string): string[] {
  return line.split(",").map((c) => c.trim().replace(/"/g, ""));
}

/** Strip indices + NSE test symbols from a raw symbol list. */
export function sanitizeFnoStockSymbols(symbols: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const raw of symbols) {
    const sym = raw.trim().toUpperCase();
    if (!sym || NSETEST_RE.test(sym) || INDEX_SET.has(sym)) continue;
    out.add(sym);
  }
  return [...out];
}

/** Unique F&O equity underlyings from Dhan CSV (deriv segment + matching EQ row). */
export function parseDhanFnoUnderlyings(csv: string): string[] {
  const lines = csv.split("\n");
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]);
  const exchIdx = header.indexOf("SEM_EXM_EXCH_ID");
  const segIdx = header.indexOf("SEM_SEGMENT");
  const symbolIdx = header.indexOf("SEM_TRADING_SYMBOL");
  const instrIdx = header.indexOf("SEM_INSTRUMENT_NAME");

  if (exchIdx === -1 || segIdx === -1 || symbolIdx === -1 || instrIdx === -1) {
    return [];
  }

  const deriv = new Set<string>();
  const equity = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length <= Math.max(exchIdx, segIdx, symbolIdx, instrIdx)) continue;
    if (cols[exchIdx]?.toUpperCase() !== "NSE") continue;

    const seg = cols[segIdx]?.toUpperCase();
    const instr = (cols[instrIdx] ?? "").toUpperCase();
    const sym = cols[symbolIdx]?.trim().toUpperCase();
    if (!sym) continue;

    if (seg === "D" && DHAN_DERIV_INSTR.has(instr)) {
      deriv.add(sym.split("-", 1)[0]!);
    } else if (seg === "E" && (instr === "EQUITY" || instr === "EQUITIES")) {
      equity.add(sym);
    }
  }

  const mapped = [...deriv].filter((s) => equity.has(s));
  return sanitizeFnoStockSymbols(mapped);
}
