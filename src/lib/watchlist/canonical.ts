/**
 * Canonical perpetual symbol: BASE + USDT + .P (matches webhook / signals).
 * Example: BTCUSDT.P
 */

/** Normalize any venue symbol key to canonical `COINUSDT.P`, or null if not a USDT/USDC perp. */
export function toCanonicalPerp(raw: string): string | null {
  let s = raw.replace(/\.P$/i, "").trim().toUpperCase().replace(/-/g, "");
  if (!s) return null;

  if (s.endsWith("USDC")) {
    const base = s.slice(0, -4);
    if (!isValidBase(base)) return null;
    return `${base}USDT.P`;
  }

  if (s.endsWith("USDT")) {
    const base = s.slice(0, -4);
    if (!isValidBase(base)) return null;
    return `${base}USDT.P`;
  }

  return null;
}

function isValidBase(base: string): boolean {
  return base.length > 0 && /^[A-Z0-9]+$/.test(base);
}

/** Build a set of canonical symbols from an exchange instrument map. */
export function canonicalSetFromInstrumentMap(map: Map<string, unknown>): Set<string> {
  const out = new Set<string>();
  for (const key of map.keys()) {
    const c = toCanonicalPerp(key);
    if (c) out.add(c);
  }
  return out;
}

/** Sort canonical symbols: major coins first, then alphabetical. */
const MAJOR_ORDER = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ADA", "AVAX", "LINK", "DOT"];

export function sortCanonicalSymbols(symbols: Iterable<string>): string[] {
  const list = [...symbols];
  return list.sort((a, b) => {
    const baseA = a.replace(/USDT\.P$/i, "");
    const baseB = b.replace(/USDT\.P$/i, "");
    const ia = MAJOR_ORDER.indexOf(baseA);
    const ib = MAJOR_ORDER.indexOf(baseB);
    if (ia !== -1 || ib !== -1) {
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    }
    return a.localeCompare(b);
  });
}
