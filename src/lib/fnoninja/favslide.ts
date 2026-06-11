import type { LevelsTvScope } from "@/lib/levels/tradingview-symbol";

/** Firestore field on `users/{uid}` — ordered list of `scope:symbol` keys. */
export const FNONINJA_FAVSLIDE_FIELD = "fnoninjaFavslide";

export const MAX_FAVSLIDE_SYMBOLS = 48;

export type FavslideEntry = {
  scope: LevelsTvScope;
  symbol: string;
};

export function normalizeFavslideSymbol(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  if (!s || s.length > 24) return null;
  if (!/^[A-Z][A-Z0-9&.-]*$/.test(s)) return null;
  return s;
}

export function favslideEntryKey(entry: FavslideEntry): string {
  return `${entry.scope}:${entry.symbol}`;
}

export function parseFavslideEntry(raw: string): FavslideEntry | null {
  const colon = raw.indexOf(":");
  if (colon > 0) {
    const scope = raw.slice(0, colon);
    if (scope !== "index" && scope !== "stock") return null;
    const symbol = normalizeFavslideSymbol(raw.slice(colon + 1));
    if (!symbol) return null;
    return { scope, symbol };
  }
  const symbol = normalizeFavslideSymbol(raw);
  return symbol ? { scope: "stock", symbol } : null;
}

/** Parse stored keys (`stock:BHEL`) or API `{ scope, symbol }` objects. */
export function parseFavslideEntries(raw: unknown): FavslideEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: FavslideEntry[] = [];
  for (const item of raw) {
    let entry: FavslideEntry | null = null;
    if (typeof item === "string") {
      entry = parseFavslideEntry(item);
    } else if (item && typeof item === "object") {
      const o = item as { scope?: unknown; symbol?: unknown };
      const scope =
        o.scope === "index" ? "index" : o.scope === "stock" ? "stock" : null;
      const symbol =
        typeof o.symbol === "string" ? normalizeFavslideSymbol(o.symbol) : null;
      if (scope && symbol) entry = { scope, symbol };
    }
    if (!entry) continue;
    const key = favslideEntryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
    if (out.length >= MAX_FAVSLIDE_SYMBOLS) break;
  }
  return out;
}

/** @deprecated Prefer {@link parseFavslideEntries}. */
export function parseFavslideSymbols(raw: unknown): FavslideEntry[] {
  return parseFavslideEntries(raw);
}

export function encodeFavslideStorage(entries: FavslideEntry[]): string[] {
  return entries.map(favslideEntryKey);
}
