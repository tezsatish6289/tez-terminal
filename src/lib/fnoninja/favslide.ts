/** Firestore field on `users/{uid}` — ordered list of F&O stock symbols. */
export const FNONINJA_FAVSLIDE_FIELD = "fnoninjaFavslide";

export const MAX_FAVSLIDE_SYMBOLS = 48;

export function normalizeFavslideSymbol(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  if (!s || s.length > 24) return null;
  if (!/^[A-Z][A-Z0-9&.-]*$/.test(s)) return null;
  return s;
}

export function parseFavslideSymbols(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const sym = normalizeFavslideSymbol(item);
    if (!sym || seen.has(sym)) continue;
    seen.add(sym);
    out.push(sym);
    if (out.length >= MAX_FAVSLIDE_SYMBOLS) break;
  }
  return out;
}
