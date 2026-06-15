/**
 * Runtime F&O universe — reads Firestore `config/fno_universe`, falls back to seed list.
 */

import "server-only";

import type { Firestore } from "firebase-admin/firestore";
import {
  FNO_UNIVERSE as FNO_UNIVERSE_SEED,
  FNO_UNIVERSE_ALPHA as FNO_UNIVERSE_ALPHA_SEED,
  orderFnoSymbols,
} from "@/lib/nse/fno-universe";
import { FNO_UNIVERSE_DOC } from "@/lib/nse/fno-universe-sync";
import { normalizeStockSymbol } from "@/lib/nse/fno-symbol";

const UNIVERSE_TTL_MS = 5 * 60_000;

let universeCache: { at: number; symbols: readonly string[] } | null = null;

export function invalidateFnoUniverseCache(): void {
  universeCache = null;
}

/** Ordered F&O stock list (Tier B first). Cached 5 min per worker. */
export async function loadFnoUniverse(db: Firestore): Promise<readonly string[]> {
  if (universeCache && Date.now() - universeCache.at < UNIVERSE_TTL_MS) {
    return universeCache.symbols;
  }

  try {
    const snap = await db.doc(FNO_UNIVERSE_DOC).get();
    const raw = snap.data()?.symbols;
    if (Array.isArray(raw) && raw.length > 0) {
      const symbols = orderFnoSymbols(
        raw.filter((s): s is string => typeof s === "string" && s.trim() !== ""),
      );
      universeCache = { at: Date.now(), symbols };
      return symbols;
    }
  } catch {
    /* fall through */
  }

  universeCache = { at: Date.now(), symbols: FNO_UNIVERSE_SEED };
  return FNO_UNIVERSE_SEED;
}

/** A–Z list for UI catalog (derived from runtime universe). */
export async function loadFnoUniverseAlpha(db: Firestore): Promise<readonly string[]> {
  const symbols = await loadFnoUniverse(db);
  return [...symbols].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}

export async function isValidFnoSymbolDb(db: Firestore, symbol: string): Promise<boolean> {
  const sym = normalizeStockSymbol(symbol);
  const universe = await loadFnoUniverse(db);
  return universe.includes(sym);
}

/** Seed list — safe for client bundles when Firestore is unavailable. */
export { FNO_UNIVERSE_SEED as FNO_UNIVERSE_FALLBACK, FNO_UNIVERSE_ALPHA_SEED as FNO_UNIVERSE_ALPHA_FALLBACK };
