/**
 * Build src/lib/nse/fno-company-names.ts from Dhan scrip master (SM_SYMBOL_NAME).
 * Run: npx tsx scripts/build-fno-company-names.ts
 */
import { writeFileSync } from "fs";
import { FNO_UNIVERSE } from "../src/lib/nse/fno-universe";

const CSV_URL = "https://images.dhan.co/api-data/api-scrip-master.csv";

async function main() {
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
  const csv = await res.text();
  const lines = csv.split("\n");
  const header = lines[0].split(",").map((h) => h.trim());
  const symbolIdx = header.indexOf("SEM_TRADING_SYMBOL");
  const segmentIdx = header.indexOf("SEM_SEGMENT");
  const exchIdx = header.indexOf("SEM_EXM_EXCH_ID");
  const instrIdx = header.indexOf("SEM_INSTRUMENT_NAME");
  const nameIdx = header.indexOf("SM_SYMBOL_NAME");
  const seriesIdx = header.indexOf("SEM_SERIES");

  const want = new Set(FNO_UNIVERSE.map((s) => s.toUpperCase()));
  const map: Record<string, string> = {};

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length <= Math.max(symbolIdx, nameIdx)) continue;
    if (cols[exchIdx] !== "NSE") continue;
    if (cols[segmentIdx] !== "E") continue;
    const instr = (cols[instrIdx] ?? "").toUpperCase();
    if (instr !== "EQUITY") continue;
    const series = (cols[seriesIdx] ?? "").toUpperCase();
    if (series && series !== "EQ") continue;
    const sym = cols[symbolIdx]?.toUpperCase();
    const name = cols[nameIdx]?.trim();
    if (!sym || !name || !want.has(sym)) continue;
    if (!map[sym]) map[sym] = name;
  }

  /** Symbols renamed or absent from Dhan EQ rows — NSE F&O tickers kept for options. */
  const MANUAL: Record<string, string> = {
    TATAMOTORS: "Tata Motors Ltd",
    LTIM: "LTIMindtree Ltd",
    ZOMATO: "Zomato Ltd",
  };
  for (const [sym, name] of Object.entries(MANUAL)) {
    if (want.has(sym)) map[sym] = name;
  }

  const missing = FNO_UNIVERSE.filter((s) => !map[s.toUpperCase()]);
  console.log(`mapped ${Object.keys(map).length} / ${FNO_UNIVERSE.length}, missing ${missing.length}`);
  if (missing.length) console.log("missing:", missing.join(", "));

  const out = `/**
 * NSE F&O symbol → company name (from Dhan scrip master SM_SYMBOL_NAME).
 * Regenerate: npx tsx scripts/build-fno-company-names.ts
 */
export const FNO_COMPANY_NAMES: Readonly<Record<string, string>> = ${JSON.stringify(map, null, 2)} as const;

export function fnoCompanyName(symbol: string): string | null {
  const key = symbol.trim().toUpperCase();
  const name = FNO_COMPANY_NAMES[key];
  return name && name.toUpperCase() !== key ? name : null;
}
`;
  writeFileSync("src/lib/nse/fno-company-names.ts", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
